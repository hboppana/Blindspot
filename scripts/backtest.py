"""Backtest: were today's worst intersections already visible before 2022?

Builds the hotspot ranking from 2015 to UNTIL only (intersections placed and
ranked from those crashes alone, via build_hotspots.py --until), then looks
up each of today's top N in it by location.

What this shows: at this stage the ranking is crash counts, so the result
says hotspots persist. It is not yet a test of the contributing-factor
model (workstream 3), which would need to predict change beyond past counts.

Usage: python scripts/backtest.py                 # rebuild the pre-2022 ranking, then compare
       python scripts/backtest.py --no-rebuild    # compare against the existing file
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

from build_hotspots import M_PER_DEG_LAT, M_PER_DEG_LON

ROOT = Path(__file__).resolve().parent.parent
DERIVED = ROOT / "data" / "derived"
UNTIL = 2021
MATCH_M = 40  # an intersection's placement can shift a little between runs


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--no-rebuild", action="store_true")
    ap.add_argument("--top", type=int, default=20)
    args = ap.parse_args()

    past_path = DERIVED / f"backtest_2015_{UNTIL}.json"
    if not args.no_rebuild:
        subprocess.run([sys.executable, str(ROOT / "scripts" / "build_hotspots.py"),
                        "--since", "2015", "--until", str(UNTIL), "--out", str(past_path)],
                       check=True, stdout=subprocess.DEVNULL)

    now = json.loads((DERIVED / "hotspots.json").read_text())["hotspots"]
    past = json.loads(past_path.read_text())["hotspots"]
    plat = np.array([h["lat"] for h in past])
    plon = np.array([h["lon"] for h in past])

    print(f"Today's top {args.top} (crashes 2022 on) vs the ranking built from 2015-{UNTIL} only\n")
    print(f"{'now':>4s} {'crashes':>7s} {'pre-2022 rank':>13s}  intersection")
    ranks = []
    for h in now[:args.top]:
        d = np.hypot((plon - h["lon"]) * M_PER_DEG_LON, (plat - h["lat"]) * M_PER_DEG_LAT)
        i = int(d.argmin())
        rank = past[i]["rank"] if d[i] <= MATCH_M else None
        ranks.append(rank)
        print(f"{h['rank']:4d} {h['crashes']['crashes']:7d} {str(rank or '-'):>13s}  {h['name']}")

    print()
    for k in (10, args.top, 50):
        print(f"today's top {args.top} in the pre-2022 top {k}: {sum(1 for r in ranks if r and r <= k)}")


if __name__ == "__main__":
    main()
