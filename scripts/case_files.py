"""Write a case file for every intersection with a crash since 2022 (workstream 6).

Intersections with at least MIN_CRASHES crashes: Gemini writes the text
from a compact set of computed facts (screening, crash rate, crash types vs
similar corners, what the imagery shows, FHWA countermeasures that fit,
confidence). Everything else gets a template filled with its own numbers.

Rules for Gemini's text, enforced before a case file is kept:
  - every number it writes must appear in the facts (no invented figures)
  - the recommended fix must be one of the listed countermeasures
  - no causal wording ("caused", "causes", "because of the design"): the
    plan's language is "contributing factor" and "the evidence points to"
A failed check is retried once with the problem named; a second failure
falls back to the template.

Each case file is cached in data/cache/case_files/ and never regenerated
unless PROMPT_VERSION changes. Standard (not batch) requests.

Output: data/derived/case_files.json
Usage:  python scripts/case_files.py --limit 20     # the top 20 by screening rank
        python scripts/case_files.py                # everything
"""

import argparse
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pandas as pd

from label_features import API, api_key, call_gemini

ROOT = Path(__file__).resolve().parent.parent
DERIVED = ROOT / "data" / "derived"
CACHE = ROOT / "data" / "cache" / "case_files"
OUT = DERIVED / "case_files.json"

MODEL = "gemini-3.7-flash"
PROMPT_VERSION = 4
KEEP_VERSIONS = (3,)  # older cached case files still used unless an intersection is regenerated
MIN_CRASHES = 5
CAUSAL = re.compile(r"\b(caus(e|es|ed|ing)|because of the (design|road|intersection)|due to the (design|layout))\b", re.I)
TYPE_WORDS = {"left_turn": "left-turn", "rear_end": "rear-end", "angle": "angle", "sideswipe": "sideswipe",
              "right_turn": "right-turn", "pedestrian": "pedestrian", "bicycle": "bicycle", "other": "other"}

SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "verdict": {"type": "STRING", "description": "One sentence, at most 30 words: what stands out here."},
        "factor_explanations": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
            "factor": {"type": "STRING"},
            "explanation": {"type": "STRING", "description": "2-3 sentences for a traffic engineer."}},
            "required": ["factor", "explanation"]}},
        "recommended_fix": {"type": "OBJECT", "properties": {
            "countermeasure_id": {"type": "STRING"},
            "why": {"type": "STRING", "description": "2-3 sentences tying the fix to this corner's facts."}},
            "required": ["countermeasure_id", "why"]},
        "audit_text": {"type": "STRING", "description": "One paragraph, 80-140 words, for an audit report."},
    },
    "required": ["verdict", "factor_explanations", "recommended_fix", "audit_text"],
}

PROMPT = """You are writing a road safety case file for a city traffic safety engineer.
Use ONLY the facts in the JSON below. Rules:
- Every number you write must appear in the facts, written the same way. Do not compute new numbers, percentages or ratios.
- Never say a road feature caused crashes. Say "contributing factor", "is associated with", or "the evidence points to".
- recommended_fix.countermeasure_id must be one of the ids in facts.countermeasures. If the list is empty, use "none" and say more data is needed.
- If facts.confidence is "low", say so plainly in the verdict and the audit text, and name the reason.
- factor_explanations: one entry per item in facts.distinctive_crash_types (or, if that is empty, the top crash type), explaining what the crash type means here. Say "the imagery shows" only for facts listed under imagery_shows; road_records facts come from FDOT's road records.
- recommended_fix: prefer the first countermeasure in facts.countermeasures unless another fits these facts clearly better. If facts.note exists, include its point in recommended_fix.why.
- Quote only the numbers that matter most: at most 5 numbers in audit_text and 3 in the verdict. Write percentages with %.
- Write like a concise engineering memo: plain, specific, no marketing tone, no list of every statistic.
- Crash counts come from two periods: crashes_since_2022 (dataGNV) and crash-type counts from 2015-2018 (FDOT). Name the period whenever you quote a count, and never present a 2015-2018 count as part of the since-2022 total.
- Only call a crash type elevated, prominent or a pattern if it is in facts.distinctive_crash_types. Top types that are not distinctive are normal for similar corners; say so if you mention them.
- Do not add explanations or mechanisms that are not in the facts (for example "heavy demand", "dilemma zones", "peak travel periods", "stabilize speeds"). State what the data shows, and what FHWA reports for the countermeasure.

FACTS:
{facts}
"""


def pct(x):
    return None if x is None else round(100 * x)


def build_facts(h, c, r, feat):
    """Compact facts for one intersection. Shares are whole percents so the text can quote them as given."""
    prof = h["crashes"]
    hours = prof["by_hour"]
    peak = sorted(range(24), key=lambda i: -hours[i])[:3]
    facts = {
        "intersection": h["name"],
        "crashes_since_2022": prof["crashes"],
        "crashes_by_year": prof["by_year"],
        "pedestrian_crash_pct": pct(prof["pedestrian_share"]),
        "bicycle_crash_pct": pct(prof["bicycle_share"]),
        "fatal_crashes": prof["fatal_crashes"],
        "busiest_hours": [f"{x}:00" for x in peak],
        "traffic_signal": feat.get("traffic_signal") or "unknown",
    }
    if c:
        s = c.get("screening")
        if s:
            facts["screening"] = {"citywide_rank": s["rank"], "observed_crashes": s["observed"],
                                  "predicted_for_similar_corner": round(s["predicted"]),
                                  "excess_crashes_per_year": round(s["excess_per_year"])}
        if c.get("crash_rate"):
            cr = c["crash_rate"]
            facts["crash_rate"] = {"per_million_entering_vehicles": round(cr["per_million_entering"], 1),
                                   "similar_corners_median": round(cr["similar_corners_median"], 1),
                                   "times_similar_corners": round(cr["vs_similar"], 1)}
        facts["crash_types_2015_2018"] = {"fdot_crashes": c["fdot_crashes_2015_2018"], "pattern": c["verdict"],
                                          "top_types": [{"type": TYPE_WORDS[f["type"]], "pct": pct(f["share"]),
                                                         "similar_corners_pct": pct(f["similar_corners_share"])}
                                                        for f in c["factors"][:4]]}
        facts["distinctive_crash_types"] = []
        for x in c["distinctive_factors"]:
            shown = next((e["imagery_shows"] for e in c["evidence"] if e["type"] == x["type"]), [])
            facts["distinctive_crash_types"].append({
                "type": TYPE_WORDS[x["type"]], "period": "2015-2018 (FDOT)", "crashes": x["crashes"],
                "expected_at_similar_corners": round(x["expected_at_similar_corners"]),
                # Speed and lanes are FDOT road records, not imagery.
                "imagery_shows": [t for t in shown if "FDOT" not in t and "mph" not in t],
                "road_records": [t for t in shown if "FDOT" in t or "mph" in t]})
        facts["dark_crash_pct"] = pct(c["dark_share"])
        facts["confidence"] = c["confidence"]
        facts["confidence_reasons"] = c["confidence_reasons"]
    else:
        facts["confidence"] = "low"
        facts["confidence_reasons"] = ["no FDOT crash records to show how crashes happen"]
    if r:
        facts["countermeasures"] = [{"id": x["id"], "name": x["name"], "cost": x["cost"],
                                     "fhwa_effects": [f"{e['value']} {e['measure']}" for e in x["fhwa_effects"]]}
                                    for x in r["recommendations"][:4]]
        if r.get("note"):
            facts["note"] = r["note"]
        ex = next((x["local_example"] for x in r["recommendations"] if x.get("local_example")), None)
        if ex:
            facts["gainesville_precedent"] = {"intersection": ex["intersection"], "change": ex["change"],
                                              "effect": ex["effect"]}
    else:
        facts["countermeasures"] = []
    imagery = [feat.get("imagery_from"), feat.get("imagery_to")]
    if all(isinstance(x, str) and x for x in imagery):
        facts["imagery_dates"] = f"{imagery[0]} to {imagery[1]}"
    return facts


NUM = re.compile(r"\d+(?:[.,]\d+)?")


def numbers(text):
    return {n.replace(",", "") for n in NUM.findall(text)}


def check(answer, facts):
    """Problems with Gemini's case file, or [] if it passes."""
    problems = []
    allowed = numbers(json.dumps(facts)) | {str(i) for i in range(11)}
    allowed |= {n.rstrip("0").rstrip(".") for n in allowed if "." in n}
    text = " ".join([answer["verdict"], answer["audit_text"], answer["recommended_fix"]["why"]]
                    + [f["explanation"] for f in answer["factor_explanations"]])
    invented = sorted(n for n in numbers(text) if n not in allowed and n.rstrip("0").rstrip(".") not in allowed)
    if invented:
        problems.append(f"numbers not in the facts: {', '.join(invented[:8])}")
    if CAUSAL.search(text):
        problems.append(f"causal wording: '{CAUSAL.search(text).group(0)}'")
    if mixes_periods(text, facts):
        problems.append("a 2015-2018 crash-type count is presented with the since-2022 period; name each count's period")
    ids = {x["id"] for x in facts["countermeasures"]} | {"none"}
    if answer["recommended_fix"]["countermeasure_id"] not in ids:
        problems.append(f"countermeasure_id must be one of {sorted(ids)}")
    return problems


def mixes_periods(text, facts):
    """A sentence that puts a 2015-2018 crash-type count next to 'since 2022' without naming 2015,
    or calls a crash-type count the intersection's crash total."""
    dist = {str(d["crashes"]) for d in facts.get("distinctive_crash_types", [])}
    dist |= {str(d["expected_at_similar_corners"]) for d in facts.get("distinctive_crash_types", [])}
    # A number that also belongs to the recent period (total, rank, screening, yearly counts) is ambiguous.
    recent = {str(facts["crashes_since_2022"])} | {str(v) for v in facts.get("screening", {}).values()}
    recent |= {str(v) for v in facts.get("crashes_by_year", {}).values()}
    dist -= recent
    for sent in re.split(r"(?<=[.!?])\s+", text):
        nums = set(re.findall(r"\d+", sent)) - {"2022"}
        if "2022" in sent and nums & dist and "2015" not in sent:
            return True
        m = re.search(r"recorded (\d+) crashes", sent)
        if m and m.group(1) in dist and m.group(1) != str(facts["crashes_since_2022"]):
            return True
    return False


def template(h, c, facts):
    n = facts["crashes_since_2022"]
    vul = []
    if facts["pedestrian_crash_pct"]:
        vul.append(f"{facts['pedestrian_crash_pct']}% involved a pedestrian")
    if facts["bicycle_crash_pct"]:
        vul.append(f"{facts['bicycle_crash_pct']}% a cyclist")
    reason = "Too few crashes to identify a repeated pattern." if n < MIN_CRASHES else \
        "No specific pattern could be written up automatically; review the numbers below."
    return {"verdict": f"{n} crash{'es' if n != 1 else ''} since 2022. {reason}",
            "factor_explanations": [],
            "recommended_fix": {"countermeasure_id": "none", "why": "Not enough evidence to recommend a specific fix; monitor."},
            "audit_text": f"{facts['intersection']}: {n} crash{'es' if n != 1 else ''} since 2022"
                          + (f" ({'; '.join(vul)})" if vul else "") + f". {reason}"}


def generate(h, c, r, feat, key, regenerate=False):
    facts = build_facts(h, c, r, feat)
    cache = CACHE / f"{h['id']}_v{PROMPT_VERSION}.json"
    if cache.exists():
        return json.loads(cache.read_text())
    if not regenerate:
        for v in KEEP_VERSIONS:
            old = CACHE / f"{h['id']}_v{v}.json"
            if old.exists():
                return json.loads(old.read_text())
    if facts["crashes_since_2022"] < MIN_CRASHES:
        result = {"source": "template", "facts": facts, "case_file": template(h, c, facts)}
    else:
        prompt = PROMPT.format(facts=json.dumps(facts, indent=1))
        usage, problems, answer = [], [], None
        for attempt in range(2):
            text = prompt if not problems else prompt + "\nYour previous answer had these problems; fix them:\n- " + "\n- ".join(problems)
            body = {"contents": [{"role": "user", "parts": [{"text": text}]}],
                    "generationConfig": {"responseMimeType": "application/json", "responseSchema": SCHEMA,
                                         "temperature": 0}}
            resp = call_gemini(body, MODEL, key)
            usage.append(resp.get("usageMetadata"))
            answer = json.loads(resp["candidates"][0]["content"]["parts"][0]["text"])
            problems = check(answer, facts)
            if not problems:
                break
        if problems:
            result = {"source": "template", "fallback_reason": problems, "facts": facts,
                      "case_file": template(h, c, facts), "usage": usage}
        else:
            result = {"source": MODEL, "prompt_version": PROMPT_VERSION, "facts": facts,
                      "case_file": answer, "usage": usage, "attempts": len(usage)}
    CACHE.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(result, indent=1))
    return result


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--limit", type=int, help="only the first N by screening rank")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--regenerate-top", type=int, default=0,
                    help="rewrite the top N by screening rank, plus any older file that fails the period check")
    args = ap.parse_args()

    hot = json.loads((DERIVED / "hotspots.json").read_text())["hotspots"]
    causes = json.loads((DERIVED / "causes.json").read_text())
    rec = json.loads((DERIVED / "recommendations.json").read_text())["intersections"]
    feats = {x["id"]: x for x in pd.read_csv(DERIVED / "road_features.csv").to_dict("records")}
    screen = causes["screening"]
    order = sorted(hot, key=lambda h: screen.get(h["id"], {}).get("rank", 10**6))
    if args.limit:
        order = order[:args.limit]
    key = api_key()
    redo = {h["id"] for h in order[:args.regenerate_top]}
    for v in KEEP_VERSIONS:  # older files that mix periods get rewritten too
        for fpath in CACHE.glob(f"*_v{v}.json"):
            old = json.loads(fpath.read_text())
            x = old["case_file"]
            text = " ".join([x["verdict"], x["audit_text"], x["recommended_fix"]["why"]]
                            + [e["explanation"] for e in x["factor_explanations"]])
            if old["source"] != "template" and mixes_periods(text, old["facts"]):
                redo.add(fpath.name[: -len(f"_v{v}.json")])
    print(f"regenerating {len(redo)} case files with prompt v{PROMPT_VERSION}")

    def run(h):
        try:
            return h["id"], generate(h, causes["intersections"].get(h["id"]), rec.get(h["id"]),
                                     feats.get(h["id"], {}), key, regenerate=h["id"] in redo)
        except Exception as e:  # keep going; rerun retries it
            return h["id"], {"error": str(e)}

    start = time.time()
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        results = dict(pool.map(run, order))

    # Merge with anything already cached so the output always has every case file generated so far.
    for v in (PROMPT_VERSION, *KEEP_VERSIONS):
        for f in CACHE.glob(f"*_v{v}.json"):
            cid = f.name[: -len(f"_v{v}.json")]
            results.setdefault(cid, json.loads(f.read_text()))
    ok = {k: v for k, v in results.items() if "error" not in v}
    OUT.write_text(json.dumps({"model": MODEL, "prompt_versions": sorted({v.get("prompt_version", 0) for v in ok.values()}),
                               "case_files": ok}, indent=1))

    src = pd.Series([v["source"] for v in ok.values()]).value_counts().to_dict()
    fallback = sum(1 for v in ok.values() if v.get("fallback_reason"))
    this_run = [v for v in ok.values() if v.get("prompt_version") == PROMPT_VERSION]
    tokens_in = sum(u.get("promptTokenCount", 0) for v in this_run for u in v.get("usage", []) if u)
    tokens_out = sum(u.get("candidatesTokenCount", 0) + u.get("thoughtsTokenCount", 0)
                     for v in this_run for u in v.get("usage", []) if u)
    errors = {k: v["error"][:120] for k, v in results.items() if "error" in v}
    print(f"{len(ok)} case files ({src}); {fallback} fell back to the template after failing checks; "
          f"{len(errors)} errors; {time.time() - start:.0f} s")
    print(f"Gemini tokens: {tokens_in:,} in, {tokens_out:,} out -> ${(tokens_in * 0.75 + tokens_out * 3.75) / 1e6:.2f} at list price")
    for k, e in list(errors.items())[:5]:
        print(f"  error {k}: {e}")


if __name__ == "__main__":
    main()
