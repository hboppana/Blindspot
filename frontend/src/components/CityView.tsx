"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { IntersectionListItem } from "@/lib/types";
import {
  FACTOR_GROUPS,
  type FactorGroup,
  displayName,
  factorGroup,
  factorLabel,
  num,
} from "@/lib/format";
import { CityMap } from "./CityMap";

const MIN_CRASH_OPTIONS = [0, 1, 5, 10, 25, 50];

type Mode = "all" | "pedestrian" | "bicycle";

export function CityView({
  intersections,
  apiKey,
}: {
  intersections: IntersectionListItem[];
  apiKey: string | undefined;
}) {
  const [group, setGroup] = useState<FactorGroup | "all">("all");
  const [mode, setMode] = useState<Mode>("all");
  const [confidentOnly, setConfidentOnly] = useState(false);
  const [minCrashes, setMinCrashes] = useState(5);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());

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

  const select = useCallback((id: string) => setSelectedId(id), []);

  useEffect(() => {
    if (selectedId)
      rowRefs.current.get(selectedId)?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  const selectClass =
    "rounded-md border border-line bg-surface px-2 py-1 focus:outline-none focus:ring-2 focus:ring-accent/60";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-line bg-surface px-4 py-2 text-sm">
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

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="relative h-80 shrink-0 md:h-auto md:flex-1">
          <CityMap
            apiKey={apiKey}
            intersections={filtered}
            selectedId={selectedId}
            onSelect={select}
          />
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
                On the fix list
              </li>
            </ul>
            <p className="mt-1 text-muted">Size shows crashes since 2022</p>
          </div>
        </div>

        <div className="flex min-h-0 flex-col border-line bg-surface md:w-96 md:border-l">
        <div className="flex items-baseline justify-between border-b border-line px-4 py-2.5">
          <h2 className="text-sm font-bold">Ranked by crashes above similar corners</h2>
          <span className="text-xs text-muted tabular-nums">{num(filtered.length)}</span>
        </div>
        <ol className="min-h-0 flex-1 overflow-y-auto max-md:max-h-[60vh]">
          {filtered.map((i) => {
            const selected = i.id === selectedId;
            const g = factorGroup(i);
            return (
              <li
                key={i.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(i.id, el);
                  else rowRefs.current.delete(i.id);
                }}
                className={`border-b border-line border-l-4 text-sm ${
                  selected ? "border-l-accent bg-accent-soft" : "border-l-transparent"
                }`}
              >
                <button
                  onClick={() => select(i.id)}
                  className="flex w-full gap-3 px-4 py-2.5 text-left hover:bg-brand-soft"
                >
                  <span className="w-10 font-bold tabular-nums">
                    {i.screening_rank ? `#${i.screening_rank}` : "-"}
                  </span>
                  <span className="flex-1">
                    <span className="block font-semibold">{displayName(i.name)}</span>
                    <span className="flex items-center gap-1.5 text-xs opacity-70">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: FACTOR_GROUPS[g].color }}
                      />
                      {g === "none" ? "No clear factor" : factorLabel(i.main_factor)}
                      {i.in_fix_list && (
                        <span className="ml-1 font-semibold text-accent-ink">on the fix list</span>
                      )}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-bold tabular-nums">
                      {num(i.crashes_since_2022)}
                    </span>
                    {i.excess_per_year != null && i.excess_per_year >= 1 && (
                      <span className="block text-xs tabular-nums text-accent-ink">
                        +{Math.round(i.excess_per_year)} a year
                      </span>
                    )}
                  </span>
                </button>
                {selected && (
                  <Link
                    href={`/intersections/${i.id}`}
                    className="mb-2 ml-17 inline-block rounded-md bg-brand px-3 py-1 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-hover active:translate-y-px"
                  >
                    Open case file
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
        {filtered.length === 0 && (
          <p className="px-4 py-6 text-sm text-muted">
            No intersections match these filters. Lower the crash minimum or set the main factor to All.
          </p>
        )}
        </div>
      </div>
      <p className="border-t border-line bg-surface px-4 py-1 text-xs opacity-60">
        Rank: network screening (crashes above what similar corners predict).
        Crashes: dataGNV since 2022; &ldquo;+N a year&rdquo; is the excess over similar corners.
      </p>
    </div>
  );
}
