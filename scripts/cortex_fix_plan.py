"""Snowflake Cortex text for the Fix Plan page: where to start, and a draft
request letter per fix.

The numbers are ours, the words are Cortex's. Every figure (crashes a year,
crashes avoided, FHWA effects, costs) is computed here from the committed
derived files, exactly as the Fix Plan page computes it. Cortex only turns
those facts into a short summary and letters, and any text with a number that
isn't in its facts is rejected (the same check as the Gemini case files).

How it runs: the facts go into a Snowflake table (STREETSMART.CORTEX
.FIX_PLAN_FACTS) and one query runs SNOWFLAKE.CORTEX.COMPLETE over every row.
A row that fails the checks gets one retry with the problems named; a second
failure drops that text, and the page shows what it showed before.

Nothing here runs on the website. The output is a derived file like the others:
Output: data/derived/fix_plan_cortex.json
Needs:  SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, SNOWFLAKE_PASSWORD (or SNOWFLAKE_TOKEN),
        SNOWFLAKE_WAREHOUSE, SNOWFLAKE_ROLE in the environment or the repo-root .env
Usage:  python scripts/cortex_fix_plan.py --test       # connection and model check
        python scripts/cortex_fix_plan.py --dry-run    # print the facts, no Snowflake
        python scripts/cortex_fix_plan.py              # generate (cached rows are reused)
"""

import argparse
import hashlib
import json
import math
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from case_files import CAUSAL, numbers

ROOT = Path(__file__).resolve().parent.parent
DERIVED = ROOT / "data" / "derived"
REFERENCE = ROOT / "data" / "reference"
CACHE = ROOT / "data" / "cache" / "cortex_fix_plan"
OUT = DERIVED / "fix_plan_cortex.json"

MODEL = "claude-sonnet-4-5"
PROMPT_VERSION = 1
PLAN_WORDS = 60
LETTER_WORDS = 170
SUBJECT_WORDS = 16
REVIEW = "review needed"

# What each fix does, in a resident's words. Mirrors frontend/src/lib/plain.ts.
FIX_STORY = {
    "Dedicated left-turn lanes": "Give left-turning cars their own lane, out of the through traffic.",
    "Dedicated right-turn lanes": "Give right-turning cars their own lane, out of the through traffic.",
    "Reduced left-turn conflict intersection (RCUT / MUT)":
        "Replace risky left turns across traffic with a U-turn a short way down the road.",
    "Roundabout": "Swap the signal for a roundabout, where crashes are slower and glancing.",
    "Appropriate yellow change intervals": "Retime the yellow lights so drivers have time to stop.",
    "Signal backplates with retroreflective borders": "Frame the signals so drivers see them sooner.",
    "Leading pedestrian interval": "Give people on foot a head start before cars get a green.",
    "Crosswalk visibility enhancements (high-visibility crosswalks, lighting, advance yield/stop markings)":
        "Make the crosswalks impossible to miss: bold paint, lighting and stop lines.",
    "Medians and pedestrian refuge islands": "Add a median island so people cross one direction at a time.",
    "Pedestrian hybrid beacon": "Add a signal people on foot can call to stop traffic.",
    "Rectangular rapid flashing beacon": "Add flashing lights that warn drivers someone is crossing.",
    "Bicycle lanes (separated with flexible posts)": "Give bikes their own lane, separated by posts.",
    "Intersection lighting": "Light the intersection so crashes after dark drop.",
    "Road diet (4 lanes to 3)": "Trade two travel lanes for a turn lane, calming the traffic.",
    "Speed safety cameras": "Use cameras to bring speeds down.",
    "Systemic low-cost countermeasures at stop-controlled intersections":
        "Make the stop signs and markings far easier to see.",
    "Corridor access management (fewer driveways)":
        "Close or combine driveways so fewer cars pull in and out mid-block.",
}

SYSTEM = """You write for StreetSmart, a road-safety tool for Gainesville, Florida.
Rules, all of them strict:
- Use ONLY the facts in the user message. Every number you write must appear in the facts exactly as written there. Never compute, round, add or convert numbers, and never write a number as a word.
- No names of people, no street addresses, no phone numbers, emails, dates or deadlines.
- Never say a road feature caused crashes. Say "is associated with" or "the crash pattern points to".
- Plain, specific, calm language a resident would use. No marketing tone, no exclamation marks.
- Answer with JSON only, matching the requested fields."""

PLAN_PROMPT = """Write "summary": 2 or 3 sentences, at most {words} words, telling Gainesville where to start on its most dangerous intersections.
Name the first fix in facts.plan (it has the biggest payoff) and say why to start there, using its cost and crashes avoided a year. Mention facts.total_crashes_avoided_a_year once. Do not list every fix.

FACTS:
{facts}"""

LETTER_PROMPT = """Write a request letter from a Gainesville resident to the City of Gainesville's transportation and traffic engineering staff.
- "subject": at most {subject_words} words.
- "body": at most {words} words. Start with "Dear City of Gainesville Traffic Engineering staff," and end with "Sincerely," then a new line with "[Your name]".
- Name each intersection in facts.intersections with its crashes a year.
- {ask}
- Say the figures come from StreetSmart's analysis of dataGNV crash records.

FACTS:
{facts}"""

ASK_FIX = ("Ask the city to evaluate and schedule facts.fix, say in plain words what it does (facts.what_it_does), "
           "and cite facts.fhwa_effect as the FHWA's result and, if present, facts.crashes_avoided_a_year as the estimate.")
ASK_REVIEW = ("Explain that the crashes there are a mix of kinds, so no single standard fix fits, "
              "and ask the city for an engineering review of the intersection.")

SCHEMAS = {
    "plan": {"type": "object", "properties": {"summary": {"type": "string"}}, "required": ["summary"]},
    "letter": {"type": "object", "properties": {"subject": {"type": "string"}, "body": {"type": "string"}},
               "required": ["subject", "body"]},
}


# ---------------------------------------------------------------- facts


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"), parse_constant=lambda _: None)


def js_round(x):
    """Math.round, so figures match the Fix Plan page."""
    return math.floor(x + 0.5)


def effect_range(value):
    """'14-26%' -> (0.14, 0.26); '12%' -> (0.12, 0.12)."""
    m = re.match(r"\s*(\d+(?:\.\d+)?)\s*(?:-|to)?\s*(\d+(?:\.\d+)?)?\s*%", value)
    if not m:
        return None
    lo = float(m.group(1)) / 100
    return lo, (float(m.group(2)) / 100 if m.group(2) else lo)


def total_crash_effect(effects):
    """The fix's effect on total crashes, or None: other effects measure other things."""
    for e in effects:
        if e["measure"].strip().lower() == "reduction in total crashes":
            return e
    return None


def span(lo, hi):
    lo, hi = js_round(lo), js_round(hi)
    return str(lo) if lo == hi else f"{lo} to {hi}"


def build_facts():
    """[(kind, key, facts)] for the plan summary and one letter per fix (and the review case)."""
    city = read_json(DERIVED / "city_summary.json")
    fixes = city["fix_list"]
    measures = read_json(REFERENCE / "countermeasures.json")["countermeasures"]
    by_name = {m["name"]: m for m in measures.values()}
    # Cost lives with each case file's facts; it's the same for a fix everywhere.
    cost = {}
    for cf in read_json(DERIVED / "case_files.json")["case_files"].values():
        for c in (cf.get("facts") or {}).get("countermeasures", []):
            cost.setdefault(c["name"], c.get("cost"))

    groups, reviews = {}, []
    for f in fixes:
        if f["recommended_fix"].startswith(REVIEW):
            reviews.append(f)
        else:
            groups.setdefault(f["recommended_fix"], []).append(f)

    rows, plan = [], []
    for fix, members in groups.items():
        m = by_name.get(fix, {"effects": []})
        per_year = sum(x["crashes_per_year"] for x in members)
        total = total_crash_effect(m["effects"])
        rng = effect_range(total["value"]) if total else None
        facts = {
            "fix": fix,
            "what_it_does": FIX_STORY.get(fix, fix),
            "intersections": [{"name": x["name"], "red_list_rank": x["rank"], "crashes_a_year": x["crashes_per_year"]}
                              for x in members],
            "crashes_a_year_together": per_year,
            "cost": cost.get(fix),
        }
        if total:
            facts["fhwa_effect"] = f"{total['value']} {total['measure']}"
            facts["crashes_avoided_a_year"] = span(per_year * rng[0], per_year * rng[1])
        elif m["effects"]:
            e = m["effects"][0]
            facts["fhwa_effect"] = f"{e['value']} {e['measure']}"
        rows.append(("letter", fix, facts))
        plan.append({**facts, "_avoided_hi": per_year * rng[1] if rng else 0, "_avoided_lo": per_year * rng[0] if rng else 0})

    for f in reviews:
        rows.append(("letter", f["id"], {
            "fix": "engineering review",
            "intersections": [{"name": f["name"], "red_list_rank": f["rank"], "crashes_a_year": f["crashes_per_year"]}],
            "why_no_single_fix": "The crashes there are a mix of kinds, so no single standard fix fits.",
        }))

    # The plan in payoff order, as the page shows it.
    plan.sort(key=lambda g: -g["_avoided_hi"])
    lo = sum(g["_avoided_lo"] for g in plan)
    hi = sum(g["_avoided_hi"] for g in plan)
    plan_facts = {
        "plan": [{k: v for k, v in g.items() if not k.startswith("_")} for g in plan],
        "total_crashes_avoided_a_year": span(lo, hi),
        "red_list_intersections": len(fixes),
        "covered_by_a_proven_fix": len(fixes) - len(reviews),
    }
    rows.insert(0, ("plan", "plan", plan_facts))
    return rows


def prompt_for(kind, facts):
    body = json.dumps(facts, indent=1)
    if kind == "plan":
        return PLAN_PROMPT.format(words=PLAN_WORDS, facts=body)
    ask = ASK_REVIEW if facts["fix"] == "engineering review" else ASK_FIX
    return LETTER_PROMPT.format(words=LETTER_WORDS, subject_words=SUBJECT_WORDS, ask=ask, facts=body)


# ---------------------------------------------------------------- checks


def words(text):
    return len(text.split())


def check(kind, answer, facts):
    """Problems with Cortex's answer, or [] if it passes."""
    fields = ["summary"] if kind == "plan" else ["subject", "body"]
    missing = [f for f in fields if not isinstance(answer.get(f), str) or not answer[f].strip()]
    if missing:
        return [f"missing fields: {', '.join(missing)}"]
    text = " ".join(answer[f] for f in fields)
    problems = []
    allowed = numbers(json.dumps(facts)) | {str(i) for i in range(11)}
    allowed |= {n.rstrip("0").rstrip(".") for n in allowed if "." in n}
    invented = sorted(n for n in numbers(text) if n not in allowed and n.rstrip("0").rstrip(".") not in allowed)
    if invented:
        problems.append(f"numbers not in the facts: {', '.join(invented[:8])}")
    if CAUSAL.search(text):
        problems.append(f"causal wording: '{CAUSAL.search(text).group(0)}'")
    if re.search(r"[\w.+-]+@[\w-]+\.\w+|https?://", text):
        problems.append("no emails or links")
    if kind == "plan" and words(answer["summary"]) > PLAN_WORDS:
        problems.append(f"summary is {words(answer['summary'])} words; at most {PLAN_WORDS}")
    if kind == "letter":
        if words(answer["body"]) > LETTER_WORDS:
            problems.append(f"body is {words(answer['body'])} words; at most {LETTER_WORDS}")
        if words(answer["subject"]) > SUBJECT_WORDS:
            problems.append(f"subject is {words(answer['subject'])} words; at most {SUBJECT_WORDS}")
    return problems


# ---------------------------------------------------------------- Snowflake


def env(name):
    value = os.environ.get(name)
    dotenv = ROOT / ".env"
    if not value and dotenv.exists():
        for line in dotenv.read_text(encoding="utf-8").splitlines():
            key, _, v = line.partition("=")
            if key.strip() == name:
                # Drop an inline "# comment" after the value.
                value = re.split(r"\s+#", v.strip())[0].strip().strip("\"'")
    return value or None


def connect():
    import snowflake.connector

    need = ["SNOWFLAKE_ACCOUNT", "SNOWFLAKE_USER", "SNOWFLAKE_WAREHOUSE"]
    missing = [n for n in need if not env(n)]
    secret = env("SNOWFLAKE_PASSWORD") or env("SNOWFLAKE_TOKEN")
    if missing or not secret:
        sys.exit(f"Missing in .env: {', '.join(missing + ([] if secret else ['SNOWFLAKE_PASSWORD']))}")
    return snowflake.connector.connect(
        account=env("SNOWFLAKE_ACCOUNT"),
        user=env("SNOWFLAKE_USER"),
        password=secret,
        warehouse=env("SNOWFLAKE_WAREHOUSE"),
        role=env("SNOWFLAKE_ROLE"),
        session_parameters={"QUERY_TAG": "streetsmart-fix-plan"},
    )


def parse_completion(raw):
    """COMPLETE with options returns a JSON document; the answer is in structured_output or choices."""
    doc = json.loads(raw) if isinstance(raw, str) else raw
    if isinstance(doc, dict):
        if doc.get("structured_output"):
            out = doc["structured_output"][0]
            out = out.get("raw_message", out)
            return json.loads(out) if isinstance(out, str) else out
        if doc.get("choices"):
            msg = doc["choices"][0].get("messages") or doc["choices"][0].get("message") or ""
            msg = msg.get("content", "") if isinstance(msg, dict) else msg
            return json.loads(re.sub(r"^```(?:json)?\s*|\s*```$", "", msg.strip()))
    raise ValueError(f"unexpected COMPLETE result: {str(raw)[:200]}")


COMPLETE_SQL = """SELECT kind, key, SNOWFLAKE.CORTEX.COMPLETE(
    %(model)s,
    ARRAY_CONSTRUCT(
        OBJECT_CONSTRUCT('role', 'system', 'content', %(system)s),
        OBJECT_CONSTRUCT('role', 'user', 'content', prompt)),
    OBJECT_CONSTRUCT('temperature', 0, 'response_format', response_format))
FROM FIX_PLAN_FACTS {where}"""


def load_facts(cur, rows):
    cur.execute("CREATE DATABASE IF NOT EXISTS STREETSMART")
    cur.execute("CREATE SCHEMA IF NOT EXISTS STREETSMART.CORTEX")
    cur.execute("USE SCHEMA STREETSMART.CORTEX")
    cur.execute("""CREATE OR REPLACE TABLE FIX_PLAN_FACTS (
        kind STRING, key STRING, facts VARIANT, prompt STRING, response_format VARIANT)""")
    for kind, key, facts, prompt in rows:
        cur.execute(
            """INSERT INTO FIX_PLAN_FACTS
               SELECT %(kind)s, %(key)s, PARSE_JSON(%(facts)s), %(prompt)s, PARSE_JSON(%(fmt)s)""",
            {"kind": kind, "key": key, "facts": json.dumps(facts), "prompt": prompt,
             "fmt": json.dumps({"type": "json", "schema": SCHEMAS[kind]})},
        )


def complete_all(cur, model, retry=None):
    """{(kind, key): parsed answer or exception} for every row (or just the retry rows)."""
    where, params = "", {"model": model, "system": SYSTEM}
    if retry:
        where = "WHERE " + " OR ".join(f"(kind = %(k{i})s AND key = %(q{i})s)" for i in range(len(retry)))
        for i, (kind, key) in enumerate(retry):
            params[f"k{i}"], params[f"q{i}"] = kind, key
    cur.execute(COMPLETE_SQL.format(where=where), params)
    out = {}
    for kind, key, raw in cur.fetchall():
        try:
            out[(kind, key)] = parse_completion(raw)
        except (ValueError, json.JSONDecodeError) as e:
            out[(kind, key)] = e
    return out


# ---------------------------------------------------------------- main


def cache_path(kind, key, model, facts):
    digest = hashlib.sha256(json.dumps([PROMPT_VERSION, model, facts], sort_keys=True).encode()).hexdigest()[:16]
    safe = re.sub(r"[^a-z0-9]+", "-", key.lower()).strip("-")[:60]
    return CACHE / f"{kind}_{safe}_{digest}.json"


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--model", default=MODEL)
    ap.add_argument("--test", action="store_true", help="check the connection and model, then stop")
    ap.add_argument("--dry-run", action="store_true", help="print the facts and prompts, no Snowflake")
    ap.add_argument("--regenerate", action="store_true", help="ignore cached answers")
    args = ap.parse_args()

    facts = build_facts()
    if args.dry_run:
        for kind, key, f in facts:
            print(f"--- {kind}: {key}\n{prompt_for(kind, f)}\n")
        return

    conn = connect()
    cur = conn.cursor()
    if args.test:
        cur.execute("SELECT CURRENT_ACCOUNT(), CURRENT_ROLE(), CURRENT_WAREHOUSE()")
        print("connected:", cur.fetchone())
        cur.execute("SELECT SNOWFLAKE.CORTEX.COMPLETE(%s, 'Say hello in five words.')", (args.model,))
        print(f"{args.model}:", cur.fetchone()[0].strip())
        return

    CACHE.mkdir(parents=True, exist_ok=True)
    answers, todo = {}, []
    for kind, key, f in facts:
        path = cache_path(kind, key, args.model, f)
        if path.exists() and not args.regenerate:
            answers[(kind, key)] = json.loads(path.read_text(encoding="utf-8"))
        else:
            todo.append((kind, key, f, prompt_for(kind, f)))

    if todo:
        load_facts(cur, todo)
        by_key = {(k, q): f for k, q, f, _ in todo}
        results = complete_all(cur, args.model)
        retry = {}
        for (kind, key), ans in results.items():
            problems = [str(ans)] if isinstance(ans, Exception) else check(kind, ans, by_key[(kind, key)])
            if problems:
                retry[(kind, key)] = problems
            else:
                answers[(kind, key)] = ans
        if retry:
            # One more try, with the problems spelled out in the prompt.
            for (kind, key), problems in retry.items():
                print(f"retry {kind} {key}: {'; '.join(problems)}")
                cur.execute(
                    "UPDATE FIX_PLAN_FACTS SET prompt = prompt || %(fix)s WHERE kind = %(kind)s AND key = %(key)s",
                    {"fix": "\n\nYour last answer had these problems; fix them: " + "; ".join(problems),
                     "kind": kind, "key": key},
                )
            for (kind, key), ans in complete_all(cur, args.model, list(retry)).items():
                problems = [str(ans)] if isinstance(ans, Exception) else check(kind, ans, by_key[(kind, key)])
                if problems:
                    print(f"dropped {kind} {key}: {'; '.join(problems)}")
                else:
                    answers[(kind, key)] = ans
        for (kind, key), ans in answers.items():
            if (kind, key) in by_key:
                cache_path(kind, key, args.model, by_key[(kind, key)]).write_text(
                    json.dumps(ans, indent=1), encoding="utf-8")
    conn.close()

    plan = answers.get(("plan", "plan"))
    out = {
        "source": f"snowflake-cortex-{args.model}",
        "prompt_version": PROMPT_VERSION,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "plan": {"summary": plan["summary"].strip()} if plan else None,
        "letters": {key: {"subject": a["subject"].strip(), "body": a["body"].strip()}
                    for (kind, key), a in sorted(answers.items()) if kind == "letter"},
    }
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{'plan summary, ' if plan else 'no plan summary, '}{len(out['letters'])} letters -> {OUT}")


if __name__ == "__main__":
    main()
