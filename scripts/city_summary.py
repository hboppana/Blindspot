"""City summary: the console header, the fix list, and the audit report text (workstream 6).

Headline numbers, with their definitions stored next to them:
  investigated         intersections with a crash history (all of them), and
                       how many also had road design read from imagery
  repeat_crashes       intersections with >= REPEAT crashes since 2022, and
                       how many are above the crashes predicted for a corner
                       like them (network screening)
  clear_fixable        high confidence + a distinctive crash type + at least
                       one FHWA countermeasure that fits the corner
  fix_list             the top FIX_LIST by screening rank: crashes a year,
                       excess crashes a year, recommended fix
Then Gemini writes one audit-report paragraph from these numbers, under the
same checks as the case files (numbers only from the facts, no causal
wording).

Output: data/derived/city_summary.json
Usage:  python scripts/city_summary.py
"""

import json
from pathlib import Path

import pandas as pd

from case_files import CAUSAL, numbers
from label_features import api_key, call_gemini

ROOT = Path(__file__).resolve().parent.parent
DERIVED = ROOT / "data" / "derived"
OUT = DERIVED / "city_summary.json"
MODEL = "gemini-3.7-flash"
REPEAT = 5
FIX_LIST = 10


def main():
    inters = pd.read_csv(DERIVED / "intersections.csv")
    feats = pd.read_csv(DERIVED / "road_features.csv")
    causes = json.loads((DERIVED / "causes.json").read_text())
    rec = json.loads((DERIVED / "recommendations.json").read_text())["intersections"]
    cases = json.loads((DERIVED / "case_files.json").read_text(encoding="utf-8"))["case_files"]
    hot = json.loads((DERIVED / "hotspots.json").read_text())
    crashes = pd.read_csv(ROOT / "data" / "processed" / "gnv_crashes_clean.csv", usecols=["year", "crash_date"])

    last = crashes.crash_date.max()
    years = (pd.Timestamp(last) - pd.Timestamp("2022-01-01")).days / 365.25
    city_recent = int((crashes.year >= 2022).sum())
    screen = causes["screening"]
    ci = causes["intersections"]

    repeat = inters[inters.crashes_window >= REPEAT]
    above = [k for k, v in screen.items() if v["excess_per_year"] > 0 and v["observed"] >= REPEAT]
    clear = [k for k, v in ci.items() if v["confidence"] == "ok" and v["distinctive_factors"]
             and rec.get(k, {}).get("recommendations")]

    ranked = sorted(screen, key=lambda k: screen[k]["rank"])[:FIX_LIST]
    names = {h["id"]: h["name"] for h in hot["hotspots"]}
    fix_list = []
    for k in ranked:
        s = screen[k]
        fix = cases.get(k, {}).get("case_file", {}).get("recommended_fix", {}).get("countermeasure_id", "none")
        fix_name = next((r["name"] for r in rec.get(k, {}).get("recommendations", []) if r["id"] == fix), None)
        fix_list.append({"id": k, "name": names.get(k, k), "rank": s["rank"],
                         "crashes_per_year": round(s["observed"] / years),
                         "excess_crashes_per_year": round(s["excess_per_year"]),
                         "recommended_fix": fix_name or "review needed (no single FHWA countermeasure fits)"})
    top_crashes_year = sum(x["crashes_per_year"] for x in fix_list)
    top_excess_year = sum(x["excess_crashes_per_year"] for x in fix_list)
    intersection_recent = int(inters.crashes_window.sum())

    summary = {
        "period": f"2022-01-01 to {last}",
        "intersections_investigated": int(len(inters)),
        "with_road_design_from_imagery": int(feats.has_gemini.sum()),
        "with_repeat_crashes": int(len(repeat)),
        "above_predicted_for_similar_corners": len(above),
        "with_clear_fixable_pattern": len(clear),
        "crashes_citywide_since_2022": city_recent,
        "crashes_at_intersections_since_2022": intersection_recent,
        "fix_list_crashes_per_year": top_crashes_year,
        "fix_list_excess_crashes_per_year": top_excess_year,
        "worst_intersection": fix_list[0]["name"],
        "worst_crash_rate_times_similar_corners": round(ci.get(ranked[0], {}).get("crash_rate", {}).get("vs_similar", 0), 1),
        "share_of_crashes_at_intersections_pct": round(100 * intersection_recent / city_recent),
    }
    definitions = {
        "intersections_investigated": "every intersection with a crash history in dataGNV (2015 on)",
        "with_road_design_from_imagery": "Gemini read signals, crosswalks, left-turn lanes and medians from satellite and Street View imagery",
        "with_repeat_crashes": f">= {REPEAT} crashes since 2022",
        "above_predicted_for_similar_corners": "network screening (safety performance function + empirical Bayes): expected crashes above what a corner with the same traffic/road class, signal and legs would have",
        "with_clear_fixable_pattern": "high-confidence crash-type data, a crash type clearly above similar corners, and an FHWA Proven Safety Countermeasure that fits the corner",
        "crashes_at_intersections_since_2022": "crashes at an intersection or within 150 ft of it",
        "fix_list": f"top {FIX_LIST} by screening rank; crashes and excess per year over {years:.1f} years",
    }

    facts = {**summary, "fix_list": [{k: v for k, v in x.items() if k != "id"} for x in fix_list]}
    prompt = ("Write one paragraph (120-180 words) for the opening of a city road safety audit report for Gainesville, "
              "addressed to the city's traffic safety engineers. Use ONLY these facts; every number you write must "
              "appear in them. Never say a design caused crashes. Write thousands with commas (19,915), dates in "
              "words (January 2022 to July 2026), and ratios as '4.5 times the crash rate of similar intersections'. "
              "Lead with the finding, not with a greeting. Plain, specific language.\n\nFACTS:\n"
              + json.dumps(facts, indent=1))
    body = {"contents": [{"role": "user", "parts": [{"text": prompt}]}], "generationConfig": {"temperature": 0}}
    key = api_key()
    report, problems = None, None
    for attempt in range(2):
        text = prompt if not problems else prompt + "\nFix these problems: " + "; ".join(problems)
        body["contents"][0]["parts"][0]["text"] = text
        resp = call_gemini(body, MODEL, key)
        report = resp["candidates"][0]["content"]["parts"][0]["text"].strip()
        allowed = numbers(json.dumps(facts)) | {str(i) for i in range(11)}
        allowed |= {n.rstrip("0").rstrip(".") for n in allowed if "." in n}
        invented = sorted(n for n in numbers(report) if n not in allowed)
        problems = ([f"numbers not in the facts: {', '.join(invented)}"] if invented else []) + \
                   ([f"causal wording: {CAUSAL.search(report).group(0)}"] if CAUSAL.search(report) else [])
        if not problems:
            break

    OUT.write_text(json.dumps({"summary": summary, "definitions": definitions, "fix_list": fix_list,
                               "audit_report": {"text": report if not problems else None,
                                                "problems": problems or None, "model": MODEL}}, indent=1))
    for k, v in summary.items():
        print(f"{k:40s} {v}")
    print("\nFix list:")
    for x in fix_list:
        print(f"  {x['rank']:2d}. {x['crashes_per_year']:3d}/yr (+{x['excess_crashes_per_year']} above similar)  {x['name']:34s} -> {x['recommended_fix']}")
    print("\nAudit report" + (" (FAILED CHECKS: " + "; ".join(problems) + ")" if problems else "") + ":\n" + report)


if __name__ == "__main__":
    main()
