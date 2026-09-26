"""Recommend FHWA countermeasures per intersection (workstream 4).

For each intersection in causes.json:
  targets   its distinctive factors (crash types clearly above similar
            corners); if none, its main or leading factor; plus "dark" when
            at least DARK_SHARE of its FDOT crashes were in the dark, and
            "speed" when the speed limit is 45+ mph and rear-ends or angle
            crashes are a target
  filter    a countermeasure from data/reference/countermeasures.json is
            suggested only if it addresses a target and its conditions hold
            at this corner (signal status, legs missing a left-turn lane or
            median, lanes, share of crashes in the dark)
  order     aimed at a missing feature seen in the imagery first, then
            low-cost changes, then larger projects
  local     the verified Gainesville example (local_fixes_verified.json)
            when its change matches

Each recommendation carries FHWA's figures as published, with the URL, so
case files quote them rather than our own estimates.

Output: data/derived/recommendations.json
Usage:  python scripts/recommend.py
"""

import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DERIVED = ROOT / "data" / "derived"
REF = ROOT / "data" / "reference"
OUT = DERIVED / "recommendations.json"

DARK_SHARE = 0.35
COST = {"yellow_change_intervals": "low", "signal_backplates": "low", "leading_pedestrian_interval": "low",
        "crosswalk_visibility": "low", "stop_controlled_low_cost": "low", "rrfb": "low",
        "pedestrian_hybrid_beacon": "medium", "lighting": "medium", "median_refuge_island": "medium",
        "right_turn_lanes": "medium", "left_turn_lanes": "medium", "road_diet": "medium",
        "speed_safety_cameras": "medium", "bicycle_lanes": "medium",
        "reduced_left_turn_conflict": "high", "roundabout": "high", "access_management": "high"}
COST_ORDER = {"low": 0, "medium": 1, "high": 2}
# Which verified local change counts as an example of which countermeasure.
LOCAL_MATCH = {"NW 69TH TER & W NEWBERRY RD": ["left_turn_lanes", "right_turn_lanes"]}


def conditions_hold(cond, feat, dark_share, missing):
    if cond.get("signal") and feat.get("traffic_signal") != cond["signal"]:
        return False
    if cond.get("legs_missing") and not missing.get(cond["legs_missing"]):
        return False
    lanes = feat.get("fdot_lanes_max")
    if cond.get("max_lanes") and pd.notna(lanes) and lanes > cond["max_lanes"]:
        return False
    if cond.get("lanes_exactly") and not (pd.notna(lanes) and lanes == cond["lanes_exactly"]):
        return False
    if cond.get("median_on_no_leg") and feat.get("median") != "no":
        return False
    if cond.get("min_dark_share") and dark_share < cond["min_dark_share"]:
        return False
    speed = feat.get("speed_limit")
    if cond.get("min_speed_limit") and not (pd.notna(speed) and speed >= cond["min_speed_limit"]):
        return False
    return True


def main():
    library = json.loads((REF / "countermeasures.json").read_text())["countermeasures"]
    causes = json.loads((DERIVED / "causes.json").read_text())["intersections"]
    feats = {r["id"]: r for r in pd.read_csv(DERIVED / "road_features.csv").to_dict("records")}
    local = {x["intersection_id"]: x for x in json.loads((REF / "local_fixes_verified.json").read_text())["findings"]
             if x["status"] == "verified_timing"}

    out = {}
    for cid, c in causes.items():
        feat = feats.get(cid, {})
        targets = [x["type"] for x in c["distinctive_factors"]]
        basis = "distinctive"
        if not targets and c["main_factor"]:
            targets, basis = [c["main_factor"]], c["verdict"]
        if c["dark_share"] >= DARK_SHARE:
            targets.append("dark")
        speed = feat.get("speed_limit")
        if pd.notna(speed) and speed >= 45 and {"rear_end", "angle"} & set(targets):
            targets.append("speed")
        legs = feat.get("legs_seen")
        missing = {}
        if pd.notna(legs):
            missing = {"left_turn_lane": feat.get("left_turn_lane_legs", legs) < legs,
                       "median": feat.get("median_legs", legs) < legs}

        recs = []
        for key, cm in library.items():
            hits = [t for t in targets if t in cm["addresses"]]
            if not hits or not conditions_hold(cm["applies_when"], feat, c["dark_share"], missing):
                continue
            aimed = bool(cm["applies_when"].get("legs_missing"))
            example = next((dict(intersection=iid, change=x["change"], effect=x["effect"], caveats=x["caveats"])
                            for iid, x in local.items() if key in LOCAL_MATCH.get(iid, [])), None)
            recs.append({"id": key, "name": cm["name"], "for": hits, "cost": COST[key],
                         "aimed_at_missing_feature": aimed,
                         "larger_project": bool(cm["applies_when"].get("major_project") or cm["applies_when"].get("corridor")),
                         "fhwa_effects": cm["effects"], "url": cm["url"], "local_example": example})
        recs.sort(key=lambda r: (r["larger_project"], not r["aimed_at_missing_feature"], COST_ORDER[r["cost"]]))
        note = None
        if "left_turn" in targets and feat.get("traffic_signal") == "yes" and not missing.get("left_turn_lane"):
            note = ("Left-turn crashes are high although every leg already has a left-turn lane: how left turns are "
                    "signalled (e.g. protected phasing) is worth reviewing. That is not an FHWA Proven Safety "
                    "Countermeasure, so no figure is quoted.")
        out[cid] = {"name": c["name"], "targets": targets, "basis": basis if targets else None,
                    "confidence": c["confidence"], "recommendations": recs, "note": note}

    OUT.write_text(json.dumps({"source": "data/reference/countermeasures.json (FHWA Proven Safety Countermeasures)",
                               "intersections": out}, indent=1))
    with_recs = sum(1 for v in out.values() if v["recommendations"])
    print(f"{len(out)} intersections; {with_recs} with at least one countermeasure -> {OUT.relative_to(ROOT)}")
    top = json.loads((DERIVED / "causes.json").read_text())["screening"]
    for cid in sorted(top, key=lambda k: top[k]["rank"])[:8]:
        v = out.get(cid)
        if not v:
            continue
        first = "; ".join(f"{r['name']} ({r['fhwa_effects'][0]['value']} {r['fhwa_effects'][0]['measure'].split(' (')[0]})"
                          for r in v["recommendations"][:3]) or "none"
        print(f"\n{v['name']}  targets {v['targets']}\n  -> {first}" + (f"\n  note: {v['note'][:90]}..." if v["note"] else ""))


if __name__ == "__main__":
    main()
