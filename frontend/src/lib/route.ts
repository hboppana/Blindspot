// Which intersections a route passes through, and how their crash records
// compare. Pure functions over the intersection list the city page already has.
import type { IntersectionListItem } from "./types";
import { type Grade, GRADES, gradeOf } from "./grade";

export type TravelMode = "DRIVING" | "WALKING" | "BICYCLING";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteHit {
  intersection: IntersectionListItem;
  grade: Grade | null;
  metresAlong: number; // distance from the start, for ordering
}

export interface RouteSummary {
  intersections: number;
  byGrade: Record<Grade, number>;
  ungraded: number;
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
      hits.push({ intersection: i, grade: gradeOf(i), metresAlong: along });
  }
  return hits.sort((a, b) => a.metresAlong - b.metresAlong);
}

export function summarizeRoute(hits: RouteHit[]): RouteSummary {
  const byGrade = Object.fromEntries(GRADES.map((g) => [g.grade, 0])) as Record<Grade, number>;
  for (const h of hits) if (h.grade) byGrade[h.grade]++;
  return {
    intersections: hits.length,
    byGrade,
    ungraded: hits.filter((h) => !h.grade).length,
    crashesSince2022: hits.reduce((n, h) => n + h.intersection.crashes_since_2022, 0),
  };
}

/** Index of the safest route: fewest F intersections, then D, then C, then the quickest. */
export function saferRouteIndex(
  routes: { summary: RouteSummary; durationMillis: number }[],
): number {
  const key = (x: (typeof routes)[number]) => [
    x.summary.byGrade.F,
    x.summary.byGrade.D,
    x.summary.byGrade.C,
    x.durationMillis,
  ];
  let best = 0;
  routes.forEach((r, k) => {
    const a = key(r);
    const b = key(routes[best]);
    const i = a.findIndex((v, n) => v !== b[n]);
    if (i !== -1 && a[i] < b[i]) best = k;
  });
  return best;
}

export const formatDuration = (ms: number) => {
  const min = Math.round(ms / 60_000);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
};

export const formatMiles = (m: number) => `${(m / 1609.344).toFixed(1)} mi`;
