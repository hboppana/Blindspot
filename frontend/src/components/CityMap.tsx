"use client";

import { useEffect, useMemo } from "react";
import {
  APIProvider,
  ControlPosition,
  Map,
  MapControl,
  useMap,
} from "@vis.gl/react-google-maps";
import type { IntersectionListItem } from "@/lib/types";
import { FACTOR_GROUPS, factorGroup } from "@/lib/format";

const GAINESVILLE = { lat: 29.6516, lng: -82.3248 };

// Dot radius in px, by crashes since 2022 (area grows with count).
const dotScale = (crashes: number) => 3 + Math.sqrt(crashes) * 0.8;

export function CityMap({
  apiKey,
  intersections,
  selectedId,
  onSelect,
}: {
  apiKey: string | undefined;
  intersections: IntersectionListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (!apiKey) {
    return (
      <div className="flex h-full items-center justify-center bg-black/5 p-6 text-center text-sm opacity-70 dark:bg-white/5">
        Set NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY in .env.local to show the map
        (needs Maps JavaScript API).
      </div>
    );
  }
  return (
    <APIProvider apiKey={apiKey}>
      <Map
        defaultCenter={GAINESVILLE}
        defaultZoom={12}
        gestureHandling="greedy"
        disableDefaultUI
        zoomControl
        clickableIcons={false}
        className="h-full w-full"
      >
        <WholeCityButton />
        <DotLayer
          intersections={intersections}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      </Map>
    </APIProvider>
  );
}

function WholeCityButton() {
  const map = useMap();
  return (
    <MapControl position={ControlPosition.TOP_LEFT}>
      <button
        onClick={() => {
          map?.panTo(GAINESVILLE);
          map?.setZoom(12);
        }}
        className="m-2.5 rounded bg-white px-3 py-1.5 text-sm font-medium text-black shadow"
      >
        Whole city
      </button>
    </MapControl>
  );
}

// One Data layer instead of ~1,200 marker elements keeps panning smooth.
function DotLayer({
  intersections,
  selectedId,
  onSelect,
}: {
  intersections: IntersectionListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const map = useMap();
  // `map` is only non-null once the Maps API has loaded, so `google` exists.
  const layer = useMemo(() => (map ? new google.maps.Data() : null), [map]);

  useEffect(() => {
    if (!map || !layer) return;
    layer.setMap(map);
    const click = layer.addListener("click", (e: google.maps.Data.MouseEvent) =>
      onSelect(String(e.feature.getId())),
    );
    return () => {
      click.remove();
      layer.setMap(null);
    };
  }, [map, layer, onSelect]);

  useEffect(() => {
    if (!layer) return;
    layer.forEach((f) => layer.remove(f));
    // Biggest first, so small dots draw on top and stay clickable.
    const byCrashes = [...intersections].sort(
      (a, b) => b.crashes_since_2022 - a.crashes_since_2022,
    );
    for (const i of byCrashes) {
      layer.add({
        id: i.id,
        geometry: new google.maps.Data.Point({ lat: i.lat, lng: i.lon }),
        properties: {
          name: i.name,
          crashes: i.crashes_since_2022,
          color: FACTOR_GROUPS[factorGroup(i)].color,
          fixList: i.in_fix_list,
        },
      });
    }
  }, [layer, intersections]);

  useEffect(() => {
    if (!layer) return;
    layer.setStyle((f) => {
      const selected = f.getId() === selectedId;
      const fixList = f.getProperty("fixList") as boolean;
      return {
        title: `${f.getProperty("name")} · ${f.getProperty("crashes")} crashes since 2022`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: dotScale(f.getProperty("crashes") as number),
          fillColor: f.getProperty("color") as string,
          fillOpacity: 0.85,
          strokeColor: selected || fixList ? "#0b0b0b" : "#ffffff",
          strokeWeight: selected ? 3.5 : fixList ? 2 : 1,
        },
        zIndex: selected ? 1000 : fixList ? 500 : undefined,
      };
    });
  }, [layer, selectedId]);

  useEffect(() => {
    if (!map || !selectedId) return;
    const i = intersections.find((x) => x.id === selectedId);
    if (!i) return;
    map.panTo({ lat: i.lat, lng: i.lon });
    if ((map.getZoom() ?? 0) < 15) map.setZoom(15);
  }, [map, selectedId, intersections]);

  return null;
}
