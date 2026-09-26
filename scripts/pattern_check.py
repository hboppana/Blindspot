"""Pattern check: do an intersection's 2015-2018 crashes look like today's?

FDOT's cause fields (driver actions, collision types) only cover 2015-2018.
We use them for an intersection only where its crash pattern held into the
current window (2022 onward). Per intersection, from dataGNV:

  still a hotspot   recent crashes per year vs 2015-2018, divided by the same
                    ratio citywide (crashes fell ~30% everywhere in 2020).
                    Holds if at least MIN_RELATIVE_RATE.
  same people       share of crashes involving a pedestrian or cyclist.
                    Holds if the change is under MAX_SHARE_CHANGE, or not
                    statistically clear (two-proportion z-test, p >= 0.05).
  same times        crashes by time of day (5 bands). Holds if the total
                    variation distance is under MAX_TIME_SHIFT, or the shift
                    is not statistically clear (chi-square, 4 df, p >= 0.05).
                    With 20-40 crashes a period the mix moves a lot by chance.

An intersection needs MIN_CRASHES in each period to be checked. The
thresholds are judgment calls, set so ordinary year-to-year noise passes.

Output: data/derived/pattern_check.csv
Usage:  python scripts/pattern_check.py
"""

import math
from pathlib import Path

import pandas as pd

from build_hotspots import load_intersection_crashes, merge_pairs, snap_leftovers, _display

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "derived" / "pattern_check.csv"

EARLY = (2015, 2018)
RECENT_FROM = 2022
MIN_CRASHES = 20
MIN_RELATIVE_RATE = 0.6
MAX_SHARE_CHANGE = 0.10
MAX_TIME_SHIFT = 0.20
TIME_BANDS = [(0, 6, "night"), (6, 10, "morning"), (10, 15, "midday"), (15, 19, "evening"), (19, 24, "late")]


def band(hour):
    return next(name for lo, hi, name in TIME_BANDS if lo <= hour < hi)


def two_prop_p(k1, n1, k2, n2):
    p = (k1 + k2) / (n1 + n2)
    se = math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2)) if 0 < p < 1 else 0
    if se == 0:
        return 1.0
    z = abs(k1 / n1 - k2 / n2) / se
    return math.erfc(z / math.sqrt(2))


CHI2_4DF_05 = 9.488  # chi-square critical value, 4 degrees of freedom, p = 0.05


def time_shift_clear(early_bands, recent_bands):
    """Chi-square test of independence on a 2 x 5 table (period x time band)."""
    table = [[(early_bands == b).sum() for _, _, b in TIME_BANDS],
             [(recent_bands == b).sum() for _, _, b in TIME_BANDS]]
    total = sum(map(sum, table))
    chi2 = 0.0
    for j in range(len(TIME_BANDS)):
        col = table[0][j] + table[1][j]
        for i in range(2):
            expected = sum(table[i]) * col / total
            if expected:
                chi2 += (table[i][j] - expected) ** 2 / expected
    return chi2 >= CHI2_4DF_05


def main():
    d = load_intersection_crashes()
    inters = snap_leftovers(d, merge_pairs(d))
    d = d[d.intersection_id.notna()].copy()
    d["band"] = d.hour.map(band)
    d["vulnerable"] = (d.involves_pedestrian == 1) | (d.involves_bicycle == 1)

    last = pd.to_datetime(d.crash_date.max())
    recent_years = (last - pd.Timestamp(f"{RECENT_FROM}-01-01")).days / 365.25
    early_years = EARLY[1] - EARLY[0] + 1
    early = d[d.year.between(*EARLY)]
    recent = d[d.year >= RECENT_FROM]

    all_crashes = pd.read_csv(ROOT / "data" / "processed" / "gnv_crashes_clean.csv", usecols=["year"])
    city_ratio = ((all_crashes.year >= RECENT_FROM).sum() / recent_years) / (
        all_crashes.year.between(*EARLY).sum() / early_years)

    e, r = dict(tuple(early.groupby("intersection_id"))), dict(tuple(recent.groupby("intersection_id")))
    rows = []
    for iid in inters.intersection_id:
        ge, gr = e.get(iid), r.get(iid)
        ne, nr = (0 if ge is None else len(ge)), (0 if gr is None else len(gr))
        row = {"intersection_id": iid, "name": _display(iid), "crashes_early": ne, "crashes_recent": nr}
        if ne < MIN_CRASHES or nr < MIN_CRASHES:
            row["verdict"] = "too few crashes"
            rows.append(row)
            continue
        rel = (nr / recent_years) / (ne / early_years) / city_ratio
        ve, vr = ge.vulnerable.mean(), gr.vulnerable.mean()
        p = two_prop_p(ge.vulnerable.sum(), ne, gr.vulnerable.sum(), nr)
        te = ge.band.value_counts(normalize=True)
        tr = gr.band.value_counts(normalize=True)
        tvd = 0.5 * sum(abs(te.get(b, 0) - tr.get(b, 0)) for _, _, b in TIME_BANDS)
        checks = {
            "still_hotspot": rel >= MIN_RELATIVE_RATE,
            "same_people": abs(vr - ve) < MAX_SHARE_CHANGE or p >= 0.05,
            "same_times": tvd < MAX_TIME_SHIFT or not time_shift_clear(ge.band, gr.band),
        }
        row.update({
            "relative_rate": round(rel, 2),
            "vulnerable_share_early": round(ve, 3), "vulnerable_share_recent": round(vr, 3),
            "time_shift": round(tvd, 3),
            **checks,
            "verdict": "held" if all(checks.values()) else
                       "changed: " + ", ".join(k for k, ok in checks.items() if not ok),
        })
        rows.append(row)

    out = pd.DataFrame(rows).sort_values("crashes_recent", ascending=False)
    out.to_csv(OUT, index=False)

    checked = out[out.verdict != "too few crashes"]
    print(f"citywide crashes/year, {RECENT_FROM} on vs {EARLY[0]}-{EARLY[1]}: {city_ratio:.2f}x")
    print(f"checked {len(checked)} intersections (>= {MIN_CRASHES} crashes in both periods); "
          f"{(checked.verdict == 'held').sum()} held")
    for k in ("still_hotspot", "same_people", "same_times"):
        print(f"  failed {k}: {(~checked[k].astype(bool)).sum()}")
    print(f"\nTop 20 by recent crashes:")
    for r_ in out.head(20).itertuples():
        extra = f"rate {r_.relative_rate:.2f}x, vuln {r_.vulnerable_share_early:.0%}->{r_.vulnerable_share_recent:.0%}, " \
                f"time shift {r_.time_shift:.2f}" if r_.verdict != "too few crashes" else ""
        print(f"  {r_.crashes_recent:4d}  {r_.verdict:28s} {extra}  {r_.name}")
    print(f"\nwrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
