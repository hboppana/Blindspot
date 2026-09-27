// Builds mock API responses from data/derived so the frontend runs without the
// API or its database. Shapes match docs/API.md; the field mapping follows
// scripts/load_db.py (keep the two in sync).
//
//   mock/city/summary.json          GET /city/summary
//   mock/city/trend.json            GET /city/trend
//   mock/fix-list.json              GET /fix-list
//   mock/intersections.json         GET /intersections
//   mock/intersections/{id}.json    GET /intersections/{id}
//   mock/backtest.json              GET /backtest
//   mock/fix-plan/notes.json        GET /fix-plan/notes (Snowflake Cortex text; only if generated)
//   mock/watch-list.json            GET /watch-list
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const derived = join(root, "data", "derived");
const out = join(here, "..", "mock");

// Python's json.dump writes NaN, which isn't valid JSON; read it as null.
const readJson = (path) =>
  JSON.parse(
    readFileSync(path, "utf8").replace(
      /(?<=[:,[]\s*)(?:NaN|-?Infinity)\b/g,
      "null",
    ),
  );

function readCsv(path) {
  const [header, ...lines] = readFileSync(path, "utf8").split(/\r?\n/);
  const cols = header.split(",");
  return lines.filter(Boolean).map((line) => {
    const cells = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') {
          cell += '"';
          i++;
        } else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ",") {
        cells.push(cell);
        cell = "";
      } else cell += ch;
    }
    cells.push(cell);
    return Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? ""]));
  });
}

const write = (path, data) => {
  mkdirSync(dirname(join(out, path)), { recursive: true });
  writeFileSync(join(out, path), JSON.stringify(data));
};

const num = (v) => (v === "" || v == null ? null : Number(v));
const text = (v) => (v === "" || v == null ? null : v);

// build_hotspots._display: "SW 34TH ST & SW ARCHER RD" -> "SW 34th St & SW Archer Rd"
const KEEP = new Set(["N", "S", "E", "W", "NW", "NE", "SW", "SE", "SR", "US", "CR", "FL", "&"]);
const display = (name) =>
  name
    .split(/\s+/)
    .map((w) =>
      KEEP.has(w)
        ? w
        : /^\d/.test(w)
          ? w.toLowerCase()
          : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join(" ");

const city = readJson(join(derived, "city_summary.json"));
const hotspotList = readJson(join(derived, "hotspots.json")).hotspots;
const hotspots = new Map(hotspotList.map((h) => [h.id, h]));
const causes = readJson(join(derived, "causes.json"));
const recs = readJson(join(derived, "recommendations.json")).intersections;
const cases = readJson(join(derived, "case_files.json")).case_files;
const measures = readJson(join(root, "data", "reference", "countermeasures.json")).countermeasures;

// load_db.load_road_features: two raw names can share a slug; keep the busier.
const features = new Map();
for (const r of readCsv(join(derived, "road_features.csv"))) {
  const old = features.get(r.id);
  if (!old || Number(r.crashes_all_years) > Number(old.crashes_all_years))
    features.set(r.id, r);
}
const latlon = new Map(
  readCsv(join(derived, "intersections.csv")).map((r) => [
    r.intersection_id,
    [Number(r.lat), Number(r.lon)],
  ]),
);
const fixRank = new Map(city.fix_list.map((f) => [f.id, f.rank]));

// load_db.intersection_rows
const rows = [...features.entries()].map(([id, f]) => {
  const h = hotspots.get(id);
  const c = causes.intersections[id] ?? {};
  const s = causes.screening[id] ?? {};
  const rec = recs[id]?.recommendations?.[0] ?? {};
  const crash = h?.crashes;
  const [lat, lon] = latlon.get(f.intersection_id);
  return {
    id,
    name: h ? h.name : display(f.intersection_id),
    raw_name: f.intersection_id,
    lat,
    lon,
    crashes_since_2022: Number(f.crashes_window),
    crashes_all_years: Number(f.crashes_all_years),
    fdot_crashes: Number(f.fdot_crashes),
    pedestrian_crashes: crash ? Math.round(crash.pedestrian_share * crash.crashes) : null,
    bicycle_crashes: crash ? Math.round(crash.bicycle_share * crash.crashes) : null,
    has_gemini_description: (cases[id]?.source ?? "").startsWith("gemini"),
    screening_rank: s.rank ?? null,
    observed: s.observed ?? null,
    predicted: s.predicted ?? null,
    excess_per_year: s.excess_per_year ?? null,
    main_factor: c.main_factor ?? null,
    verdict: c.verdict ?? null,
    confidence: c.confidence ?? null,
    crash_rate_vs_similar: c.crash_rate?.vs_similar ?? null,
    recommended_fix_id: rec.id ?? null,
    recommended_fix_name: rec.name ?? null,
    traffic_signal: text(f.traffic_signal),
    crosswalk: text(f.crosswalk),
    left_turn_lane: text(f.left_turn_lane),
    median: text(f.median),
    speed_limit: num(f.speed_limit),
    fdot_lanes_max: num(f.fdot_lanes_max),
    daily_traffic_max: num(f.daily_traffic_max),
    has_imagery_labels: f.has_gemini === "True",
    osm_matched: f.osm_matched === "True",
    imagery_from: text(f.imagery_from),
    imagery_to: text(f.imagery_to),
    in_fix_list: fixRank.has(id),
    fix_list_rank: fixRank.get(id) ?? null,
  };
});

// api/main.py: ORDER BY screening_rank NULLS LAST, crashes_since_2022 DESC
rows.sort(
  (a, b) =>
    (a.screening_rank ?? Infinity) - (b.screening_rank ?? Infinity) ||
    b.crashes_since_2022 - a.crashes_since_2022,
);

rmSync(out, { recursive: true, force: true });

// GET /city/summary has no fix_list; GET /fix-list serves it.
const summary = { ...city };
delete summary.fix_list;
write("city/summary.json", summary);

const LIST = [
  "id", "name", "lat", "lon", "crashes_since_2022", "excess_per_year",
  "screening_rank", "main_factor", "confidence", "has_gemini_description",
  "recommended_fix_name", "pedestrian_crashes", "bicycle_crashes", "in_fix_list",
];
write("intersections.json", rows.map((r) => Object.fromEntries(LIST.map((k) => [k, r[k]]))));

const byId = new Map(rows.map((r) => [r.id, r]));
write(
  "fix-list.json",
  city.fix_list.map((f) => {
    const r = byId.get(f.id);
    return r
      ? { ...f, lat: r.lat, lon: r.lon, main_factor: r.main_factor, has_gemini_description: r.has_gemini_description }
      : f;
  }),
);

// api/main.py load_intersection
for (const r of rows) {
  const cf = cases[r.id];
  const recommended = (recs[r.id]?.recommendations ?? []).map((m) => m.id);
  if (!recommended.length && r.recommended_fix_id) recommended.push(r.recommended_fix_id);
  write(`intersections/${r.id}.json`, {
    ...r,
    case_file: cf
      ? {
          source: cf.source,
          prompt_version: cf.prompt_version ?? null,
          case_file: cf.case_file,
          facts: cf.facts ?? null,
          causes: causes.intersections[r.id] ?? null,
          recommendations: recs[r.id] ?? null,
          crash_profile: hotspots.get(r.id)?.crashes ?? null,
          fdot_profile: hotspots.get(r.id)?.causes_fdot ?? null,
        }
      : null,
    countermeasures: recommended
      .filter((id) => measures[id])
      .map((id) => ({
        id,
        url: null,
        applies_when: null,
        note: null,
        ...measures[id],
      })),
  });
}

// crashes_monthly continuous aggregate (api/schema.sql)
const months = new Map();
for (const c of readCsv(join(root, "data", "processed", "gnv_crashes_clean.csv"))) {
  if (!c.crash_datetime) continue;
  const month = c.crash_datetime.slice(0, 7);
  const m =
    months.get(month) ??
    months
      .set(month, {
        month,
        crashes: 0,
        pedestrian_crashes: 0,
        bicycle_crashes: 0,
        fatal_crashes: 0,
        fatalities: 0,
        at_intersection_crashes: 0,
      })
      .get(month);
  const fatalities = Number(c.fatalities) || 0;
  m.crashes++;
  m.pedestrian_crashes += c.involves_pedestrian === "1";
  m.bicycle_crashes += c.involves_bicycle === "1";
  m.fatal_crashes += fatalities > 0;
  m.fatalities += fatalities;
  m.at_intersection_crashes += c.at_intersection === "1";
}
write("city/trend.json", [...months.values()].sort((a, b) => a.month.localeCompare(b.month)));

// scripts/backtest.py: today's top 20 (by crashes since 2022) against the
// ranking built from 2015-2021 only, matched by location within 40 m.
// build_hotspots.py constants
const LAT0 = 29.65;
const M_PER_DEG_LAT = 110_860;
const M_PER_DEG_LON = 111_320 * Math.cos((LAT0 * Math.PI) / 180);
const MATCH_M = 40;
const past = readJson(join(derived, "backtest_2015_2021.json")).hotspots;
const TOP = 20;
const backRows = hotspotList.slice(0, TOP).map((h) => {
  let best = null;
  let bestD = Infinity;
  for (const p of past) {
    const d = Math.hypot((p.lon - h.lon) * M_PER_DEG_LON, (p.lat - h.lat) * M_PER_DEG_LAT);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return {
    id: h.id,
    name: h.name,
    rank_now: h.rank,
    crashes_now: h.crashes.crashes,
    rank_before_2022: bestD <= MATCH_M ? best.rank : null,
  };
});
const flagged = (k) => backRows.filter((r) => r.rank_before_2022 && r.rank_before_2022 <= k).length;
write("backtest.json", {
  top: TOP,
  flagged_in_top_10: flagged(10),
  flagged_in_top_20: flagged(20),
  flagged_in_top_50: flagged(50),
  rows: backRows,
});

// Watch List (GET /watch-list; api/main.py has the same rules): intersections
// whose crashes are climbing. The latest year is partial, so it is put on a
// full-year pace. "Rising" means the recent rate (last full year and this
// year's pace) is above the rate of the first two years, both middle years are
// at least the year two before them, and there are enough crashes (8+ a year
// recently) for it to mean something. Ranked by crashes a year added. The top
// 10 already on the fix list are left out: this list is for the ones heading
// there.
const [, periodEnd] = city.summary.period.split(" to ");
const endYear = Number(periodEnd.slice(0, 4));
const startOfYear = new Date(`${endYear}-01-01T00:00:00Z`);
const yearFraction = (new Date(`${periodEnd}T00:00:00Z`) - startOfYear) / 864e5 / 365;
const WATCH_YEARS = [2022, 2023, 2024, 2025, endYear];
const watchRows = hotspotList
  .filter((h) => !fixRank.has(h.id))
  .map((h) => {
    const byYear = h.crashes?.by_year ?? {};
    const counts = WATCH_YEARS.map((y) => byYear[y] ?? 0);
    const pace = counts[4] / yearFraction;
    const early = (counts[0] + counts[1]) / 2;
    const late = (counts[3] + pace) / 2;
    return { h, counts, pace, early, late };
  })
  .filter(
    (r) =>
      r.late >= 8 &&
      r.late > r.early &&
      r.counts[2] >= r.counts[0] &&
      r.counts[3] >= r.counts[1],
  )
  .sort((a, b) => b.late - b.early - (a.late - a.early))
  .slice(0, 10)
  .map((r, i) => ({
    id: r.h.id,
    name: r.h.name,
    rank: i + 1,
    by_year: WATCH_YEARS.map((year, k) => ({
      year,
      crashes: r.counts[k],
      partial: year === endYear,
      pace: year === endYear ? Math.round(r.pace) : r.counts[k],
    })),
    per_year_before: Math.round(r.early * 10) / 10,
    per_year_now: Math.round(r.late * 10) / 10,
  }));
write("watch-list.json", { through: periodEnd, rows: watchRows });

// Fix Plan text written by Snowflake Cortex (scripts/cortex_fix_plan.py). Not
// every checkout has run it; without the file the page shows no Cortex text.
const cortexNotes = join(derived, "fix_plan_cortex.json");
if (existsSync(cortexNotes)) write("fix-plan/notes.json", readJson(cortexNotes));

console.log(
  `mock data: ${rows.length} intersections, ${months.size} months, ` +
    `backtest ${flagged(20)} of ${TOP} -> ${out}`,
);
