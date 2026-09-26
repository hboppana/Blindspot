"""Build intersection hotspots from the clean dataGNV crashes.

Step 1: decide which crashes belong to an intersection.
  A crash counts if it is coded at an intersection, or if it names a cross
  street and sits within NEAR_FT of it. Approach crashes (rear-ends at a
  signal, turning crashes) are usually coded "not at intersection" with a
  small offset, and they are exactly the ones we want.

  offset_from_cross comes as "100   FEET", ".25   MILES", "1/10  MILES", or a
  bare unit with no number. A bare unit is unknown. So is anything over
  MAX_MILES, since "50 MILES" inside Gainesville is a data-entry slip.

Step 2: place each pair and merge pairs that are the same corner.
  A pair sits at the median lat/lon of its counted crashes, using only the
  ones coded at the intersection when it has any. Pairs within MERGE_M of
  each other merge if they share a street once directions are dropped
  ("ARCHER RD" = "SW ARCHER RD"), or if one side is a bare route number
  ("SR 121"). Two different corners that happen to be close stay apart.
  A merged intersection takes the name of its biggest pair.

Step 3: snap crashes with no pair key (no cross street, or one that isn't a
  street) to the nearest intersection within SNAP_M, if they are coded at an
  intersection. Crashes with a pair that step 1 filtered out are not
  snapped: dataGNV puts them on the reference corner whatever the offset, so
  distance can't vouch for them.

Step 4: attach FDOT crashes (see fdot.py), profile each intersection, and
  write the outputs:
    data/derived/intersections.csv  every intersection, with counts (the
                                    comparison corners for workstreams 2-3)
    data/derived/hotspots.json      every intersection with a crash in the
                                    window, ranked citywide, each with a
                                    dataGNV profile and FDOT causes

The window is --since (default SINCE_YEAR) to --until (default: latest). With
--until, crashes after it are dropped before anything else, so intersections
are placed and ranked from those years only (the backtest), and
intersections.csv is left alone.

Requires: pip install pandas numpy
Usage:    python scripts/build_hotspots.py
          python scripts/build_hotspots.py --since 2015 --until 2021 --out data/derived/backtest_2015_2021.json
"""

import argparse
import json
import re
from datetime import date
from fractions import Fraction
from pathlib import Path

import numpy as np
import pandas as pd

from fdot import FLAGS, link_to_gnv, load_fdot, snap_fdot
from streets import ROUTE_NAME, normalize_street, pair_key, street_base

ROOT = Path(__file__).resolve().parent.parent
CRASHES = ROOT / "data" / "processed" / "gnv_crashes_clean.csv"
DERIVED = ROOT / "data" / "derived"

SINCE_YEAR = 2022  # crashes dropped ~30% in 2020; current hotspots use 2022 onward
UNCODED = {"NOT CODED", "UNKNOWN", "UNKNOWN/NOT CODED", "NaN"}
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

NEAR_FT = 150  # about 45 m
MAX_MILES = 2
OFFSET = re.compile(r"^\s*([\d./]+)\s+(FEET|MILES)\s*$")

MERGE_M = 30
SNAP_M = 40
# Local flat projection around Gainesville; error is well under a metre at this scale.
LAT0, LON0 = 29.65, -82.35
M_PER_DEG_LAT = 110_860
M_PER_DEG_LON = 111_320 * np.cos(np.radians(LAT0))


def parse_offset_ft(text):
    """Return the offset in feet, or None if it is missing or implausible."""
    if not isinstance(text, str):
        return None
    m = OFFSET.match(text.upper())
    if not m:
        return None
    try:
        value = float(Fraction(m.group(1)))
    except (ValueError, ZeroDivisionError):
        return None
    if m.group(2) == "MILES":
        return value * 5280 if value <= MAX_MILES else None
    return value


def load_intersection_crashes(until=None):
    """All crashes with a pair key, plus a flag for whether each one counts."""
    d = pd.read_csv(CRASHES, low_memory=False)
    if until is not None:
        d = d[d.year <= until].reset_index(drop=True)
    names = pd.concat([d.street, d.cross_street]).dropna().unique()
    canon = {n: normalize_street(n) for n in names}

    d["street_norm"] = d.street.map(canon)
    d["cross_norm"] = d.cross_street.map(canon)
    d["pair"] = [pair_key(a, b) for a, b in zip(d.street_norm, d.cross_norm)]
    d["offset_ft"] = d.offset_from_cross.map(parse_offset_ft)
    d["near"] = d.pair.notna() & (
        (d.at_intersection == 1) | (d.offset_ft <= NEAR_FT)
    )
    return d


def _can_merge(pair_a, pair_b):
    a, b = pair_a.split(" & "), pair_b.split(" & ")
    if any(ROUTE_NAME.match(s) for s in a + b):
        return True
    return bool({street_base(s) for s in a} & {street_base(s) for s in b})


def _median_location(crashes):
    at = crashes[crashes.at_intersection == 1]
    use = at if len(at) else crashes
    return use.latitude.median(), use.longitude.median()


def merge_pairs(d, since=SINCE_YEAR):
    """Add an intersection_id to counted crashes; return the intersections table."""
    near = d[d.near]
    pairs = pd.DataFrame(
        [(p, *_median_location(g), len(g)) for p, g in near.groupby("pair")],
        columns=["pair", "lat", "lon", "crashes"],
    )
    x = (pairs.lon.to_numpy() - LON0) * M_PER_DEG_LON
    y = (pairs.lat.to_numpy() - LAT0) * M_PER_DEG_LAT

    # Union-find over pairs that are close and compatible. Grid cells of
    # MERGE_M mean any close neighbour is in the same or an adjacent cell.
    parent = list(range(len(pairs)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    cells = {}
    for i, key in enumerate(zip((x // MERGE_M).astype(int), (y // MERGE_M).astype(int))):
        cells.setdefault(key, []).append(i)
    names = pairs.pair.to_numpy()
    for (cx, cy), members in cells.items():
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for i in members:
                    for j in cells.get((cx + dx, cy + dy), ()):
                        if j <= i:
                            continue
                        if np.hypot(x[i] - x[j], y[i] - y[j]) <= MERGE_M and _can_merge(names[i], names[j]):
                            parent[find(i)] = find(j)

    pairs["group"] = [find(i) for i in range(len(pairs))]
    # Name each group after its biggest pair; that name is the intersection id.
    top = pairs.sort_values("crashes", ascending=False).drop_duplicates("group")
    pairs["intersection_id"] = pairs.group.map(dict(zip(top.group, top.pair)))

    d["intersection_id"] = d.pair.map(dict(zip(pairs.pair, pairs.intersection_id))).where(d.near)
    counted = d[d.near]
    inters = pd.DataFrame(
        [(i, *_median_location(g), len(g), (g.year >= since).sum(),
          sorted(pairs.pair[pairs.intersection_id == i]))
         for i, g in counted.groupby("intersection_id")],
        columns=["intersection_id", "lat", "lon", "crashes", "crashes_window", "pairs"],
    )
    return inters.sort_values("crashes_window", ascending=False).reset_index(drop=True)


def nearest_intersection(lat, lon, inters):
    """Row position of the nearest intersection for each point, and the distance in metres."""
    ix = (inters.lon.to_numpy() - LON0) * M_PER_DEG_LON
    iy = (inters.lat.to_numpy() - LAT0) * M_PER_DEG_LAT
    cx = (np.asarray(lon, dtype=float) - LON0) * M_PER_DEG_LON
    cy = (np.asarray(lat, dtype=float) - LAT0) * M_PER_DEG_LAT
    nearest = np.empty(len(cx), dtype=int)
    dist = np.empty(len(cx))
    for k in range(0, len(cx), 2000):  # chunked so the distance matrix stays small
        dm = np.hypot(cx[k:k + 2000, None] - ix[None], cy[k:k + 2000, None] - iy[None])
        nearest[k:k + 2000] = dm.argmin(axis=1)
        dist[k:k + 2000] = dm.min(axis=1)
    return nearest, dist


def intersections_within(lat, lon, inters, radius_m):
    """For each point, row positions of intersections within radius_m, nearest first."""
    ix = (inters.lon.to_numpy() - LON0) * M_PER_DEG_LON
    iy = (inters.lat.to_numpy() - LAT0) * M_PER_DEG_LAT
    cx = (np.asarray(lon, dtype=float) - LON0) * M_PER_DEG_LON
    cy = (np.asarray(lat, dtype=float) - LAT0) * M_PER_DEG_LAT
    out = []
    for k in range(0, len(cx), 2000):
        dm = np.hypot(cx[k:k + 2000, None] - ix[None], cy[k:k + 2000, None] - iy[None])
        for row in dm:
            hits = np.flatnonzero(row <= radius_m)
            out.append(hits[np.argsort(row[hits])])
    return out


def snap_leftovers(d, inters, since=SINCE_YEAR):
    """Attach crashes with no pair key to the nearest intersection within SNAP_M.

    Only crashes with no pair key that are coded at an intersection are
    candidates. Crashes that have a pair but were filtered out stay out: their
    coordinates sit on the reference corner whatever the reported offset, so
    distance says nothing about them. Address-only crashes not coded at an
    intersection stay out too: they cluster on a few house numbers next to
    busy corners (3970 SW Archer Rd), which reads as driveway crashes.
    """
    cand = d.index[d.pair.isna()]
    nearest, dist = nearest_intersection(d.loc[cand, "latitude"], d.loc[cand, "longitude"], inters)
    ids = inters.intersection_id.to_numpy()
    at = d.loc[cand, "at_intersection"].to_numpy() == 1
    keep = at & (dist <= SNAP_M)
    snap = dict(zip(cand[keep], ids[nearest[keep]]))

    d["snapped"] = False
    d.loc[list(snap), "snapped"] = True
    d.loc[list(snap), "intersection_id"] = pd.Series(snap)

    counted = d[d.intersection_id.notna()]
    g = counted.groupby("intersection_id")
    inters["crashes"] = inters.intersection_id.map(g.size())
    inters["crashes_window"] = inters.intersection_id.map(g.year.apply(lambda y: (y >= since).sum()))
    inters["snapped_window"] = inters.intersection_id.map(
        counted[counted.snapped & (counted.year >= since)].groupby("intersection_id").size()
    ).fillna(0).astype(int)
    return inters.sort_values("crashes_window", ascending=False).reset_index(drop=True)


def _display(name):
    """"SW 34TH ST & SW ARCHER RD" -> "SW 34th St & SW Archer Rd"."""
    keep = {"N", "S", "E", "W", "NW", "NE", "SW", "SE", "SR", "US", "CR", "FL", "&"}
    return " ".join(w if w in keep else w.lower() if w[0].isdigit() else w.capitalize()
                    for w in name.split())


def _slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def _shares(values, top=None):
    """Counts and shares of coded values, most common first. Uncoded values are left out."""
    v = pd.Series(values).dropna()
    v = v[~v.isin(UNCODED)]
    counts = v.value_counts()
    if top:
        counts = counts.head(top)
    return {"coded": int(len(v)),
            "values": [{"label": k, "count": int(c), "share": round(c / len(v), 3)} for k, c in counts.items()]}


def gnv_profile(g):
    """Profile of an intersection's dataGNV crashes (pass only the years you want)."""
    hours = g.hour.value_counts()
    return {
        "crashes": int(len(g)),
        "by_year": {int(y): int(c) for y, c in g.year.value_counts().sort_index().items()},
        "pedestrian_share": round(g.involves_pedestrian.mean(), 3),
        "bicycle_share": round(g.involves_bicycle.mean(), 3),
        "moped_share": round((g.mopeds > 0).mean(), 3),
        "motorcycle_share": round((g.motorcycles > 0).mean(), 3),
        "fatal_crashes": int((g.fatalities > 0).sum()),
        "fatalities": int(g.fatalities.sum()),
        "coded_at_intersection_share": round(g.at_intersection.mean(), 3),
        "intersection_type": _shares(g.intersection_type.where(g.at_intersection == 1), top=3),
        "by_hour": [int(hours.get(h, 0)) for h in range(24)],
        "by_weekday": {day: int((g.day_of_week == day).sum()) for day in WEEKDAYS},
    }


def _road_context(h):
    """Speed limit, lanes and traffic volume per road, from FDOT (medians over its crashes)."""
    out = []
    for road, r in h.dropna(subset=["on_norm"]).groupby("on_norm"):
        if r.AVERAGE_DAILY_TRAFFIC.notna().sum() == 0 and r.SPEED_LIMIT.notna().sum() == 0:
            continue
        med = lambda s: None if s.notna().sum() == 0 else float(s.median())
        out.append({"road": road, "crashes": int(len(r)), "speed_limit": med(r.SPEED_LIMIT),
                    "lanes": med(r.CNTOFLANES), "daily_traffic": med(r.AVERAGE_DAILY_TRAFFIC)})
    return sorted(out, key=lambda x: -x["crashes"])[:2]


def fdot_profile(h):
    """Profile of an intersection's FDOT crashes: how they happen."""
    return {
        "crashes": int(len(h)),
        "years": {int(y): int(c) for y, c in h.CALENDAR_YEAR.value_counts().sort_index().items()},
        "driver_actions": _shares(h.D1_FRST_DR_ACTN_CD_TXT, top=8),
        "collision_types": _shares(h.collision_type, top=8),
        "vehicle_movements": _shares(h.vehicle_movement, top=8),
        "lighting": _shares(h.lighting),
        "injury_severity": _shares(h.injury_severity),
        "traffic_control": _shares(h.V1TRAFCTL_TXT, top=5),
        "road_surface": _shares(h.road_surface, top=4),
        "flags": {name: round(h[name].mean(), 3) for name in FLAGS.values()},
        "roads": _road_context(h),
    }


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--since", type=int, default=SINCE_YEAR, help="first year counted for ranking and profiles")
    ap.add_argument("--until", type=int, help="drop crashes after this year (backtest)")
    ap.add_argument("--out", default=str(DERIVED / "hotspots.json"))
    args = ap.parse_args()

    d = load_intersection_crashes(args.until)

    raw = d.offset_from_cross.notna()
    print(f"offsets: {raw.sum()} present, {d.offset_ft.notna().sum()} parsed, "
          f"{(raw & d.offset_ft.isna()).sum()} unknown")
    print(f"crashes with a pair key: {d.pair.notna().sum()} of {len(d)}")
    print(f"  counted (at intersection or within {NEAR_FT} ft): {d.near.sum()}")
    print(f"    coded at intersection:  {(d.near & (d.at_intersection == 1)).sum()}")
    print(f"    approach, <= {NEAR_FT} ft:     {(d.near & (d.at_intersection == 0)).sum()}")
    far = d.pair.notna() & ~d.near
    print(f"  dropped: {far.sum()} ({(far & d.offset_ft.isna()).sum()} with no usable offset)")

    inters = merge_pairs(d, args.since)
    n_pairs = d.loc[d.near, "pair"].nunique()
    merged = inters[inters.pairs.map(len) > 1]
    print(f"\nmerge within {MERGE_M} m: {n_pairs} pairs -> {len(inters)} intersections "
          f"({len(merged)} absorbed at least one other pair)")
    print(f"largest group: {inters.pairs.map(len).max()} pairs")

    inters = snap_leftovers(d, inters, args.since)
    no_pair = d.pair.isna()
    no_pair_at = no_pair & (d.at_intersection == 1)
    print(f"\nsnap within {SNAP_M} m: {d.snapped.sum()} of {no_pair_at.sum()} crashes with no pair key "
          f"coded at an intersection")
    print(f"crashes on an intersection: {d.intersection_id.notna().sum()} of {len(d)}")

    # FDOT join
    # FDOT join: crashes also in dataGNV follow dataGNV's assignment; the rest snap by distance.
    f = snap_fdot(load_fdot(), inters, intersections_within, SNAP_M)
    snapped_id = f.intersection_id.copy()
    f = link_to_gnv(f, d)
    near = f.near_corner & ~f.linked
    driveway = near & (f.JCT_CD == 4)
    i75 = near & ~driveway & (f.on_norm.isna() | (f.on_norm == "SR 93"))
    print(f"\nFDOT: {len(f)} crashes after dropping duplicates; {f.intersection_id.notna().sum()} attached")
    print(f"  linked to dataGNV by report number: {f.linked.sum()} "
          f"({(f.linked & f.intersection_id.notna()).sum()} at an intersection, the rest mid-block)")
    both = f.linked & (f.intersection_id.notna() | snapped_id.notna())
    print(f"    where distance matching would have put them elsewhere or nowhere: "
          f"{(both & (f.intersection_id.fillna('') != snapped_id.fillna(''))).sum()} of {both.sum()}")
    print(f"  snapped by distance (not in dataGNV): {(~f.linked & f.intersection_id.notna()).sum()}; left out near "
          f"a corner: driveway {driveway.sum()}, I-75 or no road {i75.sum()}, "
          f"no street in common {(near & ~driveway & ~i75 & f.intersection_id.isna()).sum()}")
    inters["fdot_crashes"] = inters.intersection_id.map(f.intersection_id.value_counts()).fillna(0).astype(int)

    # Every intersection with a crash in the window, ranked citywide.
    DERIVED.mkdir(parents=True, exist_ok=True)
    if args.until is None:  # a backtest run must not overwrite the current table
        inters.assign(pairs=inters.pairs.map(" | ".join)).to_csv(DERIVED / "intersections.csv", index=False)

    ranked = inters[inters.crashes_window > 0]
    window = d[d.intersection_id.notna() & (d.year >= args.since)]
    by_id_gnv = dict(tuple(window.groupby("intersection_id")))
    by_id_fdot = dict(tuple(f[f.intersection_id.notna()].groupby("intersection_id")))
    hotspots = []
    for rank, r in enumerate(ranked.itertuples(), 1):
        hotspots.append({
            "id": _slug(r.intersection_id),
            "rank": rank,
            "name": _display(r.intersection_id),
            "lat": round(r.lat, 6), "lon": round(r.lon, 6),
            "merged_names": r.pairs,
            "crashes_all_years": int(r.crashes),
            "crashes": gnv_profile(by_id_gnv[r.intersection_id]),
            "causes_fdot": fdot_profile(by_id_fdot.get(r.intersection_id, f.iloc[0:0])),
        })

    last = d.crash_date.max()
    out = {
        "generated": str(date.today()),
        "definitions": {
            "crashes": f"dataGNV crashes {args.since} to {last}, at the intersection "
                       f"or within {NEAR_FT} ft of it",
            "causes_fdot": f"FDOT crashes 2015 to 2019 (mostly 2015 to 2018) within {SNAP_M} m, "
                           "excluding driveway-related and I-75",
            "hotspots": f"every intersection with a crash from {args.since} to {last}, "
                        "ranked citywide by that count",
            "shares": "share of coded values; NOT CODED / UNKNOWN left out",
            "roads": "FDOT road context per road at the corner, medians over its crashes",
        },
        "hotspots": hotspots,
    }
    out_path = Path(args.out)
    out_path.write_text(json.dumps(out, separators=(",", ":")))
    if args.until is None:
        print(f"\nwrote {len(inters)} intersections to data/derived/intersections.csv")
    print(f"wrote {len(hotspots)} intersections ({out_path.stat().st_size / 1e6:.1f} MB) to {out_path}")

    print(f"\nTop 15 citywide (crashes {args.since} to {last} / FDOT crashes):")
    for h in hotspots[:15]:
        print(f"{h['rank']:3d}. {h['crashes']['crashes']:4d} / {h['causes_fdot']['crashes']:4d}  {h['name']}")
