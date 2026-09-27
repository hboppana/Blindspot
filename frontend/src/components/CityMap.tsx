"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ControlPosition, Map, MapControl, useMap } from "@vis.gl/react-google-maps";
import type { IntersectionListItem } from "@/lib/types";
import { FACTOR_GROUPS, GAINESVILLE, factorGroup } from "@/lib/format";
import type { LatLng } from "@/lib/route";

// Dot radius in px: a base size so low-crash corners stay easy to see and
// click, plus a part that grows with crashes since 2022, so every corner is
// still bigger than one with fewer crashes.
const BASE_DOT_RADIUS = 5;
const dotScale = (crashes: number) => BASE_DOT_RADIUS + Math.sqrt(crashes) * 0.75;

export type CityMapView = "ranked" | "route";

// Zoomed out, only the corners with the most crashes are drawn. The cut-off
// falls exponentially as you zoom in (divided by 2.5 per step), so each step
// reveals a few times more corners. Zoom 12 is the whole city:
// 120+, 48+, 19+, 8+, 3+, then everything from zoom 17.
export function minCrashesAtZoom(zoom: number) {
  if (zoom >= 17) return 0;
  return Math.round(120 * 0.4 ** (zoom - 12));
}

// Log fade: a dot just over the cut-off is faint, one 4x over it is solid,
// so newly revealed corners don't compete with the big ones.
function dotOpacity(crashes: number, threshold: number) {
  if (threshold <= 0) return 0.85;
  const t = Math.log(Math.max(crashes, threshold) / threshold) / Math.log(4);
  return 0.35 + 0.55 * Math.min(1, t);
}

// Rendered inside CityView's APIProvider (the route panel needs it too).
export function CityMap({
  all,
  shown,
  selectedId,
  onSelect,
  view,
  onToggleView,
  routes = [],
  selectedRoute = 0,
  onSelectRoute,
  highDanger,
}: {
  all: IntersectionListItem[]; // every intersection: dots are created once from this
  shown: IntersectionListItem[]; // what the current view and filters include
  selectedId: string | null;
  onSelect: (id: string) => void;
  view: CityMapView;
  onToggleView: () => void;
  routes?: LatLng[][];
  selectedRoute?: number;
  onSelectRoute?: (k: number) => void;
  highDanger?: Set<string>; // ids drawn with a heavy ring on the route view
}) {
  const [zoom, setZoom] = useState(12);
  const threshold = view === "ranked" ? minCrashesAtZoom(zoom) : 0;

  // Always keep the selected corner, fix-list corners and route danger visible.
  const visibleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const i of shown)
      if (
        threshold === 0 ||
        i.crashes_since_2022 >= threshold ||
        i.in_fix_list ||
        i.id === selectedId ||
        highDanger?.has(i.id)
      )
        ids.add(i.id);
    return ids;
  }, [shown, threshold, selectedId, highDanger]);
  const hidden = shown.length - visibleIds.size;

  return (
    <Map
      defaultCenter={GAINESVILLE}
      defaultZoom={12}
      onZoomChanged={(e) => setZoom(Math.round(e.detail.zoom))}
      gestureHandling="cooperative"
      disableDefaultUI
      zoomControl
      clickableIcons={false}
      className="absolute inset-0"
    >
      <MapControl position={ControlPosition.TOP_LEFT}>
        <div className="m-2.5 flex gap-2">
          <WholeCityButton />
          <button
            onClick={onToggleView}
            aria-pressed={view === "route"}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-bold text-[#1f2226] shadow transition-colors hover:brightness-95 active:translate-y-px"
          >
            {view === "ranked" ? "Plan a route" : "Ranked list"}
          </button>
        </div>
      </MapControl>
      {hidden > 0 && (
        <MapControl position={ControlPosition.BOTTOM_CENTER}>
          <p className="mb-2.5 rounded-md bg-surface/95 px-3 py-1.5 text-xs font-medium shadow ring-1 ring-line">
            Showing corners with {threshold}+ crashes. Zoom in to see{" "}
            {hidden.toLocaleString("en-US")} more.
          </p>
        </MapControl>
      )}
      <DotLayer
        all={all}
        visibleIds={visibleIds}
        threshold={threshold}
        selectedId={selectedId}
        onSelect={onSelect}
        highDanger={highDanger}
      />
      {view === "route" && (
        <RouteLayer routes={routes} selected={selectedRoute} onSelect={onSelectRoute} />
      )}
    </Map>
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
      className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white shadow transition-colors hover:bg-brand-hover active:translate-y-px"
    >
      Whole city
    </button>
  );
}

// All dots are drawn on one canvas laid over the map. Google's Data layer
// treated every dot as a marker and re-rendered each one on every zoom step
// (100-400 ms of freezing); a canvas redraw of every dot takes ~1 ms.
// Clicks and hover find the dot under the pointer themselves.
interface DotProps {
  all: IntersectionListItem[];
  visibleIds: Set<string>;
  threshold: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  highDanger?: Set<string>;
}

interface Drawn {
  i: IntersectionListItem;
  x: number; // container pixels
  y: number;
  r: number;
}

function DotLayer(props: DotProps) {
  const { all, visibleIds, threshold, selectedId, highDanger } = props;
  const map = useMap();
  const latest = useRef(props);
  const redrawRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    latest.current = props;
  });

  // Draw order and colours depend only on the full list: biggest first, so
  // small dots end up on top and stay clickable.
  const ordered = useMemo(
    () =>
      [...all]
        .sort((a, b) => b.crashes_since_2022 - a.crashes_since_2022)
        .map((i) => ({ i, color: FACTOR_GROUPS[factorGroup(i)].color, r: dotScale(i.crashes_since_2022) })),
    [all],
  );
  const orderedRef = useRef(ordered);
  useEffect(() => {
    orderedRef.current = ordered;
  });

  useEffect(() => {
    if (!map) return;
    const canvas = document.createElement("canvas");
    canvas.style.position = "absolute";
    canvas.style.pointerEvents = "none";
    const tip = document.createElement("div");
    tip.className =
      "pointer-events-none absolute z-10 hidden rounded-md bg-surface px-2 py-1 text-xs font-medium text-foreground shadow ring-1 ring-line";
    map.getDiv().appendChild(tip);
    let drawn: Drawn[] = [];

    class CanvasDots extends google.maps.OverlayView {
      onAdd() {
        this.getPanes()?.overlayLayer.appendChild(canvas);
      }
      onRemove() {
        canvas.remove();
      }
      draw() {
        const proj = this.getProjection();
        if (!proj) return;
        const { visibleIds, threshold, selectedId, highDanger } = latest.current;
        const box = map!.getDiv();
        const w = box.clientWidth;
        const h = box.clientHeight;
        const dpr = window.devicePixelRatio || 1;
        // Pin the canvas to the visible area (the overlay pane moves while panning).
        const topLeft = proj.fromContainerPixelToLatLng(new google.maps.Point(0, 0));
        const origin = topLeft && proj.fromLatLngToDivPixel(topLeft);
        if (!origin) return;
        canvas.style.left = `${origin.x}px`;
        canvas.style.top = `${origin.y}px`;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
          canvas.width = Math.round(w * dpr);
          canvas.height = Math.round(h * dpr);
        }
        const ctx = canvas.getContext("2d")!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        const plain: Drawn[] = [];
        const top: (Drawn & { color: string; selected: boolean })[] = [];
        drawn = [];
        for (const d of orderedRef.current) {
          if (!visibleIds.has(d.i.id)) continue;
          const p = proj.fromLatLngToContainerPixel(new google.maps.LatLng(d.i.lat, d.i.lon));
          if (!p || p.x < -d.r || p.y < -d.r || p.x > w + d.r || p.y > h + d.r) continue;
          const selected = d.i.id === selectedId;
          const ringed = d.i.in_fix_list || (highDanger?.has(d.i.id) ?? false);
          const item = { i: d.i, x: p.x, y: p.y, r: d.r };
          if (selected || ringed) {
            top.push({ ...item, color: d.color, selected });
            continue;
          }
          ctx.globalAlpha = dotOpacity(d.i.crashes_since_2022, threshold);
          ctx.beginPath();
          ctx.arc(p.x, p.y, d.r, 0, Math.PI * 2);
          ctx.fillStyle = d.color;
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.lineWidth = 1;
          ctx.strokeStyle = "#ffffff";
          ctx.stroke();
          plain.push(item);
        }
        // Fix-list, route-danger and selected dots on top, fully opaque.
        top.sort((a, b) => Number(a.selected) - Number(b.selected));
        for (const d of top) {
          ctx.globalAlpha = 0.95;
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
          ctx.fillStyle = d.color;
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.lineWidth = d.selected ? 3.5 : 2;
          ctx.strokeStyle = "#0b0b0b";
          ctx.stroke();
        }
        drawn = [...plain, ...top];
      }
    }

    const layer = new CanvasDots();
    layer.setMap(map);
    // Coalesce redraw requests (panning, resizing, prop changes) to one per frame.
    let frame = 0;
    const redraw = () => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          layer.draw();
        });
    };
    redrawRef.current = redraw;

    // Topmost dot under the pointer (drawn last = on top).
    const hit = (e: google.maps.MapMouseEvent) => {
      const ev = e.domEvent as MouseEvent | undefined;
      if (!ev) return null;
      const rect = map.getDiv().getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      for (let k = drawn.length - 1; k >= 0; k--) {
        const d = drawn[k];
        if ((d.x - x) ** 2 + (d.y - y) ** 2 <= (d.r + 2) ** 2) return { d, x, y };
      }
      return null;
    };
    const listeners = [
      map.addListener("click", (e: google.maps.MapMouseEvent) => {
        const h = hit(e);
        if (h) latest.current.onSelect(h.d.i.id);
      }),
      map.addListener("mousemove", (e: google.maps.MapMouseEvent) => {
        const h = hit(e);
        map.setOptions({ draggableCursor: h ? "pointer" : null });
        if (!h) {
          tip.classList.add("hidden");
          return;
        }
        tip.textContent = `${h.d.i.name}: ${h.d.i.crashes_since_2022} crashes since 2022`;
        tip.style.left = `${h.x + 12}px`;
        tip.style.top = `${h.y + 12}px`;
        tip.classList.remove("hidden");
      }),
      map.addListener("mouseout", () => tip.classList.add("hidden")),
      // Redraw while panning so newly revealed areas get their dots.
      map.addListener("bounds_changed", redraw),
    ];

    return () => {
      cancelAnimationFrame(frame);
      listeners.forEach((l) => l.remove());
      layer.setMap(null);
      tip.remove();
      redrawRef.current = null;
    };
  }, [map]);

  // Any change to what's shown: one cheap redraw.
  useEffect(() => {
    redrawRef.current?.();
  }, [ordered, visibleIds, threshold, selectedId, highDanger]);

  // Pan only when the selection changes, not when zoom changes what's visible.
  useEffect(() => {
    if (!map || !selectedId) return;
    const i = latest.current.all.find((x) => x.id === selectedId);
    if (!i) return;
    map.panTo({ lat: i.lat, lng: i.lon });
    if ((map.getZoom() ?? 0) < 15) map.setZoom(15);
  }, [map, selectedId]);

  return null;
}

// The planned routes: the selected one bold and on top, alternatives thin grey
// and clickable. Fits the map to the selected route when the routes change.
function RouteLayer({
  routes,
  selected,
  onSelect,
}: {
  routes: LatLng[][];
  selected: number;
  onSelect?: (k: number) => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || !routes.length) return;
    const bounds = new google.maps.LatLngBounds();
    routes[selected]?.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 60);
    // Only on new routes; switching between alternatives keeps the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, routes]);

  useEffect(() => {
    if (!map) return;
    const lines = routes.flatMap((path, k) => {
      const isSelected = k === selected;
      // A light casing under the line keeps it readable over any map colour.
      const casing = new google.maps.Polyline({
        map,
        path,
        strokeColor: "#ffffff",
        strokeOpacity: isSelected ? 0.9 : 0.6,
        strokeWeight: isSelected ? 9 : 6,
        zIndex: isSelected ? 20 : 10,
        clickable: false,
      });
      const line = new google.maps.Polyline({
        map,
        path,
        strokeColor: isSelected ? "#1f2226" : "#9a988f",
        strokeOpacity: 1,
        strokeWeight: isSelected ? 5 : 4,
        zIndex: isSelected ? 21 : 11,
        clickable: !isSelected,
      });
      if (!isSelected && onSelect) line.addListener("click", () => onSelect(k));
      return [casing, line];
    });
    return () => lines.forEach((l) => l.setMap(null));
  }, [map, routes, selected, onSelect]);

  return null;
}
