"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { capitalize } from "@/lib/format";

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

function ColumnChart({
  data,
  xKey,
  label,
  height = 180,
  interval,
}: {
  data: Record<string, string | number>[];
  xKey: string;
  label: string;
  height?: number;
  interval?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis dataKey={xKey} {...axis} interval={interval} />
        <YAxis {...axis} axisLine={false} allowDecimals={false} />
        <Tooltip {...tooltip} />
        <Bar
          dataKey="crashes"
          name={label}
          fill="var(--series-1)"
          radius={[4, 4, 0, 0]}
          maxBarSize={24}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CrashesByYear({
  byYear,
  periodEnd,
}: {
  byYear: Record<string, number>;
  periodEnd: string; // e.g. "2026-07-23"
}) {
  const lastYear = periodEnd.slice(0, 4);
  const data = Object.entries(byYear).map(([year, crashes]) => ({
    year: year === lastYear ? `${year}*` : year,
    crashes,
  }));
  return (
    <figure>
      <ColumnChart data={data} xKey="year" label="Crashes" />
      <figcaption className="text-xs opacity-60">
        * {lastYear} runs to {periodEnd} (partial year). Source: dataGNV.
      </figcaption>
    </figure>
  );
}

export function CrashesByHour({ byHour }: { byHour: number[] }) {
  const data = byHour.map((crashes, h) => ({ hour: `${h}:00`, crashes }));
  return (
    <figure>
      <ColumnChart data={data} xKey="hour" label="Crashes" interval={2} />
      <figcaption className="text-xs opacity-60">
        Hour of day, all crashes since 2022. Source: dataGNV.
      </figcaption>
    </figure>
  );
}

export function CrashTypesVsSimilar({
  types,
}: {
  types: { type: string; crashes: number; expected: number }[];
}) {
  const data = types.map((t) => ({
    type: capitalize(t.type),
    "This corner": t.crashes,
    "Expected at similar corners": t.expected,
  }));
  return (
    <figure>
      <ul className="mb-2 flex gap-4 text-xs opacity-80">
        <li className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: "var(--series-1)" }}
          />
          This corner
        </li>
        <li className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: "var(--reference)" }}
          />
          Expected at similar corners
        </li>
      </ul>
      <ResponsiveContainer
        width="100%"
        height={Math.max(100, 56 * data.length + 24)}
      >
        <BarChart
          data={data}
          layout="vertical"
          barGap={2}
          margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
        >
          <CartesianGrid horizontal={false} stroke="var(--grid)" />
          <XAxis type="number" {...axis} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="type"
            {...axis}
            axisLine={false}
            width={90}
          />
          <Tooltip {...tooltip} />
          <Bar
            dataKey="This corner"
            fill="var(--series-1)"
            radius={[0, 4, 4, 0]}
            maxBarSize={16}
            isAnimationActive={false}
          />
          <Bar
            dataKey="Expected at similar corners"
            fill="var(--reference)"
            radius={[0, 4, 4, 0]}
            maxBarSize={16}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}
