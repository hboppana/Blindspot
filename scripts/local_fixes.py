"""Find intersections whose crashes dropped and stayed down (workstream 4).

For every intersection with at least MIN_CRASHES crashes in 2015-2025 (full
years only), try each change year from 2017 to 2023:

  before / after     crashes per year in 2015..year-1 and year..2025
  comparison group   intersections of similar size (before-period rate within
                     a factor of 2), excluding this one: their after/before
                     ratio over the same years. This takes out the citywide
                     drop in 2020 and any general trend.
  relative change    (this corner's after/before) / (comparison after/before)
  stayed down        every year after is below the before average, scaled by
                     the comparison trend
  significance       conditional binomial test: given the corner's total
                     crashes, are there fewer after the change than the
                     comparison trend predicts? (one-sided p)

The year with the lowest p is kept. A corner is a candidate if the relative
change is at most MAX_RELATIVE, it stayed down, p < MAX_P, and there are at
least MIN_YEARS years on each side.

Caveat: picking corners because they were bad inflates their "improvement"
(regression to the mean). Requiring 3+ years before and a sustained drop
limits this, but a candidate is a lead until we know what changed there.

Also reports whether the crashes' coded intersection type changed (for
example, crashes start being coded ROUNDABOUT), a direct sign of a redesign.

Output: data/derived/local_fix_candidates.csv
Usage:  python scripts/local_fixes.py
"""

import math
from pathlib import Path

import numpy as np
import pandas as pd

from build_hotspots import _display, load_intersection_crashes, merge_pairs, snap_leftovers

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "derived" / "local_fix_candidates.csv"

YEARS = list(range(2015, 2026))
SPLITS = range(2017, 2024)
MIN_YEARS = 2
MIN_CRASHES = 40
MAX_RELATIVE = 0.6
MAX_P = 0.01


def binom_cdf(k, n, p):
    """P(X <= k) for X ~ Binomial(n, p)."""
    return sum(math.comb(n, i) * p ** i * (1 - p) ** (n - i) for i in range(k + 1))


def main():
    d = load_intersection_crashes()
    inters = snap_leftovers(d, merge_pairs(d))
    d = d[d.intersection_id.notna() & d.year.isin(YEARS)]
    counts = d.groupby(["intersection_id", "year"]).size().unstack(fill_value=0).reindex(columns=YEARS, fill_value=0)
    counts = counts[counts.sum(axis=1) >= MIN_CRASHES]

    rows = []
    for iid, series in counts.iterrows():
        best = None
        for split in SPLITS:
            before_y = [y for y in YEARS if y < split]
            after_y = [y for y in YEARS if y >= split]
            if len(before_y) < 3 or len(after_y) < MIN_YEARS:
                continue
            b = series[before_y].sum()
            a = series[after_y].sum()
            if b == 0:
                continue
            rate_b = b / len(before_y)

            # Comparison group: similar-size corners over the same years.
            others = counts.drop(index=iid)
            others_rate_b = others[before_y].sum(axis=1) / len(before_y)
            peers = others[(others_rate_b >= rate_b / 2) & (others_rate_b <= rate_b * 2)]
            if len(peers) < 10:
                continue
            peer_trend = (peers[after_y].sum().sum() / len(after_y)) / (peers[before_y].sum().sum() / len(before_y))

            relative = (a / len(after_y)) / rate_b / peer_trend
            expected_after_share = (peer_trend * len(after_y)) / (peer_trend * len(after_y) + len(before_y))
            p = binom_cdf(int(a), int(a + b), expected_after_share)
            stayed_down = all(series[y] < rate_b * peer_trend for y in after_y)
            cand = {"split": split, "before_per_year": round(rate_b, 1),
                    "after_per_year": round(a / len(after_y), 1), "peer_trend": round(peer_trend, 2),
                    "relative_change": round(relative, 2), "p": p, "stayed_down": stayed_down,
                    "peers": len(peers)}
            if best is None or p < best["p"]:
                best = cand
        if best is None:
            continue

        # Did the coded intersection type change around the split?
        g = d[d.intersection_id == iid]
        coded = lambda s: s[s.intersection_type.notna() & (s.at_intersection == 1)].intersection_type.value_counts(normalize=True)
        tb, ta = coded(g[g.year < best["split"]]), coded(g[g.year >= best["split"]])
        type_before = tb.index[0] if len(tb) else ""
        type_after = ta.index[0] if len(ta) else ""

        rows.append({"intersection_id": iid, "name": _display(iid), **best,
                     "p": float(f"{best['p']:.2g}"),
                     "yearly": " ".join(str(int(series[y])) for y in YEARS),
                     "type_before": type_before, "type_after": type_after,
                     "type_changed": bool(type_before and type_after and type_before != type_after),
                     "candidate": best["relative_change"] <= MAX_RELATIVE and best["stayed_down"] and best["p"] < MAX_P})

    out = pd.DataFrame(rows).sort_values(["candidate", "p"], ascending=[False, True])
    out.to_csv(OUT, index=False)
    cands = out[out.candidate]
    print(f"tested {len(out)} intersections with >= {MIN_CRASHES} crashes in {YEARS[0]}-{YEARS[-1]}; "
          f"{len(cands)} candidates (relative change <= {MAX_RELATIVE}, stayed down, p < {MAX_P})\n")
    print(f"{'split':>5s} {'before/yr':>9s} {'after/yr':>8s} {'vs peers':>8s} {'p':>8s}  yearly {YEARS[0]}-{YEARS[-1]:<14d} type change  intersection")
    for r in cands.itertuples():
        tc = f"{r.type_before[:12]} -> {r.type_after[:12]}" if r.type_changed else ""
        print(f"{r.split:5d} {r.before_per_year:9.1f} {r.after_per_year:8.1f} {r.relative_change:8.2f} {r.p:8.1g}  "
              f"{r.yearly:28s} {tc:28s} {r.name}")
    print(f"\nwrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
