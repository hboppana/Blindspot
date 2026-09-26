"""Load FDOT crashes, decode their _CD fields, and attach them to intersections.

FDOT (2015 to 2018, plus 282 rows in 2019) is where the causes come from:
driver actions, manner of collision, vehicle movement, lighting, and road
context (speed limit, lanes, traffic volume). dataGNV has none of these.

Unlike dataGNV, FDOT coordinates are real crash positions: matched against
dataGNV, FDOT's distance from the corner tracks the offset dataGNV reports
(about 146 m for a reported 152 m). So FDOT crashes snap by distance.

A crash attaches to the nearest intersection within SNAP_M that shares a
street with it, unless:
  - it is coded driveway/alley related (JCT_CD 4), the same call we made
    for dataGNV's address-only crashes;
  - its road is I-75 (SR 93 or "I 75"), which passes over surface corners.
FDOT often names only the route ("SR 24 & SR 121"); a crash with no street
name besides route numbers goes to the nearest intersection.

Codes come from data/reference/fdot_codes.json (FDOT's own coded-value
domains). Speed limit, lanes and traffic volume are already plain numbers.
"""

import json
from pathlib import Path

import pandas as pd

from streets import ROUTE_NAME, normalize_street, street_base

ROOT = Path(__file__).resolve().parent.parent
FDOT = ROOT / "data" / "processed" / "fdot_alachua_crashes_clean.csv"
CODES = ROOT / "data" / "reference" / "fdot_codes.json"

DRIVEWAY_JCT = 4
I75 = {"SR 93", None}  # normalize_street("I 75") is None
DECODE = {
    "IMPCT_TYP_CD": "collision_type",
    "VHCL_MOVE_CD": "vehicle_movement",
    "LGHT_COND_CD": "lighting",
    "EVNT_WTHR_COND_CD": "weather",
    "RD_SRFC_COND_CD": "road_surface",
    "INJSEVER": "injury_severity",
    "JCT_CD": "junction",
    "MOST_HARM_EVNT_CD": "harmful_event",
    "INTCT_TYP_CD": "intersection_type",
}
FLAGS = {
    "DISTRACTED_DRIVER_IND": "distracted",
    "IMPAIRED_DRIVER_IND": "impaired",
    "SPEEDING_IND": "speeding",
    "AGGRESSIVE_DRIVING_IND": "aggressive",
    "LANE_DEPARTURE_IND": "lane_departure",
    "AGE_TEEN_IND": "teen_driver",
    "AGE_65_PLUS_IND": "driver_65_plus",
    "PEDESTRIAN_RELATED_IND": "pedestrian",
    "BICYCLIST_RELATED_IND": "bicyclist",
}


def load_fdot():
    """FDOT crashes with duplicates dropped, codes decoded and street names normalized."""
    f = pd.read_csv(FDOT, low_memory=False)
    f = f.drop_duplicates(["CRASH_DATE", "CRASH_TIME", "ON_ROADWAY_NAME", "INT_ROADWAY_NAME",
                           "LATITUDE", "LONGITUDE"]).reset_index(drop=True)

    codes = json.loads(CODES.read_text())["fields"]
    for col, name in DECODE.items():
        table = codes[col]["codes"]
        f[name] = f[col].map(lambda v: table.get(str(int(v))) if pd.notna(v) else None)
    for col, name in FLAGS.items():
        f[name] = f[col] == "Y"

    names = pd.concat([f.ON_ROADWAY_NAME, f.INT_ROADWAY_NAME]).dropna().unique()
    canon = {n: normalize_street(n) for n in names}
    f["on_norm"] = f.ON_ROADWAY_NAME.map(canon)
    f["int_norm"] = f.INT_ROADWAY_NAME.map(canon)
    return f


def snap_fdot(f, inters, intersections_within, snap_m):
    """Set f.intersection_id for FDOT crashes that belong to an intersection.

    Among the intersections within snap_m, a crash goes to the nearest one
    that shares a street with it. Only a crash whose roads are all bare route
    numbers falls back to the nearest intersection. Checking every nearby
    corner, not just the nearest, matters: a few tiny intersections made by
    misplaced dataGNV crashes sit right next to big corners (SW 38TH ST &
    SW 39TH BLVD is 20 m from SW 37TH BLVD & SW ARCHER RD).
    """
    candidates = intersections_within(f.LATITUDE, f.LONGITUDE, inters, snap_m)
    streets = [{street_base(s) for p in members for s in p.split(" & ")} for members in inters.pairs]
    ids = inters.intersection_id.to_numpy()

    def pick(cands, on, cross, jct):
        if not len(cands) or jct == DRIVEWAY_JCT or on in I75 or not isinstance(on, str):
            return None
        roads = [r for r in (on, cross) if isinstance(r, str) and not ROUTE_NAME.match(r)]
        for i in cands:
            if any(street_base(r) in streets[i] for r in roads):
                return ids[i]
        return ids[cands[0]] if not roads else None

    f["intersection_id"] = [pick(c, on, cross, jct) for c, on, cross, jct
                            in zip(candidates, f.on_norm, f.int_norm, f.JCT_CD)]
    f["near_corner"] = [len(c) > 0 for c in candidates]
    return f
