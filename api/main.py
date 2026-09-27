"""StreetSmart API: read-only endpoints over the Tiger Data database, plus PDF audit reports.

Load the database first (python scripts/load_db.py), then from the repo root:
  uvicorn api.main:app --reload
Interactive docs at http://localhost:8000/docs.

ALLOWED_ORIGINS (comma-separated) adds CORS origins beyond http://localhost:3000.
"""

import math
import os
from contextlib import asynccontextmanager
from datetime import date
from typing import Literal

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from api.db import fetch_all, fetch_one, pool
from api.report import build_report

ORIGINS = ["http://localhost:3000"] + [
    o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()
]

# What the map and ranked list need; GET /intersections/{id} returns every column.
LIST_COLUMNS = """id, name, lat, lon, crashes_since_2022, excess_per_year, screening_rank,
    main_factor, confidence, has_gemini_description, recommended_fix_name,
    pedestrian_crashes, bicycle_crashes, in_fix_list"""
# Each ends on hotspot_rank, id so ties don't come back in whatever order the rows are stored.
SORTS = {
    "rank": "screening_rank NULLS LAST, crashes_since_2022 DESC, hotspot_rank NULLS LAST, id",
    "crashes": "crashes_since_2022 DESC, hotspot_rank NULLS LAST, id",
    "excess": "excess_per_year DESC NULLS LAST, hotspot_rank NULLS LAST, id",
}

# scripts/backtest.py and build_hotspots.py (which needs numpy, so the constants are copied)
BACKTEST_TOP = 20
BACKTEST_MATCH_M = 40
M_PER_DEG_LAT = 110_860
M_PER_DEG_LON = 111_320 * math.cos(math.radians(29.65))


def js_round(x):
    """Math.round, so numbers match the frontend's mocks (Python's round() goes to even on .5)."""
    return math.floor(x + 0.5)


@asynccontextmanager
async def lifespan(app):
    pool.open()
    yield
    pool.close()


app = FastAPI(title="StreetSmart API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["GET"], allow_headers=["*"])
app.add_middleware(GZipMiddleware, minimum_size=1000)  # the full intersection list is ~650 KB raw


@app.get("/health")
def health():
    fetch_one("SELECT 1")
    return {"ok": True}


@app.get("/city/summary")
def city_summary():
    return fetch_one("SELECT summary, definitions, audit_report FROM city_summary WHERE id = 1")


@app.get("/city/trend")
def city_trend(
    start: str | None = Query(None, alias="from", pattern=r"^\d{4}-\d{2}$", description="YYYY-MM"),
    end: str | None = Query(None, alias="to", pattern=r"^\d{4}-\d{2}$", description="YYYY-MM"),
):
    """Citywide crashes per month, from the crashes_monthly continuous aggregate."""
    return fetch_all(
        """SELECT to_char(month AT TIME ZONE 'America/New_York', 'YYYY-MM') AS month,
                  crashes::int, pedestrian_crashes::int, bicycle_crashes::int,
                  fatal_crashes::int, fatalities::int, at_intersection_crashes::int
           FROM crashes_monthly
           WHERE (%(start)s::text IS NULL OR to_char(month AT TIME ZONE 'America/New_York', 'YYYY-MM') >= %(start)s)
             AND (%(end)s::text IS NULL OR to_char(month AT TIME ZONE 'America/New_York', 'YYYY-MM') <= %(end)s)
           ORDER BY month""",
        {"start": start, "end": end},
    )


@app.get("/fix-list")
def fix_list():
    """The ranked fix list from the city summary, with each intersection's location."""
    fixes = fetch_one("SELECT fix_list FROM city_summary WHERE id = 1")["fix_list"]
    places = {r["id"]: r for r in fetch_all(
        "SELECT id, lat, lon, main_factor, has_gemini_description FROM intersections WHERE id = ANY(%s)",
        [[f["id"] for f in fixes]],
    )}
    return [{**f, **{k: v for k, v in places.get(f["id"], {}).items() if k != "id"}} for f in fixes]


@app.get("/watch-list")
def watch_list():
    """Intersections whose crashes are climbing, worst climb first; the top 10 on the fix list are left out.

    The latest year is partial, so it is put on a full-year pace. "Rising" means the recent rate
    (last full year and this year's pace) is above the rate of the first two years, both middle
    years are at least the year two before them, and there are 8+ crashes a year recently.
    """
    period_end = fetch_one("SELECT summary->>'period' AS period FROM city_summary WHERE id = 1")["period"].split(" to ")[1]
    end = date.fromisoformat(period_end)
    year_fraction = (end - date(end.year, 1, 1)).days / 365
    years = [2022, 2023, 2024, 2025, end.year]
    rows = []
    for r in fetch_all(
        """SELECT i.id, i.name, c.crash_profile->'by_year' AS by_year
           FROM intersections i JOIN case_files c ON c.intersection_id = i.id
           WHERE c.crash_profile IS NOT NULL AND NOT i.in_fix_list
           ORDER BY i.hotspot_rank"""
    ):
        counts = [(r["by_year"] or {}).get(str(y), 0) for y in years]
        pace = counts[4] / year_fraction
        early = (counts[0] + counts[1]) / 2
        late = (counts[3] + pace) / 2
        if late >= 8 and late > early and counts[2] >= counts[0] and counts[3] >= counts[1]:
            rows.append((r, counts, pace, early, late))
    rows.sort(key=lambda x: x[4] - x[3], reverse=True)
    return {"through": period_end, "rows": [{
        "id": r["id"],
        "name": r["name"],
        "rank": i + 1,
        "by_year": [{"year": y, "crashes": counts[k], "partial": y == end.year,
                     "pace": js_round(pace) if y == end.year else counts[k]} for k, y in enumerate(years)],
        "per_year_before": js_round(early * 10) / 10,
        "per_year_now": js_round(late * 10) / 10,
    } for i, (r, counts, pace, early, late) in enumerate(rows[:10])]}


@app.get("/backtest")
def backtest():
    """Today's top 20 (by crashes since 2022) looked up in the ranking built from 2015 to 2021 only, by location."""
    past = fetch_all("SELECT rank, lat, lon FROM backtest_hotspots")
    now = fetch_all(
        """SELECT id, name, lat, lon, hotspot_rank, crashes_since_2022 FROM intersections
           WHERE hotspot_rank IS NOT NULL ORDER BY hotspot_rank LIMIT %s""",
        [BACKTEST_TOP],
    )
    rows = []
    for h in now:
        best = min(past, key=lambda p: math.hypot((p["lon"] - h["lon"]) * M_PER_DEG_LON, (p["lat"] - h["lat"]) * M_PER_DEG_LAT))
        d = math.hypot((best["lon"] - h["lon"]) * M_PER_DEG_LON, (best["lat"] - h["lat"]) * M_PER_DEG_LAT)
        rows.append({"id": h["id"], "name": h["name"], "rank_now": h["hotspot_rank"], "crashes_now": h["crashes_since_2022"],
                     "rank_before_2022": best["rank"] if d <= BACKTEST_MATCH_M else None})

    def flagged(k):
        return sum(1 for r in rows if r["rank_before_2022"] and r["rank_before_2022"] <= k)

    return {"top": BACKTEST_TOP, "flagged_in_top_10": flagged(10), "flagged_in_top_20": flagged(20),
            "flagged_in_top_50": flagged(50), "rows": rows}


@app.get("/intersections")
def intersections(
    factor: str | None = Query(None, description="main contributing factor, e.g. rear_end, left_turn"),
    min_crashes: int | None = Query(None, ge=0, description="minimum crashes since 2022"),
    mode: Literal["pedestrian", "bicycle"] | None = Query(None, description="only corners with these crashes"),
    has_gemini_description: bool | None = None,
    confidence: Literal["ok", "low"] | None = None,
    sort: Literal["rank", "crashes", "excess"] = "rank",
    limit: int | None = Query(None, ge=1),
):
    where, params = [], {}
    if factor:
        where.append("main_factor = %(factor)s")
        params["factor"] = factor
    if min_crashes is not None:
        where.append("crashes_since_2022 >= %(min_crashes)s")
        params["min_crashes"] = min_crashes
    if mode:
        where.append(f"{mode}_crashes > 0")
    if has_gemini_description is not None:
        where.append("has_gemini_description = %(gemini)s")
        params["gemini"] = has_gemini_description
    if confidence:
        where.append("confidence = %(confidence)s")
        params["confidence"] = confidence
    sql = f"SELECT {LIST_COLUMNS} FROM intersections"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += f" ORDER BY {SORTS[sort]}"
    if limit:
        sql += " LIMIT %(limit)s"
        params["limit"] = limit
    return fetch_all(sql, params)


def load_intersection(intersection_id: str) -> dict:
    """An intersection's row, its case file (or None) and its recommended countermeasures; 404 if unknown."""
    row = fetch_one("SELECT * FROM intersections WHERE id = %s", [intersection_id])
    if not row:
        raise HTTPException(404, f"no intersection {intersection_id!r}")
    case = fetch_one(
        """SELECT source, prompt_version, case_file, facts, causes, recommendations,
                  crash_profile, fdot_profile
           FROM case_files WHERE intersection_id = %s""",
        [intersection_id],
    )
    recommended = [r["id"] for r in ((case or {}).get("recommendations") or {}).get("recommendations", [])]
    if not recommended and row["recommended_fix_id"]:
        recommended = [row["recommended_fix_id"]]
    measures = fetch_all("SELECT * FROM countermeasures WHERE id = ANY(%s)", [recommended]) if recommended else []
    order = {mid: i for i, mid in enumerate(recommended)}
    return {**row, "case_file": case, "countermeasures": sorted(measures, key=lambda m: order[m["id"]])}


@app.get("/intersections/{intersection_id}")
def intersection(intersection_id: str):
    """Everything about one intersection: its row, its case file (or null) and the recommended countermeasures."""
    return load_intersection(intersection_id)


@app.get("/intersections/{intersection_id}/report.pdf")
def intersection_report(intersection_id: str):
    """The intersection's audit report as a PDF (1 to 2 pages)."""
    x = load_intersection(intersection_id)
    period = fetch_one("SELECT summary->>'period' AS period FROM city_summary WHERE id = 1")["period"]
    return Response(build_report(x, period), media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="streetsmart-{intersection_id}.pdf"'})
