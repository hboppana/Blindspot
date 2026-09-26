"""Fetch satellite and Street View imagery for the 20 hand-check corners.

Workstream 2 labels road design with Gemini. Before labeling everything we
hand-check 20 corners: the top HOTSPOTS hotspots (the demo depends on them)
plus COMPARISON quieter corners near campus, spread across crash counts.

Per corner, into data/imagery/<corner id>/:
  satellite.png   Static Maps, zoom 20, centred on the intersection
  sv_<n>.jpg      one Street View image per road leg, taken ~TARGET_M up the
                  leg and pointed back at the intersection, tilted down so
                  lane arrows and crosswalks are in frame
  meta.json       corner, capture dates, pano ids, headings

Finding the legs: Street View metadata requests are free and use no quota,
so we probe PROBE_BEARINGS directions at PROBE_DISTANCES around the corner.
A pano only counts if it sits on one of the corner's own streets (within
ON_ROAD_M of its OSM centreline), which rules out parking lots and side
streets. Bearings closer than LEG_GAP_DEG are the same leg; each leg takes
the pano nearest TARGET_M out, far enough to be behind the stop line of a
big intersection (Archer & 34th is ~70 m across). If fewer than 2 legs turn
up, we fall back to the centre pano with four fixed headings.

Corners whose views came from an older LEG_METHOD get their views redone.

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

import numpy as np

from build_hotspots import CAMPUS_KM, _display, _slug
from osm_features import fetch as fetch_osm, way_names
from streets import ROUTE_NAME, street_base

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

LEG_METHOD = 3
PROBE_DISTANCES = (30, 50, 70)
PROBE_RADIUS_M = 15
PROBE_BEARINGS = range(0, 360, 30)
LEG_DIST_M = (20, 85)  # a pano this far from the centre can show a leg
TARGET_M = 50
ON_ROAD_M = 10
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


_OSM = None


def corner_roads(corner):
    """Segments (x1, y1, x2, y2 in metres from the corner) of the corner's own
    streets in OSM, within 150 m. None if OSM has none of them."""
    global _OSM
    if _OSM is None:
        osm = fetch_osm()
        nodes = {e["id"]: (e["lat"], e["lon"]) for e in osm["elements"] if e["type"] == "node"}
        _OSM = [(way_names(w.get("tags", {})), [nodes[n] for n in w["nodes"] if n in nodes])
                for w in osm["elements"]
                if w["type"] == "way" and "highway" in w.get("tags", {})
                and w["tags"].get("footway") != "crossing"]
        _OSM = [(names, {street_base(n) for n in names}, pts) for names, pts in _OSM if names]

    pairs = {r["intersection_id"]: r["pairs"]
             for r in csv.DictReader(open(DERIVED / "intersections.csv", encoding="utf-8"))
             if _slug(r["intersection_id"]) == corner["id"]}
    if not pairs:
        return None
    streets = {s for p in next(iter(pairs.values())).split(" | ") for s in p.split(" & ")}
    routes = {s for s in streets if ROUTE_NAME.match(s)}
    bases = {street_base(s) for s in streets - routes}

    segs = []
    for names, way_bases, pts in _OSM:
        if not (way_bases & bases or names & routes):
            continue
        xy = [((lo - corner["lon"]) * M_PER_DEG_LON, (la - corner["lat"]) * M_PER_DEG_LAT) for la, lo in pts]
        if min(math.hypot(x, y) for x, y in xy) > 150:
            continue
        segs += [(*a, *b) for a, b in zip(xy, xy[1:])]
    return np.array(segs) if segs else None


def dist_to_segments(x, y, segs):
    x1, y1, x2, y2 = segs.T
    dx, dy = x2 - x1, y2 - y1
    t = np.clip(((x - x1) * dx + (y - y1) * dy) / np.maximum(dx * dx + dy * dy, 1e-9), 0, 1)
    return float(np.min(np.hypot(x - (x1 + t * dx), y - (y1 + t * dy))))


def find_legs(corner, key):
    """Panos out along each road leg, on the corner's own streets, with the heading back to the centre."""
    lat, lon = corner["lat"], corner["lon"]
    roads = corner_roads(corner)
    found = {}
    for b in PROBE_BEARINGS:
        for d in PROBE_DISTANCES:
            meta = sv_metadata(*offset(lat, lon, b, d), key)
            if not meta or meta["pano_id"] in found:
                continue
            p = meta["location"]
            leg_bearing, dist = bearing_and_dist(lat, lon, p["lat"], p["lng"])
            if not LEG_DIST_M[0] <= dist <= LEG_DIST_M[1]:
                continue
            off_road = None
            if roads is not None:
                off_road = dist_to_segments((p["lng"] - lon) * M_PER_DEG_LON,
                                            (p["lat"] - lat) * M_PER_DEG_LAT, roads)
                if off_road > ON_ROAD_M:
                    continue
            found[meta["pano_id"]] = {"pano_id": meta["pano_id"], "pano_lat": p["lat"],
                                      "pano_lon": p["lng"], "date": meta.get("date"),
                                      "leg_bearing": round(leg_bearing), "distance_m": round(dist),
                                      "road_offset_m": None if off_road is None else round(off_road, 1),
                                      "copyright": meta.get("copyright", ""),
                                      "heading": round((leg_bearing + 180) % 360)}

    # One pano per leg: Google's own imagery first (third-party 360 photos are
    # older and often show the photographer's car), then the one nearest TARGET_M out.
    legs = []
    for pano in sorted(found.values(), key=lambda p: ("Google" not in p["copyright"],
                                                       abs(p["distance_m"] - TARGET_M))):
        if all(angle_gap(pano["leg_bearing"], l["leg_bearing"]) >= LEG_GAP_DEG for l in legs):
            legs.append(pano)
    return sorted(legs[:MAX_LEGS], key=lambda l: l["leg_bearing"]), roads is not None


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

    if meta.get("leg_method") != LEG_METHOD:
        # Views from an older method (or none yet): drop them and find the legs again.
        for v in meta.get("views", []):
            (folder / v["file"]).unlink(missing_ok=True)
        for old in folder.glob("gemini_*.json"):  # labels were made from the old views
            old.unlink()
        centre = sv_metadata(corner["lat"], corner["lon"], key, radius=30)
        meta["centre_pano"] = centre and {"pano_id": centre["pano_id"], "date": centre.get("date")}
        legs, meta["road_check"] = find_legs(corner, key)
        meta["leg_method"] = LEG_METHOD
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
