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

const MIN_CRASH_OPTIONS = [1, 5, 10, 25, 50];

export function CityView({
  intersections,
  apiKey,
}: {
  intersections: IntersectionListItem[];
  apiKey: string | undefined;
}) {
  const [group, setGroup] = useState<FactorGroup | "all">("all");
  const [pedBikeOnly, setPedBikeOnly] = useState(false);
  const [minCrashes, setMinCrashes] = useState(5);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());

  const filtered = useMemo(
    () =>
      intersections
        .filter(
          (i) =>
            i.crashes_since_2022 >= minCrashes &&
            (group === "all" || factorGroup(i) === group) &&
            (!pedBikeOnly || i.pedestrian_or_bike_share > 0),
        )
        .sort((a, b) => a.rank - b.rank),
    [intersections, group, pedBikeOnly, minCrashes],
  );

  const select = useCallback((id: string) => setSelectedId(id), []);

  useEffect(() => {
    if (selectedId)
      rowRefs.current.get(selectedId)?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-black/10 px-4 py-2 text-sm dark:border-white/15">
        <label className="flex items-center gap-2">
          Main factor
          <select
            value={group}
            onChange={(e) => setGroup(e.target.value as FactorGroup | "all")}
            className="rounded border border-black/15 bg-transparent px-2 py-1 dark:border-white/20"
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
          Min crashes since 2022
          <select
            value={minCrashes}
            onChange={(e) => setMinCrashes(Number(e.target.value))}
            className="rounded border border-black/15 bg-transparent px-2 py-1 dark:border-white/20"
          >
            {MIN_CRASH_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}+
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={pedBikeOnly}
            onChange={(e) => setPedBikeOnly(e.target.checked)}
          />
          Pedestrian or bike crashes
        </label>
        <span className="opacity-60">{num(filtered.length)} shown</span>

        <ul className="ml-auto flex flex-wrap gap-4 text-xs">
          {Object.values(FACTOR_GROUPS).map((g) => (
            <li key={g.label} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: g.color }}
              />
              {g.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="h-80 md:h-auto md:flex-1">
          <CityMap
            apiKey={apiKey}
            intersections={filtered}
            selectedId={selectedId}
            onSelect={select}
          />
        </div>

        <ol className="overflow-y-auto border-black/10 md:w-96 md:border-l dark:border-white/15">
          {filtered.map((i) => {
            const selected = i.id === selectedId;
            return (
              <li
                key={i.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(i.id, el);
                  else rowRefs.current.delete(i.id);
                }}
                className={`border-b border-black/5 text-sm dark:border-white/10 ${
                  selected ? "bg-black/5 dark:bg-white/10" : ""
                }`}
              >
                <button
                  onClick={() => select(i.id)}
                  className="flex w-full gap-3 px-4 py-2 text-left hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <span className="w-10 tabular-nums opacity-60">#{i.rank}</span>
                  <span className="flex-1">
                    <span className="block">{displayName(i.name)}</span>
                    <span className="flex items-center gap-1.5 text-xs opacity-70">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: FACTOR_GROUPS[factorGroup(i)].color }}
                      />
                      {i.confidence === "ok"
                        ? factorLabel(i.main_factor)
                        : "No clear factor"}
                    </span>
                  </span>
                  <span className="tabular-nums">
                    {num(i.crashes_since_2022)}
                  </span>
                </button>
                {selected && (
                  <Link
                    href={`/intersection/${i.id}`}
                    className="block px-4 pb-2 pl-17 text-sm font-medium underline"
                  >
                    Open case file →
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
