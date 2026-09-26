"""Fetch satellite and Street View imagery for the 20 hand-check corners.

Workstream 2 labels road design with Gemini. Before labeling everything we
hand-check 20 corners: the top HOTSPOTS hotspots (the demo depends on them)
plus COMPARISON quieter corners near campus, spread across crash counts.

Per corner, into data/imagery/<corner id>/:
  satellite.png   Static Maps, zoom 20, centred on the intersection
  sv_<n>.jpg      one Street View image per road leg, taken ~PROBE_M up the
                  leg and pointed back at the intersection, tilted down so
                  lane arrows and crosswalks are in frame
  meta.json       corner, capture dates, pano ids, headings

Finding the legs: Street View metadata requests are free and use no quota,
so we probe PROBE_BEARINGS directions around the corner. A pano found out
along a direction means a road leg there; bearings closer than LEG_GAP_DEG
are the same leg. If fewer than 2 legs turn up, we fall back to the centre
pano with four fixed headings.

Billed requests: 1 satellite + up to MAX_LEGS Street View images per corner.
Anything already on disk is never fetched again.

Needs GOOGLE_MAPS_API_KEY (Static Maps + Street View Static enabled), in the
environment or in .env at the repo root.

Usage:
  python scripts/fetch_imagery.py --dry-run   # pick corners, no API calls
  python scripts/fetch_imagery.py             # fetch
  python scripts/fetch_imagery.py --only sw-34th-st-sw-archer-rd
"""

import argparse
import csv
import json
import math
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from build_hotspots import CAMPUS_KM, _display, _slug

ROOT = Path(__file__).resolve().parent.parent
DERIVED = ROOT / "data" / "derived"
IMAGERY = ROOT / "data" / "imagery"
CORNERS = DERIVED / "handcheck_corners.csv"

HOTSPOTS = 12
COMPARISON = 8
COMPARISON_RANGE = (5, 40)  # crashes since 2022

STATIC_URL = "https://maps.googleapis.com/maps/api/staticmap"
SV_URL = "https://maps.googleapis.com/maps/api/streetview"
SV_META_URL = "https://maps.googleapis.com/maps/api/streetview/metadata"

SAT_ZOOM = 20
SAT_SIZE = "640x640"
SAT_SCALE = 2  # 1280x1280 pixels
SV_SIZE = "640x640"
SV_FOV = 80
SV_PITCH = -10

PROBE_M = 35
PROBE_RADIUS_M = 15
PROBE_BEARINGS = range(0, 360, 30)
LEG_DIST_M = (15, 60)  # a pano this far from the centre can show a leg
LEG_GAP_DEG = 50
MAX_LEGS = 4

# Local flat projection, as in build_hotspots.py.
M_PER_DEG_LAT = 110_860
M_PER_DEG_LON = 111_320 * math.cos(math.radians(29.65))


def api_key():
    key = os.environ.get("GOOGLE_MAPS_API_KEY")
    env = ROOT / ".env"
    if not key and env.exists():
        for line in env.read_text().splitlines():
            name, _, value = line.partition("=")
            if name.strip() == "GOOGLE_MAPS_API_KEY":
                key = value.strip().strip("\"'")
    if not key:
        sys.exit("GOOGLE_MAPS_API_KEY is not set (environment or .env)")
    return key


def pick_corners():
    """Top hotspots plus comparison corners spread across lower crash counts."""
    hotspots = json.loads((DERIVED / "hotspots.json").read_text())["hotspots"]
    chosen = [{"id": h["id"], "name": h["name"], "lat": h["lat"], "lon": h["lon"],
               "crashes_2022_on": h["crashes"]["crashes"], "role": "hotspot"}
              for h in hotspots[:HOTSPOTS]]
    taken = {c["id"] for c in chosen}

    rows = list(csv.DictReader(open(DERIVED / "intersections.csv", encoding="utf-8")))
    lo, hi = COMPARISON_RANGE
    pool = [r for r in rows
            if float(r["campus_km"]) <= CAMPUS_KM and lo <= int(r["crashes_2022_on"]) <= hi]
    pool.sort(key=lambda r: -int(r["crashes_2022_on"]))
    step = len(pool) / COMPARISON
    for k in range(COMPARISON):
        r = pool[int(k * step)]
        cid = _slug(r["intersection_id"])
        if cid in taken:
            continue
        chosen.append({"id": cid, "name": _display(r["intersection_id"]),
                       "lat": round(float(r["lat"]), 6), "lon": round(float(r["lon"]), 6),
                       "crashes_2022_on": int(r["crashes_2022_on"]), "role": "comparison"})
    return chosen


def offset(lat, lon, bearing_deg, dist_m):
    b = math.radians(bearing_deg)
    return (lat + dist_m * math.cos(b) / M_PER_DEG_LAT,
            lon + dist_m * math.sin(b) / M_PER_DEG_LON)


def bearing_and_dist(lat1, lon1, lat2, lon2):
    """Bearing (degrees from north) and distance (m) from point 1 to point 2."""
    dx = (lon2 - lon1) * M_PER_DEG_LON
    dy = (lat2 - lat1) * M_PER_DEG_LAT
    return math.degrees(math.atan2(dx, dy)) % 360, math.hypot(dx, dy)


def angle_gap(a, b):
    return abs((a - b + 180) % 360 - 180)


def get(url, params, key):
    query = urllib.parse.urlencode({**params, "key": key})
    with urllib.request.urlopen(f"{url}?{query}", timeout=60) as resp:
        return resp.headers.get("Content-Type", ""), resp.read()


def sv_metadata(lat, lon, key, radius=PROBE_RADIUS_M):
    _, body = get(SV_META_URL, {"location": f"{lat},{lon}", "radius": radius,
                                "source": "outdoor"}, key)
    meta = json.loads(body)
    if meta["status"] in ("REQUEST_DENIED", "OVER_QUERY_LIMIT", "INVALID_REQUEST"):
        sys.exit(f"Street View metadata: {meta['status']} {meta.get('error_message', '')}")
    return meta if meta["status"] == "OK" else None


def save_image(url, params, key, path):
    ctype, body = get(url, params, key)
    if not ctype.startswith("image/"):
        raise RuntimeError(f"{path.name}: expected an image, got {ctype}: {body[:200]!r}")
    path.write_bytes(body)


def find_legs(corner, key):
    """Panos out along each road leg, with the heading back to the centre."""
    lat, lon = corner["lat"], corner["lon"]
    found = {}
    for b in PROBE_BEARINGS:
        meta = sv_metadata(*offset(lat, lon, b, PROBE_M), key)
        if not meta or meta["pano_id"] in found:
            continue
        p = meta["location"]
        leg_bearing, dist = bearing_and_dist(lat, lon, p["lat"], p["lng"])
        if LEG_DIST_M[0] <= dist <= LEG_DIST_M[1]:
            found[meta["pano_id"]] = {"pano_id": meta["pano_id"], "pano_lat": p["lat"],
                                      "pano_lon": p["lng"], "date": meta.get("date"),
                                      "leg_bearing": round(leg_bearing), "distance_m": round(dist),
                                      "heading": round((leg_bearing + 180) % 360)}

    # One pano per leg: the one nearest PROBE_M out.
    legs = []
    for pano in sorted(found.values(), key=lambda p: abs(p["distance_m"] - PROBE_M)):
        if all(angle_gap(pano["leg_bearing"], l["leg_bearing"]) >= LEG_GAP_DEG for l in legs):
            legs.append(pano)
    return sorted(legs[:MAX_LEGS], key=lambda l: l["leg_bearing"])


def fetch_corner(corner, key):
    folder = IMAGERY / corner["id"]
    folder.mkdir(parents=True, exist_ok=True)
    meta_path = folder / "meta.json"
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {"corner": corner}

    sat = folder / "satellite.png"
    if not sat.exists():
        save_image(STATIC_URL, {"center": f"{corner['lat']},{corner['lon']}", "zoom": SAT_ZOOM,
                                "size": SAT_SIZE, "scale": SAT_SCALE, "maptype": "satellite"}, key, sat)
    meta["satellite"] = {"file": sat.name, "zoom": SAT_ZOOM}

    if "views" not in meta:
        centre = sv_metadata(corner["lat"], corner["lon"], key, radius=30)
        meta["centre_pano"] = centre and {"pano_id": centre["pano_id"], "date": centre.get("date")}
        legs = find_legs(corner, key)
        if len(legs) >= 2:
            meta["view_method"] = "legs"
            meta["views"] = legs
        elif centre:
            meta["view_method"] = "centre_fixed_headings"
            meta["views"] = [{"pano_id": centre["pano_id"], "date": centre.get("date"),
                              "heading": h} for h in (0, 90, 180, 270)]
        else:
            meta["view_method"] = "none"
            meta["views"] = []
        for n, v in enumerate(meta["views"], 1):
            v["file"] = f"sv_{n}.jpg"

    for v in meta["views"]:
        path = folder / v["file"]
        if not path.exists():
            save_image(SV_URL, {"pano": v["pano_id"], "heading": v["heading"], "fov": SV_FOV,
                                "pitch": SV_PITCH, "size": SV_SIZE}, key, path)

    meta["fetched_at"] = meta.get("fetched_at") or datetime.now(timezone.utc).isoformat(timespec="seconds")
    meta_path.write_text(json.dumps(meta, indent=2))
    return meta


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--dry-run", action="store_true", help="pick corners and stop; no API calls")
    ap.add_argument("--only", help="fetch one corner by id")
    args = ap.parse_args()

    corners = pick_corners()
    with open(CORNERS, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(corners[0]))
        w.writeheader()
        w.writerows(corners)
    print(f"{len(corners)} hand-check corners -> {CORNERS.relative_to(ROOT)}")
    for c in corners:
        print(f"  {c['role']:10s} {c['crashes_2022_on']:4d}  {c['name']}")
    if args.dry_run:
        return

    key = api_key()
    for c in corners:
        if args.only and c["id"] != args.only:
            continue
        meta = fetch_corner(c, key)
        dates = sorted({v.get("date") for v in meta["views"] if v.get("date")})
        print(f"{c['id']}: {meta['view_method']}, {len(meta['views'])} Street View images, "
              f"captured {', '.join(dates) or 'n/a'}")


if __name__ == "__main__":
    main()
