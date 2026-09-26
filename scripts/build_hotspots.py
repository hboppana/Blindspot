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

Requires: pip install pandas numpy
Usage:    python scripts/build_hotspots.py
"""

import re
from fractions import Fraction
from pathlib import Path

import numpy as np
import pandas as pd

from streets import normalize_street, pair_key

ROOT = Path(__file__).resolve().parent.parent
CRASHES = ROOT / "data" / "processed" / "gnv_crashes_clean.csv"

NEAR_FT = 150  # about 45 m
MAX_MILES = 2
OFFSET = re.compile(r"^\s*([\d./]+)\s+(FEET|MILES)\s*$")

MERGE_M = 30
SNAP_M = 40
# Local flat projection around Gainesville; error is well under a metre at this scale.
LAT0, LON0 = 29.65, -82.35
M_PER_DEG_LAT = 110_860
M_PER_DEG_LON = 111_320 * np.cos(np.radians(LAT0))
ROUTE_NAME = re.compile(r"^(SR|US|CR|FL) \d+$")


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


def load_intersection_crashes():
    """All crashes with a pair key, plus a flag for whether each one counts."""
    d = pd.read_csv(CRASHES, low_memory=False)
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


def _base(street):
    """Street name without its direction: "SW ARCHER RD" -> "ARCHER RD"."""
    words = street.split()
    return " ".join(words[1:]) if words[0] in {"N", "S", "E", "W", "NW", "NE", "SW", "SE"} else street


def _can_merge(pair_a, pair_b):
    a, b = pair_a.split(" & "), pair_b.split(" & ")
    if any(ROUTE_NAME.match(s) for s in a + b):
        return True
    return bool({_base(s) for s in a} & {_base(s) for s in b})


def _median_location(crashes):
    at = crashes[crashes.at_intersection == 1]
    use = at if len(at) else crashes
    return use.latitude.median(), use.longitude.median()


def merge_pairs(d):
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
        [(i, *_median_location(g), len(g), (g.year >= 2022).sum(),
          sorted(pairs.pair[pairs.intersection_id == i]))
         for i, g in counted.groupby("intersection_id")],
        columns=["intersection_id", "lat", "lon", "crashes", "crashes_2022_on", "pairs"],
    )
    return inters.sort_values("crashes_2022_on", ascending=False).reset_index(drop=True)


def snap_leftovers(d, inters):
    """Attach crashes with no pair key to the nearest intersection within SNAP_M.

    Only crashes with no pair key that are coded at an intersection are
    candidates. Crashes that have a pair but were filtered out stay out: their
    coordinates sit on the reference corner whatever the reported offset, so
    distance says nothing about them. Address-only crashes not coded at an
    intersection stay out too: they cluster on a few house numbers next to
    busy corners (3970 SW Archer Rd), which reads as driveway crashes.
    """
    cand = d.index[d.pair.isna()]
    ix = (inters.lon.to_numpy() - LON0) * M_PER_DEG_LON
    iy = (inters.lat.to_numpy() - LAT0) * M_PER_DEG_LAT
    cx = (d.loc[cand, "longitude"].to_numpy() - LON0) * M_PER_DEG_LON
    cy = (d.loc[cand, "latitude"].to_numpy() - LAT0) * M_PER_DEG_LAT

    nearest = np.empty(len(cand), dtype=int)
    dist = np.empty(len(cand))
    for k in range(0, len(cand), 2000):  # chunked so the distance matrix stays small
        dm = np.hypot(cx[k:k + 2000, None] - ix[None], cy[k:k + 2000, None] - iy[None])
        nearest[k:k + 2000] = dm.argmin(axis=1)
        dist[k:k + 2000] = dm.min(axis=1)

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
    inters["crashes_2022_on"] = inters.intersection_id.map(g.year.apply(lambda y: (y >= 2022).sum()))
    inters["snapped_2022_on"] = inters.intersection_id.map(
        counted[counted.snapped & (counted.year >= 2022)].groupby("intersection_id").size()
    ).fillna(0).astype(int)
    return inters.sort_values("crashes_2022_on", ascending=False).reset_index(drop=True)


if __name__ == "__main__":
    d = load_intersection_crashes()

    raw = d.offset_from_cross.notna()
    print(f"offsets: {raw.sum()} present, {d.offset_ft.notna().sum()} parsed, "
          f"{(raw & d.offset_ft.isna()).sum()} unknown")
    print(f"crashes with a pair key: {d.pair.notna().sum()} of {len(d)}")
    print(f"  counted (at intersection or within {NEAR_FT} ft): {d.near.sum()}")
    print(f"    coded at intersection:  {(d.near & (d.at_intersection == 1)).sum()}")
    print(f"    approach, <= {NEAR_FT} ft:     {(d.near & (d.at_intersection == 0)).sum()}")
    far = d.pair.notna() & ~d.near
    print(f"  dropped: {far.sum()} ({(far & d.offset_ft.isna()).sum()} with no usable offset)")

    inters = merge_pairs(d)
    n_pairs = d.loc[d.near, "pair"].nunique()
    merged = inters[inters.pairs.map(len) > 1]
    print(f"\nmerge within {MERGE_M} m: {n_pairs} pairs -> {len(inters)} intersections "
          f"({len(merged)} absorbed at least one other pair)")
    print(f"largest group: {inters.pairs.map(len).max()} pairs")

    inters = snap_leftovers(d, inters)
    no_pair = d.pair.isna()
    no_pair_at = no_pair & (d.at_intersection == 1)
    print(f"\nsnap within {SNAP_M} m: {d.snapped.sum()} of {no_pair_at.sum()} crashes with no pair key "
          f"coded at an intersection")
    print(f"crashes on an intersection: {d.intersection_id.notna().sum()} of {len(d)}")

    print("\nTop 20 intersections, 2022 onward (snapped crashes in brackets):")
    for _, r in inters.head(20).iterrows():
        print(f"{r.crashes_2022_on:5d}  ({r.snapped_2022_on:3d})  {r.intersection_id}")
