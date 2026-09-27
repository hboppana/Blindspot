# StreetSmart

**Ground intelligence for safer streets.** StreetSmart reads Gainesville's roads to find the intersections that keep crashing, shows why, and names the proven fix.

**Live site:** [streetsmart.work](https://streetsmart.work)

## What's on the site

| Page | What it shows |
|---|---|
| **Home** (`/`) | The problem, why it's the road and not just the drivers, how StreetSmart works, and what fixing the worst intersections is worth |
| **City Map** (`/map`) | Every intersection, coloured by grade (A to F). Click one for its report. **Route Planner** grades every intersection on a drive, walk or bike route. The expand button makes the map fill the screen. |
| **Red List** (`/red-list`) | The 10 most dangerous intersections, with what keeps happening and the fix |
| **Watch List** (`/watch-list`) | Intersections where crashes are climbing year after year |
| **Road Map** (`/road-map`) | What building the Red List's fixes would do, grouped by fix, with cost |
| **Reports** (`/intersections/[id]`) | One intersection's dashboard: grade, crashes against similar intersections, crash types, timing, the fix, and satellite and Street View |

**Grades** compare an intersection's crashes a year with what an intersection with the same traffic and layout sees:

| Grade | Crashes a year |
|---|---|
| F | 8 or more above similar |
| D | 4 to 8 above |
| C | 1 to 4 above |
| B | 0 to 1 above |
| A | fewer than similar |

## How the repo is laid out

| Folder | What's in it |
|---|---|
| `frontend/` | The website (Next.js). See [frontend/README.md](frontend/README.md). |
| `scripts/` | The data pipeline (Python) |
| `data/` | Raw downloads, cleaned crash files, and the pipeline's outputs |
| `api/` | The API (FastAPI) and the database schema |
| `docs/` | [API reference](docs/API.md) and the [build plan](docs/PLAN.md) |

## Run the website locally

```bash
cd frontend
npm install
cp .env.example .env.local   # add your Google Maps browser key
npm run dev                  # http://localhost:3000
```

It runs on the committed data alone: no database or API needed.

## The data

**Use the files in `data/processed/`.** `data/raw/` holds the untouched downloads.

| File | Rows | Source | Years | What it's for |
|---|---|---|---|---|
| `gnv_crashes_clean.csv` | ~60,500 | [dataGNV Traffic Crashes](https://data.cityofgainesville.org/Public-Safety/Traffic-Crashes/iecn-3sxx) (City of Gainesville) | 2015 to mid-2026 | Where, when, and who: location, time, streets, pedestrians, bikes, vehicles, deaths |
| `fdot_alachua_crashes_clean.csv` | ~26,800 | [FDOT State Safety Office](https://gis.fdot.gov/arcgis/rest/services/Crashes_All/MapServer/0) (Alachua County) | 2015 to 2018 | Why: collision type, driver actions, lighting, weather, speed limit, lanes, traffic |

**Refresh it:** on GitHub, run **Actions → Fetch crash data → Run workflow**. It downloads, cleans and commits both files. Locally, run `python scripts/fetch_data.py`, then `python scripts/clean_data.py` (the second needs `pyproj`).

### Things to know about the data

- **Current hotspots use 2022 onward.** Crashes fell about 30% in 2020 and stayed lower.
- **Crash types come from FDOT, which stops in 2018.** dataGNV has no cause fields, and FDOT's public 2019 data is only a few hundred rows.
- **Street pairs appear in both orders** ("Archer Rd & 34th St" and "34th St & Archer Rd"). Group by location or a sorted pair, never the raw text.
- **About half of dataGNV's raw coordinates are a placeholder** (one downtown point). The clean file rebuilds every location from `geox`/`geoy` (Florida State Plane North, EPSG:2238, ×100), accurate to a few metres.
- **FDOT fields ending in `_CD` are numeric codes**; decode them with FDOT's crash code manual. Fields ending in `_TXT` are already readable.

## The pipeline

Each script writes to `data/derived/`, and the outputs are committed. Run them in this order when the crash data changes:

| Step | Script | What it does |
|---|---|---|
| 1 | `fetch_data.py`, `clean_data.py` | Download and clean the crash data |
| 2 | `build_hotspots.py` | Group crashes into intersections |
| 3 | `osm_features.py` | Road design from OpenStreetMap |
| 4 | `fetch_imagery.py`, `label_features.py` | Satellite and Street View imagery, labelled by Gemini |
| 5 | `merge_features.py` | One row of road features per intersection (Gemini, OSM, FDOT) |
| 6 | `pattern_check.py`, `causes.py` | Compare with similar intersections; find the crash types that stand out |
| 7 | `local_fixes.py`, `recommend.py` | Match each pattern to an FHWA proven safety fix |
| 8 | `case_files.py` | Plain-language write-ups by Gemini, checked against the numbers |
| 9 | `city_summary.py` | City totals, the Red List, and the audit summary |
| 10 | `backtest.py` | Would today's worst intersections have been caught before 2022? |

Python setup: `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`. Keys go in a `.env` file at the repo root (see the scripts' headers for which ones each needs).

## Database and API

The site can also read from a Tiger Data (TimescaleDB) database through a FastAPI app. The endpoints are listed in [docs/API.md](docs/API.md).

1. **Set up:** put `DATABASE_URL=postgres://...?sslmode=require` in `.env`.
2. **Load:** `.venv/bin/python scripts/load_db.py`. It drops and recreates every table from [api/schema.sql](api/schema.sql), then loads everything from `data/derived/` and `data/reference/`.
3. **Run:** `.venv/bin/uvicorn api.main:app --reload`, then open http://localhost:8000/docs.
4. **Point the site at it:** set `API_BASE_URL=http://localhost:8000` in `frontend/.env.local`.

## Deployment

The site deploys to **Vercel** on every push to `main`, at [streetsmart.work](https://streetsmart.work) (domain registered with GoDaddy).

- **Vercel project settings:** Root Directory `frontend`, Framework Preset **Next.js**, "Include files outside the root directory" left on. The build generates its data from `data/`.
- **Environment variable:** `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`. Leave `API_BASE_URL` unset to serve the committed data.
- **Google Maps key:** its website restrictions must list `https://streetsmart.work/*` and `https://www.streetsmart.work/*`.
