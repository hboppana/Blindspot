# Blindspot

Blindspot is road intelligence for cities. It investigates every intersection, finds why crashes keep happening there using Gemini-labeled road imagery and statistics on public crash data, and ranks which fixes to make first.

See [docs/PLAN.md](docs/PLAN.md) for the build plan.

## Data

**Use the files in `data/processed/`.** `data/raw/` holds the untouched downloads.

| File | Rows | Source | Years | What it's for |
|---|---|---|---|---|
| `data/processed/gnv_crashes_clean.csv` | ~60,500 | [dataGNV Traffic Crashes](https://data.cityofgainesville.org/Public-Safety/Traffic-Crashes/iecn-3sxx) (City of Gainesville) | 2015 to mid-2026 | Where, when, and who: location, time, street and cross street, intersection type, pedestrian/bike/vehicle counts, fatalities |
| `data/processed/fdot_alachua_crashes_clean.csv` | ~26,800 | [FDOT State Safety Office crashes](https://gis.fdot.gov/arcgis/rest/services/Crashes_All/MapServer/0) (Alachua County) | 2015 to 2018 (2019 is partial) | Why: police-cited driver actions, collision type, lighting, weather, speed limit, lanes, traffic volume, behavior flags |

### Known data quirks

- **dataGNV coordinates:** about half the raw rows have a placeholder latitude/longitude (one downtown point). The clean file rebuilds every location from `geox`/`geoy` (Florida State Plane North, EPSG:2238, ×100), which match the real coordinates to a few meters.
- **Street pairs appear in both orders:** "Archer Rd & 34th St" and "34th St & Archer Rd" are separate strings. Group hotspots by location (or a sorted street pair), not by the raw text.
- **dataGNV has no cause fields.** Causes come from FDOT, which ends in 2019 publicly. FDOT's 2019 has only a few hundred Alachua rows, so treat 2015 to 2018 as its full years.
- **FDOT coded fields** (`IMPCT_TYP_CD`, `LGHT_COND_CD`, others ending in `_CD`) are numeric codes; decode them with FDOT's crash code manual. Fields ending in `_TXT` are already readable.
- **2020 drop:** crashes fell about 30% in 2020 and stayed lower. Use 2022 onward for current hotspots.

### Refreshing the data

- **On GitHub:** Actions → *Fetch crash data* → *Run workflow*. It downloads both sources, cleans them, and commits the CSVs.
- **Locally:** `python scripts/fetch_data.py` (standard library only; `--gnv` or `--fdot` for one source), then `pip install pyproj && python scripts/clean_data.py`.
