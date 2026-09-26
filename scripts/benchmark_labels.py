"""Benchmark Gemini's road-feature labels after a batch (workstream 2).

Two checks:
  1. Automatic, every labeled corner: Gemini against OSM wherever OSM gives a
     definite answer, per feature, with a pass mark. OSM is not ground truth
     (it misses things), so a low number means "look closer", and the hand
     check stays the reference. Also reports coverage, "cant_tell" rates and
     how old the Street View imagery is.
  2. A random sample of corners, excluding the hand-check set, to read by eye
     against the images, the same way as the 20-corner hand check.

Only the features that passed the hand check are scored: signal, marked
crosswalk, left-turn lane, median. Protected arrows, pedestrian signals,
bike lanes and lane counts failed it and are not used downstream.

Usage: python scripts/benchmark_labels.py [--model gemini-3.7-flash] [--sample 10]
"""

import argparse
import csv
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMAGERY = ROOT / "data" / "imagery"
DERIVED = ROOT / "data" / "derived"

# Agreement with OSM needed to call a feature decent. The hand-check corners
# scored 100% (signal), 100% (left turn), 94% (median) against OSM, and
# 93-100% against a careful read, so 85% leaves room for OSM's own gaps.
PASS = {"traffic_signal": 0.85, "left_turn_lane": 0.85, "marked_crosswalk": 0.85, "median": 0.80}
MAX_CANT_TELL = 0.15  # share of answers on the scored features
OLD_IMAGERY_YEAR = 2020


def load(model):
    from build_hotspots import _slug  # noqa: E402  (scripts/ on sys.path when run directly)
    osm = {_slug(r["intersection_id"]): r
           for r in csv.DictReader(open(DERIVED / "road_features_osm.csv", encoding="utf-8"))}
    rows = []
    for folder in sorted(IMAGERY.glob("*")):
        meta_path, label_path = folder / "meta.json", folder / f"gemini_{model}_v1.json"
        if not meta_path.exists():
            continue
        meta = json.loads(meta_path.read_text())
        labels = json.loads(label_path.read_text())["answers"] if label_path.exists() else None
        rows.append({"id": folder.name, "meta": meta, "labels": labels, "osm": osm.get(folder.name)})
    return rows


def any_leg(labels, feature):
    vals = [leg[feature] for leg in labels["legs"]]
    if "yes" in vals:
        return "yes"
    return "no" if vals and all(v == "no" for v in vals) else None


def osm_answer(o, feature):
    """OSM's definite answer for a corner-level feature, or None."""
    if not o or o["osm_matched"] != "True":
        return None
    if feature == "traffic_signal":
        return "yes" if o["traffic_signal"] == "yes" else None  # OSM has no "no" for signals
    if feature == "left_turn_lane":
        return o["left_turn_lane"] or None
    if feature == "median":
        return o["divided"] or None
    if feature == "marked_crosswalk":
        return "yes" if o["crossings_marked"] not in ("", "0", "0.0") else None
    return None


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--model", default="gemini-3.7-flash")
    ap.add_argument("--sample", type=int, default=10)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    rows = load(args.model)
    labeled = [r for r in rows if r["labels"]]
    print(f"Coverage: {len(labeled)} of {len(rows)} fetched corners labeled with {args.model}")
    no_views = sum(1 for r in rows if not r["meta"].get("views"))
    print(f"  no Street View at all: {no_views}")

    dates = [v.get("date") for r in rows for v in r["meta"].get("views", []) if v.get("date")]
    old = sum(1 for d in dates if int(d[:4]) < OLD_IMAGERY_YEAR)
    print(f"  Street View images older than {OLD_IMAGERY_YEAR}: {old} of {len(dates)} ({old / max(len(dates), 1):.0%})")

    print(f"\n{'feature':18s} {'compared':>8s} {'agree':>7s} {'pass at':>8s}  result   disagreements (first 5)")
    verdicts = {}
    for feature, mark in PASS.items():
        pairs = []
        for r in labeled:
            g = r["labels"][feature] if feature == "traffic_signal" else any_leg(r["labels"], feature)
            o = osm_answer(r["osm"], feature)
            if g in ("yes", "no") and o in ("yes", "no"):
                pairs.append((r["id"], g, o))
        agree = sum(g == o for _, g, o in pairs)
        rate = agree / len(pairs) if pairs else float("nan")
        ok = bool(pairs) and rate >= mark
        verdicts[feature] = ok
        dis = ", ".join(f"{i} {g}/{o}" for i, g, o in pairs if g != o)[:160]
        print(f"{feature:18s} {len(pairs):8d} {rate:7.0%} {mark:8.0%}  {'PASS' if ok else 'CHECK':7s}  {dis}")

    scored = [leg[f] for r in labeled for leg in r["labels"]["legs"]
              for f in ("marked_crosswalk", "left_turn_lane", "median")]
    cant = scored.count("cant_tell") / max(len(scored), 1)
    verdicts["cant_tell"] = cant <= MAX_CANT_TELL
    print(f"\n'cant_tell' on scored leg features: {cant:.1%} (limit {MAX_CANT_TELL:.0%}) "
          f"{'PASS' if verdicts['cant_tell'] else 'CHECK'}")
    print(f"\nOverall: {'PASS' if all(verdicts.values()) else 'CHECK the features marked above'}")

    handcheck = {r["id"] for r in csv.DictReader(open(DERIVED / "handcheck_corners.csv", encoding="utf-8"))}
    pool = [r["id"] for r in labeled if r["id"] not in handcheck]
    random.Random(args.seed).shuffle(pool)
    print(f"\nRandom sample to read by eye (seed {args.seed}):")
    for cid in sorted(pool[:args.sample]):
        print(f"  {cid}")


if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    main()
