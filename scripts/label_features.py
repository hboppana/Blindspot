"""Label road-design features at each corner with Gemini (workstream 2).

Gemini is a sensor here: it reports what is visible in the imagery, leg by
leg, and says "cant_tell" when it can't see it. It does not judge danger.

Input:  data/imagery/<corner id>/  from fetch_imagery.py (satellite.png,
        sv_<n>.jpg, meta.json with each view's leg bearing and capture date)
Output: data/imagery/<corner id>/gemini_<model>_v<PROMPT_VERSION>.json
            the raw response and parsed answers; a corner with this file is
            never sent again. Bump PROMPT_VERSION when the questions change.
        data/derived/road_features_gemini.csv
            one row per corner and leg

Uses the generateContent REST endpoint (standard library only).

Needs GEMINI_API_KEY in the environment or in .env at the repo root.

Usage:
  python scripts/label_features.py --dry-run          # show prompts and token estimate
  python scripts/label_features.py                    # label every fetched corner
  python scripts/label_features.py --only sw-34th-st-sw-archer-rd
  python scripts/label_features.py --model gemini-3.1-pro-preview
"""

import argparse
import base64
import csv
import json
import math
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMAGERY = ROOT / "data" / "imagery"
OUT_CSV = ROOT / "data" / "derived" / "road_features_gemini.csv"

MODEL = "gemini-3.8-flash"
PROMPT_VERSION = 1
API = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

ANSWER = {"type": "STRING", "enum": ["yes", "no", "cant_tell"]}
LEG_FEATURES = {
    "marked_crosswalk": "A painted crosswalk across this leg at the intersection.",
    "left_turn_lane": "A dedicated left-turn lane on this leg's approach to the intersection.",
    "protected_left_arrow": "A signal head with a green left-turn arrow for traffic on this approach.",
    "bike_lane": "A marked bike lane (painted line or bike symbol, or separated) on this leg.",
    "median": "A raised or planted median dividing this leg's two directions.",
    "pedestrian_signal": "Pedestrian signal heads (walk / don't walk) for crossing this leg.",
}
CORNER_FEATURES = {
    "traffic_signal": "The intersection is controlled by traffic signals.",
    "stop_sign": "Stop signs control at least one approach.",
}

SCHEMA = {
    "type": "OBJECT",
    "properties": {
        **{k: ANSWER for k in CORNER_FEATURES},
        "legs": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "leg": {"type": "INTEGER"},
                    **{k: ANSWER for k in LEG_FEATURES},
                    "travel_lanes": {"type": "INTEGER", "nullable": True,
                                     "description": "Travel lanes on this leg, both directions, "
                                                    "not counting turn lanes; null if you can't tell."},
                    "evidence": {"type": "STRING",
                                 "description": "At most 25 words: which image shows what."},
                },
                "required": ["leg", *LEG_FEATURES, "travel_lanes", "evidence"],
            },
        },
    },
    "required": [*CORNER_FEATURES, "legs"],
}

COMPASS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"]


def compass(bearing):
    return COMPASS[round(bearing / 45) % 8]


def api_key():
    key = os.environ.get("GEMINI_API_KEY")
    env = ROOT / ".env"
    if not key and env.exists():
        for line in env.read_text().splitlines():
            name, _, value = line.partition("=")
            if name.strip() == "GEMINI_API_KEY":
                key = value.strip().strip("\"'")
    if not key:
        sys.exit("GEMINI_API_KEY is not set (environment or .env)")
    return key


def satellite_width_m(meta):
    """Ground width of the satellite image (Web Mercator)."""
    lat = meta["corner"]["lat"]
    m_per_px = 156543.03392 * math.cos(math.radians(lat)) / 2 ** meta["satellite"]["zoom"]
    return round(640 * m_per_px)  # 640 logical px; scale 2 only adds detail


def build_prompt(meta):
    corner = meta["corner"]
    lines = [
        f"You are recording the road design of one intersection: {corner['name']} in Gainesville, Florida.",
        "Report only what you can see in the images. If something is hidden, blurry, out of frame "
        "or ambiguous, answer cant_tell. Do not guess from what is typical.",
        "",
        f"Image 1 is a satellite view, north up, about {satellite_width_m(meta)} m across, "
        "centred on the intersection.",
    ]
    for n, v in enumerate(meta["views"], 2):
        if meta["view_method"] == "legs":
            lines.append(f"Image {n} is Street View from the {compass(v['leg_bearing'])} leg, about "
                         f"{v['distance_m']} m out, looking {compass(v['heading'])} toward the "
                         f"intersection. This is leg {n - 1}.")
        else:
            lines.append(f"Image {n} is Street View from the middle of the intersection, looking "
                         f"{compass(v['heading'])}. Leg {n - 1} is the leg in that direction.")
    lines += ["", f"Answer for the whole intersection and for each of legs 1 to {len(meta['views'])}:"]
    lines += [f"- {k}: {d}" for k, d in CORNER_FEATURES.items()]
    lines += [f"- per leg, {k}: {d}" for k, d in LEG_FEATURES.items()]
    lines += ["- per leg, travel_lanes: travel lanes on the leg, both directions, not counting "
              "turn lanes; null if you can't tell.",
              "Use the satellite image and the Street View images together; say in evidence which "
              "image showed each answer."]
    return "\n".join(lines)


def build_request(folder, meta):
    parts = [{"text": build_prompt(meta)}]
    images = [(folder / meta["satellite"]["file"], "image/png")]
    images += [(folder / v["file"], "image/jpeg") for v in meta["views"]]
    for path, mime in images:
        parts.append({"inlineData": {"mimeType": mime,
                                     "data": base64.b64encode(path.read_bytes()).decode()}})
    return {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {"responseMimeType": "application/json", "responseSchema": SCHEMA,
                             "temperature": 0},
    }


def call_gemini(body, model, key, retries=4):
    req = urllib.request.Request(API.format(model=model), data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", "x-goog-api-key": key})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 503) and attempt < retries - 1:
                time.sleep(2 ** attempt * 5)
                continue
            sys.exit(f"Gemini HTTP {e.code}: {e.read()[:500]!r}")


def parse(response, n_legs):
    """Parsed answers, or raise ValueError if the response doesn't fit the schema."""
    cand = (response.get("candidates") or [{}])[0]
    if cand.get("finishReason") not in (None, "STOP"):
        raise ValueError(f"finishReason {cand.get('finishReason')}")
    answers = json.loads(cand["content"]["parts"][0]["text"])
    legs = sorted(answers["legs"], key=lambda l: l["leg"])
    if [l["leg"] for l in legs] != list(range(1, n_legs + 1)):
        raise ValueError(f"expected legs 1..{n_legs}, got {[l['leg'] for l in legs]}")
    allowed = set(ANSWER["enum"])
    for key in CORNER_FEATURES:
        if answers[key] not in allowed:
            raise ValueError(f"{key}={answers[key]!r}")
    for leg in legs:
        for key in LEG_FEATURES:
            if leg[key] not in allowed:
                raise ValueError(f"leg {leg['leg']} {key}={leg[key]!r}")
    answers["legs"] = legs
    return answers


def label_corner(folder, model, key):
    meta = json.loads((folder / "meta.json").read_text())
    out = folder / f"gemini_{model}_v{PROMPT_VERSION}.json"
    if out.exists():
        return json.loads(out.read_text())
    if not meta.get("views"):
        return None
    response = call_gemini(build_request(folder, meta), model, key)
    answers = parse(response, len(meta["views"]))  # raises before caching a bad answer
    result = {"model": model, "prompt_version": PROMPT_VERSION, "answers": answers,
              "usage": response.get("usageMetadata"), "response": response}
    out.write_text(json.dumps(result, indent=2))
    return result


def write_csv(folders, model):
    rows = []
    for folder in folders:
        path = folder / f"gemini_{model}_v{PROMPT_VERSION}.json"
        if not path.exists():
            continue
        meta = json.loads((folder / "meta.json").read_text())
        a = json.loads(path.read_text())["answers"]
        for leg, view in zip(a["legs"], meta["views"]):
            rows.append({"corner_id": folder.name, "leg": leg["leg"],
                         "leg_bearing": view.get("leg_bearing", view.get("heading")),
                         "view_method": meta["view_method"], "capture_date": view.get("date"),
                         **{k: a[k] for k in CORNER_FEATURES},
                         **{k: leg[k] for k in LEG_FEATURES},
                         "travel_lanes": leg["travel_lanes"], "evidence": leg["evidence"],
                         "model": model, "prompt_version": PROMPT_VERSION})
    if rows:
        OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
        with open(OUT_CSV, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0]))
            w.writeheader()
            w.writerows(rows)
    return len(rows)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--dry-run", action="store_true", help="print prompts and token estimate; no API calls")
    ap.add_argument("--only", help="label one corner by id")
    ap.add_argument("--model", default=MODEL)
    args = ap.parse_args()

    folders = sorted(p for p in IMAGERY.glob("*") if (p / "meta.json").exists())
    if args.only:
        folders = [p for p in folders if p.name == args.only]
    if not folders:
        sys.exit(f"no fetched corners in {IMAGERY.relative_to(ROOT)}; run fetch_imagery.py first")

    if args.dry_run:
        tokens = 0
        for folder in folders:
            meta = json.loads((folder / "meta.json").read_text())
            prompt = build_prompt(meta)
            # Per Gemini docs: large images are tiled at 258 tokens a tile;
            # a 1280 px satellite and a 640 px Street View image are 4 tiles each.
            tokens += 258 * 4 * (1 + len(meta["views"])) + len(prompt) // 4
        print(build_prompt(json.loads((folders[0] / "meta.json").read_text())))
        print(f"\n{len(folders)} corners, about {tokens:,} input tokens in total")
        return

    key = api_key()
    for folder in folders:
        try:
            result = label_corner(folder, args.model, key)
        except (ValueError, KeyError, json.JSONDecodeError) as e:
            print(f"{folder.name}: unusable answer ({e}); not cached, rerun to retry")
            continue
        if result:
            a = result["answers"]
            print(f"{folder.name}: signal {a['traffic_signal']}, {len(a['legs'])} legs")
        else:
            print(f"{folder.name}: no Street View views, skipped")
    print(f"wrote {write_csv(folders, args.model)} leg rows -> {OUT_CSV.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
