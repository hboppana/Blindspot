"""Contributing factors per intersection, and citywide evidence (workstream 3).

A. Per intersection. Each FDOT crash at the intersection (2015-2018, linked
   to dataGNV by report number) gets one type, first match wins:
     pedestrian, bicycle, left_turn (vehicle 1 turning left), rear_end,
     angle, sideswipe, right_turn (vehicle 1 turning right), other.
   Factors are ranked by share. Per the plan: a "main" factor at 50%+,
   "leading" at 40-50%, "mixed" below 40%. Each share is also compared with
   similar corners (same major road class and signal status), so "34% left
   turns" comes with "vs 18% at similar corners". Confidence is low with
   fewer than MIN_FDOT FDOT crashes or where the pattern check found the
   intersection changed since 2015-2018.

B. Citywide. Negative binomial count models, one per crash type, across
   intersections with Gemini labels: crashes of that type ~ road features
   (left-turn lane, median, crosswalk, signal) + controls (major and minor
   road class, number of legs). A sensitivity fit adds log daily traffic on
   the corners FDOT counts. Vehicle crash types use FDOT 2015-2018;
   pedestrian and bicycle crashes use dataGNV 2022 on, which matches the
   2025-26 imagery the features come from.

   These are associations across intersections, not causal effects: busier
   and more complex corners get more of everything, and the controls only
   partly account for that. Wording follows the plan: "corners with X have
   N times the Y crashes of similar corners without it."

Output: data/derived/causes.json
Usage:  python scripts/causes.py
"""

import json
import re
import warnings
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.api as sm
import statsmodels.formula.api as smf

from build_hotspots import (SNAP_M, _display, _slug, intersections_within, load_intersection_crashes,
                            merge_pairs, snap_leftovers)
from fdot import link_to_gnv, load_fdot, snap_fdot

ROOT = Path(__file__).resolve().parent.parent
DERIVED = ROOT / "data" / "derived"
OUT = DERIVED / "causes.json"

MIN_FDOT = 20
MIN_EXCESS = 3  # crashes above what similar corners would have
MAIN, LEADING = 0.50, 0.40
TYPES = ["pedestrian", "bicycle", "left_turn", "rear_end", "angle", "sideswipe", "right_turn", "other"]
LABELS = {"pedestrian": "pedestrian crashes", "bicycle": "bicycle crashes", "left_turn": "left-turn crashes",
          "rear_end": "rear-end crashes", "angle": "angle (side-impact) crashes",
          "sideswipe": "sideswipes", "right_turn": "right-turn crashes", "other": "other crashes"}


def crash_type(r):
    if r.pedestrian or r.harmful_event == "PEDESTRIAN":
        return "pedestrian"
    if r.bicyclist or r.harmful_event == "PEDALCYCLE":
        return "bicycle"
    if r.vehicle_movement == "TURNING LEFT":
        return "left_turn"
    if r.collision_type == "FRONT TO REAR":
        return "rear_end"
    if r.collision_type == "ANGLE":
        return "angle"
    if isinstance(r.collision_type, str) and r.collision_type.startswith("SIDESWIPE"):
        return "sideswipe"
    if r.vehicle_movement == "TURNING RIGHT":
        return "right_turn"
    return "other"


def load():
    d = load_intersection_crashes()
    inters = snap_leftovers(d, merge_pairs(d))
    f = snap_fdot(load_fdot(), inters, intersections_within, SNAP_M)
    f = link_to_gnv(f, d)
    f = f[f.intersection_id.notna() & f.CALENDAR_YEAR.between(2015, 2018)].copy()
    f["type"] = [crash_type(r) for r in f.itertuples()]
    return d[d.intersection_id.notna()], f


def binom_sf(k, n, p):
    """P(X >= k) for X ~ Binomial(n, p)."""
    from scipy.stats import binom
    return float(binom.sf(k - 1, n, p))


def street_volumes(d, f):
    """Daily traffic on each of an intersection's two streets, from FDOT's road
    inventory on its crashes. FDOT names one road several ways (SR 24, SW ARCHER
    RD), so each linked FDOT crash takes its street from dataGNV instead, matched
    (allowing typos) to one of the intersection's two named streets.
    Returns {intersection_id: (major, minor)} where both streets are counted."""
    from difflib import SequenceMatcher
    from streets import street_base
    g = d.dropna(subset=["dhsmv_number"]).drop_duplicates("dhsmv_number")
    street_of = dict(zip(g.dhsmv_number.astype("int64").astype(str), g.street_norm))
    ff = f[f.linked & f.AVERAGE_DAILY_TRAFFIC.notna()]
    by = {}
    for iid, dh, aadt in zip(ff.intersection_id, ff.dhsmv_number, ff.AVERAGE_DAILY_TRAFFIC):
        st = street_of.get(dh)
        if not isinstance(st, str):
            continue
        a, b = [street_base(x) for x in iid.split(" & ")]
        sb = street_base(st)
        score = [SequenceMatcher(None, sb, x).ratio() for x in (a, b)]
        if max(score) >= 0.85:
            by.setdefault(iid, {}).setdefault((a, b)[score.index(max(score))], []).append(aadt)
    out = {}
    for iid, streets in by.items():
        if len(streets) == 2:
            v = sorted((float(np.median(x)) for x in streets.values()), reverse=True)
            out[iid] = (v[0], v[1])
    return out


def crash_rates(d, feats, vols):
    """Crashes per million entering vehicles (2022 on), where FDOT counts traffic on
    both streets, compared with the median of corners with the same signal status."""
    hot = {h["id"]: h for h in json.loads((DERIVED / "hotspots.json").read_text())["hotspots"]}
    last = pd.to_datetime(d.crash_date.max())
    years = (last - pd.Timestamp("2022-01-01")).days / 365.25
    rows = {}
    for iid in feats.index:
        h = hot.get(_slug(iid))
        if h is None or iid not in vols:
            continue
        entering = sum(vols[iid])  # two-way daily traffic on both streets ~ vehicles entering per day
        rows[iid] = {"per_million_entering": h["crashes"]["crashes"] / years * 1e6 / (entering * 365),
                     "entering_per_day": entering, "signal": feats.traffic_signal.get(iid)}
    df = pd.DataFrame(rows).T
    df = df[df.signal.isin(["yes", "no"])]  # signal status unknown: no fair comparison group
    if df.empty:
        return {}
    df["per_million_entering"] = df.per_million_entering.astype(float)
    med = df.groupby("signal").per_million_entering.median()
    return {iid: {"per_million_entering": round(r.per_million_entering, 2),
                  "similar_corners_median": round(float(med[r.signal]), 2),
                  "vs_similar": round(r.per_million_entering / float(med[r.signal]), 2),
                  "entering_per_day": int(r.entering_per_day),
                  "compared_with": int((df.signal == r.signal).sum())}
            for iid, r in df.iterrows()}


def per_intersection(d, f, feats, pattern, vols):
    feats = feats.set_index("intersection_id")
    counts = f.groupby(["intersection_id", "type"]).size().unstack(fill_value=0).reindex(columns=TYPES, fill_value=0)

    # Peer baselines: pooled type shares by (major road class, signal).
    key = lambda iid: (feats.major_road_class.get(iid), feats.traffic_signal.get(iid))
    peer_counts = {}
    for iid, row in counts.iterrows():
        peer_counts.setdefault(key(iid), []).append(row)
    peer_share = {k: (pd.concat(v, axis=1).sum(axis=1) / pd.concat(v, axis=1).values.sum()) for k, v in peer_counts.items()}
    citywide = counts.sum() / counts.values.sum()

    recent = d[d.year >= 2022].groupby("intersection_id")
    rates = crash_rates(d, feats, vols)
    out = {}
    for iid, row in counts.iterrows():
        n = int(row.sum())
        shares = (row / n).sort_values(ascending=False)
        base = peer_share.get(key(iid), citywide)
        factors = [{"type": t, "label": LABELS[t], "crashes": int(row[t]), "share": round(float(s), 3),
                    "similar_corners_share": round(float(base[t]), 3),
                    "vs_similar": round(float(s / base[t]), 2) if base[t] > 0 else None}
                   for t, s in shares.items() if row[t] > 0]
        top = factors[0]
        verdict = "main" if top["share"] >= MAIN else ("leading" if top["share"] >= LEADING else "mixed")
        # Distinctive: types that happen here clearly more than at similar corners.
        distinctive = []
        for fa in factors:
            expected = n * base[fa["type"]]
            fa["excess_crashes"] = round(float(fa["crashes"] - expected), 1)
            p_more = binom_sf(fa["crashes"], n, base[fa["type"]])
            if fa["crashes"] - expected >= MIN_EXCESS and fa["vs_similar"] and fa["vs_similar"] >= 1.25 and p_more < 0.05:
                distinctive.append({"type": fa["type"], "label": fa["label"], "crashes": fa["crashes"],
                                    "expected_at_similar_corners": round(float(expected), 1),
                                    "vs_similar": fa["vs_similar"], "p": float(f"{p_more:.2g}")})
        distinctive.sort(key=lambda x: -(x["crashes"] - x["expected_at_similar_corners"]))
        pat = pattern.get(iid, "too few crashes")
        reasons = []
        if n < MIN_FDOT:
            reasons.append(f"only {n} FDOT crashes (2015-2018)")
        if impossible_pair(iid):
            reasons.append("street names can't both be right (two parallel numbered streets)")
        if pat.startswith("changed"):
            reasons.append(f"crash pattern {pat} since 2015-2018")
        g = recent.get_group(iid) if iid in recent.groups else None
        out[_slug(iid)] = {
            "name": _display(iid),
            "fdot_crashes_2015_2018": n,
            "verdict": verdict,
            "main_factor": top["type"] if verdict != "mixed" else None,
            "distinctive_factors": distinctive,
            "factors": factors,
            "crash_rate": rates.get(iid),
            "recent": None if g is None else {
                "crashes": int(len(g)),
                "pedestrian_or_bike_share": round(float(((g.involves_pedestrian == 1) | (g.involves_bicycle == 1)).mean()), 3),
            },
            "dark_share": round(float(f[f.intersection_id == iid].lighting.fillna("").str.startswith("DARK").mean()), 3),
            "pattern_check": pat,
            "name_check": "impossible street pair - crash reports misnamed a street" if impossible_pair(iid) else "ok",
            "confidence": "low" if reasons else "ok",
            "confidence_reasons": reasons,
        }
    return out


def model_table(d, f, feats):
    m = feats[feats.has_gemini & feats.major_road_class.notna()].copy()
    for col in ("left_turn_lane", "median", "crosswalk"):
        m[col] = (m[col] == "yes").astype(int)
    m["signal"] = (m.traffic_signal == "yes").astype(int)
    m["major"] = m.major_road_class.clip(upper=5).astype(int).astype(str)  # 5 = local streets
    m["minor"] = m.minor_road_class.fillna(6).clip(upper=5).astype(int).astype(str)
    m["four_legs"] = (m.legs_seen >= 4).astype(int)
    m["log_traffic"] = np.log(m.daily_traffic_max)

    fdot_counts = f.groupby(["intersection_id", "type"]).size().unstack(fill_value=0)
    for t in TYPES:
        m[t] = m.intersection_id.map(fdot_counts[t] if t in fdot_counts else {}).fillna(0).astype(int)
    rec = d[d.year >= 2022]
    m["ped_recent"] = m.intersection_id.map(rec[rec.involves_pedestrian == 1].groupby("intersection_id").size()).fillna(0).astype(int)
    m["bike_recent"] = m.intersection_id.map(rec[rec.involves_bicycle == 1].groupby("intersection_id").size()).fillna(0).astype(int)
    return m


MODELS = {
    "left_turn": ("left_turn", ["left_turn_lane", "median", "signal"]),
    "rear_end": ("rear_end", ["left_turn_lane", "median", "signal"]),
    "angle": ("angle", ["left_turn_lane", "median", "signal"]),
    "pedestrian": ("ped_recent", ["crosswalk", "median", "signal"]),
    "bicycle": ("bike_recent", ["crosswalk", "median", "signal"]),
}
CONTROLS = "C(major) + C(minor) + four_legs"


def fit(m, outcome, features, extra=""):
    formula = f"{outcome} ~ {' + '.join(features)} + {CONTROLS}{extra}"
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        res = smf.negativebinomial(formula, data=m).fit(disp=0, maxiter=200)
    effects = {}
    for feat in features:
        coef, (lo, hi), p = res.params[feat], res.conf_int().loc[feat], res.pvalues[feat]
        effects[feat] = {"rate_ratio": round(float(np.exp(coef)), 2),
                         "ci95": [round(float(np.exp(lo)), 2), round(float(np.exp(hi)), 2)],
                         "p": float(f"{p:.2g}")}
    return {"formula": formula, "n": int(res.nobs), "effects": effects}


def screening(d, feats, vols):
    """Network screening as in the Highway Safety Manual: a safety performance
    function (negative binomial) predicts crashes for a corner like this one;
    empirical Bayes blends that prediction with the corner's own count; the
    excess (EB-expected minus predicted) ranks where crashes are above what
    the corner's traffic and layout would explain.

    Two SPFs: 'traffic' (log daily traffic on the major and minor street,
    signal, legs) for corners where FDOT counts both streets, and
    'road_class' (major/minor road class instead of traffic) for the rest.
    """
    hot = {h["id"]: h for h in json.loads((DERIVED / "hotspots.json").read_text())["hotspots"]}
    last = pd.to_datetime(d.crash_date.max())
    years = (last - pd.Timestamp("2022-01-01")).days / 365.25

    s = feats[feats.osm_matched & feats.major_road_class.notna()
              & ~feats.intersection_id.map(impossible_pair)].copy()
    s["obs"] = s.crashes_window.astype(int)
    s["signal"] = (s.traffic_signal == "yes").astype(int)
    s["four_legs"] = (s.legs_seen.fillna(3) >= 4).astype(int)
    s["major"] = s.major_road_class.clip(upper=5).astype(int).astype(str)
    s["minor"] = s.minor_road_class.fillna(6).clip(upper=5).astype(int).astype(str)
    v = s.intersection_id.map(vols)
    s["log_major"] = v.map(lambda x: np.log(x[0]) if isinstance(x, tuple) else np.nan)
    s["log_minor"] = v.map(lambda x: np.log(x[1]) if isinstance(x, tuple) else np.nan)

    out, spfs = {}, {}
    for name, rows, formula in [
            ("traffic", s[s.log_major.notna()], "obs ~ log_major + log_minor + signal + four_legs"),
            ("road_class", s[s.log_major.isna()], "obs ~ C(major) + C(minor) + signal + four_legs")]:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            res = smf.negativebinomial(formula, data=rows).fit(disp=0, maxiter=500, method="bfgs")
        if not np.isfinite(res.params).all():
            raise RuntimeError(f"SPF '{name}' did not converge")
        alpha = float(res.params["alpha"])
        mu = res.predict(rows)
        w = 1 / (1 + alpha * mu)
        eb = w * mu + (1 - w) * rows.obs
        spfs[name] = {"formula": formula, "n": int(res.nobs), "overdispersion": round(alpha, 3),
                      "coefficients": {k: round(float(v), 3) for k, v in res.params.items()}}
        for iid, o, p_, e in zip(rows.intersection_id, rows.obs, mu, eb):
            out[_slug(iid)] = {"spf": name, "observed": int(o), "predicted": round(float(p_), 1),
                               "eb_expected": round(float(e), 1),
                               "excess_per_year": round(float((e - p_) / years), 2)}
    ranked = sorted(out, key=lambda k: -out[k]["excess_per_year"])
    for rank, k in enumerate(ranked, 1):
        out[k]["rank"] = rank
    return out, spfs, years


NUMBERED = re.compile(r"^(N|S|E|W|NW|NE|SW|SE)?\s*\d+(ST|ND|RD|TH)\s+(ST|AVE)$")


def impossible_pair(iid):
    """Gainesville's numbered streets run north-south and numbered avenues east-west,
    so two numbered STs (or two AVEs) can't cross: the crash reports misnamed one
    (usually NW 13th Ave written as 13th St)."""
    kinds = [NUMBERED.match(x.strip()) for x in iid.split(" & ")]
    return all(kinds) and kinds[0].group(3) == kinds[1].group(3)


COMPASS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"]


def imagery_evidence(cid, distinctive, feat):
    """What the verified imagery features show at this corner, per distinctive factor.
    Facts about the corner, not claims that they caused the crashes."""
    folder = ROOT / "data" / "imagery" / cid
    lab = folder / "gemini_gemini-3.7-flash_v1.json"
    if not lab.exists():
        return []
    legs = json.loads(lab.read_text())["answers"]["legs"]
    views = json.loads((folder / "meta.json").read_text())["views"]
    name = lambda v: COMPASS[round(v.get("leg_bearing", v.get("heading", 0)) / 45) % 8]
    def legs_where(feature, value):
        return [(name(v), v["file"]) for leg, v in zip(legs, views) if leg[feature] == value]

    signal = feat.get("traffic_signal")
    sig_txt = {"yes": "The intersection is signalized.", "no": "The intersection is not signalized."}.get(signal, "")
    speed = feat.get("speed_limit")
    lanes = feat.get("fdot_lanes_max")
    road_txt = " ".join(t for t in [f"Speed limit {speed:.0f} mph." if pd.notna(speed) else "",
                                    f"Up to {lanes:.0f} lanes (FDOT)." if pd.notna(lanes) else ""] if t)
    n = len(legs)
    out = []
    for fa in distinctive:
        facts, images = [], ["satellite.png"]
        if fa["type"] == "left_turn":
            missing = legs_where("left_turn_lane", "no")
            facts.append(f"A dedicated left-turn lane is visible on {n - len(missing)} of {n} legs"
                         + (f"; none on the {', '.join(m for m, _ in missing)} leg{'s' if len(missing) > 1 else ''}." if missing else "."))
            facts.append(sig_txt)
            facts.append("Whether left turns get a protected arrow can't be read reliably from the imagery.")
            images += [f for _, f in missing]
        elif fa["type"] in ("pedestrian", "bicycle"):
            no_xwalk = legs_where("marked_crosswalk", "no")
            no_median = legs_where("median", "no")
            conf = feat.get("crosswalk_confidence")
            facts.append(f"Marked crosswalks are visible on {n - len(no_xwalk)} of {n} legs"
                         + (f" (none on the {', '.join(m for m, _ in no_xwalk)})" if no_xwalk else "")
                         + (" - low confidence at this corner." if conf == "low" else "."))
            facts.append(f"{n - len(no_median)} of {n} legs have a raised median (a refuge for crossing).")
            facts.append(sig_txt)
            if fa["type"] == "bicycle":
                facts.append("Bike lanes can't be read reliably from the imagery.")
            images += [f for _, f in no_xwalk]
        elif fa["type"] == "angle":
            facts += [sig_txt, f"{len(legs_where('median', 'yes'))} of {n} legs have a raised median."]
        elif fa["type"] in ("rear_end", "sideswipe", "right_turn"):
            facts += [sig_txt, road_txt]
        out.append({"type": fa["type"], "imagery_shows": [t for t in facts if t], "images": images})
    return out


def main():
    d, f = load()
    feats = pd.read_csv(DERIVED / "road_features.csv")
    pattern = dict(pd.read_csv(DERIVED / "pattern_check.csv")[["intersection_id", "verdict"]].values)

    vols = street_volumes(d, f)
    inter = per_intersection(d, f, feats, pattern, vols)
    screen, spfs, years = screening(d, feats, vols)
    by_slug = {r["id"]: r for r in feats.to_dict("records")}
    for cid, v in inter.items():
        v["screening"] = screen.get(cid)
        v["evidence"] = imagery_evidence(cid, v["distinctive_factors"], by_slug.get(cid, {}))
    m = model_table(d, f, feats)
    models = {}
    for name, (outcome, features) in MODELS.items():
        models[name] = {"all": fit(m, outcome, features),
                        "with_traffic": fit(m[m.log_traffic.notna()], outcome, features, " + log_traffic")}

    OUT.write_text(json.dumps({
        "generated": str(date.today()),
        "definitions": {
            "factors": "FDOT crashes 2015-2018 at the intersection (linked to dataGNV by report number), one type each",
            "verdict": f"main if the top type is >= {MAIN:.0%} of crashes, leading if >= {LEADING:.0%}, else mixed",
            "vs_similar": "share here / share at intersections with the same major road class and signal status",
            "models": "negative binomial across labeled intersections; rate_ratio = crashes of that type at corners "
                      "with the feature vs similar corners without it (controls: road classes, legs; "
                      "with_traffic adds log daily traffic where FDOT counts it). Associations, not causal effects.",
        },
        "models": models,
        "screening_spfs": spfs,
        "screening": screen,
        "intersections": inter,
    }, indent=1))

    print(f"screening: {len(screen)} intersections, crashes {years:.1f} years from 2022; "
          + ", ".join(f"SPF '{k}' on {v['n']} corners" for k, v in spfs.items()))
    print("  top 10 by excess crashes a year (observed / predicted for a corner like it):")
    for cid in sorted(screen, key=lambda k: screen[k]["rank"])[:10]:
        r = screen[cid]
        print(f"   {r['rank']:3d}. +{r['excess_per_year']:5.1f}/yr  {r['observed']:4d} vs {r['predicted']:6.1f} predicted  "
              f"({r['spf']})  {_display(cid.replace('-', ' ').upper()) if cid not in inter else inter[cid]['name']}")

    print(f"per-intersection factors: {len(inter)} intersections with FDOT crashes; "
          f"{sum(v['confidence'] == 'ok' for v in inter.values())} at ok confidence")
    verdicts = pd.Series([v["verdict"] for v in inter.values() if v["confidence"] == "ok"]).value_counts()
    print(f"  verdicts (ok confidence): {verdicts.to_dict()}")
    print(f"\ncitywide models (rate ratio [95% CI], p) - n = {models['left_turn']['all']['n']} "
          f"corners, {models['left_turn']['with_traffic']['n']} with traffic counts")
    for name, fits in models.items():
        for feat in fits["all"]["effects"]:
            a, t = fits["all"]["effects"][feat], fits["with_traffic"]["effects"][feat]
            print(f"  {name:10s} ~ {feat:15s} {a['rate_ratio']:5.2f} [{a['ci95'][0]:.2f}-{a['ci95'][1]:.2f}] p={a['p']:<8g}"
                  f" | with traffic {t['rate_ratio']:5.2f} [{t['ci95'][0]:.2f}-{t['ci95'][1]:.2f}] p={t['p']:g}")
    top = json.loads((DERIVED / "hotspots.json").read_text())["hotspots"][:10]
    print("\nTop 10 hotspots:")
    for h in top:
        v = inter.get(h["id"])
        if not v:
            print(f"  {h['name']}: no FDOT crashes"); continue
        rate = v["crash_rate"]
        rate_txt = f"rate {rate['per_million_entering']:.2f}/MEV ({rate['vs_similar']:.1f}x similar)" if rate else "rate n/a"
        dist = "; ".join(f"{x['label']} {x['crashes']} vs {x['expected_at_similar_corners']:.0f} expected"
                         for x in v["distinctive_factors"][:2]) or "nothing stands out"
        print(f"  {v['name']}: {rate_txt}; distinctive: {dist}")


if __name__ == "__main__":
    main()
