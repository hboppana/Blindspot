"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useReducedMotion } from "@/lib/useReducedMotion";

// Charts draw in once on load (the data arriving); off for reduced motion.
const DRAW_MS = 700;

const axis = {
  stroke: "var(--baseline)",
  tick: { fill: "var(--ink-muted)", fontSize: 12 },
  tickLine: false,
};

const tooltip = {
  cursor: { fill: "var(--grid)", opacity: 0.5 },
  contentStyle: {
    background: "var(--background)",
    border: "1px solid var(--grid)",
    borderRadius: 6,
    fontSize: 12,
  },
  labelStyle: { color: "var(--foreground)", fontWeight: 600 },
  itemStyle: { color: "var(--ink-secondary)" },
};

// Citywide dataGNV crashes per month (GET /city/trend).
export function CityTrend({
  months,
}: {
  months: { month: string; crashes: number }[];
}) {
  const reduce = useReducedMotion();
  const data = months.map((m) => ({ month: m.month, crashes: m.crashes }));
  const januaries = data.filter((d) => d.month.endsWith("-01")).map((d) => d.month);
  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis
          dataKey="month"
          {...axis}
          ticks={januaries}
          tickFormatter={(m: string) => m.slice(0, 4)}
        />
        <YAxis {...axis} axisLine={false} allowDecimals={false} />
        <Tooltip {...tooltip} />
        <Area
          type="linear"
          dataKey="crashes"
          name="Crashes"
          stroke="var(--series-1)"
          strokeWidth={2}
          fill="var(--series-1)"
          fillOpacity={0.1}
          isAnimationActive={!reduce}
          animationDuration={DRAW_MS}
          activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--background)" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
