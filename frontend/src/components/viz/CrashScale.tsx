import { gradeInfo } from "@/lib/grade";

// Crashes a year at one intersection on a zero-based scale, against two
// references: Gainesville's median intersection (a tick) and what a similar
// intersection sees (a hollow dot). The red connector is the extra.
//
// Adapted from 21st.dev's "Dumbbell Range" (vizcn by vibecoding.tech): two
// marks joined by a connector on a shared scale, the connector growing in on
// view. Here it has a third mark and no filled track, and grows with the
// site's scroll-driven .reveal-grow instead of an observer.

const EXTRA = gradeInfo("F").color;
const pct = (v: number, max: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`;
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
  return (
    <div
      className={`relative w-full ${card ? "h-16" : "h-5"}`}
      role="img"
      aria-label={`${fmt(value)} crashes a year here, ${fmt(similar)} at a similar intersection, ${fmt(median)} at Gainesville's median intersection`}
    >
      {/* Everything sits on one line through the middle of the top row. */}
      <div className={`absolute inset-x-0 ${card ? "top-3" : "top-1/2"} h-px bg-line`} />

      {/* City median: a tick. */}
      <span
        className={`absolute w-0.5 -translate-x-1/2 rounded-full bg-muted ${card ? "top-0.5 h-5" : "top-0.5 h-4"}`}
        style={{ left: pct(median, max) }}
      />

      {/* The extra, from similar to this one. */}
      <span
        className={`reveal-grow absolute h-1.5 -translate-y-1/2 rounded-full ${card ? "top-3" : "top-1/2"}`}
        style={{ left: pct(lo, max), width: `calc(${pct(hi, max)} - ${pct(lo, max)})`, background: EXTRA }}
      />

      {/* Similar intersection: hollow. */}
      <span
        className={`absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-muted bg-background ${card ? "top-3" : "top-1/2"}`}
        style={{ left: pct(similar, max) }}
      />

      {/* This intersection: solid. */}
      <span
        className={`absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background ${card ? "top-3" : "top-1/2"}`}
        style={{ left: pct(value, max), background: EXTRA }}
      />

      {card && (
        <>
          <Label at={pct(median, max)} align="start" muted>
            City median {fmt(median)}
          </Label>
          <Label at={pct(similar, max)} muted>
            Similar {fmt(similar)}
          </Label>
          <Label at={pct(value, max)} align="end">
            Here {fmt(value)}
          </Label>
        </>
      )}
    </div>
  );
}

function Label({
  at,
  align = "center",
  muted,
  children,
}: {
  at: string;
  align?: "start" | "center" | "end";
  muted?: boolean;
  children: React.ReactNode;
}) {
  const shift = align === "start" ? "" : align === "end" ? "-translate-x-full" : "-translate-x-1/2";
  return (
    <span
      className={`absolute top-7 text-xs whitespace-nowrap tabular-nums ${shift} ${muted ? "text-muted" : "font-bold"}`}
      style={{ left: at }}
    >
      {children}
    </span>
  );
}
