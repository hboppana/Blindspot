// Builds mock API responses from data/derived so the frontend runs before the
// real API exists. Each file mirrors one endpoint (see src/lib/types.ts):
//   mock/city/summary.json          GET /city/summary
//   mock/intersections.json         GET /intersections
//   mock/intersections/{id}.json    GET /intersections/{id}
//   mock/fix-list.json              GET /fix-list
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const derived = join(here, "..", "..", "data", "derived");
const out = join(here, "..", "mock");

// Python's json.dump writes NaN, which isn't valid JSON; read it as null.
const load = (name) =>
  JSON.parse(
    readFileSync(join(derived, name), "utf8").replace(
      /(?<=[:,[]\s*)(?:NaN|-?Infinity)\b/g,
      "null",
    ),
  );
const write = (path, data) => {
  mkdirSync(dirname(join(out, path)), { recursive: true });
  writeFileSync(join(out, path), JSON.stringify(data));
};

const city = load("city_summary.json");
const { hotspots } = load("hotspots.json");
const { case_files: caseFiles } = load("case_files.json");
const { intersections: causes } = load("causes.json");

rmSync(out, { recursive: true, force: true });

write("city/summary.json", city);
write("fix-list.json", city.fix_list);

write(
  "intersections.json",
  hotspots.map((h) => {
    const cause = causes[h.id];
    return {
      id: h.id,
      name: h.name,
      rank: h.rank,
      lat: h.lat,
      lon: h.lon,
      crashes_since_2022: h.crashes.crashes,
      pedestrian_or_bike_share: +(
        h.crashes.pedestrian_share + h.crashes.bicycle_share
      ).toFixed(3),
      main_factor: cause?.main_factor ?? null,
      confidence: cause?.confidence ?? null,
    };
  }),
);

for (const h of hotspots) {
  const cf = caseFiles[h.id];
  write(`intersections/${h.id}.json`, {
    id: h.id,
    name: h.name,
    rank: h.rank,
    lat: h.lat,
    lon: h.lon,
    crashes: h.crashes,
    facts: cf?.facts ?? null,
    case_file: cf?.case_file ?? null,
    source: cf?.source ?? null,
  });
}

console.log(`mock data: ${hotspots.length} intersections -> ${out}`);
