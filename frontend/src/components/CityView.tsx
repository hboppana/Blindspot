"use client";

import { useCallback, useMemo, useState } from "react";
import { APIProvider, useMap } from "@vis.gl/react-google-maps";
import { ArrowsIn, MapTrifold, Path } from "@phosphor-icons/react";
import type { IntersectionListItem } from "@/lib/types";
import { GAINESVILLE } from "@/lib/format";
import type { TravelMode } from "@/lib/route";
import { CityMap, type CityMapView } from "./CityMap";
import { GradeLegend } from "./GradeChip";
import { RoutePanel, type RoutePlan } from "./RoutePanel";

// The map fills the page. Everything else floats over it: the view switch and
// route planner top left, the grade legend bottom right. Intersections are read
// straight off the map: hover for a summary, click for the report.
const PANEL =
  "pointer-events-auto rounded-2xl bg-surface/95 shadow-[0_16px_40px_-16px_rgb(31_34_38/0.45)] ring-1 ring-line backdrop-blur-md";

export function CityView({
  intersections,
  apiKey,
}: {
  intersections: IntersectionListItem[];
  apiKey: string | undefined;
}) {
  const [view, setView] = useState<CityMapView>("city");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [mode, setMode] = useState<TravelMode>("DRIVING");
  const [selectedRoute, setSelectedRoute] = useState(0);

  const routes = useMemo(() => plan?.[mode] ?? [], [plan, mode]);
  const route = routes[selectedRoute];
  const routeDots = useMemo(() => route?.hits.map((h) => h.intersection) ?? [], [route]);
  const routePaths = useMemo(() => routes.map((r) => r.path), [routes]);

  const select = useCallback((id: string) => setSelectedId(id), []);
  const close = useCallback(() => setSelectedId(null), []);
  const switchView = (v: CityMapView) => {
    setView(v);
    setSelectedId(null);
  };

  if (!apiKey)
    return (
      <div className="absolute inset-0 grid place-items-center bg-brand-soft p-6 text-center text-sm text-muted">
        Set NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY in .env.local to show the map (needs Maps JavaScript API).
      </div>
    );

  return (
    <APIProvider apiKey={apiKey}>
      <CityMap
        all={intersections}
        shown={view === "city" ? intersections : routeDots}
        selectedId={selectedId}
        onSelect={select}
        onClose={close}
        view={view}
        routes={view === "route" ? routePaths : []}
        selectedRoute={selectedRoute}
        onSelectRoute={setSelectedRoute}
      />

      {/* Top left: view switch, then the planner in route view. */}
      <div className="pointer-events-none absolute top-4 right-4 left-4 flex max-h-[calc(100%-8rem)] flex-col gap-3 max-md:max-h-[55%] md:right-auto md:w-[360px]">
        <div className="flex items-center gap-2">
          <div role="tablist" aria-label="Map view" className={`${PANEL} flex gap-1 rounded-full p-1`}>
            {(
              [
                ["city", "City Map", MapTrifold],
                ["route", "Route Planner", Path],
              ] as const
            ).map(([v, label, Icon]) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                onClick={() => switchView(v)}
                className={`flex h-9 items-center gap-2 rounded-full px-4 text-sm font-bold whitespace-nowrap transition-colors duration-150 ${
                  view === v ? "bg-brand text-white" : "text-foreground hover:bg-brand-soft"
                }`}
              >
                <Icon weight="bold" aria-hidden className="size-4" />
                {label}
              </button>
            ))}
          </div>
          <WholeCityButton />
        </div>

        {/* Kept mounted so the From and To boxes survive a trip to the city map. */}
        <section aria-label="Plan a route" className={`${PANEL} min-h-0 flex-col ${view === "route" ? "flex" : "hidden"}`}>
          <RoutePanel
            intersections={intersections}
            plan={plan}
            onPlan={(p, m) => {
              setPlan(p);
              setMode(m);
              setSelectedRoute(0);
              setSelectedId(null);
            }}
            mode={mode}
            onMode={(m) => {
              setMode(m);
              setSelectedRoute(0);
              setSelectedId(null);
            }}
            selectedRoute={selectedRoute}
            onSelectRoute={setSelectedRoute}
          />
        </section>
      </div>

      {/* Hidden on phones, where the map needs the room. */}
      <GradeLegend
        className={`${PANEL} pointer-events-none absolute right-4 bottom-4 hidden w-60 px-4 py-3 text-xs md:block`}
      />
    </APIProvider>
  );
}

function WholeCityButton() {
  const map = useMap();
  return (
    <button
      onClick={() => {
        map?.panTo(GAINESVILLE);
        map?.setZoom(12);
      }}
      aria-label="Show the whole city"
      title="Show the whole city"
      className={`${PANEL} grid size-11 shrink-0 place-items-center rounded-full text-foreground transition-colors hover:bg-brand-soft active:translate-y-px`}
    >
      <ArrowsIn weight="bold" aria-hidden className="size-5" />
    </button>
  );
}
