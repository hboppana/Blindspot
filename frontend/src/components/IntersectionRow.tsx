"use client";

import { memo, type ReactNode } from "react";
import Link from "next/link";
import type { IntersectionListItem } from "@/lib/types";
import { FACTOR_GROUPS, displayName, factorGroup, factorLabel, num } from "@/lib/format";

// One intersection in a side list (ranked list and route planner). Memoised:
// a selection change re-renders only the two rows whose `selected` flipped.
export const IntersectionRow = memo(function IntersectionRow({
  i,
  selected,
  onSelect,
  lead,
  detail,
}: {
  i: IntersectionListItem;
  selected: boolean;
  onSelect: (id: string) => void;
  lead: ReactNode; // left column: rank, or a danger badge
  detail?: ReactNode; // extra line under the factor
}) {
  const g = factorGroup(i);
  return (
    <li
      data-row-id={i.id}
      // Off-screen rows skip layout and paint, so showing a list of hundreds
      // of rows (e.g. switching back to the ranked view) stays fast.
      className={`border-b border-line border-l-4 text-sm transition-colors duration-200 [content-visibility:auto] [contain-intrinsic-size:auto_58px] ${
        selected ? "border-l-accent bg-accent-soft" : "border-l-transparent"
      }`}
    >
      <button
        onClick={() => onSelect(i.id)}
        className="flex w-full gap-3 px-4 py-2.5 text-left transition-colors duration-150 hover:bg-brand-soft"
      >
        <span className="w-10 shrink-0 font-bold tabular-nums">{lead}</span>
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
          {detail && <span className="mt-0.5 block text-xs">{detail}</span>}
        </span>
        <span className="text-right">
          <span className="block font-bold tabular-nums">{num(i.crashes_since_2022)}</span>
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
});
