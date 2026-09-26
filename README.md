# Blindspot

Blindspot checks your route for dangerous intersections and explains why each one is dangerous. It uses Gemini to label road design from street imagery and runs statistics on crash data to find the causes, along with the fixes that have already worked.

## Data

| File | Source | Years | What it's for |
|---|---|---|---|
| `data/raw/gnv_crashes.csv` | [dataGNV Traffic Crashes](https://data.cityofgainesville.org/Public-Safety/Traffic-Crashes/iecn-3sxx) (City of Gainesville) | 2015 to present | Where, when, and who: location, time, intersection type, pedestrian/bike/vehicle counts, fatalities |
| `data/raw/fdot_alachua_crashes.csv` | [FDOT State Safety Office crashes](https://gis.fdot.gov/arcgis/rest/services/Crashes_All/MapServer/0) (Alachua County) | 2015 to 2019 | Why: police-cited driver actions, collision type, lighting, weather, speed limit, lanes, traffic volume, behavior flags |

FDOT's public service stops at 2019. Its coded fields (`IMPCT_TYP_CD`, `LGHT_COND_CD`, and others ending in `_CD`) are numeric codes; decode them with FDOT's crash code manual.

### Refreshing the data

- **On GitHub:** Actions → *Fetch crash data* → *Run workflow*. It downloads both sources and commits the CSVs.
- **Locally:** `python scripts/fetch_data.py` (standard library only; `--gnv` or `--fdot` for one source).
