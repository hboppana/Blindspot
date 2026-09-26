"""Clean raw crash data into data/processed/.

gnv_crashes.csv
  About half of dataGNV's rows carry a placeholder latitude/longitude (one
  downtown point). Every row also has geox/geoy: Florida State Plane North
  (EPSG:2238, US survey feet) x100. We rebuild lat/lon from those for all rows;
  where the published coordinates are real, the two agree to a few meters.

fdot_alachua_crashes.csv
  Passed through with lat/lon checked and a crash_date column.

Requires: pip install pyproj
Usage:    python scripts/clean_data.py
"""

import csv
from pathlib import Path

from pyproj import Transformer

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "processed"

# Generous box around Gainesville / Alachua County.
LAT_MIN, LAT_MAX = 29.40, 29.95
LON_MIN, LON_MAX = -82.70, -82.00

TO_WGS84 = Transformer.from_crs("EPSG:2238", "EPSG:4326", always_xy=True)


def in_box(lat, lon):
    return LAT_MIN <= lat <= LAT_MAX and LON_MIN <= lon <= LON_MAX


def to_int(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return 0


def clean_gnv():
    src = RAW / "gnv_crashes.csv"
    rows = list(csv.DictReader(open(src, encoding="utf-8")))
    out, dropped = [], 0
    for r in rows:
        lat = lon = None
        try:
            lon, lat = TO_WGS84.transform(float(r["geox"]) / 100, float(r["geoy"]) / 100)
        except (KeyError, ValueError):
            pass
        if lat is None or not in_box(lat, lon):
            dropped += 1
            continue

        peds = to_int(r.get("numberofpedestriansinvolved"))
        bikes = to_int(r.get("numberofbicyclesinvolved"))
        mopeds = to_int(r.get("numberofmopedsinvolved"))
        motos = to_int(r.get("numberofmotorcylesinvolved"))
        date = r.get("accident_date", "")
        out.append({
            "case_number": r.get("case_number", ""),
            "crash_datetime": date[:19],
            "crash_date": date[:10],
            "year": date[:4],
            "hour": to_int(r.get("accident_hour_of_day")),
            "day_of_week": r.get("accident_day_of_week", ""),
            "street": (r.get("occurred_on") or "").strip(),
            "cross_street": (r.get("at_from_intersection") or "").strip(),
            "offset_from_cross": (r.get("at") or "").strip(),
            "direction": (r.get("direction") or "").strip(),
            "street_address": (r.get("at_street_address") or "").strip(),
            "intersection_type": (r.get("intersecttype") or "").strip(),
            "at_intersection": int(bool(r.get("intersecttype")) and r.get("intersecttype") != "NOT AT INTERSECTION"),
            "latitude": round(lat, 6),
            "longitude": round(lon, 6),
            "vehicles": to_int(r.get("totalvehiclesinvolved")),
            "people": to_int(r.get("totalpeopleinvolved")),
            "pedestrians": peds,
            "bicycles": bikes,
            "mopeds": mopeds,
            "motorcycles": motos,
            "buses": to_int(r.get("numberofbusesinvolved")),
            "fatalities": to_int(r.get("totalfatalities")),
            "involves_pedestrian": int(peds > 0),
            "involves_bicycle": int(bikes > 0),
            "involves_vulnerable_user": int(peds + bikes + mopeds + motos > 0),
        })

    OUT.mkdir(parents=True, exist_ok=True)
    dst = OUT / "gnv_crashes_clean.csv"
    with open(dst, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0].keys()))
        w.writeheader()
        w.writerows(out)
    print(f"dataGNV: {len(out):,} crashes kept, {dropped:,} dropped (no usable location) -> {dst.relative_to(ROOT)}")


def clean_fdot():
    src = RAW / "fdot_alachua_crashes.csv"
    rows = list(csv.DictReader(open(src, encoding="utf-8")))
    out, dropped = [], 0
    for r in rows:
        try:
            lat, lon = float(r["LATITUDE"]), float(r["LONGITUDE"])
        except (KeyError, ValueError):
            dropped += 1
            continue
        if not in_box(lat, lon):
            dropped += 1
            continue
        r["LATITUDE"], r["LONGITUDE"] = round(lat, 6), round(lon, 6)
        out.append(r)

    dst = OUT / "fdot_alachua_crashes_clean.csv"
    with open(dst, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(out)
    print(f"FDOT: {len(out):,} crashes kept, {dropped:,} dropped (no usable location) -> {dst.relative_to(ROOT)}")


if __name__ == "__main__":
    clean_gnv()
    clean_fdot()
