"""Merge road features from Gemini, OSM and FDOT into one row per intersection.

Which source each feature comes from, based on the hand check and benchmark:

  traffic_signal   yes if OSM tags a signal (an explicit tag is reliable),
                   otherwise Gemini's answer
  crosswalks,      Gemini, per leg (these passed the hand check). Crosswalks
  left-turn lanes, are marked low confidence at quiet corners, where Gemini
  medians          misses faded and brick crosswalks
  lanes, speed,    FDOT's road inventory where the corner has FDOT crashes
  daily traffic    (state roads mostly), else OSM
  road class       OSM, major and minor street: the traffic stand-in where
                   FDOT has no count

Features that failed the hand check (protected arrows, pedestrian signals,
bike lanes, Gemini lane counts) are left out.

Output: data/derived/road_features.csv
Usage:  python scripts/merge_features.py
"""

import json
from pathlib import Path

import pandas as pd

from build_hotspots import _slug

ROOT = Path(__file__).resolve().parent.parent
DERIVED = ROOT / "data" / "derived"
IMAGERY = ROOT / "data" / "imagery"
MODEL = "gemini-3.7-flash"
BUSY = 20  # crashes since 2022; crosswalk labels are high confidence at or above this


def gemini(cid):
    path = IMAGERY / cid / f"gemini_{MODEL}_v1.json"
    if not path.exists():
        return {}
    a = json.loads(path.read_text())["answers"]
    meta = json.loads((IMAGERY / cid / "meta.json").read_text())
    legs = a["legs"]
    count = lambda f: sum(leg[f] == "yes" for leg in legs)
    anyof = lambda f: "yes" if count(f) else ("no" if all(leg[f] == "no" for leg in legs) else "")
    dates = sorted(v["date"] for v in meta.get("views", []) if v.get("date"))
    return {
        "legs_seen": len(legs),
        "gemini_signal": a["traffic_signal"],
        "crosswalk_legs": count("marked_crosswalk"), "crosswalk": anyof("marked_crosswalk"),
        "left_turn_lane_legs": count("left_turn_lane"), "left_turn_lane": anyof("left_turn_lane"),
        "median_legs": count("median"), "median": anyof("median"),
        "imagery_from": dates[0] if dates else "", "imagery_to": dates[-1] if dates else "",
    }


def fdot_roads(h):
    roads = h["causes_fdot"]["roads"]
    vals = lambda k: [r[k] for r in roads if r.get(k)]
    return {"fdot_lanes_max": max(vals("lanes"), default=None),
            "fdot_speed_max": max(vals("speed_limit"), default=None),
            "daily_traffic_max": max(vals("daily_traffic"), default=None)}


def main():
    inters = pd.read_csv(DERIVED / "intersections.csv")
    osm = pd.read_csv(DERIVED / "road_features_osm.csv").set_index("intersection_id")
    hot = {h["id"]: h for h in json.loads((DERIVED / "hotspots.json").read_text())["hotspots"]}

    rows = []
    for r in inters.itertuples():
        cid = _slug(r.intersection_id)
        o = osm.loc[r.intersection_id] if r.intersection_id in osm.index else None
        g = gemini(cid)
        row = {"intersection_id": r.intersection_id, "id": cid, "crashes_window": r.crashes_window,
               "crashes_all_years": r.crashes, "fdot_crashes": r.fdot_crashes,
               "osm_matched": bool(o is not None and o.osm_matched), "has_gemini": bool(g)}
        osm_signal = o is not None and o.traffic_signal == "yes"
        row["traffic_signal"] = "yes" if osm_signal else g.get("gemini_signal", "")
        row["signal_source"] = "osm" if osm_signal else ("gemini" if g else "")
        row.update({k: v for k, v in g.items() if k != "gemini_signal"})
        row["crosswalk_confidence"] = ("high" if r.crashes_window >= BUSY else "low") if g else ""
        if o is not None and o.osm_matched:
            row.update({"osm_divided": o.divided if isinstance(o.divided, str) else "",
                        "osm_left_turn_lane": o.left_turn_lane if isinstance(o.left_turn_lane, str) else "",
                        "osm_lanes_max": o.osm_lanes_max, "osm_speed_max": o.max_speed_mph,
                        "major_road_class": o.major_road_class, "minor_road_class": o.minor_road_class})
        if cid in hot:
            row.update(fdot_roads(hot[cid]))
        rows.append(row)

    out = pd.DataFrame(rows)
    out["speed_limit"] = out.fdot_speed_max.fillna(out.osm_speed_max)
    out.to_csv(DERIVED / "road_features.csv", index=False)

    print(f"{len(out)} intersections -> data/derived/road_features.csv")
    print(f"  with Gemini labels: {out.has_gemini.sum()}, OSM matched: {out.osm_matched.sum()}, "
          f"FDOT traffic count: {out.daily_traffic_max.notna().sum()}, road class: {out.major_road_class.notna().sum()}")
    for f in ("traffic_signal", "crosswalk", "left_turn_lane", "median"):
        print(f"  {f:15s} {out[f].value_counts().to_dict()}")


if __name__ == "__main__":
    main()
