# Blindspot: Build Plan

Sep 26, 2026 · @Hemanshu

> Source of truth is the shared Claude doc: https://claude.ai/code/artifact/7b05af60-dd0f-4871-b737-c25b0ae117f5. This file is a snapshot for working in the repo.

## Overview

Blindspot tells students why their route is dangerous, and tells the city which fix already worked. It is our ShellHacks 2026 entry, built on Gainesville crash data.

**How a student uses it**

1. Enter a trip (dorm to class) and a mode: walk, bike or drive.
2. See only the hotspots on that route whose crash pattern matches your mode, your maneuver and your time of day.
3. Tap a hotspot: ranked causes, each with a plain-language explanation, the evidence behind it, and what to do.
4. Tap **Report to the city**: a ready-made request backed by the crash data and a fix that already worked in Gainesville.

**What makes it different:** Gemini is a sensor, not an oracle. It turns street imagery into road-design data, and statistics reaches the conclusions. Every "why" is backed by evidence from the whole city.

**Tracks:** Best Overall (automatic), Waymo (primary), State Farm, Microsoft, MLH Gemini, MLH Tiger Data, MLH GoDaddy, MLH DigitalOcean. ElevenLabs only if ahead of schedule. Confirm with organizers whether there is a cap on tracks per project.

## Current state

The data layer is done: both crash sources are downloaded, cleaned and committed to [hboppana/Blindspot](https://github.com/hboppana/Blindspot). Everything else is still to build.

| Path | What it is |
| --- | --- |
| `data/processed/gnv_crashes_clean.csv` | 60,466 Gainesville crashes, 2015 to mid-2026: location, time, street and cross street, intersection type, pedestrian/bike/vehicle counts, fatalities |
| `data/processed/fdot_alachua_crashes_clean.csv` | 26,811 Alachua County crashes, 2015 to 2019: police-cited driver actions, collision type, lighting, weather, speed limit, lanes, traffic volume, behavior flags |
| `data/raw/` | Untouched downloads of both sources |
| `scripts/fetch_data.py` | Downloads both sources (standard library only) |
| `scripts/clean_data.py` | Rebuilds locations and writes the clean CSVs (needs `pyproj`) |
| `.github/workflows/fetch-data.yml` | Runs fetch + clean on GitHub and commits the data |

**Data quirks to respect**

- About half the raw dataGNV rows had a placeholder location. The clean file rebuilds every location from `geox`/`geoy` (EPSG:2238), accurate to a few meters.
- The same corner appears under both street orders ("Archer & 34th", "34th & Archer"). Group hotspots by location, not street text.
- dataGNV has no cause fields. Causes come from FDOT, which is really 2015 to 2018 (only 282 Alachua rows in 2019).
- FDOT fields ending in `_CD` are numeric codes that need decoding. Fields ending in `_TXT` are readable.
- Crashes dropped about 30% in 2020. Use 2022 onward for current hotspots.
- Top hotspot since 2022: SW Archer Rd & SW 34th St, 275 crashes at the corner or within 150 ft, all spellings merged.

## Architecture

All heavy work runs offline and is cached, so the app only reads precomputed results and the demo is instant. The only live calls are Google Directions for the route and the page itself.

| Stage | Input | Output | Tech |
| --- | --- | --- | --- |
| 1. Hotspots | Clean crash CSVs | Intersection hotspots with crash profiles (mode, time, intersection type, severity) | pandas, spatial clustering |
| 2. Road labels | Top intersections | Road-design features per intersection (turn arrow, crosswalks, bike lane, lanes, median) | Gemini API on Static Maps satellite + Street View Static |
| 3. Causes | Stages 1 and 2 + FDOT causes | Ranked causes per hotspot, with citywide effect sizes | statsmodels (Poisson / negative binomial) |
| 4. Proven fixes | Crash history 2011 to 2026 + imagery | Corners where crashes dropped after a change, and what changed | before/after vs. comparison corners |
| 5. Cards | Stages 1 to 4 | Plain-language explanation, what to do, suggested fix, city report text | Gemini API (grounded, structured JSON) |
| 6. Store | All of the above | Tables the API reads | Tiger Data (Postgres) |
| 7. API | Store + Directions | Route check, hotspot detail, report endpoints | FastAPI |
| 8. App | API | Route-first student UI with map, hotspot page, report | React / Next.js + Google Maps JS |
| 9. Deploy | App + API | Public URL on our own domain | DigitalOcean App Platform, GoDaddy domain |

One Google Cloud key covers Directions, Maps JS, Static Maps and Street View Static. Keep keys in `.env`, never in the repo.

## Workstreams

Eight workstreams, in build order. Each ends in something the next one can use.

### 1. Hotspots and crash profiles

Goal: a table of the top ~50 intersections near campus and student housing, each with a crash profile.

- [x] Snap crashes to intersections (cluster within ~40 m, or a sorted street pair plus location)
- [x] Rank by crash count, 2022 onward
- [x] Profile each: share involving pedestrians, bikes, mopeds; hour and day pattern; severity; at-intersection share
- [x] Join FDOT 2015 to 2018 crashes at the same spot: top driver actions, collision types, lighting, speed limit, lanes, traffic volume
- [x] Decode FDOT `_CD` fields used
- [x] Output: `data/derived/hotspots.json`

Notes: build items done; the Archer Rd & 34th St hand check is still pending. Severity since 2022 is fatalities only; injury severity comes from FDOT (2015 to 2018). Six hotspots have under 20 FDOT crashes, mostly plaza roads FDOT doesn't cover.

### 2. Road-feature labeling with Gemini

Goal: a road-design dataset for every major intersection, not just the hotspots (the model needs comparison corners).

- [ ] Pull a satellite image plus 4 Street View headings per intersection; save capture dates from Street View metadata
- [ ] Ask Gemini fixed yes/no/can't-tell questions: protected left arrow, marked crosswalk per leg, bike lane, median, lane count, pedestrian signal
- [ ] Cache images and answers on disk; never re-call for the same intersection
- [ ] Hand-check 20 intersections before labeling the rest
- [ ] Output: `data/derived/road_features.csv`

Done when: hand-check agreement is high enough to trust, or we fall back to images as visuals only.

### 3. Cause analysis

Goal: citywide evidence for each cause, so no "why" is just an LLM opinion.

- [ ] Fit a count model: crashes by type ~ road features, controlling for traffic volume
- [ ] Produce effect sizes like "no protected left arrow: 2.3x the left-turn crashes"
- [ ] Per hotspot: ranked causes. Name a main cause only if it covers 50% or more; under ~40%, label the hotspot "mixed"
- [ ] Output: causes and evidence added to `hotspots.json`

Done when: every top hotspot has a ranked cause list with a number behind each cause.

### 4. Proven fixes

Goal: fixes that already worked in Gainesville.

- [ ] Find corners whose yearly crashes dropped sharply and stayed down (2011 to 2026)
- [ ] Compare against similar corners with no drop in the same years
- [ ] Use imagery plus Gemini to name what changed; hand-verify each one used in the demo
- [ ] Link each hotspot to the closest proven fix for its main cause

Done when: at least 3 verified fixes, each with before and after counts.

### 5. Card and report generation

Goal: all user-facing text, precomputed and grounded.

- [ ] Gemini writes, per hotspot and per mode: what happens here, what to do, suggested fix, as structured JSON
- [ ] Gemini writes the city report text from the same facts
- [ ] Prompt gets only computed facts; it may not add numbers

### 6. Database and API

- [ ] Load hotspots, features, causes, fixes and cards into Tiger Data
- [ ] Continuous aggregate for crashes by hour and month (feeds the hotspot charts)
- [ ] FastAPI: `POST /route-check` (origin, destination, mode, time), `GET /hotspots/{id}`, `POST /report`
- [ ] Route check: Directions API steps, match hotspots within ~50 m, keep those whose pattern fits the mode, maneuver and hour
- [ ] Safer route: request alternatives, pick the one with the fewest matching hotspots

### 7. Frontend

- [ ] Landing: "Where are you going?" with origin, destination and mode. Route first, map second.
- [ ] Results: route on the map, hotspot markers, one briefing card per hotspot in trip order, safer-route toggle with time difference
- [ ] Hotspot page: ranked causes with evidence checks, crash charts, satellite image with capture date, Street View on tap, suggested fix, proven fix, Report to the city
- [ ] Report screen: generated request, copy and send
- [ ] Closing view: all hotspots near campus, for the demo finale
- [ ] Labels say "crashes 2022 to 2026" and show image dates

### 8. Ship and submit

- [ ] Deploy on DigitalOcean; register the GoDaddy domain
- [ ] Devpost write-up, screenshots, 2-minute backup video
- [ ] Submit to every track in the Overview

## Timeline

Core working by hour 23, polish from there. Hours count from the start of building.

| Hours | Data and AI | App |
| --- | --- | --- |
| 0 to 6 | Workstream 1 (hotspots). Start 2 on 20 intersections and hand-check | Google Cloud key, repo scaffold, API and frontend skeletons |
| 6 to 14 | Finish 2 across all intersections. Start 3 | Workstream 6 (DB, route check). Landing and results screens |
| 14 to 20 | Finish 3. Workstream 4 (proven fixes) | Hotspot page, charts, images |
| 20 to 23 | Workstream 5 (cards and reports), load into the DB | Wire the app to real data, report screen |
| 23 to 28 | Hand-verify demo hotspots and fixes | Deploy, domain, closing view |
| 28 to 36 | Numbers for the pitch | Polish, rehearsal, backup video, Devpost |

**Team split for 3:** one on data and stats (1, 3, 4), one on Gemini and backend (2, 5, 6), one on frontend and design (7). Everyone on 8 and the demo from hour 28.

## Cut order and risks

Protect three things above all: the route briefing cards, the hotspot page's "why", and the link between them.

**If behind, cut in this order:** ElevenLabs voice, safer route, closing citywide view, the regression (keep per-hotspot patterns only), proven fixes (keep 1 hand-picked example).

| Risk | Fallback |
| --- | --- |
| Gemini road labels are inaccurate | Drop the model; images become visuals only, causes come from crash patterns and FDOT fields |
| Regression finds nothing clear | Show per-hotspot patterns and FDOT causes; skip citywide effect sizes |
| No clean proven fix in the data | Hand-verify one known change and present it as a case study |
| Directions maneuvers are vague ("keep left") | Give a general warning for that hotspot instead of a maneuver-specific one |
| Street View is old or blocked | Satellite image is the default; always show capture dates |
| Old FDOT causes (2015 to 2018) | Say it once in the pitch; causes are patterns, current locations come from 2022 to 2026 |
| API quota or latency on stage | Everything precomputed; demo route cached; backup video ready |
| Judges ask "why not Miami?" | Florida's public crash data stops at 2019; Gainesville publishes current data. Works for any city that does |

## Demo and pitch

About 90 seconds, one continuous story, no UF-specific names on stage.

1. **Hook:** Gainesville has about 4,300 crashes a year, concentrated on the streets students use every day. Crash maps show dots; nobody tells you why.
2. **Route:** "I'm walking from my apartment to class." The route shows 2 hotspots; flip through the briefing cards.
3. **Why:** tap Archer Rd & 34th St. Ranked causes, the evidence behind each, the satellite image.
4. **Proof:** "A corner like this dropped X% after this change. It already worked here."
5. **Act:** Report to the city, generated in one tap.
6. **Zoom out:** every hotspot near campus. "We built it on Gainesville because it publishes current data. Give us Miami's, and it works for every student here tomorrow."

**Closing line:** "We tell students why their route is dangerous, and tell the city which fix already worked."

Open questions:

- [ ] Verify the University Ave redesign history before using it as the opener
- [ ] Swap every X and every placeholder number for real figures from the pipeline
