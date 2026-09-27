"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ControlPosition, InfoWindow, Map, MapControl, useMap } from "@vis.gl/react-google-maps";
import type { IntersectionListItem } from "@/lib/types";
import { GAINESVILLE, displayName, factorGroup, factorLabel, num } from "@/lib/format";
import { UNGRADED, gradeInfo, gradeOf, gradeReason } from "@/lib/grade";
import { GradeChip } from "./GradeChip";
import type { LatLng } from "@/lib/route";
import { dotRadius } from "@/lib/dotSize";

// Finds the intersection dot under a pointer event. DotLayer fills it in;
// RouteLayer asks it so a click on a dot sitting on a route line opens the dot.
type DotAt = (ev: MouseEvent) => IntersectionListItem | null;

export type CityMapView = "city" | "route";

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
  onClose,
  view,
  routes = [],
  selectedRoute = 0,
  onSelectRoute,
}: {
  all: IntersectionListItem[]; // every intersection: dots are created once from this
  shown: IntersectionListItem[]; // what the current view and filters include
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  view: CityMapView;
  routes?: LatLng[][];
  selectedRoute?: number;
  onSelectRoute?: (k: number) => void;
}) {
  const [zoom, setZoom] = useState(12);
  const threshold = view === "city" ? minCrashesAtZoom(zoom) : 0;
  const dotAt = useRef<DotAt | null>(null);

  // Always keep the selected corner and wreck-list corners visible.
  const visibleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const i of shown)
      if (
        threshold === 0 ||
        i.crashes_since_2022 >= threshold ||
        i.in_fix_list ||
        i.id === selectedId
      )
        ids.add(i.id);
    return ids;
  }, [shown, threshold, selectedId]);
  const hidden = shown.length - visibleIds.size;

  return (
    <Map
      defaultCenter={GAINESVILLE}
      defaultZoom={12}
      // The map is the whole page, so the wheel zooms without a modifier key.
      gestureHandling="greedy"
      disableDefaultUI
      zoomControl
      zoomControlOptions={{ position: ControlPosition.LEFT_BOTTOM }}
      clickableIcons={false}
      className="absolute inset-0"
    >
      {hidden > 0 && (
        <MapControl position={ControlPosition.BOTTOM_CENTER}>
          <p className="mx-16 mb-4 rounded-full bg-surface/95 px-4 py-2 text-center text-xs font-medium shadow ring-1 ring-line">
            Showing corners with {threshold}+ crashes. Zoom in to see{" "}
            {hidden.toLocaleString("en-US")} more.
          </p>
        </MapControl>
      )}
      <ZoomWatcher onZoom={setZoom} />
      <DotLayer
        dotAt={dotAt}
        all={all}
        visibleIds={visibleIds}
        threshold={threshold}
        selectedId={selectedId}
        onSelect={onSelect}
      />
      {view === "route" && (
        <RouteLayer
          routes={routes}
          selected={selectedRoute}
          onSelect={onSelectRoute}
          dotAt={dotAt}
          onSelectDot={onSelect}
        />
      )}
      <SelectedPopup all={all} selectedId={selectedId} onClose={onClose} />
    </Map>
  );
}

// Reads the zoom once the camera settles, so programmatic zooms (panning to a
// selected corner, fitting a route) update the detail level too, not just the wheel.
function ZoomWatcher({ onZoom }: { onZoom: (zoom: number) => void }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const l = map.addListener("idle", () => onZoom(Math.round(map.getZoom() ?? 12)));
    return () => l.remove();
  }, [map, onZoom]);
  return null;
}

// The selected intersection's grade, record and a way into its report.
// Google draws the bubble white in both colour schemes, so text is set dark.
function SelectedPopup({
  all,
  selectedId,
  onClose,
}: {
  all: IntersectionListItem[];
  selectedId: string | null;
  onClose: () => void;
}) {
  const i = useMemo(() => all.find((x) => x.id === selectedId), [all, selectedId]);
  if (!i) return null;
  const g = factorGroup(i);
  const grade = gradeOf(i);
  return (
    <InfoWindow
      position={{ lat: i.lat, lng: i.lon }}
      pixelOffset={[0, -dotRadius(i.crashes_since_2022)]}
      headerContent={<p className="pr-2 text-base leading-snug font-extrabold text-[#1f2226]">{displayName(i.name)}</p>}
      onCloseClick={onClose}
      shouldFocus={false}
      minWidth={220}
    >
      <div className="font-sans text-sm text-[#1f2226]">
        <div className="flex items-center gap-2.5">
          <GradeChip grade={grade} size="lg" />
          <p className="leading-snug">
            <span className="block font-bold">{grade ? `Grade ${grade}` : "Not graded"}</span>
            <span className="text-[#52514e]">{gradeReason(i)}</span>
          </p>
        </div>
        <p className="mt-2.5">
          <span className="font-bold tabular-nums">{num(i.crashes_since_2022)}</span> crashes since 2022
          {g !== "none" && <>, mostly {factorLabel(i.main_factor).toLowerCase()}</>}
        </p>
        {((i.pedestrian_crashes ?? 0) > 0 || (i.bicycle_crashes ?? 0) > 0) && (
          <p className="text-[#52514e]">
            {[
              i.pedestrian_crashes ? `${i.pedestrian_crashes} involving pedestrians` : null,
              i.bicycle_crashes ? `${i.bicycle_crashes} involving bikes` : null,
            ]
              .filter(Boolean)
              .join(", ")}
          </p>
        )}
        {i.in_fix_list && <p className="mt-1 font-semibold text-[#6b5200]">On the Wreck List</p>}
        <Link
          href={`/intersections/${i.id}`}
          className="mt-3 inline-flex h-8 items-center rounded-full bg-[#1f2226] px-3.5 text-sm font-bold text-white transition-colors hover:bg-[#353a40]"
        >
          View Report
        </Link>
      </div>
    </InfoWindow>
  );
}

// All dots are drawn on one canvas laid over the map. Google's Data layer
// treated every dot as a marker and re-rendered each one on every zoom step
// (100-400 ms of freezing); a canvas redraw of every dot takes ~1 ms.
// Clicks and hover find the dot under the pointer themselves.
interface DotProps {
  dotAt: React.RefObject<DotAt | null>;
  all: IntersectionListItem[];
  visibleIds: Set<string>;
  threshold: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

interface Drawn {
  i: IntersectionListItem;
  x: number; // container pixels
  y: number;
  r: number;
}

function DotLayer(props: DotProps) {
  const { all, visibleIds, threshold, selectedId } = props;
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
        .map((i) => {
          const g = gradeOf(i);
          return { i, color: g ? gradeInfo(g).color : UNGRADED.color, r: dotRadius(i.crashes_since_2022) };
        }),
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
      "pointer-events-none absolute z-10 hidden max-w-64 rounded-xl bg-surface px-3 py-2 text-xs text-foreground shadow-lg ring-1 ring-line";
    const tipTitle = document.createElement("p");
    tipTitle.className = "text-sm font-bold";
    const tipGrade = document.createElement("p");
    tipGrade.className = "mt-0.5";
    const tipHint = document.createElement("p");
    tipHint.className = "mt-1 font-semibold text-accent-ink";
    tipHint.textContent = "Click to View Report";
    tip.append(tipTitle, tipGrade, tipHint);
    map.getDiv().appendChild(tip);
    let drawn: Drawn[] = [];

    class CanvasDots extends google.maps.OverlayView {
      onAdd() {
        // Above the pane route lines are drawn in, so dots always sit on top of
        // them. The canvas ignores the pointer; clicks are hit-tested below.
        this.getPanes()?.overlayMouseTarget.appendChild(canvas);
      }
      onRemove() {
        canvas.remove();
      }
      draw() {
        const proj = this.getProjection();
        if (!proj) return;
        const { visibleIds, threshold, selectedId } = latest.current;
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
          const ringed = d.i.in_fix_list;
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
        // Wreck-list and selected dots on top, fully opaque.
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
    const hit = (e: google.maps.MapMouseEvent) => hitAt(e.domEvent as MouseEvent | undefined);
    const hitAt = (ev: MouseEvent | undefined) => {
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
    const { dotAt } = latest.current;
    dotAt.current = (ev) => hitAt(ev)?.d.i ?? null;
    const listeners = [
      map.addListener("click", (e: google.maps.MapMouseEvent) => {
        tip.classList.add("hidden");
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
        const g = gradeOf(h.d.i);
        tipTitle.textContent = displayName(h.d.i.name);
        tipGrade.textContent = g
          ? `Grade ${g}: ${gradeReason(h.d.i).toLowerCase()}`
          : `Not graded, ${h.d.i.crashes_since_2022} crashes since 2022`;
        tip.style.left = `${h.x + 12}px`;
        tip.style.top = `${h.y + 12}px`;
        tip.classList.remove("hidden");
      }),
      map.addListener("mouseout", () => tip.classList.add("hidden")),
      // Redraw while panning so newly revealed areas get their dots. The hover
      // card belongs to a dot that is now moving, so it goes.
      map.addListener("bounds_changed", () => {
        tip.classList.add("hidden");
        redraw();
      }),
    ];

    return () => {
      cancelAnimationFrame(frame);
      listeners.forEach((l) => l.remove());
      layer.setMap(null);
      tip.remove();
      redrawRef.current = null;
      dotAt.current = null;
    };
  }, [map]);

  // Any change to what's shown: one cheap redraw.
  useEffect(() => {
    redrawRef.current?.();
  }, [ordered, visibleIds, threshold, selectedId]);

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
  dotAt,
  onSelectDot,
}: {
  routes: LatLng[][];
  selected: number;
  onSelect?: (k: number) => void;
  dotAt: React.RefObject<DotAt | null>;
  onSelectDot: (id: string) => void;
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
      // A clickable line takes the click before the map sees it, so check
      // for a dot first: dots win over the route underneath.
      if (!isSelected && onSelect)
        line.addListener("click", (e: google.maps.PolyMouseEvent) => {
          const dot = dotAt.current?.(e.domEvent as MouseEvent);
          if (dot) onSelectDot(dot.id);
          else onSelect(k);
        });
      return [casing, line];
    });
    return () => lines.forEach((l) => l.setMap(null));
  }, [map, routes, selected, onSelect, dotAt, onSelectDot]);

  return null;
}
