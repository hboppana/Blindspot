// Which intersections a route passes through, and how their crash records
// compare. Pure functions over the intersection list the city page already has.
import type { IntersectionListItem } from "./types";

export type TravelMode = "DRIVING" | "WALKING" | "BICYCLING";
export type Danger = "high" | "elevated" | "none";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteHit {
  intersection: IntersectionListItem;
  danger: Danger;
  metresAlong: number; // distance from the start, for ordering
}

export interface RouteSummary {
  intersections: number;
  high: number;
  elevated: number;
  crashesSince2022: number;
}

// Metres per degree near Gainesville (same approach as scripts/build_hotspots.py).
const LAT0 = 29.65;
const M_PER_DEG_LAT = 110_860;
const M_PER_DEG_LON = 111_320 * Math.cos((LAT0 * Math.PI) / 180);

const toXY = (p: LatLng) => ({ x: p.lng * M_PER_DEG_LON, y: p.lat * M_PER_DEG_LAT });

/**
 * Intersections within `toleranceM` of the route, in the order the route
 * reaches them. A route passes through an intersection's centre only roughly
 * (the point is the average of its crash locations), hence the tolerance.
 */
export function intersectionsOnRoute(
  path: LatLng[],
  intersections: IntersectionListItem[],
  mode: TravelMode,
  toleranceM = 30,
): RouteHit[] {
  if (path.length < 2) return [];
  const pts = path.map(toXY);

  // Cheap prefilter: the route's bounding box plus the tolerance.
  const pad = toleranceM + 20;
  const minX = Math.min(...pts.map((p) => p.x)) - pad;
  const maxX = Math.max(...pts.map((p) => p.x)) + pad;
  const minY = Math.min(...pts.map((p) => p.y)) - pad;
  const maxY = Math.max(...pts.map((p) => p.y)) + pad;

  // Distance from the start to each vertex, for ordering hits along the route.
  const cum = [0];
  for (let k = 1; k < pts.length; k++)
    cum.push(cum[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y));

  const hits: RouteHit[] = [];
  for (const i of intersections) {
    const q = toXY({ lat: i.lat, lng: i.lon });
    if (q.x < minX || q.x > maxX || q.y < minY || q.y > maxY) continue;

    let best = Infinity;
    let along = 0;
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1];
      const b = pts[k];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / len2)) : 0;
      const d = Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy));
      if (d < best) {
        best = d;
        along = cum[k - 1] + t * Math.sqrt(len2);
      }
    }
    if (best <= toleranceM)
      hits.push({ intersection: i, danger: dangerLevel(i, mode), metresAlong: along });
  }
  return hits.sort((a, b) => a.metresAlong - b.metresAlong);
}

/**
 * High: on the fix list or in the top 50 citywide by crashes above similar
 * corners. Elevated: more crashes than similar corners, 25+ crashes since
 * 2022, or (walking/biking) any pedestrian/bike crash since 2022.
 */
export function dangerLevel(i: IntersectionListItem, mode: TravelMode): Danger {
  if (i.in_fix_list || (i.screening_rank != null && i.screening_rank <= 50)) return "high";
  if ((i.excess_per_year ?? 0) >= 1 || i.crashes_since_2022 >= 25) return "elevated";
  if (mode === "WALKING" && (i.pedestrian_crashes ?? 0) > 0) return "elevated";
  if (mode === "BICYCLING" && (i.bicycle_crashes ?? 0) > 0) return "elevated";
  return "none";
}

export function summarizeRoute(hits: RouteHit[]): RouteSummary {
  return {
    intersections: hits.length,
    high: hits.filter((h) => h.danger === "high").length,
    elevated: hits.filter((h) => h.danger === "elevated").length,
    crashesSince2022: hits.reduce((n, h) => n + h.intersection.crashes_since_2022, 0),
  };
}

/** Index of the route passing the fewest dangerous intersections (then the shortest). */
export function saferRouteIndex(
  routes: { summary: RouteSummary; durationMillis: number }[],
): number {
  let best = 0;
  routes.forEach((r, k) => {
    const b = routes[best];
    const key = (x: typeof r) => [x.summary.high, x.summary.elevated, x.durationMillis];
    const [h1, e1, d1] = key(r);
    const [h2, e2, d2] = key(b);
    if (h1 < h2 || (h1 === h2 && (e1 < e2 || (e1 === e2 && d1 < d2)))) best = k;
  });
  return best;
}

export const formatDuration = (ms: number) => {
  const min = Math.round(ms / 60_000);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
};

export const formatMiles = (m: number) => `${(m / 1609.344).toFixed(1)} mi`;
