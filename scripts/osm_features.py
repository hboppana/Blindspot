"""Road-design features for every intersection from OpenStreetMap.

A second source next to Gemini (workstream 2): free, no key, and it covers
all intersections. It doubles as the fallback if Gemini's labels don't pass
the hand check.

Matching: each intersection is matched to the OSM node where its streets
meet, by name (OSM's "Southwest Archer Road" normalizes to SW ARCHER RD).
An intersection whose streets don't meet in OSM within JUNCTION_M stays
unmatched rather than borrowing features from a neighbour.

A missing OSM tag usually means nobody mapped it, not that the feature is
absent. So every feature is yes / no / blank (unknown), and "no" only comes
from a tag that says so (cycleway=no, crossing=unmarked, a way that is not
oneway). Traffic signals and crosswalks have no "no" tag: they are counts,
and a 0 is weak evidence.

Source: OpenStreetMap contributors, ODbL (attribution required if shown).
Raw download cached at data/raw/osm_gainesville.json.

Usage: python scripts/osm_features.py            # fetch once, then build
       python scripts/osm_features.py --refetch  # download again
"""

import argparse
import csv
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd

from build_hotspots import LAT0, LON0, M_PER_DEG_LAT, M_PER_DEG_LON
from streets import ROUTE_NAME, normalize_street, street_base

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "osm_gainesville.json"
DERIVED = ROOT / "data" / "derived"
OUT = DERIVED / "road_features_osm.csv"

OVERPASS = "https://overpass-api.de/api/interpreter"
OVERPASS_MIRROR = "https://overpass.private.coffee/api/interpreter"
BBOX = (29.50, -82.61, 29.85, -82.08)  # every intersection, with a margin
ROADS = ("motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|"
         "tertiary|tertiary_link|unclassified|residential|living_street")
QUERY = f"""
[out:json][timeout:300];
(
  way["highway"~"^({ROADS})$"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
  way["footway"="crossing"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
  node["highway"~"^(crossing|traffic_signals)$"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});
);
out body;
>;
out body qt;
"""

JUNCTION_M = 60  # our intersection point to the OSM junction node
NEAR_M = 50      # signals, crossings and road ways counted around the intersection
NAME_TAGS = ("name", "alt_name", "old_name", "official_name", "ref")
MARKED = {"marked", "zebra", "traffic_signals", "uncontrolled"}
BIKE_YES = {"lane", "track", "buffered_lane", "separate", "opposite_lane", "opposite_track"}
BIKE_NO = {"no", "none", "shared_lane", "share_busway"}
TURN_TAGS = ("turn:lanes", "turn:lanes:forward", "turn:lanes:backward")
BIKE_TAGS = ("cycleway", "cycleway:both", "cycleway:left", "cycleway:right")


def fetch(refetch=False):
    if RAW.exists() and not refetch:
        return json.loads(RAW.read_bytes())
    data = urllib.parse.urlencode({"data": QUERY}).encode()
    # Public Overpass servers are often busy (429/504); retry, then try the mirror.
    for attempt, url in enumerate([OVERPASS, OVERPASS, OVERPASS_MIRROR, OVERPASS_MIRROR]):
        req = urllib.request.Request(url, data=data, headers={"User-Agent": "Blindspot (ShellHacks 2026)"})
        try:
            with urllib.request.urlopen(req, timeout=400) as resp:
                body = resp.read()
            break
        except urllib.error.HTTPError as e:
            if e.code not in (429, 502, 503, 504) or attempt == 3:
                raise
            print(f"Overpass {url}: HTTP {e.code}, retrying")
            time.sleep(15 * (attempt + 1))
    RAW.write_bytes(body)
    return json.loads(body)


def xy(lat, lon):
    return ((np.asarray(lon, dtype=float) - LON0) * M_PER_DEG_LON,
            (np.asarray(lat, dtype=float) - LAT0) * M_PER_DEG_LAT)


def way_names(tags):
    """Normalized street names a road way goes by, from name, alt_name, ref, ..."""
    names = set()
    for key in NAME_TAGS:
        for value in str(tags.get(key, "")).split(";"):
            n = normalize_street(value.strip()) if value.strip() else None
            if n:
                names.add(n)
    return names


def tri(values, yes, no):
    """yes if any value is in yes, no if all present values are in no, else unknown."""
    values = [v for v in values if v]
    if any(v in yes for v in values):
        return "yes"
    if values and all(v in no for v in values):
        return "no"
    return ""


def speed_mph(value):
    m = re.match(r"^\s*(\d+)\s*(mph)?", str(value or ""))
    return int(m.group(1)) if m else None


def _direction(way, nodes):
    """Unit vector from a way's first node to its last (its travel direction if one-way)."""
    pts = [nodes[n] for n in (way["nodes"][0], way["nodes"][-1]) if n in nodes]
    if len(pts) < 2:
        return None
    dx = (pts[1]["lon"] - pts[0]["lon"]) * M_PER_DEG_LON
    dy = (pts[1]["lat"] - pts[0]["lat"]) * M_PER_DEG_LAT
    norm = np.hypot(dx, dy)
    return (dx / norm, dy / norm) if norm else None


def street_features(ways, nodes):
    """Features of one street's ways near the intersection."""
    tags = [w["tags"] for w in ways]
    lanes = [int(t["lanes"]) for t in tags if str(t.get("lanes", "")).isdigit()]
    turn = [t[k] for t in tags for k in TURN_TAGS if k in t]
    bike = [t[k] for t in tags for k in BIKE_TAGS if k in t]
    speeds = [s for s in (speed_mph(t.get("maxspeed")) for t in tags) if s]

    # A divided road is mapped as two one-way carriageways running opposite
    # ways. A one-way street split at the junction also gives two one-way
    # pieces, but they point the same way.
    oneway_dirs = [d for w in ways if w["tags"].get("oneway") == "yes"
                   and (d := _direction(w, nodes)) is not None]
    opposite = any(a[0] * b[0] + a[1] * b[1] < -0.7 for i, a in enumerate(oneway_dirs) for b in oneway_dirs[i + 1:])
    two_way = any(w["tags"].get("oneway", "no") == "no" for w in ways)
    return {
        # OSM lanes: on a divided road this is ONE direction, turn lanes included.
        "osm_lanes_max": max(lanes) if lanes else None,
        "left_turn_lane": ("yes" if any("left" in v for v in turn) else "no") if turn else "",
        "bike_lane": tri(bike, BIKE_YES, BIKE_NO),
        "divided": "yes" if opposite else ("no" if two_way or oneway_dirs else ""),
        "one_way": "yes" if oneway_dirs and not opposite and not two_way else "",
        "speed_mph": max(speeds) if speeds else None,
    }


def build(osm, inters):
    nodes = {e["id"]: e for e in osm["elements"] if e["type"] == "node"}
    ways = [e for e in osm["elements"] if e["type"] == "way"]
    roads = [w for w in ways if w.get("tags", {}).get("highway", "") and w["tags"].get("footway") != "crossing"]
    crossing_ways = [w for w in ways if w.get("tags", {}).get("footway") == "crossing"]
    for w in roads:
        w["names"] = way_names(w.get("tags", {}))
        w["bases"] = {street_base(n) for n in w["names"]}

    node_ways = {}
    for i, w in enumerate(roads):
        for nid in w["nodes"]:
            node_ways.setdefault(nid, []).append(i)
    road_nodes = np.array([n for n in node_ways if n in nodes])
    rx, ry = xy([nodes[n]["lat"] for n in road_nodes], [nodes[n]["lon"] for n in road_nodes])

    tagged = [n for n in nodes.values() if n.get("tags", {}).get("highway") in ("crossing", "traffic_signals")]
    tx, ty = xy([n["lat"] for n in tagged], [n["lon"] for n in tagged])
    on_crossing_way = {nid for w in crossing_ways for nid in w["nodes"]}
    cw_x, cw_y = xy([np.mean([nodes[n]["lat"] for n in w["nodes"] if n in nodes]) for w in crossing_ways],
                    [np.mean([nodes[n]["lon"] for n in w["nodes"] if n in nodes]) for w in crossing_ways])

    rows = []
    for r in inters.itertuples():
        ix, iy = xy(r.lat, r.lon)
        streets = {street_base(s) for p in r.pairs.split(" | ") for s in p.split(" & ")}
        routes = {s for p in r.pairs.split(" | ") for s in p.split(" & ") if ROUTE_NAME.match(s)}
        dist = np.hypot(rx - ix, ry - iy)
        near = np.flatnonzero(dist <= JUNCTION_M)

        # Junction: the nearest node where ways of two of our streets meet.
        junction, junction_d = None, None
        for k in near[np.argsort(dist[near])]:
            matched = set()
            for wi in node_ways[road_nodes[k]]:
                matched |= roads[wi]["bases"] & streets
                matched |= {"route"} if roads[wi]["names"] & routes else set()
            if len(matched) >= 2:
                junction, junction_d = road_nodes[k], float(dist[k])
                break

        row = {"intersection_id": r.intersection_id, "osm_matched": junction is not None,
               "junction_m": round(junction_d, 1) if junction_d is not None else None}
        if junction is not None:
            close = {road_nodes[k] for k in np.flatnonzero(dist <= NEAR_M)}
            near_ways = {wi for n in close for wi in node_ways[n]}
            # Route numbers only help find the junction; features are per named street.
            per_street = {}
            for s in sorted(x for x in streets if not ROUTE_NAME.match(x)):
                ws = [roads[wi] for wi in near_ways if s in roads[wi]["bases"]]
                if ws:
                    per_street[s] = street_features(ws, nodes)

            td = np.hypot(tx - ix, ty - iy)
            near_tags = [tagged[k]["tags"] for k in np.flatnonzero(td <= NEAR_M)]
            near_node_crossings = [tagged[k] for k in np.flatnonzero(td <= NEAR_M)
                                   if tagged[k]["tags"].get("highway") == "crossing"
                                   and tagged[k]["id"] not in on_crossing_way]
            near_cw = [crossing_ways[k] for k in np.flatnonzero(np.hypot(cw_x - ix, cw_y - iy) <= NEAR_M)]
            crossings = [n["tags"] for n in near_node_crossings] + [w["tags"] for w in near_cw]

            def kind(t):
                if t.get("crossing") in MARKED or t.get("crossing:markings", "no") not in ("no",):
                    return "marked"
                return "unmarked" if t.get("crossing") == "unmarked" or t.get("crossing:markings") == "no" else "unknown"

            kinds = [kind(t) for t in crossings]
            vals = list(per_street.values())
            row.update({
                "streets_matched": len(per_street),
                "traffic_signal": "yes" if any(t.get("highway") == "traffic_signals" for t in near_tags) else "",
                "crossings": len(crossings),
                "crossings_marked": kinds.count("marked"),
                "crossings_unmarked": kinds.count("unmarked"),
                "crossings_signalized": sum(t.get("crossing") == "traffic_signals"
                                            or t.get("crossing:signals") == "yes" for t in crossings),
                "osm_lanes_max": max((v["osm_lanes_max"] for v in vals if v["osm_lanes_max"]), default=None),
                "left_turn_lane": tri([v["left_turn_lane"] for v in vals], {"yes"}, {"no"}),
                "bike_lane": tri([v["bike_lane"] for v in vals], {"yes"}, {"no"}),
                "divided": tri([v["divided"] for v in vals], {"yes"}, {"no"}),
                "one_way_street": "yes" if any(v["one_way"] == "yes" for v in vals) else "",
                "max_speed_mph": max((v["speed_mph"] for v in vals if v["speed_mph"]), default=None),
                "streets": json.dumps(per_street),
            })
        rows.append(row)
    return pd.DataFrame(rows)


def coverage(df, label):
    m = df[df.osm_matched]
    known = lambda col: (m[col].fillna("").astype(str) != "").mean()
    print(f"\n{label}: {len(df)} intersections, {len(m)} matched to OSM ({len(m) / len(df):.0%})")
    if len(m):
        print(f"  of matched: signal tagged {(m.traffic_signal == 'yes').mean():.0%}, "
              f"any crossing mapped {(m.crossings > 0).mean():.0%}, lanes known {known('osm_lanes_max'):.0%}, "
              f"turn lanes known {known('left_turn_lane'):.0%}, bike lane known {known('bike_lane'):.0%}, "
              f"divided known {known('divided'):.0%}, speed known {known('max_speed_mph'):.0%}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--refetch", action="store_true")
    args = ap.parse_args()

    osm = fetch(args.refetch)
    kinds = pd.Series([e["type"] for e in osm["elements"]]).value_counts().to_dict()
    print(f"OSM: {kinds} ({RAW.stat().st_size / 1e6:.1f} MB cached)")

    inters = pd.read_csv(DERIVED / "intersections.csv")
    df = build(osm, inters)
    df.to_csv(OUT, index=False)
    print(f"wrote {len(df)} rows -> {OUT.relative_to(ROOT)}")

    coverage(df, "All intersections")
    top = inters.sort_values("crashes_2022_on", ascending=False).head(200).intersection_id
    coverage(df[df.intersection_id.isin(top)], "Top 200 by crashes since 2022")
    hc = DERIVED / "handcheck_corners.csv"
    if hc.exists():
        from build_hotspots import _slug
        ids = set(pd.read_csv(hc).id)
        coverage(df[df.intersection_id.map(_slug).isin(ids)], "Hand-check corners")
