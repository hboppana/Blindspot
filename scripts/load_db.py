"""Load the derived data into the Tiger Data database (workstream 7).

Drops and recreates every table from api/schema.sql, then loads:
  intersections    every intersection (road_features.csv + intersections.csv,
                   with screening, factors and the first recommended fix)
  case_files       case_files.json plus each intersection's causes,
                   recommendations and crash profile
  city_summary     city_summary.json
  countermeasures  data/reference/countermeasures.json
  backtest_hotspots  backtest_2015_2021.json: the ranking from 2015 to 2021 only
  fix_plan_notes   fix_plan_cortex.json: Fix Plan text by Snowflake Cortex, if generated
  crashes          every dataGNV crash (hypertable), for citywide trends,
                   and refreshes the crashes_monthly continuous aggregate

Run by hand whenever the pipeline's outputs change. Nothing is kept between
loads.

Needs DATABASE_URL in the environment or in .env at the repo root.

Requires: pip install -r requirements.txt
Usage:    python scripts/load_db.py
"""

import csv
import json
import os
import sys
from pathlib import Path

import psycopg
from psycopg.types.json import Jsonb

from build_hotspots import _display

ROOT = Path(__file__).resolve().parent.parent
DERIVED = ROOT / "data" / "derived"
REFERENCE = ROOT / "data" / "reference"
CRASHES = ROOT / "data" / "processed" / "gnv_crashes_clean.csv"
SCHEMA = ROOT / "api" / "schema.sql"

GEMINI_SOURCE_PREFIX = "gemini"  # case_files.json source is "gemini-<model>" or "template"


def database_url():
    url = os.environ.get("DATABASE_URL")
    env = ROOT / ".env"
    if not url and env.exists():
        for line in env.read_text().splitlines():
            name, _, value = line.partition("=")
            if name.strip() == "DATABASE_URL":
                url = value.strip().strip("\"'")
    if not url:
        sys.exit("DATABASE_URL is not set (environment or .env)")
    return url


def read_json(path):
    # Some profiles hold NaN (no FDOT crashes to average); JSON and Postgres need null.
    return json.loads(path.read_text(), parse_constant=lambda _: None)


def num(v, kind=float):
    """CSV text to a number, or None if blank."""
    return kind(float(v)) if v not in ("", None) else None


def text(v):
    return v if v not in ("", None) else None


def load_road_features():
    """road_features.csv rows keyed by slug. Two raw names can share a slug; keep the busier one."""
    rows, dropped = {}, []
    for r in csv.DictReader(open(DERIVED / "road_features.csv", encoding="utf-8")):
        old = rows.get(r["id"])
        if old and int(old["crashes_all_years"]) >= int(r["crashes_all_years"]):
            dropped.append(r["intersection_id"])
            continue
        if old:
            dropped.append(old["intersection_id"])
        rows[r["id"]] = r
    return rows, dropped


def intersection_rows(features, hotspots, causes, recs, cases, fix_list):
    latlon = {r["intersection_id"]: (float(r["lat"]), float(r["lon"]))
              for r in csv.DictReader(open(DERIVED / "intersections.csv", encoding="utf-8"))}
    fix_rank = {f["id"]: f["rank"] for f in fix_list}

    for cid, f in features.items():
        h = hotspots.get(cid)
        c = causes["intersections"].get(cid, {})
        s = causes["screening"].get(cid, {})
        rec = (recs.get(cid, {}).get("recommendations") or [{}])[0]
        crash = h["crashes"] if h else None
        lat, lon = latlon[f["intersection_id"]]
        yield {
            "id": cid,
            "name": h["name"] if h else _display(f["intersection_id"]),
            "raw_name": f["intersection_id"],
            "lat": lat, "lon": lon,
            "crashes_since_2022": int(f["crashes_window"]),
            "hotspot_rank": h["rank"] if h else None,
            "crashes_all_years": int(f["crashes_all_years"]),
            "fdot_crashes": int(f["fdot_crashes"]),
            "pedestrian_crashes": round(crash["pedestrian_share"] * crash["crashes"]) if crash else None,
            "bicycle_crashes": round(crash["bicycle_share"] * crash["crashes"]) if crash else None,
            "has_gemini_description": cases.get(cid, {}).get("source", "").startswith(GEMINI_SOURCE_PREFIX),
            "screening_rank": s.get("rank"),
            "observed": s.get("observed"),
            "predicted": s.get("predicted"),
            "excess_per_year": s.get("excess_per_year"),
            "main_factor": c.get("main_factor"),
            "verdict": c.get("verdict"),
            "confidence": c.get("confidence"),
            "crash_rate_vs_similar": (c.get("crash_rate") or {}).get("vs_similar"),
            "recommended_fix_id": rec.get("id"),
            "recommended_fix_name": rec.get("name"),
            "traffic_signal": text(f["traffic_signal"]),
            "crosswalk": text(f["crosswalk"]),
            "left_turn_lane": text(f["left_turn_lane"]),
            "median": text(f["median"]),
            "speed_limit": num(f["speed_limit"]),
            "fdot_lanes_max": num(f["fdot_lanes_max"]),
            "daily_traffic_max": num(f["daily_traffic_max"]),
            "has_imagery_labels": f["has_gemini"] == "True",
            "osm_matched": f["osm_matched"] == "True",
            "imagery_from": text(f["imagery_from"]),
            "imagery_to": text(f["imagery_to"]),
            "in_fix_list": cid in fix_rank,
            "fix_list_rank": fix_rank.get(cid),
        }


def backtest_rows():
    for h in read_json(DERIVED / "backtest_2015_2021.json")["hotspots"]:
        yield {"rank": h["rank"], "id": h["id"], "name": h["name"], "lat": h["lat"], "lon": h["lon"]}


def jsonb(v):
    """JSONB value, or SQL NULL when there is nothing to store."""
    return Jsonb(v) if v is not None else None


def insert(cur, table, rows):
    rows = list(rows)
    cols = list(rows[0])
    cur.executemany(f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join('%s' for _ in cols)})",
                    [tuple(r[c] for c in cols) for r in rows])
    return len(rows)


def copy_crashes(cur):
    cols = ["crash_time", "case_number", "street", "cross_street", "latitude", "longitude",
            "at_intersection", "vehicles", "pedestrians", "bicycles", "mopeds", "motorcycles",
            "fatalities", "involves_pedestrian", "involves_bicycle"]
    n = skipped = 0
    with cur.copy(f"COPY crashes ({', '.join(cols)}) FROM STDIN") as copy:
        for r in csv.DictReader(open(CRASHES, encoding="utf-8")):
            if not r["crash_datetime"]:
                skipped += 1
                continue
            copy.write_row((
                # dataGNV times are local; let Postgres apply EST/EDT.
                r["crash_datetime"].replace("T", " ") + " America/New_York",
                text(r["case_number"]), text(r["street"]), text(r["cross_street"]),
                num(r["latitude"]), num(r["longitude"]),
                r["at_intersection"] == "1",
                num(r["vehicles"], int), num(r["pedestrians"], int), num(r["bicycles"], int),
                num(r["mopeds"], int), num(r["motorcycles"], int), num(r["fatalities"], int),
                r["involves_pedestrian"] == "1", r["involves_bicycle"] == "1",
            ))
            n += 1
    return n, skipped


def main():
    features, dropped = load_road_features()
    hotspots = {h["id"]: h for h in read_json(DERIVED / "hotspots.json")["hotspots"]}
    causes = read_json(DERIVED / "causes.json")
    recs = read_json(DERIVED / "recommendations.json")["intersections"]
    cases = read_json(DERIVED / "case_files.json")["case_files"]
    city = read_json(DERIVED / "city_summary.json")
    measures = read_json(REFERENCE / "countermeasures.json")["countermeasures"]

    with psycopg.connect(database_url(), autocommit=True) as conn, conn.cursor() as cur:
        cur.execute(SCHEMA.read_text())
        print("schema recreated")

        with conn.transaction():
            n = insert(cur, "intersections",
                       intersection_rows(features, hotspots, causes, recs, cases, city["fix_list"]))
            print(f"intersections: {n}")
            n = insert(cur, "case_files", ({
                "intersection_id": cid,
                "source": cf["source"],
                "prompt_version": cf.get("prompt_version"),
                "case_file": Jsonb(cf["case_file"]),
                "facts": jsonb(cf.get("facts")),
                "causes": jsonb(causes["intersections"].get(cid)),
                "recommendations": jsonb(recs.get(cid)),
                "crash_profile": Jsonb(hotspots[cid]["crashes"]) if cid in hotspots else None,
                "fdot_profile": Jsonb(hotspots[cid]["causes_fdot"]) if cid in hotspots else None,
            } for cid, cf in cases.items()))
            print(f"case_files: {n}")
            insert(cur, "city_summary", [{
                "id": 1, "summary": Jsonb(city["summary"]), "definitions": Jsonb(city["definitions"]),
                "fix_list": Jsonb(city["fix_list"]), "audit_report": Jsonb(city["audit_report"]),
            }])
            n = insert(cur, "countermeasures", ({
                "id": mid, "name": m["name"], "url": m.get("url"), "effects": Jsonb(m["effects"]),
                "addresses": m["addresses"], "applies_when": jsonb(m.get("applies_when")),
                "note": m.get("note"),
            } for mid, m in measures.items()))
            print(f"countermeasures: {n}")
            n = insert(cur, "backtest_hotspots", backtest_rows())
            print(f"backtest_hotspots: {n}")
            notes = DERIVED / "fix_plan_cortex.json"
            if notes.exists():
                insert(cur, "fix_plan_notes", [{"id": 1, "notes": Jsonb(read_json(notes))}])
                print("fix_plan_notes: 1")
            n, skipped = copy_crashes(cur)
            print(f"crashes: {n}" + (f" ({skipped} without a time skipped)" if skipped else ""))

        # Can't run inside a transaction.
        cur.execute("CALL refresh_continuous_aggregate('crashes_monthly', NULL, NULL)")
        months = cur.execute("SELECT count(*) FROM crashes_monthly").fetchone()[0]
        gemini = cur.execute("SELECT count(*) FROM intersections WHERE has_gemini_description").fetchone()[0]

    print(f"crashes_monthly: {months} months")
    print(f"intersections with a Gemini description: {gemini}")
    for name in dropped:
        print(f"note: dropped {name!r}, which shares a slug with a busier intersection")


if __name__ == "__main__":
    main()
