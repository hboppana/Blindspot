# StreetSmart API

Read-only JSON API over the Tiger Data database. Examples below are real responses (trimmed where marked).

- **Local:** `uvicorn api.main:app --reload` from the repo root, then http://localhost:8000
- **Interactive docs:** http://localhost:8000/docs
- **CORS:** `http://localhost:3000` is allowed. Add the deployed frontend's origin with `ALLOWED_ORIGINS` (comma-separated).
- Responses are gzipped when the client accepts it (browsers do).

| Endpoint | For |
|---|---|
| [`GET /intersections`](#get-intersections) | Map markers and the ranked side list |
| [`GET /intersections/{id}`](#get-intersectionsid) | The case file page |
| [`GET /fix-list`](#get-fix-list) | "Fix these 10 intersections" |
| [`GET /city/summary`](#get-citysummary) | Header numbers and the audit report |
| [`GET /city/trend`](#get-citytrend) | Citywide crashes by month chart |
| `GET /health` | `{"ok": true}` when the database answers |

## Things to know

- **Ids** are slugs of the intersection name: `sw-34th-st-sw-archer-rd`. Use them in URLs.
- **1,833 intersections.** `city_summary` says 1,834 investigated; one pipeline row had a junk street name that duplicated another corner's id and isn't loaded.
- **`has_gemini_description`** is true for the 411 intersections whose case file Gemini wrote. The other 828 case files are templates saying there are too few crashes for a pattern; 594 intersections have no case file at all (`case_file: null`).
- **Nulls are normal.** Screening covers 1,421 intersections and factors 1,279, so `screening_rank`, `main_factor`, `confidence` etc. can be null. Road features are `"yes"`, `"no"` or `null` (unknown).
- **Label the years.** `crashes_since_2022` and `crash_profile` are dataGNV 2022 to mid-2026; `fdot_*` and crash types are FDOT 2015 to 2018; the trend is dataGNV 2015 onward.
- **Images** (satellite, Street View) are not served by the API. `causes.evidence[].images` names the files and `imagery_from`/`imagery_to` give the capture dates.

## GET /intersections

Lightweight rows, sorted by screening rank by default. All 1,833 by default (about 50 KB gzipped).

| Query | Values |
|---|---|
| `factor` | Main factor: `rear_end`, `angle`, `left_turn`, `sideswipe`, `right_turn`, `bicycle`, `pedestrian`, `other` |
| `min_crashes` | Minimum crashes since 2022 |
| `mode` | `pedestrian` or `bicycle`: only corners with at least one such crash since 2022 |
| `has_gemini_description` | `true` / `false` |
| `confidence` | `ok` / `low` |
| `sort` | `rank` (default), `crashes`, `excess` |
| `limit` | Max rows |

`GET /intersections?limit=2`

```json
[
  {
    "id": "sw-34th-st-sw-archer-rd",
    "name": "SW 34th St & SW Archer Rd",
    "lat": 29.626806,
    "lon": -82.372432,
    "crashes_since_2022": 275,
    "excess_per_year": 35.83,
    "screening_rank": 1,
    "main_factor": "rear_end",
    "confidence": "ok",
    "has_gemini_description": true,
    "recommended_fix_name": "Dedicated right-turn lanes",
    "pedestrian_crashes": 6,
    "bicycle_crashes": 8,
    "in_fix_list": true
  },
  {
    "id": "sw-40th-blvd-sw-archer-rd",
    "name": "SW 40th Blvd & SW Archer Rd",
    "lat": 29.618576,
    "lon": -82.383387,
    "crashes_since_2022": 190,
    "excess_per_year": 25.44,
    "screening_rank": 2,
    "main_factor": "rear_end",
    "confidence": "ok",
    "has_gemini_description": true,
    "recommended_fix_name": "Appropriate yellow change intervals",
    "pedestrian_crashes": 4,
    "bicycle_crashes": 3,
    "in_fix_list": true
  }
]
```

## GET /intersections/{id}

Every column for the intersection, plus `case_file` (null if none) and `countermeasures` (full details for each recommended fix, best first). 404 for an unknown id.

`GET /intersections/sw-34th-st-sw-archer-rd` (trimmed)

```json
{
  "id": "sw-34th-st-sw-archer-rd",
  "name": "SW 34th St & SW Archer Rd",
  "raw_name": "SW 34TH ST & SW ARCHER RD",
  "lat": 29.626806,
  "lon": -82.372432,
  "crashes_since_2022": 275,
  "crashes_all_years": 797,
  "fdot_crashes": 305,
  "pedestrian_crashes": 6,
  "bicycle_crashes": 8,
  "has_gemini_description": true,
  "screening_rank": 1,
  "observed": 275.0,
  "predicted": 109.1,
  "excess_per_year": 35.83,
  "main_factor": "rear_end",
  "verdict": "leading",
  "confidence": "ok",
  "crash_rate_vs_similar": 4.54,
  "recommended_fix_id": "right_turn_lanes",
  "recommended_fix_name": "Dedicated right-turn lanes",
  "traffic_signal": "yes",
  "crosswalk": "yes",
  "left_turn_lane": "yes",
  "median": "yes",
  "speed_limit": 45.0,
  "fdot_lanes_max": 6.0,
  "daily_traffic_max": 47500.0,
  "has_imagery_labels": true,
  "osm_matched": true,
  "imagery_from": "2025-04",
  "imagery_to": "2026-02",
  "in_fix_list": true,
  "fix_list_rank": 1,
  "case_file": {
    "source": "gemini-3.7-flash",
    "prompt_version": 4,
    "case_file": {
      "verdict": "Ranking 1 citywide, this intersection recorded 275 crashes since 2022.",
      "factor_explanations": [
        {
          "factor": "sideswipe",
          "explanation": "In 2015-2018 (FDOT), 47 sideswipe crashes occurred compared to 37 expected at similar corners. FDOT's road records show a speed limit 45 mph and up to 6 lanes. The imagery shows the intersection is signalized."
        }
      ],
      "recommended_fix": {
        "countermeasure_id": "right_turn_lanes",
        "why": "The evidence points to an elevated pattern of 8 right-turn crashes during 2015-2018 (FDOT). FHWA reports that dedicated right-turn lanes achieve a 14-26% reduction in total crashes."
      },
      "audit_text": "SW 34th St & SW Archer Rd ranks 1 citywide with 275 crashes since 2022 ..."
    },
    "facts": { "...": "the computed facts the text was written from: screening, crash_rate, distinctive_crash_types, countermeasures, gainesville_precedent, imagery_dates" },
    "causes": { "...": "factors, distinctive_factors, evidence (with images), screening, crash_rate, dark_share, pattern_check" },
    "recommendations": { "...": "targets, basis, recommendations[] with FHWA effects" },
    "crash_profile": {
      "crashes": 275,
      "by_year": { "2022": 50, "2023": 67, "2024": 67, "2025": 48, "2026": 43 },
      "by_hour": [7, 4, 6, 5, 2, 2, 1, 6, 13, 7, 14, 11, 16, 14, 15, 20, 18, 21, 23, 23, 13, 15, 6, 13],
      "by_weekday": { "Monday": 38, "Tuesday": 32, "Wednesday": 37, "Thursday": 42, "Friday": 58, "Saturday": 32, "Sunday": 36 },
      "pedestrian_share": 0.022,
      "bicycle_share": 0.029,
      "...": "moped/motorcycle shares, fatal_crashes, fatalities, intersection_type"
    },
    "fdot_profile": { "...": "FDOT 2015 to 2018: driver_actions, collision_types, lighting, injury_severity, flags, roads" }
  },
  "countermeasures": [
    {
      "id": "right_turn_lanes",
      "name": "Dedicated right-turn lanes",
      "url": "https://highways.dot.gov/safety/proven-safety-countermeasures/dedicated-left-and-right-turn-lanes-intersections",
      "effects": [{ "value": "14-26%", "measure": "reduction in total crashes" }],
      "addresses": ["right_turn"],
      "applies_when": {},
      "note": "Suggested only where right-turn crashes stand out: the imagery labels don't record whether right-turn lanes already exist."
    }
  ]
}
```

A template intersection (`has_gemini_description: false`) has `case_file.source: "template"` and a verdict like `"4 crashes since 2022. Too few crashes to identify a repeated pattern."`

## GET /fix-list

The city summary's fix list, each with location and main factor.

```json
[
  {
    "id": "sw-34th-st-sw-archer-rd",
    "name": "SW 34th St & SW Archer Rd",
    "rank": 1,
    "recommended_fix": "Dedicated right-turn lanes",
    "crashes_per_year": 60,
    "excess_crashes_per_year": 36,
    "lat": 29.626806,
    "lon": -82.372432,
    "main_factor": "rear_end",
    "has_gemini_description": true
  }
]
```

## GET /city/summary

`summary` (header numbers), `definitions` (what each number means, for tooltips) and `audit_report` (`text`, `problems`, `model`).

```json
{
  "summary": {
    "period": "2022-01-01 to 2026-07-23",
    "intersections_investigated": 1834,
    "with_road_design_from_imagery": 1414,
    "with_repeat_crashes": 411,
    "above_predicted_for_similar_corners": 241,
    "with_clear_fixable_pattern": 76,
    "crashes_citywide_since_2022": 19915,
    "crashes_at_intersections_since_2022": 12247,
    "share_of_crashes_at_intersections_pct": 61,
    "fix_list_crashes_per_year": 358,
    "fix_list_excess_crashes_per_year": 206,
    "worst_intersection": "SW 34th St & SW Archer Rd",
    "worst_crash_rate_times_similar_corners": 4.5
  },
  "definitions": { "...": "one sentence per summary field" },
  "audit_report": { "text": "From January 1, 2022 to July 23, 2026, 12,247 of the 19,915 crashes citywide occurred at intersections ...", "problems": null, "model": "gemini-3.7-flash" }
}
```

## GET /city/trend

Citywide dataGNV crashes per month since January 2015, from the `crashes_monthly` continuous aggregate. Optional `from` and `to` as `YYYY-MM`.

`GET /city/trend?from=2020-02&to=2020-04`

```json
[
  { "month": "2020-02", "crashes": 424, "pedestrian_crashes": 7, "bicycle_crashes": 9, "fatal_crashes": 1, "fatalities": 1, "at_intersection_crashes": 173 },
  { "month": "2020-03", "crashes": 307, "...": "..." },
  { "month": "2020-04", "crashes": 182, "...": "..." }
]
```
