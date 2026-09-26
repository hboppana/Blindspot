# StreetSmart: Build Plan

Sep 26, 2026 · @Hemanshu

> This file is the source of truth for the build. It replaces the earlier student route-check plan (see git history for that version).

## Overview

StreetSmart is road intelligence for cities. It investigates every intersection in a city, finds why crashes keep happening there, and recommends the fix with the strongest evidence. It is our ShellHacks 2026 entry, running first on Gainesville.

**The problem.** When an intersection keeps crashing, traffic engineers run a road safety audit: pull crash reports, visit the site, study the layout, write up causes and fixes. It takes weeks per intersection, so a city audits a handful a year. Everything else waits for someone to get hurt.

**The product.** StreetSmart audits all of them in an afternoon. For every intersection it combines crash history, road design read from imagery, and citywide statistics into a case file: what keeps happening, why, and what fixed it elsewhere. Then it ranks what to fix first.

**Who uses it**

| User | What they get |
| --- | --- |
| City and county traffic safety engineers (primary) | A ranked, evidence-backed list of intersections to fix, with a case file for each |
| Regional planning agencies, state DOTs, engineering consultants | The same analysis across a whole network, in hours instead of months |
| Insurers (State Farm track) | Where crash risk comes from, at the intersection level |
| AV companies (Waymo track) | Which intersections are hard, and why |
| Residents and advocates (bonus) | Public case files they can cite when pushing for a fix |

**What makes it different**

- **Gemini is a sensor, not an oracle.** It reads satellite and Street View imagery and reports road-design features. Statistics reaches the conclusions.
- **Every claim is evidence-backed and dated.** Causes come from citywide comparisons; fixes come with FHWA crash reduction numbers and, where possible, a proven result in the same city.
- **No hardware, any city.** Runs on public crash records and public imagery.

**Validation to cite.** Samsara launched AI road intelligence for public agencies in May 2026 (pothole detection from fleet data), with counties as customers. Governments are buying this category. Samsara finds surface defects; StreetSmart finds the design problems behind repeat crashes.

**Tracks:** Best Overall (automatic), Waymo (primary), State Farm, Microsoft, MLH Gemini, MLH Tiger Data, MLH GoDaddy, MLH DigitalOcean. Confirm with organizers whether there is a cap on tracks per project.

## How we talk about causes

We never say a design *caused* a crash. Every crash has several factors. We say:

- "This intersection has 2.3x the left-turn crashes of similar-traffic intersections that have a protected arrow."
- "Where Gainesville made this change, crashes dropped X% while comparable corners stayed flat."
- "The evidence points to the missing left arrow as the main contributing factor."

The evidence that design changes crash rates: before-and-after studies with comparison groups. For example, Persaud et al. (2001) found roundabout conversions at 23 U.S. intersections cut injury crashes 80% and fatal and incapacitating crashes about 90% (empirical Bayes). FHWA's Proven Safety Countermeasures publish these effects (roundabout replacing a two-way stop: 82% fewer fatal and injury crashes; pedestrian refuge island: 56% fewer pedestrian crashes; leading pedestrian interval: 13% fewer pedestrian-vehicle crashes at intersections).

## Current state

Data is done, hotspots are built, and road-feature labeling is underway.

| Path | What it is |
| --- | --- |
| `data/processed/gnv_crashes_clean.csv` | 60,466 Gainesville crashes, 2015 to mid-2026: location, time, street and cross street, intersection type, pedestrian/bike/vehicle counts, fatalities |
| `data/processed/fdot_alachua_crashes_clean.csv` | 26,811 Alachua County crashes, 2015 to 2019: police-cited driver actions, collision type, lighting, weather, speed limit, lanes, traffic volume, behavior flags |
| `data/derived/intersections.csv` | Every matched intersection (~1,834) with crash counts |
| `data/derived/hotspots.json` | Top intersections with crash profiles and joined FDOT causes |
| `data/derived/road_features_osm.csv` | OpenStreetMap road features for every intersection (signals, crossings, lanes, turn lanes, bike lanes, divided, speed) |
| `data/derived/handcheck_corners.csv` | 20 corners for the Gemini hand check |
| `data/reference/fdot_codes.json` | Decoded FDOT `_CD` fields |
| `scripts/fetch_data.py`, `scripts/clean_data.py` | Download and clean both crash sources |
| `scripts/build_hotspots.py`, `scripts/streets.py`, `scripts/fdot.py` | Street normalization, intersection matching, hotspots |
| `scripts/fetch_imagery.py`, `scripts/label_features.py` | Satellite + Street View fetch; Gemini feature labeler (cached per corner) |
| `scripts/osm_features.py` | OSM road features, the second source and the fallback for Gemini |
| `.github/workflows/fetch-data.yml` | Runs fetch + clean on GitHub and commits the data |

**Data quirks to respect**

- About half the raw dataGNV rows had a placeholder location. The clean file rebuilds every location from `geox`/`geoy` (EPSG:2238), accurate to a few meters.
- The same corner appears under both street orders. Group by location, not street text.
- dataGNV has no cause fields. FDOT causes are really 2015 to 2018 (only 282 Alachua rows in 2019). Use them only where the pattern held into 2022 to 2026 (workstream 3).
- Crashes dropped about 30% in 2020. Use 2022 onward for current hotspots.
- A missing OSM tag usually means unmapped, not absent. Treat it as unknown.
- Top hotspot since 2022: SW Archer Rd & SW 34th St, 275 crashes at the corner or within 150 ft, all spellings merged.

## Architecture

All heavy work runs offline and is cached. The app reads precomputed results, so the demo is instant.

| Stage | Input | Output | Tech |
| --- | --- | --- | --- |
| 1. Intersections and hotspots | Clean crash CSVs | Every intersection with crash profile (mode, time, severity, type) | pandas, street normalization |
| 2. Road features | Intersections + imagery + OSM | Road-design features per intersection, with bounding boxes for the case file images | Gemini on Static Maps satellite + Street View Static; OSM |
| 3. Causes | Stages 1 and 2 + FDOT causes | Ranked contributing factors per intersection, with citywide effect sizes | statsmodels (Poisson / negative binomial) |
| 4. Fixes | Crash history 2011 to 2026 + imagery + FHWA countermeasures | Recommended countermeasure per cause; proven local fixes | before/after vs. comparison corners |
| 5. Backtest | 2015 to 2021 data only | How many of today's top intersections the method would have flagged | same pipeline, held-out years |
| 6. Case files | Stages 1 to 5 | Verdict, factor explanations, recommended fix, audit report text | Gemini (grounded, structured JSON) |
| 7. Store | All of the above | Tables the API reads | Tiger Data (Postgres) |
| 8. API | Store | City summary, intersection list, case file, report export | FastAPI |
| 9. App | API | City audit console: map, ranked list, case files, fix list | React / Next.js + Google Maps JS |
| 10. Deploy | App + API | Public URL on our own domain | DigitalOcean App Platform, GoDaddy domain |

One Google Cloud key covers Maps JS, Static Maps and Street View Static. Gemini key separate (AI Studio free tier, or Vertex AI if we need the $300 trial credits). Keys live in `.env`, never in the repo.

## Workstreams

### 1. Intersections and hotspots (done)

- [x] Snap crashes to intersections (cluster within ~40 m, or a sorted street pair plus location)
- [x] Rank by crash count, 2022 onward
- [x] Profile each: share involving pedestrians, bikes, mopeds; hour and day pattern; severity; at-intersection share
- [x] Join FDOT 2015 to 2018 crashes at the same spot: top driver actions, collision types, lighting, speed limit, lanes, traffic volume
- [x] Decode FDOT `_CD` fields used
- [x] Output: `data/derived/hotspots.json`
- [ ] Hand-check the Archer Rd & 34th St profile

Notes: severity since 2022 is fatalities only; injury severity comes from FDOT (2015 to 2018). Six hotspots have under 20 FDOT crashes, mostly plaza roads FDOT doesn't cover.

### 2. Road features (in progress)

Goal: road-design features for every major intersection, not just hotspots (the model needs comparison corners).

- [x] OSM features for every intersection (`road_features_osm.csv`)
- [x] Imagery fetch: satellite plus Street View per leg, with capture dates
- [x] Gemini labeler with per-corner cache and "can't tell" answers
- [ ] Run the labeler on the 20 hand-check corners; compare against our own read and OSM
- [ ] Label the rest if the hand check passes; otherwise OSM becomes the feature source and imagery is visual only
- [ ] Bounding boxes for the case file: ask Gemini to return boxes for the features it reports ("no left-turn arrow", "faded crosswalk") on the demo corners
- [ ] Output: `data/derived/road_features_gemini.csv`, merged with OSM into `road_features.csv`

### 3. Cause analysis

Goal: citywide evidence behind every contributing factor.

- [ ] Fit a count model: crashes by type ~ road features, controlling for traffic volume
- [ ] Effect sizes like "no protected left arrow: 2.3x the left-turn crashes"
- [ ] Pattern check before using FDOT causes: compare each hotspot's 2015 to 2018 profile with 2022 to 2026 (still a hotspot, similar pedestrian/bike share, similar time pattern). Use FDOT causes only where it held
- [ ] Check whether FDOT crash IDs match dataGNV `dhsmv_number` for 2015 to 2018; if so, link the same crashes directly
- [ ] Per intersection: ranked factors. Name a main factor only at 50% or more; under ~40%, label it "mixed"
- [ ] Output: factors and evidence in `hotspots.json`

### 4. Fixes

Goal: every recommended fix carries evidence.

- [ ] Countermeasure library: map each factor to FHWA proven countermeasures with their published crash reductions (`data/reference/countermeasures.json`)
- [ ] Proven local fixes: corners whose crashes dropped sharply and stayed down (2011 to 2026), compared against similar corners with no drop in the same years
- [ ] Name what changed with imagery plus Gemini; hand-verify every one used in the demo
- [ ] Per intersection: recommended countermeasure, FHWA effect, and the closest local proof if one exists

Done when: at least 3 verified local fixes, each with before and after counts against a comparison group.

### 5. Backtest

Goal: proof the method works.

- [ ] Run stages 1 to 3 on 2015 to 2021 data only
- [ ] Check how many of the top 20 intersections for 2022 to 2026 it flagged
- [ ] One headline number for the pitch: "Using only pre-2022 data, StreetSmart flagged N of today's top 20"

### 6. Case files and audit report

Goal: all user-facing text, precomputed and grounded.

- [ ] Gemini writes per intersection: one-line verdict, an explanation per factor, recommended fix, as structured JSON
- [ ] Gemini writes the audit report text from the same facts
- [ ] Prompt gets only computed facts; it may not add numbers
- [ ] City summary numbers: intersections investigated, with repeat crashes, with a clear fixable cause; crashes a year at the top 10

### 7. Database and API

- [ ] Load intersections, features, factors, fixes and case files into Tiger Data
- [ ] Continuous aggregate for crashes by year and hour (feeds the case file charts)
- [ ] FastAPI: `GET /city/summary`, `GET /intersections` (filters: cause, min crashes, mode), `GET /intersections/{id}`, `GET /intersections/{id}/report.pdf`, `GET /fix-list`

### 8. Frontend: city audit console

- [ ] City view: full map, intersections colored by main factor; header with the scale ("1,834 intersections investigated, N with repeat crashes, M with a clear fixable cause"); ranked side list
- [ ] Case file: verdict, annotated satellite and Street View images with capture dates, crash timeline by year, ranked factors with evidence, recommended fix with FHWA effect, local proof, export PDF
- [ ] Fix list: "Fix these 10 intersections to address X crashes a year", each linking to its case file
- [ ] Filters: pedestrian and bike crashes, factor type, years
- [ ] Every number labeled with its years; every image with its date
- [ ] Stretch: public view of case files for residents and advocates

### 9. Ship and submit

- [ ] Deploy on DigitalOcean; register the GoDaddy domain
- [ ] Devpost write-up, screenshots, 2-minute backup video
- [ ] Submit to every track in the Overview

## Timeline

Core working before polish time; polish beats one more feature.

| Phase | Data and AI | App |
| --- | --- | --- |
| Now | Hand check (2), start the model (3) | API and frontend skeletons, city map with real intersections |
| Next | Finish 3, countermeasure library and local fixes (4) | Case file page, images, charts |
| Then | Backtest (5), case files and city summary (6), load DB (7) | Fix list, report export, wire everything to real data |
| Before judging | Hand-verify demo intersections, fixes and every number | Deploy, domain, polish, rehearsal, backup video, Devpost |

**Team split for 3:** one on data and stats (3, 4, 5), one on Gemini and backend (2, 6, 7), one on frontend and design (8). Everyone on 9 and the demo at the end.

## Cut order and risks

Protect three things above all: the case file (verdict, annotated imagery, evidence), one verified finding at Archer Rd & 34th St, and the fix list.

**If behind, cut in this order:** public resident view, filters, PDF export, bounding boxes beyond the demo corners, the regression (keep per-intersection patterns and FHWA countermeasures), local proven fixes (keep 1 hand-verified example), backtest.

| Risk | Fallback |
| --- | --- |
| Gemini labels fail the hand check | OSM becomes the feature source; imagery is visual only |
| Regression finds nothing clear | Show per-intersection patterns with FHWA countermeasures; skip citywide effect sizes |
| No clean local fix | FHWA numbers carry the fix recommendations; present one hand-verified change as a case study |
| Bounding boxes are unreliable | Hand-check the demo corners; show labeled pins instead of boxes elsewhere |
| Old FDOT causes (2015 to 2018) | Use only where the pattern held; say it once in the pitch |
| Street View is old or blocked | Satellite is the default; always show capture dates |
| API quota or latency on stage | Everything precomputed; backup video ready |
| "Isn't this just a crash map?" | Crash maps show where. StreetSmart shows why, what fixes it, and ranks what to fix first |
| "Why not Miami?" | Florida's public crash data stops at 2019; Gainesville publishes current data. Works for any city that does |

## Demo and pitch

About 90 seconds. Lead with one true finding, not the map.

1. **Hook:** "Cities can afford to investigate a handful of dangerous intersections a year. Everything else waits for someone to get hurt."
2. **The finding:** open the Archer Rd & 34th St case file. 275 crashes since 2022. Annotated imagery shows what Gemini found. Corners designed like this crash N times more than similar-traffic corners.
3. **The fix:** the recommended countermeasure with FHWA's number, and a Gainesville corner where the same change cut crashes X%.
4. **The scale:** zoom out. "We investigated all 1,834 intersections in Gainesville." The fix list: these 10 address X crashes a year.
5. **The proof:** "Using only pre-2022 data, StreetSmart flagged N of today's top 20."
6. **The market:** "In May, Samsara launched AI road intelligence for cities. Potholes damage cars. Road design kills people. StreetSmart finds that, in any city that publishes crash data."

**Closing line:** "Every crash leaves evidence. StreetSmart reads it, for every intersection, so cities fix the next one before it happens."

Open questions:

- [ ] Swap every N, X and placeholder number for real figures from the pipeline
- [ ] Confirm the current Safe Streets and Roads for All program details before citing it
- [ ] Ask organizers about a cap on tracks per project
