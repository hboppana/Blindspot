"""Load StreetSmart's data into Snowflake for Ask StreetSmart (Cortex Analyst).

Creates, in STREETSMART.DATA:
  CRASHES        every dataGNV crash (gnv_crashes_clean.csv) with the
                 intersection it belongs to (crash_intersections.csv)
  INTERSECTIONS  every intersection: the site's figures, grade, lists, road
  PLACES         landmarks for "near UF" questions (approximate centre points)
  ASK_STREETSMART  the semantic view Cortex Analyst answers from
                 (api/snowflake/semantic_view.sql)

With --access it also sets up what the website uses to ask questions, all
read-only: role STREETSMART_READER, service user STREETSMART_ASK (key-pair
login; the private key is added to the repo-root .env as
SNOWFLAKE_ASK_PRIVATE_KEY if it isn't there), warehouse STREETSMART_ASK_WH
(extra small, suspends after 60 s) and a monthly credit cap on it.

Runs as the admin login in .env (SNOWFLAKE_USER / _PASSWORD or _TOKEN).
Needs the frontend mocks for the site's figures: cd frontend && npm run mocks
Usage:  python scripts/crash_links.py            # first, when crash data changes
        python scripts/snowflake_load.py --access
"""

import argparse
import base64
import json
import re
from pathlib import Path

import numpy as np
import pandas as pd

from cortex_fix_plan import connect, env

ROOT = Path(__file__).resolve().parent.parent
DERIVED = ROOT / "data" / "derived"
CRASHES = ROOT / "data" / "processed" / "gnv_crashes_clean.csv"
MOCK = ROOT / "frontend" / "mock"
SEMANTIC_VIEW = ROOT / "api" / "snowflake" / "semantic_view.sql"
DOTENV = ROOT / ".env"

DB, SCHEMA = "STREETSMART", "DATA"
ROLE, USER, WAREHOUSE, MONITOR = "STREETSMART_READER", "STREETSMART_ASK", "STREETSMART_ASK_WH", "STREETSMART_ASK_MONITOR"
MONTHLY_CREDITS = 5
NEAR_KM = 1.0  # "near" a landmark

# Approximate centre points, checked against the nearest intersections in the
# city data. Santa Fe College and the airport sit outside that data's area.
PLACES = [
    ("University of Florida", "UF, campus, the university", 29.6465, -82.3480),
    ("UF Health Shands Hospital", "Shands, the hospital", 29.6398, -82.3444),
    ("Ben Hill Griffin Stadium", "the Swamp, the stadium", 29.6500, -82.3487),
    ("Downtown Gainesville", "downtown, Bo Diddley Plaza", 29.6516, -82.3248),
    ("Depot Park", "Depot Park", 29.6445, -82.3202),
    ("Butler Plaza", "Butler Plaza", 29.6220, -82.3810),
    ("The Oaks Mall", "Oaks Mall, the mall", 29.6588, -82.4110),
    ("Santa Fe College", "Santa Fe, SF", 29.6810, -82.4310),
    ("Gainesville Regional Airport", "the airport, GNV", 29.6900, -82.2718),
    ("Midtown", "Midtown, University Ave near NW 17th St", 29.6523, -82.3425),
]


def nearby_places(lat, lon):
    """For each point, the landmarks within NEAR_KM, joined with "; " (or None).
    Computed here so "near UF" is a plain text filter, not distance maths."""
    lat, lon = np.radians(np.asarray(lat, float)), np.radians(np.asarray(lon, float))
    hits = [[] for _ in range(len(lat))]
    for name, _, plat, plon in PLACES:
        a = (np.sin((lat - np.radians(plat)) / 2) ** 2
             + np.cos(lat) * np.cos(np.radians(plat)) * np.sin((lon - np.radians(plon)) / 2) ** 2)
        km = 6371 * 2 * np.arcsin(np.sqrt(a))
        for i in np.flatnonzero(km <= NEAR_KM):
            hits[i].append(name)
    return ["; ".join(h) if h else None for h in hits]


def grade(excess):
    """The site's grade (frontend/src/lib/grade.ts): crashes a year above similar intersections."""
    if excess is None or pd.isna(excess):
        return None
    return "F" if excess >= 8 else "D" if excess >= 4 else "C" if excess >= 1 else "B" if excess >= 0 else "A"


def years_in(period):
    a, b = (pd.Timestamp(x) for x in period.split(" to "))
    return (b - a).days / 365.25


def crashes_frame():
    c = pd.read_csv(CRASHES, low_memory=False)
    c["CRASH_ROW"] = c.index
    links = pd.read_csv(DERIVED / "crash_intersections.csv").set_index("crash_row").intersection_id
    t = pd.to_datetime(c.crash_datetime, errors="coerce")
    flag = lambda s: s.fillna(0).astype(int).eq(1)
    return pd.DataFrame({
        "CRASH_ROW": c.CRASH_ROW,
        "CASE_NUMBER": c.case_number.astype(str),
        "CRASH_TIME": t.dt.strftime("%Y-%m-%d %H:%M:%S"),
        "CRASH_DATE": pd.to_datetime(c.crash_date, errors="coerce").dt.date,
        "CRASH_YEAR": c.year.astype("Int64"),
        "CRASH_MONTH": t.dt.month.astype("Int64"),
        "CRASH_HOUR": c.hour.astype("Int64"),
        "DAY_OF_WEEK": c.day_of_week,
        "STREET": c.street,
        "CROSS_STREET": c.cross_street,
        "AT_INTERSECTION": flag(c.at_intersection),
        "LATITUDE": c.latitude,
        "LONGITUDE": c.longitude,
        "VEHICLES": c.vehicles.astype("Int64"),
        "PEOPLE": c.people.astype("Int64"),
        "PEDESTRIANS": c.pedestrians.astype("Int64"),
        "BICYCLES": c.bicycles.astype("Int64"),
        "MOTORCYCLES": c.motorcycles.astype("Int64"),
        "FATALITIES": c.fatalities.fillna(0).astype(int),
        "INVOLVES_PEDESTRIAN": flag(c.involves_pedestrian),
        "INVOLVES_BICYCLE": flag(c.involves_bicycle),
        "IS_FATAL": c.fatalities.fillna(0).astype(int).gt(0),
        "INTERSECTION_ID": c.CRASH_ROW.map(links),
        "NEARBY_PLACES": nearby_places(c.latitude, c.longitude),
    })


def intersections_frame():
    summary = json.loads((MOCK / "city" / "summary.json").read_text(encoding="utf-8"))["summary"]
    years = years_in(summary["period"])
    rows = json.loads((MOCK / "intersections.json").read_text(encoding="utf-8"))
    red = {f["id"]: f["rank"] for f in json.loads((MOCK / "fix-list.json").read_text(encoding="utf-8"))}
    watch = {r["id"]: r for r in json.loads((MOCK / "watch-list.json").read_text(encoding="utf-8"))["rows"]}
    out = []
    for r in rows:
        d = json.loads((MOCK / "intersections" / f"{r['id']}.json").read_text(encoding="utf-8"))
        per_year = r["crashes_since_2022"] / years
        similar = d["predicted"] / years if d.get("predicted") is not None else None
        yn = lambda v: None if v is None else v == "yes"
        w = watch.get(r["id"])
        out.append({
            "ID": r["id"],
            "NAME": r["name"],
            "LAT": r["lat"],
            "LON": r["lon"],
            "CRASHES_SINCE_2022": r["crashes_since_2022"],
            "CRASHES_PER_YEAR": round(per_year, 1),
            "SIMILAR_CRASHES_PER_YEAR": None if similar is None else round(similar, 1),
            "EXTRA_CRASHES_PER_YEAR": None if r["excess_per_year"] is None else round(r["excess_per_year"], 1),
            "GRADE": grade(r["excess_per_year"]),
            "MAIN_CRASH_TYPE": (r["main_factor"] or "").replace("_", "-") or None,
            "PEDESTRIAN_CRASHES": r["pedestrian_crashes"],
            "BICYCLE_CRASHES": r["bicycle_crashes"],
            "RED_LIST_RANK": red.get(r["id"]),
            "WATCH_LIST_RANK": w["rank"] if w else None,
            "CRASHES_PER_YEAR_2022_23": w["per_year_before"] if w else None,
            "CRASHES_PER_YEAR_RECENT": w["per_year_now"] if w else None,
            "RECOMMENDED_FIX": r["recommended_fix_name"],
            "TRAFFIC_SIGNAL": yn(d.get("traffic_signal")),
            "CROSSWALK": yn(d.get("crosswalk")),
            "LEFT_TURN_LANE": yn(d.get("left_turn_lane")),
            "MEDIAN": yn(d.get("median")),
            "SPEED_LIMIT_MPH": d.get("speed_limit"),
            "LANES": d.get("fdot_lanes_max"),
            "CARS_PER_DAY": d.get("daily_traffic_max"),
            "REPORT_URL": f"/intersections/{r['id']}",
        })
    frame = pd.DataFrame(out)
    frame["NEARBY_PLACES"] = nearby_places(frame.LAT, frame.LON)
    # Whole numbers with gaps would otherwise load as decimals (1.0).
    for col in ["PEDESTRIAN_CRASHES", "BICYCLE_CRASHES", "RED_LIST_RANK", "WATCH_LIST_RANK",
                "SPEED_LIMIT_MPH", "LANES", "CARS_PER_DAY"]:
        frame[col] = pd.to_numeric(frame[col]).round().astype("Int64")
    return frame


def places_frame():
    return pd.DataFrame(PLACES, columns=["NAME", "ALSO_CALLED", "LAT", "LON"])


def load_tables(conn):
    from snowflake.connector.pandas_tools import write_pandas

    cur = conn.cursor()
    cur.execute(f"CREATE DATABASE IF NOT EXISTS {DB}")
    cur.execute(f"CREATE SCHEMA IF NOT EXISTS {DB}.{SCHEMA}")
    cur.execute(f"USE SCHEMA {DB}.{SCHEMA}")
    for name, frame in [("CRASHES", crashes_frame()), ("INTERSECTIONS", intersections_frame()), ("PLACES", places_frame())]:
        ok, _, rows, _ = write_pandas(conn, frame, name, database=DB, schema=SCHEMA,
                                      auto_create_table=True, overwrite=True, use_logical_type=True)
        print(f"{name}: {rows} rows" + ("" if ok else " (FAILED)"))
    # Timestamps load as text so no timezone gets applied; make them real ones.
    cur.execute("ALTER TABLE CRASHES ADD COLUMN IF NOT EXISTS CRASH_AT TIMESTAMP_NTZ")
    cur.execute("UPDATE CRASHES SET CRASH_AT = TRY_TO_TIMESTAMP_NTZ(CRASH_TIME)")


def run_sql_file(cur, path):
    # Statements are separated by ";" at a line end; comments are dropped first.
    text = re.sub(r"--[^\n]*", "", path.read_text(encoding="utf-8"))
    for stmt in (s.strip() for s in re.split(r";\s*\n", text)):
        if stmt:
            cur.execute(stmt)


def ensure_key():
    """The service user's key pair; the private key lives only in .env."""
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    stored = env("SNOWFLAKE_ASK_PRIVATE_KEY")
    if stored:
        key = serialization.load_pem_private_key(base64.b64decode(stored), password=None)
    else:
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                serialization.NoEncryption())
        with DOTENV.open("a", encoding="utf-8") as f:
            f.write("\n# Ask StreetSmart: read-only Snowflake service user (scripts/snowflake_load.py)\n"
                    f"SNOWFLAKE_ASK_USER={USER}\nSNOWFLAKE_ASK_ROLE={ROLE}\nSNOWFLAKE_ASK_WAREHOUSE={WAREHOUSE}\n"
                    f"SNOWFLAKE_SEMANTIC_VIEW={DB}.{SCHEMA}.ASK_STREETSMART\n"
                    f"SNOWFLAKE_ASK_PRIVATE_KEY={base64.b64encode(pem).decode()}\n")
        print("generated a key pair; private key added to .env as SNOWFLAKE_ASK_PRIVATE_KEY")
    der = key.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    return base64.b64encode(der).decode()


def setup_access(cur):
    public_key = ensure_key()
    for stmt in [
        f"CREATE WAREHOUSE IF NOT EXISTS {WAREHOUSE} WAREHOUSE_SIZE = XSMALL AUTO_SUSPEND = 60 "
        "AUTO_RESUME = TRUE INITIALLY_SUSPENDED = TRUE",
        f"CREATE RESOURCE MONITOR IF NOT EXISTS {MONITOR} WITH CREDIT_QUOTA = {MONTHLY_CREDITS} FREQUENCY = MONTHLY "
        "START_TIMESTAMP = IMMEDIATELY TRIGGERS ON 90 PERCENT DO NOTIFY ON 100 PERCENT DO SUSPEND",
        f"ALTER WAREHOUSE {WAREHOUSE} SET RESOURCE_MONITOR = {MONITOR}",
        f"CREATE ROLE IF NOT EXISTS {ROLE}",
        f"GRANT USAGE ON WAREHOUSE {WAREHOUSE} TO ROLE {ROLE}",
        f"GRANT USAGE ON DATABASE {DB} TO ROLE {ROLE}",
        f"GRANT USAGE ON SCHEMA {DB}.{SCHEMA} TO ROLE {ROLE}",
        f"GRANT SELECT ON ALL TABLES IN SCHEMA {DB}.{SCHEMA} TO ROLE {ROLE}",
        f"GRANT SELECT ON FUTURE TABLES IN SCHEMA {DB}.{SCHEMA} TO ROLE {ROLE}",
        f"GRANT SELECT ON SEMANTIC VIEW {DB}.{SCHEMA}.ASK_STREETSMART TO ROLE {ROLE}",
        f"GRANT DATABASE ROLE SNOWFLAKE.CORTEX_USER TO ROLE {ROLE}",
        f"CREATE USER IF NOT EXISTS {USER} TYPE = SERVICE DEFAULT_ROLE = {ROLE} DEFAULT_WAREHOUSE = {WAREHOUSE} "
        "COMMENT = 'Ask StreetSmart website: read-only, key-pair login'",
        f"ALTER USER {USER} SET RSA_PUBLIC_KEY = '{public_key}'",
        f"GRANT ROLE {ROLE} TO USER {USER}",
    ]:
        cur.execute(stmt)
    print(f"access: role {ROLE}, user {USER} (key-pair), warehouse {WAREHOUSE} capped at {MONTHLY_CREDITS} credits a month")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--access", action="store_true", help="also set up the website's read-only service user")
    args = ap.parse_args()

    conn = connect()
    cur = conn.cursor()
    load_tables(conn)
    run_sql_file(cur, SEMANTIC_VIEW)
    print("semantic view: STREETSMART.DATA.ASK_STREETSMART")
    if args.access:
        setup_access(cur)
    else:
        # Replacing tables and the view drops their grants; give the website's role them back.
        cur.execute(f"SHOW ROLES LIKE '{ROLE}'")
        if cur.fetchall():
            cur.execute(f"GRANT SELECT ON ALL TABLES IN SCHEMA {DB}.{SCHEMA} TO ROLE {ROLE}")
            cur.execute(f"GRANT SELECT ON SEMANTIC VIEW {DB}.{SCHEMA}.ASK_STREETSMART TO ROLE {ROLE}")
            print(f"grants renewed for {ROLE}")
    conn.close()


if __name__ == "__main__":
    main()
