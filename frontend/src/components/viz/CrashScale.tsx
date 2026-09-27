import { gradeInfo } from "@/lib/grade";

// Crashes a year at one intersection on a zero-based scale, against two
// references: Gainesville's median intersection (a tick) and what a similar
// intersection sees (a hollow dot). The red connector is the extra.
//
// Adapted from 21st.dev's "Dumbbell Range" (vizcn by vibecoding.tech): two
// marks joined by a connector on a shared scale, the connector growing in on
// view. Here it has a third mark and no filled track, and grows with the
// site's .reveal-grow, which plays once when it first scrolls into view.

const EXTRA = gradeInfo("F").color;
const frac = (v: number, max: number) => Math.min(100, Math.max(0, (v / max) * 100));
const pct = (v: number, max: number) => `${frac(v, max)}%`;
// Labels near an edge hang inward so they don't spill out of the card.
const alignAt = (p: number) => (p < 15 ? "start" : p > 85 ? "end" : "center");
// Two labels on one row closer than this (% of the width) would overlap.
const CLEAR = 35;
const fmt = (v: number) => (v < 10 ? v.toFixed(1).replace(/\.0$/, "") : String(Math.round(v)));

export function CrashScale({
  value,
  similar,
  median,
  max,
  size = "row",
}: {
  value: number;
  similar: number;
  median: number;
  max: number; // shared across a list, so rows compare
  size?: "row" | "card";
}) {
  const card = size === "card";
  const lo = Math.min(similar, value);
  const hi = Math.max(similar, value);
  // Card labels: this intersection above the line, similar below it, and the
  // median wherever it has room (above, below, or on a second row below).
  const [vP, sP, mP] = [frac(value, max), frac(similar, max), frac(median, max)];
  const medianRow = Math.abs(sP - mP) >= CLEAR ? "below" : Math.abs(vP - mP) >= CLEAR ? "above" : "second";
  const y = card ? "top-7" : "top-1/2";
  return (
    <div
      className={`relative w-full ${card ? (medianRow === "second" ? "h-20" : "h-16") : "h-5"}`}
      role="img"
      aria-label={`${fmt(value)} crashes a year here, ${fmt(similar)} at a similar intersection, ${fmt(median)} at Gainesville's median intersection`}
    >
      {/* Everything sits on one line through the middle of the top row. */}
      <div className={`absolute inset-x-0 ${y} h-px bg-line`} />

      {/* City median: a tick. */}
      <span
        className={`absolute w-0.5 -translate-x-1/2 rounded-full bg-muted ${card ? "top-4.5 h-5" : "top-0.5 h-4"}`}
        style={{ left: pct(median, max) }}
      />

      {/* The extra, from similar to this one. */}
      <span
        className={`reveal-grow absolute h-1.5 -translate-y-1/2 rounded-full ${y}`}
        style={{ left: pct(lo, max), width: `calc(${pct(hi, max)} - ${pct(lo, max)})`, background: EXTRA }}
      />

      {/* Similar intersection: hollow. */}
      <span
        className={`absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-muted bg-background ${y}`}
        style={{ left: pct(similar, max) }}
      />

      {/* This intersection: solid. */}
      <span
        className={`absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background ${y}`}
        style={{ left: pct(value, max), background: EXTRA }}
      />

      {card && (
        <>
          <Label at={vP} row="above">
            Here {fmt(value)}
          </Label>
          <Label at={sP} row="below" muted>
            Similar {fmt(similar)}
          </Label>
          <Label at={mP} row={medianRow} muted>
            City median {fmt(median)}
          </Label>
        </>
      )}
    </div>
  );
}

const ROW_TOP = { above: "top-0", below: "top-11", second: "top-16" } as const;

function Label({
  at,
  row,
  muted,
  children,
}: {
  at: number;
  row: keyof typeof ROW_TOP;
  muted?: boolean;
  children: React.ReactNode;
}) {
  const align = alignAt(at);
  const shift = align === "start" ? "" : align === "end" ? "-translate-x-full" : "-translate-x-1/2";
  return (
    <span
      className={`absolute ${ROW_TOP[row]} text-xs leading-4 whitespace-nowrap tabular-nums ${shift} ${muted ? "text-muted" : "font-bold"}`}
      style={{ left: `${at}%` }}
    >
      {children}
    </span>
  );
}
