"""Download Blindspot's crash data into data/raw/ as CSV.

Sources
  1. dataGNV Traffic Crashes (City of Gainesville, Socrata dataset iecn-3sxx)
     -> data/raw/gnv_crashes.csv          (2015-01-01 onward, one row per crash)
  2. FDOT State Safety Office crashes, Alachua County (ArcGIS, 2015-2019)
     -> data/raw/fdot_alachua_crashes.csv (police-cited causes, road facts)

Usage (Python 3.9+, standard library only):
  python scripts/fetch_data.py            # both sources
  python scripts/fetch_data.py --gnv      # dataGNV only
  python scripts/fetch_data.py --fdot     # FDOT only
"""

import argparse
import csv
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"

GNV_URL = "https://data.cityofgainesville.org/resource/iecn-3sxx.json"
GNV_START = "2015-01-01T00:00:00"
GNV_PAGE = 50000

FDOT_URL = "https://gis.fdot.gov/arcgis/rest/services/Crashes_All/MapServer/0/query"
FDOT_PAGE = 1000  # server max per request
FDOT_FIELDS = [
    "XID", "CALENDAR_YEAR", "CRASH_DATE", "CRASH_TIME", "WEEKDAY_TXT",
    "COUNTY_TXT", "ON_ROADWAY_NAME", "INT_ROADWAY_NAME",
    "LATITUDE", "LONGITUDE",
    "INTERSECTION_IND", "INTCT_TYP_CD", "JCT_CD",
    "IMPCT_TYP_CD", "MOST_HARM_EVNT_CD", "VHCL_MOVE_CD",
    "D1_FRST_DR_ACTN_CD_TXT", "D2_FRST_DR_ACTN_CD_TXT",
    "LGHT_COND_CD", "EVNT_WTHR_COND_CD", "RD_SRFC_COND_CD",
    "V1TRAFCTL_TXT", "V2TRAFCTL_TXT",
    "SPEED_LIMIT", "CNTOFLANES", "AVERAGE_DAILY_TRAFFIC", "RCI_AVG_PERC_TRUCK_TRAFF",
    "INJSEVER", "NUMBER_OF_INJURED", "NUMBER_OF_SERIOUS_INJURIES", "NUMBER_OF_KILLED",
    "NUMBER_OF_VEHICLES", "NUMBER_OF_PEDESTRIANS", "NUMBER_OF_BICYCLISTS",
    "PEDESTRIAN_RELATED_IND", "BICYCLIST_RELATED_IND", "MOTORCYCLE_INVOLVED_IND",
    "COMMERCIAL_VEHICLE_IND", "DISTRACTED_DRIVER_IND", "IMPAIRED_DRIVER_IND",
    "SPEEDING_IND", "AGGRESSIVE_DRIVING_IND", "LANE_DEPARTURE_IND", "WRONGWAY_IND",
    "AGE_TEEN_IND", "AGE_65_PLUS_IND",
]


def get_json(url, params, retries=4):
    full = url + "?" + urllib.parse.urlencode(params)
    for attempt in range(retries):
        try:
            req = urllib.request.Request(full, headers={"User-Agent": "blindspot-fetch/1.0"})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)
        except Exception as e:  # network hiccup: back off and retry
            if attempt == retries - 1:
                raise
            wait = 2 ** attempt
            print(f"  retry in {wait}s ({e})", file=sys.stderr)
            time.sleep(wait)


def write_csv(path, rows, fields):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def fetch_gnv():
    print("dataGNV: downloading crashes since 2015 ...")
    rows, offset = [], 0
    while True:
        page = get_json(GNV_URL, {
            "$where": f"accident_date >= '{GNV_START}'",
            "$order": "accident_date, case_number",
            "$limit": GNV_PAGE,
            "$offset": offset,
        })
        if isinstance(page, dict) and page.get("error"):
            raise RuntimeError(page)
        rows.extend(page)
        print(f"  {len(rows):,} rows")
        if len(page) < GNV_PAGE:
            break
        offset += GNV_PAGE

    for r in rows:
        r.pop("location", None)  # duplicate of latitude/longitude
        r.pop(":@computed_region", None)
    fields = sorted({k for r in rows for k in r if not k.startswith(":")})
    first = ["case_number", "dhsmv_number", "accident_date", "accident_hour_of_day",
             "accident_day_of_week", "occurred_on", "at_from_intersection",
             "intersecttype", "latitude", "longitude"]
    fields = [f for f in first if f in fields] + [f for f in fields if f not in first]

    out = RAW / "gnv_crashes.csv"
    write_csv(out, rows, fields)
    print(f"dataGNV: wrote {len(rows):,} crashes to {out.relative_to(ROOT)}")
    return rows


def fetch_fdot():
    print("FDOT: downloading Alachua County crashes (2015-2019) ...")
    where = "COUNTY_TXT = 'ALACHUA' AND CALENDAR_YEAR >= 2015"
    rows, offset = [], 0
    while True:
        page = get_json(FDOT_URL, {
            "where": where,
            "outFields": ",".join(FDOT_FIELDS),
            "returnGeometry": "false",
            "orderByFields": "OBJECTID",
            "resultOffset": offset,
            "resultRecordCount": FDOT_PAGE,
            "f": "json",
        })
        if "error" in page:
            raise RuntimeError(page["error"])
        feats = [f["attributes"] for f in page.get("features", [])]
        rows.extend(feats)
        if len(rows) % 10000 < FDOT_PAGE:
            print(f"  {len(rows):,} rows")
        if not feats or not page.get("exceededTransferLimit"):
            break
        offset += len(feats)

    for r in rows:  # epoch ms -> ISO date
        d = r.get("CRASH_DATE")
        if isinstance(d, (int, float)):
            r["CRASH_DATE"] = time.strftime("%Y-%m-%d", time.gmtime(d / 1000 + 12 * 3600))

    out = RAW / "fdot_alachua_crashes.csv"
    write_csv(out, rows, FDOT_FIELDS)
    print(f"FDOT: wrote {len(rows):,} crashes to {out.relative_to(ROOT)}")
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--gnv", action="store_true", help="dataGNV only")
    ap.add_argument("--fdot", action="store_true", help="FDOT only")
    a = ap.parse_args()
    both = not (a.gnv or a.fdot)
    if both or a.gnv:
        fetch_gnv()
    if both or a.fdot:
        fetch_fdot()


if __name__ == "__main__":
    main()
