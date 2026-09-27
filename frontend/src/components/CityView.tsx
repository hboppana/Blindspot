"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { APIProvider } from "@vis.gl/react-google-maps";
import type { IntersectionListItem } from "@/lib/types";
import { FACTOR_GROUPS, type FactorGroup, factorGroup, num } from "@/lib/format";
import { CityMap, type CityMapView } from "./CityMap";
import { IntersectionRow } from "./IntersectionRow";
import { RoutePanel, type PlannedRoute } from "./RoutePanel";

const MIN_CRASH_OPTIONS = [0, 1, 5, 10, 25, 50];

type Mode = "all" | "pedestrian" | "bicycle";

export function CityView({
  intersections,
  apiKey,
}: {
  intersections: IntersectionListItem[];
  apiKey: string | undefined;
}) {
  const [view, setView] = useState<CityMapView>("ranked");
  const [group, setGroup] = useState<FactorGroup | "all">("all");
  const [mode, setMode] = useState<Mode>("all");
  const [confidentOnly, setConfidentOnly] = useState(false);
  const [minCrashes, setMinCrashes] = useState(5);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [routes, setRoutes] = useState<PlannedRoute[]>([]);
  const [selectedRoute, setSelectedRoute] = useState(0);

  // Filtered client-side: the full list loads once, so filters are instant.
  // Order comes from the API (screening rank, then crashes).
  const filtered = useMemo(
    () =>
      intersections.filter(
        (i) =>
          i.crashes_since_2022 >= minCrashes &&
          (group === "all" || factorGroup(i) === group) &&
          (!confidentOnly || i.confidence === "ok") &&
          (mode === "all" ||
            (mode === "pedestrian"
              ? (i.pedestrian_crashes ?? 0) > 0
              : (i.bicycle_crashes ?? 0) > 0)),
      ),
    [intersections, group, mode, confidentOnly, minCrashes],
  );

  // Route view: only the intersections the selected route passes.
  const route = routes[selectedRoute];
  const routeDots = useMemo(() => route?.hits.map((h) => h.intersection) ?? [], [route]);
  const highDanger = useMemo(
    () => new Set(route?.hits.filter((h) => h.danger === "high").map((h) => h.intersection.id)),
    [route],
  );
  const routePaths = useMemo(() => routes.map((r) => r.path), [routes]);

  const select = useCallback((id: string) => setSelectedId(id), []);
  const toggleView = useCallback(() => {
    setView((v) => (v === "ranked" ? "route" : "ranked"));
    setSelectedId(null);
  }, []);

  // Scroll the selected row into view in whichever list is showing.
  const listsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selectedId) return;
    for (const el of listsRef.current?.querySelectorAll<HTMLElement>("[data-row-id]") ?? [])
      if (el.dataset.rowId === selectedId && el.offsetParent) el.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  const selectClass =
    "rounded-md border border-line bg-surface px-2 py-1 focus:outline-none focus:ring-2 focus:ring-accent/60";

  const body = (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* One bar for both views, same height either way, so switching views
          never resizes the map (a resize redraws the whole map). */}
      <div className="relative border-y border-line bg-surface text-sm">
        <div
          aria-hidden={view === "route"}
          className={`flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2 ${view === "route" ? "invisible" : ""}`}
        >
          <label className="flex items-center gap-2">
            Main factor
            <select
              value={group}
              onChange={(e) => setGroup(e.target.value as FactorGroup | "all")}
              className={selectClass}
            >
              <option value="all">All</option>
              {Object.entries(FACTOR_GROUPS).map(([key, g]) => (
                <option key={key} value={key}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            Crashes since 2022
            <select
              value={minCrashes}
              onChange={(e) => setMinCrashes(Number(e.target.value))}
              className={selectClass}
            >
              {MIN_CRASH_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? "Any" : `${n}+`}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            Involving
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
              className={selectClass}
            >
              <option value="all">Any crash</option>
              <option value="pedestrian">Pedestrians</option>
              <option value="bicycle">Bicycles</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={confidentOnly}
              onChange={(e) => setConfidentOnly(e.target.checked)}
              className="accent-brand"
            />
            Confident cause only
          </label>
        </div>
        {view === "route" && (
          <div className="absolute inset-0 flex items-center px-4">
            <p>
              <span className="font-bold">Plan a route.</span>{" "}
              <span className="text-muted">
                See which intersections on your way have a bad crash record.
              </span>
            </p>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="relative h-80 shrink-0 md:h-auto md:flex-1">
          {apiKey ? (
            <CityMap
              all={intersections}
              shown={view === "ranked" ? filtered : routeDots}
              selectedId={selectedId}
              onSelect={select}
              view={view}
              onToggleView={toggleView}
              routes={routePaths}
              selectedRoute={selectedRoute}
              onSelectRoute={setSelectedRoute}
              highDanger={view === "route" ? highDanger : undefined}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-black/5 p-6 text-center text-sm opacity-70 dark:bg-white/5">
              Set NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY in .env.local to show the map
              (needs Maps JavaScript API).
            </div>
          )}
          <div className="pointer-events-none absolute top-2.5 right-2.5 hidden rounded-md md:block bg-surface/95 px-3 py-2 text-xs shadow-sm ring-1 ring-line">
            <p className="mb-1 font-bold">Main crash type</p>
            <ul className="space-y-0.5">
              {Object.values(FACTOR_GROUPS).map((g) => (
                <li key={g.label} className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: g.color }} />
                  {g.label}
                </li>
              ))}
              <li className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-foreground" />
                {view === "ranked" ? "On the fix list" : "High crash record"}
              </li>
            </ul>
            <p className="mt-1 text-muted">Size shows crashes since 2022</p>
          </div>
        </div>

        <div ref={listsRef} className="flex min-h-0 flex-col border-line bg-surface md:w-96 md:border-l">
          {/* Kept mounted (just hidden) so switching back doesn't rebuild every row. */}
          <div className={view === "ranked" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
              <div className="flex items-baseline justify-between border-b border-line px-4 py-2.5">
                <h2 className="text-sm font-bold">Ranked by crashes above similar corners</h2>
                <span className="text-xs text-muted tabular-nums">{num(filtered.length)}</span>
              </div>
              <ol className="min-h-0 flex-1 overflow-y-auto max-md:max-h-[60vh]">
                {filtered.map((i) => (
                  <IntersectionRow
                    key={i.id}
                    i={i}
                    selected={i.id === selectedId}
                    onSelect={select}
                    lead={i.screening_rank ? `#${i.screening_rank}` : "-"}
                  />
                ))}
              </ol>
              {filtered.length === 0 && (
                <p className="px-4 py-6 text-sm text-muted">
                  No intersections match these filters. Lower the crash minimum or set the main factor to All.
                </p>
              )}
          </div>
          {/* Kept mounted so the From/To boxes survive a trip to the ranked list. */}
          <div className={view === "route" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
            <div className="border-b border-line px-4 py-2.5">
              <h2 className="text-sm font-bold">Plan a route</h2>
            </div>
            <RoutePanel
              intersections={intersections}
              routes={routes}
              onRoutes={(r) => {
                setRoutes(r);
                setSelectedId(null);
              }}
              selectedRoute={selectedRoute}
              onSelectRoute={setSelectedRoute}
              selectedId={selectedId}
              onSelect={select}
            />
          </div>
        </div>
      </div>
      <p className="border-t border-line bg-surface px-4 py-1 text-xs opacity-60">
        Rank: network screening (crashes above what similar corners predict).
        Crashes: dataGNV since 2022; &ldquo;+N a year&rdquo; is the excess over similar corners.
      </p>
    </div>
  );

  // One provider for the map and the route panel (routing and address search).
  return apiKey ? <APIProvider apiKey={apiKey}>{body}</APIProvider> : body;
}
