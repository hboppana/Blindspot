# Workstream 8: City audit console (frontend)

> **As built (branch `frontend/scaffold`).** See `frontend/README.md`. Where the build differs from the plan below:
> - The app is in `frontend/`, not `web/`. The route is `/intersections/[id]`, as planned.
> - The API is fetched server-side through `API_BASE_URL`, not `NEXT_PUBLIC_API_URL`. The browser never calls the API. Mock mode (`npm run mocks`) serves API-shaped JSON built from `data/derived`, so the UI works without the database.
> - Map points are one Google Maps Data layer, not deck.gl, with no Map ID needed. Colours are three factor groups (turning and angle, rear-end and sideswipe, pedestrian and bike) plus grey, not eight colours: at most three hues stay distinguishable for colourblind readers when mixed on a map.
> - PDF export links to the API's `report.pdf` through a same-origin proxy. Without the API, a print stylesheet is the fallback.
> - Added a `/backtest` page (16 of today's top 20 flagged with pre-2022 data), built from `backtest_2015_2021.json`. The API has no endpoint for it.

## Context

Workstream 7 is done on the local `dataWorkStream` branch: the Tiger Data database is loaded and a FastAPI (`api/main.py`, documented in `docs/API.md`) serves the intersection list, case files, fix list, city summary and citywide trend. Nothing shows it yet. Workstream 8 builds the console a city traffic engineer (and a judge) actually looks at: a city map with a ranked list, a case file per intersection, and a fix list, following `docs/PLAN.md` §8.

**This plan is saved for later; no frontend work starts now.** On approval, the only action is to copy this plan into the repo as `docs/WORKSTREAM_8.md` and commit it on `dataWorkStream` (no code). When the work does start, it's built on the same branch.

Decisions already made:
- Build on `dataWorkStream` (it has the API the frontend needs).
- **Only confident intersections get a factor colour.** `confidence: "ok"` (139) and fix-list corners are coloured by `main_factor`; the ~1,140 `low` and the ones without factors are neutral grey. Keeps the map from overclaiming, per the plan's "How we talk about causes".
- **A separate, restricted browser key** for the frontend (HTTP referrers: `localhost:3000` + the deployed domain; APIs: Maps JavaScript only). The unrestricted `GOOGLE_MAPS_API_KEY` stays server-side for `fetch_imagery.py`.
- **Imagery loads live in the browser** (Google's terms forbid serving the cached images). No bounding boxes: workstream 2 never produced them, so the case file shows a feature checklist next to the imagery instead.

## Prerequisites (before starting)

1. Confirm with the team that you own the frontend.
2. Map ID from Map Management (JavaScript, Vector).
3. Maps JavaScript API enabled on the Maps project; the restricted browser key created; a budget alert on that project (live Street View and satellite are billed per view).
4. The API running locally: `.venv/bin/uvicorn api.main:app --reload`.

## Stack

- `web/`: Next.js (App Router, TypeScript, Tailwind), created with `npx create-next-app@latest web`
- Map: `@vis.gl/react-google-maps` (`APIProvider`, `Map`, `useMap`)
- 1,833 points: `@deck.gl/google-maps` `GoogleMapsOverlay` with a `ScatterplotLayer` (one GPU layer, clickable; 1,833 DOM markers would be slow)
- Charts: `recharts` (bar charts for by-year, by-hour, monthly trend)
- `web/.env.local` (gitignored by Next's template): `NEXT_PUBLIC_API_URL=http://localhost:8000`, `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`. Commit a `web/.env.example` with the names only.

## Structure

| Path | What |
|---|---|
| `web/lib/types.ts` | TypeScript types for the API responses, from `docs/API.md` |
| `web/lib/api.ts` | `getIntersections()`, `getIntersection(id)`, `getFixList()`, `getCitySummary()`, `getTrend()`: thin `fetch` wrappers over `NEXT_PUBLIC_API_URL` |
| `web/lib/factors.ts` | Factor → label + colour (`rear_end` "Rear-end", `angle`, `left_turn`, `sideswipe`, `right_turn`, `bicycle`, `pedestrian`, `other`) and the grey for low confidence; one source for map, legend and list |
| `web/app/page.tsx` | City view |
| `web/app/intersections/[id]/page.tsx` | Case file |
| `web/app/fix-list/page.tsx` | Fix list |
| `web/components/CityMap.tsx` | Client component: map + deck.gl layer, hover tooltip, click → case file |
| `web/components/…` | `SummaryHeader`, `RankedList`, `Filters`, `FactorLegend`, `TrendChart`, `CrashCharts`, `FeatureChecklist`, `StreetViewPane`, `YearsLabel` |

## Views

**City view (`/`)**
- Header from `/city/summary`: "1,834 intersections investigated · 411 with repeat crashes · 76 with a clear fixable pattern", period label, link to the fix list.
- Map centred on Gainesville. Points from `/intersections`: radius by `crashes_since_2022`, colour by the rule above, fix-list corners drawn with a ring. Intersections with 0 crashes since 2022 hidden by default (toggle to show all).
- Ranked side list (by `screening_rank`): name, crashes since 2022, excess a year, factor chip. Hover highlights the map point; click opens the case file.
- Filters: pedestrian / bicycle crashes (`mode`), factor, "confident only", minimum crashes. **Filter client-side:** the full list is loaded once (~50 KB gzipped), so filtering is instant and needs no refetch.
- Collapsible citywide trend from `/city/trend` (monthly bars, 2015 onward; the 2020 drop is visible).
- Legend, plus Google attribution (automatic) and "© OpenStreetMap contributors" in the footer.

**Case file (`/intersections/[id]`)** from `/intersections/{id}`
- Title, rank, verdict, confidence badge. If `has_gemini_description` is false: show the template verdict ("too few crashes…") and the crash numbers only; no factor section.
- Numbers row: crashes since 2022, predicted for a similar corner, excess a year, crash rate × similar corners. Each labelled with its years.
- Crash charts from `case_file.crash_profile`: by year (2022–2026), by hour; pedestrian and bike shares.
- Factors: each `case_file.case_file.factor_explanations` entry with the matching `causes.distinctive_factors` numbers (crashes vs expected, labelled "FDOT 2015–2018").
- Recommended fix: `countermeasures[0]` name, FHWA effect(s), cost, link to the FHWA page, the case file's `recommended_fix.why`; `facts.gainesville_precedent` shown as "Local proof" when present (173 case files have one).
- Imagery: a small satellite `Map` (`mapTypeId: satellite`, zoom 20) at lat/lon and one embedded Street View panorama, with its capture date from `StreetViewService.getPanorama` (`imageDate`). Next to it, `FeatureChecklist`: signal, crosswalk, left-turn lane, median (yes / no / unknown), speed limit, lanes, "labels from imagery captured {imagery_from} to {imagery_to}".
- Audit text (`audit_text`) and an **Export PDF** button that calls `window.print()` with a print stylesheet. That covers the deferred `report.pdf` without server work.

**Fix list (`/fix-list`)** from `/fix-list` + `/city/summary`
- Headline: "Fix these 10 intersections to address 358 crashes a year (206 above what similar corners see)".
- Ranked table: name, crashes a year, excess a year, recommended fix, link to the case file; a small map of the 10.

**Everywhere:** every number carries its period (dataGNV 2022–2026, FDOT 2015–2018, trend 2015 onward) via `YearsLabel`; no causal wording in UI copy ("contributing factor", "the evidence points to").

## Order of work

1. Scaffold `web/`, env files, `lib/types.ts` + `lib/api.ts`; a page that lists the top 10 from the API (proves CORS and env).
2. City view: map + deck.gl points + colours + legend, then the ranked list and hover/click linking, then the header.
3. Case file for SW Archer Rd & SW 34th St first (the pitch opens there), then check a template intersection and one without a case file.
4. Fix list.
5. Filters and the trend chart.
6. Imagery (satellite + Street View + checklist), print stylesheet.
7. Polish: loading and error states, mobile width check, read every demo case file end to end and fix anything thin or mislabelled.
8. README: how to run `web/`; tick workstream 8 in `docs/PLAN.md`.

## Verification

- API and `npm run dev` running together; open http://localhost:3000 in the browser pane.
- City view: header shows 1,834 / 411 / 76; the map shows coloured confident corners and grey low-confidence ones; Archer & 34th is first in the list; hovering a list row highlights its point; clicking a point opens its case file.
- Filters: "pedestrian" narrows to 207 intersections; "confident only" to the coloured ones.
- Case file `/intersections/sw-34th-st-sw-archer-rd`: 275 crashes since 2022, rank 1, by-year bars 50/67/67/48/43, right-turn lanes with FHWA's 14–26%, imagery and Street View date visible, every number has a year label.
- A template intersection (e.g. `/intersections/ne-1st-st-ne-6th-ave`) shows "Too few crashes…" and no factor section; an unknown id shows a not-found page.
- Fix list: 10 rows, 358 crashes a year headline, links work.
- Export PDF produces a clean one-intersection printout.
- Browser console has no errors; the page source contains only the restricted browser key.
