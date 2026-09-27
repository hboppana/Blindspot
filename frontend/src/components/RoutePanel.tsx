"use client";

import { useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { Bicycle, Car, PersonSimpleWalk } from "@phosphor-icons/react";
import type { IntersectionListItem } from "@/lib/types";
import { GAINESVILLE, num } from "@/lib/format";
import {
  type LatLng,
  type RouteHit,
  type RouteSummary,
  type TravelMode,
  formatDuration,
  formatMiles,
  intersectionsOnRoute,
  saferRouteIndex,
  summarizeRoute,
} from "@/lib/route";
import { Button } from "@/components/ui/button";
import { GRADES } from "@/lib/grade";
import { GradeChip } from "./GradeChip";
import { PlaceInput, type PickedPlace } from "./PlaceInput";

export interface PlannedRoute {
  path: LatLng[];
  durationMillis: number;
  distanceMeters: number;
  warnings: string[];
  hits: RouteHit[];
  summary: RouteSummary;
}

// Routes for every way of travelling, found in one go so they can be compared.
export type RoutePlan = Record<TravelMode, PlannedRoute[]>;

export const MODES: { mode: TravelMode; label: string; Icon: typeof Car }[] = [
  { mode: "DRIVING", label: "Drive", Icon: Car },
  { mode: "WALKING", label: "Walk", Icon: PersonSimpleWalk },
  { mode: "BICYCLING", label: "Bike", Icon: Bicycle },
];

const COVERAGE_M = 25_000; // crash data covers Gainesville only

const metresFromCity = (p: LatLng) =>
  Math.hypot((p.lat - GAINESVILLE.lat) * 110_860, (p.lng - GAINESVILLE.lng) * 96_800);

const refused = (text: string) =>
  /not (been used|enabled)|PERMISSION_DENIED|ApiNotActivated|ApiTargetBlocked|blocked|403/i.test(text);

export function RoutePanel({
  intersections,
  plan,
  onPlan,
  mode,
  onMode,
  selectedRoute,
  onSelectRoute,
}: {
  intersections: IntersectionListItem[];
  plan: RoutePlan | null;
  onPlan: (plan: RoutePlan | null, mode: TravelMode) => void;
  mode: TravelMode;
  onMode: (mode: TravelMode) => void;
  selectedRoute: number;
  onSelectRoute: (k: number) => void;
}) {
  const routesLib = useMapsLibrary("routes");
  const [from, setFrom] = useState<PickedPlace | null>(null);
  const [to, setTo] = useState<PickedPlace | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function routesFor(travelMode: TravelMode): Promise<PlannedRoute[]> {
    const { routes: found } = await routesLib!.Route.computeRoutes({
      origin: from!.location,
      destination: to!.location,
      travelMode,
      computeAlternativeRoutes: true,
      fields: ["path", "durationMillis", "distanceMeters", "warnings"],
    });
    return (found ?? []).slice(0, 3).map((r) => {
      const path = (r.path ?? []).map((p) => ({ lat: p.lat, lng: p.lng }));
      const hits = intersectionsOnRoute(path, intersections);
      return {
        path,
        durationMillis: r.durationMillis ?? 0,
        distanceMeters: r.distanceMeters ?? 0,
        warnings: r.warnings ?? [],
        hits,
        summary: summarizeRoute(hits),
      };
    });
  }

  async function findRoutes() {
    if (!routesLib || !from || !to) return;
    setStatus("loading");
    setMessage(null);
    // One mode failing (no bike route, say) shouldn't hide the others.
    const settled = await Promise.allSettled(MODES.map((m) => routesFor(m.mode)));
    const next = Object.fromEntries(
      MODES.map((m, k) => [m.mode, settled[k].status === "fulfilled" ? settled[k].value : []]),
    ) as RoutePlan;
    const firstError = settled.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    const any = MODES.some((m) => next[m.mode].length);

    if (!any) {
      const text = String(firstError?.reason?.message ?? firstError?.reason ?? "");
      setMessage(
        !firstError
          ? "Google found no route between these places."
          : refused(text)
            ? "Google refused the route request. Enable Routes API in the Cloud project and tick it on the browser key."
            : `Couldn't get a route: ${text}`,
      );
      onPlan(null, mode);
      setStatus("error");
      return;
    }
    if (metresFromCity(from.location) > COVERAGE_M || metresFromCity(to.location) > COVERAGE_M)
      setMessage("Crash data covers Gainesville only; parts of this route outside the city aren't checked.");
    // Stay on the chosen mode if it has a route, else the first one that does.
    onPlan(next, next[mode].length ? mode : MODES.find((m) => next[m.mode].length)!.mode);
    setStatus("idle");
  }

  const routes = plan?.[mode] ?? [];
  const safer = routes.length > 1 ? saferRouteIndex(routes) : 0;
  const fastest = routes.reduce(
    (best, r, k) => (r.durationMillis < routes[best].durationMillis ? k : best),
    0,
  );

  return (
    <div className="flex min-h-0 flex-col">
      <div className="space-y-3 p-4">
        <PlaceInput label="From" placeholder="Your starting point" onPick={setFrom} />
        <PlaceInput label="To" placeholder="Where you're going" onPick={setTo} />
        <Button
          onClick={findRoutes}
          disabled={!from || !to || status === "loading" || !routesLib}
          className="w-full"
        >
          {status === "loading" ? "Checking Routes…" : "Check Routes"}
        </Button>
        {message && (
          <p role="status" className="text-sm text-accent-ink">
            {message}
          </p>
        )}
      </div>

      {/* Only the results scroll: a scrolling panel would clip the address suggestions. */}
      {plan && (
        <div className="min-h-0 overflow-y-auto border-t border-line p-4">
          <div role="radiogroup" aria-label="Travel mode" className="grid grid-cols-3 gap-1 rounded-full bg-brand-soft p-1">
            {MODES.map(({ mode: m, label, Icon }) => {
              const best = plan[m][0];
              return (
                <button
                  key={m}
                  role="radio"
                  aria-checked={mode === m}
                  disabled={!best}
                  onClick={() => onMode(m)}
                  className={`flex flex-col items-center rounded-full px-2 py-1.5 text-xs font-bold transition-colors disabled:opacity-40 ${
                    mode === m ? "bg-brand text-white shadow-sm" : "hover:bg-surface"
                  }`}
                >
                  <span className="flex items-center gap-1">
                    <Icon weight="bold" aria-hidden className="size-4" />
                    {label}
                  </span>
                  <span className={`font-medium tabular-nums ${mode === m ? "text-white/70" : "text-muted"}`}>
                    {best ? formatDuration(Math.min(...plan[m].map((r) => r.durationMillis))) : "No route"}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 space-y-2">
            {routes.map((r, k) => (
              <button
                key={k}
                onClick={() => onSelectRoute(k)}
                aria-pressed={k === selectedRoute}
                className={`block w-full rounded-xl px-3 py-2.5 text-left text-sm ring-1 transition-colors ${
                  k === selectedRoute ? "bg-accent-soft ring-accent" : "ring-line hover:bg-brand-soft"
                }`}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">
                    {formatDuration(r.durationMillis)}, {formatMiles(r.distanceMeters)}
                  </span>
                  {/* Both can land on one route: then it's the quickest and the safest. */}
                  {routes.length > 1 && k === fastest && <Tag>Fastest</Tag>}
                  {routes.length > 1 && k === safer && <Tag tone="safe">Safest</Tag>}
                </span>
                <GradeCounts summary={r.summary} />
                <span className="mt-1.5 block text-xs text-muted">
                  {r.summary.intersections} intersections, {num(r.summary.crashesSince2022)} crashes
                  since 2022
                </span>
              </button>
            ))}
          </div>
          {(routes[selectedRoute]?.warnings.length ?? 0) > 0 && (
            <p className="mt-3 text-xs text-muted">Google: {routes[selectedRoute].warnings.join(" ")}</p>
          )}
        </div>
      )}
    </div>
  );
}

// How many intersections of each grade the route passes, worst first.
function GradeCounts({ summary }: { summary: PlannedRoute["summary"] }) {
  const shown = GRADES.filter((g) => summary.byGrade[g.grade] > 0);
  if (!shown.length) return <span className="mt-1.5 block text-xs text-muted">No graded intersections</span>;
  return (
    <span className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
      {shown.map((g) => (
        <span key={g.grade} className="inline-flex items-center gap-1 font-semibold tabular-nums">
          <GradeChip grade={g.grade} size="sm" />
          {summary.byGrade[g.grade]}
        </span>
      ))}
    </span>
  );
}

// Fastest is neutral; Safest wears guide-sign green, the site's "this is good" colour.
function Tag({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "safe" }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
        tone === "safe" ? "bg-good-soft text-good-ink" : "bg-brand-soft text-foreground ring-1 ring-line"
      }`}
    >
      {children}
    </span>
  );
}
