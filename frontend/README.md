# StreetSmart website

Next.js (App Router, TypeScript, Tailwind CSS v4). It reads the data the pipeline produces and never needs a database to run.

## Run it

```bash
npm install
cp .env.example .env.local   # add NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY
npm run dev                  # http://localhost:3000
```

`npm run dev` and `npm run build` first run `npm run mocks`, which builds `mock/` from `../data/derived/` (see [Data](#data)).

## Pages

| Route | File | What it shows |
|---|---|---|
| `/` | `src/app/page.tsx` | Home: problem, why it's the road, how it works, impact |
| `/map` | `src/app/map/page.tsx` → `src/components/CityView.tsx` | Full-screen map with City Map and Route Planner views, grade legend, full-screen toggle |
| `/red-list` | `src/app/red-list/page.tsx` | The 10 most dangerous intersections, as cards |
| `/watch-list` | `src/app/watch-list/page.tsx` | Intersections where crashes are climbing |
| `/road-map` | `src/app/road-map/page.tsx` | The Road Map: crashes avoided by building the Red List's fixes, grouped by fix |
| `/intersections/[id]` | `src/app/intersections/[id]/page.tsx` | One intersection's report dashboard and camera angles |
| `/backtest` | `src/app/backtest/page.tsx` | Were today's worst intersections visible before 2022? |

Old addresses redirect: `/fix-list` to `/red-list`, `/fix-plan` to `/road-map` (`next.config.ts`).

## How things are computed

- **Grades** (`src/lib/grade.ts`): crashes a year above what an intersection with the same traffic and layout sees. F is 8 or more, D 4 to 8, C 1 to 4, B 0 to 1, A below similar. Too few crashes to compare means no grade.
- **Crashes avoided** (`totalCrashEffect` in `src/lib/format.ts`): uses only a fix's FHWA effect on **total crashes**. Some fixes list other effects first (red-light running, fatal and injury crashes), and those must not be turned into crash counts.
- **Plain-language lines** (`src/lib/plain.ts`): one sentence per crash type and per fix, used on the list cards.
- **Routes** (`src/lib/route.ts`): Google returns up to 3 routes per mode. Every intersection within 30 m of the route is graded, and the **Safest** route passes the fewest F, then D, then C intersections.

## Data

All data goes through `src/lib/api.ts`, which is server-only, typed by `src/lib/types.ts` (which follows [../docs/API.md](../docs/API.md)).

- **No `API_BASE_URL` (default, and how the live site runs):** reads `mock/`, built by `scripts/make-mocks.mjs` from `../data/derived/`. `mock/` is gitignored. The mocks copy the field mapping in `../scripts/load_db.py`, so if the loader changes, update the mocks too.
- **`API_BASE_URL` set:** calls the API on every request. Start it from the repo root with `uvicorn api.main:app`.

| Endpoint | Mock file | Used by |
|---|---|---|
| `GET /city/summary` | `mock/city/summary.json` | `/`, `/red-list`, reports |
| `GET /city/trend` | `mock/city/trend.json` | (monthly chart, currently unused) |
| `GET /intersections` | `mock/intersections.json` | `/map`, `/red-list`, `/watch-list`, reports |
| `GET /intersections/{id}` | `mock/intersections/{id}.json` | reports, `/road-map`, `/` |
| `GET /intersections/{id}/report.pdf` | none (Print instead) | Download PDF on reports |
| `GET /fix-list` | `mock/fix-list.json` | `/`, `/red-list`, `/road-map` |
| `GET /watch-list` | `mock/watch-list.json` | `/watch-list` |
| `GET /backtest` | `mock/backtest.json` | `/backtest` |

## Google Maps

Set `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` in `.env.local` (and in Vercel). Without it the pages still work and show a notice where the maps go.

- **Use a browser key, not the repo-root `GOOGLE_MAPS_API_KEY`.** Anything prefixed `NEXT_PUBLIC_` ends up in the page, and the root key is the unrestricted server key the imagery scripts use.
- **APIs it needs:** Maps JavaScript API (maps, Street View), Places API (New) (address search) and Routes API (route planner).
- **Website restrictions:** `http://localhost:3000/*`, `https://streetsmart.work/*` and `https://www.streetsmart.work/*`. Each needs the `/*`.
- **Imagery:** satellite and Street View load live in the browser and are never stored or proxied (Maps Platform terms).

## Design

- **Look:** road signs. Asphalt, lane-marking yellow and guide-sign green; Overpass type, which descends from the Highway Gothic lettering on US road signs. Colours are CSS variables in `src/app/globals.css`, with a dark mode.
- **Components:** buttons are shadcn/ui (`src/components/ui/`) restyled to the road palette; icons are Phosphor.
- **Motion:** only transform and opacity, and off for reduced motion. Bars and fade-ins play once when first scrolled into view (`src/components/RevealOnce.tsx`); the car on the lane line under the header tracks scroll.
