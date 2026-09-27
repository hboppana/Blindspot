# StreetSmart frontend

Next.js (App Router, TypeScript, Tailwind) city audit console. Workstream 8 in `docs/PLAN.md`; the API it reads is documented in `docs/API.md`.

## Run

```bash
npm install
cp .env.example .env.local   # then add the browser key
npm run dev                  # builds mock/ from ../data/derived, then serves on :3000
```

To use the real API instead of mocks, start it from the repo root (`uvicorn api.main:app`, needs `DATABASE_URL`) and set `API_BASE_URL=http://localhost:8000` in `.env.local`.

## Data

All data goes through `src/lib/api.ts` (server-side only, so there's no CORS and the browser never sees the API address), typed by `src/lib/types.ts`, which follows `docs/API.md`.

- **No `API_BASE_URL`:** reads `mock/`, built by `npm run mocks` (`scripts/make-mocks.mjs`) from `../data/derived`. It runs automatically before `dev` and `build`, and `mock/` is gitignored. The mocks copy the field mapping in `scripts/load_db.py`, so they have the same shape as the API. If the loader changes, update the mocks too.
- **`API_BASE_URL` set:** calls the API on every request.

| Endpoint | Mock file | Used by |
| --- | --- | --- |
| `GET /city/summary` | `mock/city/summary.json` | `/`, `/fix-list`, case file |
| `GET /city/trend` | `mock/city/trend.json` | `/` (monthly chart) |
| `GET /intersections` | `mock/intersections.json` | `/` |
| `GET /intersections/{id}` | `mock/intersections/{id}.json` | `/intersections/[id]` |
| `GET /intersections/{id}/report.pdf` | none (print fallback) | `/intersections/[id]/report` (proxy) |
| `GET /fix-list` | `mock/fix-list.json` | `/fix-list` |
| none (frontend-only) | `mock/backtest.json` | `/backtest` |

## Google Maps

Set `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` in `frontend/.env.local`. Use a separate browser key, not the repo-root `GOOGLE_MAPS_API_KEY`: anything prefixed `NEXT_PUBLIC_` is built into the page, and the root key is the unrestricted server key the imagery scripts use. The browser key needs **Maps JavaScript API** only; restrict it by HTTP referrer (localhost:3000 and the deployed domain). Without it, the pages work and show a notice where the maps go. The satellite map and Street View panorama load live in the browser and are never stored or proxied (Maps Platform terms). The Street View capture date comes from `StreetViewService`.

## Pages

- `/`: header numbers; citywide monthly trend; map coloured by main-factor group (three colourblind-safe groups; grey unless the cause is confident or the corner is on the fix list; fix-list corners ringed) and synced with the ranked list; filters.
- `/intersections/[id]`: case file. Verdict, the four numbers, satellite and Street View, road-design checklist, crashes by year and hour, crash types compared with similar corners, recommended fix (FHWA), local proof, audit text, PDF report.
- `/fix-list`: top 10.
- `/backtest`: 16 of today's top 20 flagged using pre-2022 data only.

## Route planner

**Plan a route** (next to **Whole city** on the map) checks a trip from A to B. Google returns up to 3 routes for driving, walking or biking. The app lists the intersections each route passes (within 30 m of the route line) and flags their crash records:

- **High:** on the fix list, or in the worst 50 citywide by crashes above similar corners.
- **Above average:** more crashes than similar corners, 25+ crashes since 2022, or (walking/biking) any pedestrian or bike crash since 2022.

The logic is in `src/lib/route.ts`. Routing and address search run in the browser, so the browser key also needs **Routes API** and **Places API (New)** enabled in the Cloud project and ticked in the key's API restrictions.
