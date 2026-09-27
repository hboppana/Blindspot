"use client";

import { useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import type { IntersectionListItem } from "@/lib/types";
import { GAINESVILLE, num } from "@/lib/format";
import {
  type Danger,
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
import { PlaceInput, type PickedPlace } from "./PlaceInput";
import { IntersectionRow } from "./IntersectionRow";

export interface PlannedRoute {
  path: LatLng[];
  durationMillis: number;
  distanceMeters: number;
  warnings: string[];
  hits: RouteHit[];
  summary: RouteSummary;
}

const MODES: { mode: TravelMode; label: string }[] = [
  { mode: "DRIVING", label: "Drive" },
  { mode: "WALKING", label: "Walk" },
  { mode: "BICYCLING", label: "Bike" },
];

const COVERAGE_M = 25_000; // crash data covers Gainesville only

const metresFromCity = (p: LatLng) =>
  Math.hypot((p.lat - GAINESVILLE.lat) * 110_860, (p.lng - GAINESVILLE.lng) * 96_800);

export function RoutePanel({
  intersections,
  routes,
  onRoutes,
  selectedRoute,
  onSelectRoute,
  selectedId,
  onSelect,
}: {
  intersections: IntersectionListItem[];
  routes: PlannedRoute[];
  onRoutes: (routes: PlannedRoute[]) => void;
  selectedRoute: number;
  onSelectRoute: (k: number) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const routesLib = useMapsLibrary("routes");
  const [from, setFrom] = useState<PickedPlace | null>(null);
  const [to, setTo] = useState<PickedPlace | null>(null);
  const [mode, setMode] = useState<TravelMode>("DRIVING");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function findRoute(travelMode = mode) {
    if (!routesLib || !from || !to) return;
    setStatus("loading");
    setMessage(null);
    try {
      const { routes: found } = await routesLib.Route.computeRoutes({
        origin: from.location,
        destination: to.location,
        travelMode,
        computeAlternativeRoutes: true,
        fields: ["path", "durationMillis", "distanceMeters", "warnings"],
      });
      const planned = (found ?? []).slice(0, 3).map((r) => {
        const path = (r.path ?? []).map((p) => ({ lat: p.lat, lng: p.lng }));
        const hits = intersectionsOnRoute(path, intersections, travelMode);
        return {
          path,
          durationMillis: r.durationMillis ?? 0,
          distanceMeters: r.distanceMeters ?? 0,
          warnings: r.warnings ?? [],
          hits,
          summary: summarizeRoute(hits),
        };
      });
      if (!planned.length) {
        setMessage("Google found no route between these places for this way of travelling.");
      } else if (
        metresFromCity(from.location) > COVERAGE_M ||
        metresFromCity(to.location) > COVERAGE_M
      ) {
        setMessage("Crash data covers Gainesville only; parts of this route outside the city aren't checked.");
      }
      onRoutes(planned);
      onSelectRoute(0);
      setStatus("idle");
    } catch (err) {
      const text = String((err as Error)?.message ?? err);
      setMessage(
        /not (been used|enabled)|PERMISSION_DENIED|ApiNotActivated|ApiTargetBlocked|blocked|403/i.test(text)
          ? "Google refused the route request. Enable Routes API in the Cloud project and tick it on the browser key."
          : `Couldn't get a route: ${text}`,
      );
      onRoutes([]);
      setStatus("error");
    }
  }

  const safer = routes.length > 1 ? saferRouteIndex(routes) : 0;
  const fastest = routes.reduce(
    (best, r, k) => (r.durationMillis < routes[best].durationMillis ? k : best),
    0,
  );
  const current = routes[selectedRoute];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 border-b border-line px-4 py-3">
        <PlaceInput label="From" placeholder="Your starting point" onPick={setFrom} />
        <PlaceInput label="To" placeholder="Where you're going" onPick={setTo} />

        <div className="flex items-center gap-3">
          <div role="radiogroup" aria-label="Travel mode" className="flex rounded-md ring-1 ring-line">
            {MODES.map((m) => (
              <button
                key={m.mode}
                role="radio"
                aria-checked={mode === m.mode}
                onClick={() => {
                  setMode(m.mode);
                  if (routes.length) findRoute(m.mode);
                }}
                className={`px-3 py-1.5 text-sm font-medium first:rounded-l-md last:rounded-r-md transition-colors ${
                  mode === m.mode ? "bg-brand text-white" : "hover:bg-brand-soft"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => findRoute()}
            disabled={!from || !to || status === "loading" || !routesLib}
            className="ml-auto rounded-md bg-accent px-3 py-1.5 text-sm font-bold text-[#1f2226] shadow-sm transition-colors hover:brightness-95 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "loading" ? "Checking…" : "Check route"}
          </button>
        </div>
        {message && (
          <p role="status" className="text-sm text-accent-ink">
            {message}
          </p>
        )}
      </div>

      {routes.length > 0 && (
        <div className="space-y-2 border-b border-line px-4 py-3">
          {routes.map((r, k) => (
            <button
              key={k}
              onClick={() => onSelectRoute(k)}
              aria-pressed={k === selectedRoute}
              className={`block w-full rounded-md px-3 py-2 text-left text-sm ring-1 transition-colors ${
                k === selectedRoute ? "bg-accent-soft ring-accent" : "ring-line hover:bg-brand-soft"
              }`}
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-bold">
                  {formatDuration(r.durationMillis)} · {formatMiles(r.distanceMeters)}
                </span>
                {k === fastest && <Tag>Fastest</Tag>}
                {routes.length > 1 && k === safer && k !== fastest && (
                  <Tag>Passes fewer dangerous intersections</Tag>
                )}
              </span>
              <span className="mt-1 block">
                <DangerCount n={r.summary.high} danger="high" />{" "}
                <DangerCount n={r.summary.elevated} danger="elevated" />
              </span>
              <span className="block text-xs text-muted">
                {num(r.summary.crashesSince2022)} crashes since 2022 at the{" "}
                {r.summary.intersections} intersections it passes
              </span>
            </button>
          ))}
        </div>
      )}

      {current && (
        <>
          <div className="flex items-baseline justify-between px-4 pt-2.5 pb-1">
            <h3 className="text-sm font-bold">Intersections on this route</h3>
            <span className="text-xs text-muted">in order</span>
          </div>
          <ol className="min-h-0 flex-1 overflow-y-auto max-md:max-h-[60vh]">
            {current.hits.map((h) => (
              <IntersectionRow
                key={h.intersection.id}
                i={h.intersection}
                selected={h.intersection.id === selectedId}
                onSelect={onSelect}
                lead={<DangerBadge danger={h.danger} />}
                detail={vulnerableDetail(h.intersection, mode)}
              />
            ))}
          </ol>
          {current.hits.length === 0 && (
            <p className="px-4 py-4 text-sm text-muted">
              This route doesn&apos;t pass any intersection with a crash record.
            </p>
          )}
          {current.warnings.length > 0 && (
            <p className="border-t border-line px-4 py-2 text-xs text-muted">
              Google: {current.warnings.join(" ")}
            </p>
          )}
        </>
      )}

      {!routes.length && status !== "error" && (
        <p className="px-4 py-4 text-sm text-muted">
          Pick a start and a destination to see which intersections along the way
          have a bad crash record. High: on the fix list or in the city&apos;s worst 50.
          Above average: more crashes than similar corners.
        </p>
      )}
    </div>
  );
}

function vulnerableDetail(i: IntersectionListItem, mode: TravelMode) {
  const n = mode === "WALKING" ? i.pedestrian_crashes : mode === "BICYCLING" ? i.bicycle_crashes : null;
  if (!n) return undefined;
  const what = mode === "WALKING" ? "pedestrian" : "bicycle";
  return (
    <span className="font-semibold text-accent-ink">
      {n} {what} crash{n === 1 ? "" : "es"} since 2022
    </span>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-good-soft px-1.5 py-0.5 text-xs font-semibold text-good-ink">
      {children}
    </span>
  );
}

// Road-sign shapes carry the level alongside the label, so colour is never alone.
function DangerIcon({ danger }: { danger: Danger }) {
  if (danger === "high")
    return (
      <svg viewBox="0 0 20 20" className="inline h-4 w-4 align-[-3px]" aria-hidden>
        <polygon points="6,1 14,1 19,6 19,14 14,19 6,19 1,14 1,6" fill="#c8102e" />
      </svg>
    );
  if (danger === "elevated")
    return (
      <svg viewBox="0 0 20 20" className="inline h-4 w-4 align-[-3px]" aria-hidden>
        <polygon points="10,1 19,10 10,19 1,10" fill="#f6c700" stroke="#1f2226" strokeWidth="1.5" />
      </svg>
    );
  return null;
}

function DangerBadge({ danger }: { danger: Danger }) {
  if (danger === "none") return <span className="text-muted">-</span>;
  return (
    <span className="flex flex-col items-start text-[10px] leading-tight font-bold uppercase">
      <DangerIcon danger={danger} />
      {danger === "high" ? "High" : "Above avg"}
    </span>
  );
}

function DangerCount({ n, danger }: { n: number; danger: Danger }) {
  return (
    <span className="mr-2 inline-flex items-center gap-1 whitespace-nowrap">
      <DangerIcon danger={danger} />
      <span className="font-semibold tabular-nums">{n}</span>
      {danger === "high" ? "high-crash" : "above average"}
    </span>
  );
}
