import Link from "next/link";
import type { CitySummary, FixListItem, IntersectionListItem, TrendMonth } from "@/lib/types";
import { FACTOR_GROUPS, displayName, groupByFix, monthYear, num } from "@/lib/format";
import { CityTrend } from "./Charts";

// City data below the map, laid out like a report: rows separated by rules and
// white space instead of a grid of identical cards. Every figure keeps its
// source and period, printed under it.

function Block({
  title,
  source,
  children,
  className = "",
}: {
  title: string;
  source?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <h2 className="text-xl font-extrabold tracking-tight">{title}</h2>
      <div className="mt-4">{children}</div>
      {source && <p className="mt-3 text-xs text-muted">{source}</p>}
    </section>
  );
}

// Ranked rows with an inline bar (no background track). The value is always
// printed, so the bar reinforces it and colour never carries meaning alone.
function BarRows({
  rows,
  color,
}: {
  rows: { key: string; label: React.ReactNode; value: number; valueLabel: string; detail?: string }[];
  color: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ol className="space-y-3">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span className="min-w-0 leading-snug font-semibold">{r.label}</span>
            <span className="shrink-0 font-bold tabular-nums">{r.valueLabel}</span>
          </div>
          <div className="reveal-grow mt-1 h-1.5 rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: color }} />
          {r.detail && <p className="mt-1 text-xs text-muted">{r.detail}</p>}
        </li>
      ))}
    </ol>
  );
}

export function CityInsights({
  summary,
  auditReport,
  trend,
  intersections,
  fixes,
}: {
  summary: CitySummary["summary"];
  auditReport: CitySummary["audit_report"];
  trend: TrendMonth[];
  intersections: IntersectionListItem[];
  fixes: FixListItem[];
}) {
  const since = `January 2022 to ${monthYear(summary.period.split(" to ")[1])}`;
  const first = trend[0]?.month;
  const last = trend.at(-1)?.month;

  const walkBike = intersections
    .map((i) => ({ i, ped: i.pedestrian_crashes ?? 0, bike: i.bicycle_crashes ?? 0 }))
    .filter((x) => x.ped + x.bike > 0)
    .sort((a, b) => b.ped + b.bike - (a.ped + a.bike))
    .slice(0, 8);
  const fixGroups = groupByFix(fixes);

  const row = "reveal grid gap-x-12 gap-y-10 border-t border-line pt-8 lg:grid-cols-3";

  return (
    <div className="mx-auto max-w-6xl space-y-12 px-4 pt-10 pb-16 sm:px-6">
      <div className={row}>
        <Block
          title="Crashes per month"
          source={`Every dataGNV crash in the city, ${first && monthYear(`${first}-01`)} to ${
            last && monthYear(`${last}-01`)
          }. Crashes fell about 30% in 2020 and stayed lower, so rankings use 2022 onward.`}
          className="lg:col-span-2"
        >
          <CityTrend months={trend} />
        </Block>

        <Block title="At intersections" source={`dataGNV, ${since}`}>
          <p className="text-5xl leading-none font-extrabold tabular-nums">
            {summary.share_of_crashes_at_intersections_pct}%
          </p>
          <p className="mt-3 text-sm">
            of crashes citywide happened at an intersection: {num(summary.crashes_at_intersections_since_2022)}{" "}
            of {num(summary.crashes_citywide_since_2022)}.
          </p>
        </Block>
      </div>

      <div className={row}>
        <Block
          title="Where people walking or biking are hit most"
          source={`Crashes involving a pedestrian or bicycle, dataGNV, ${since}`}
          className="lg:col-span-2"
        >
          <BarRows
            color={FACTOR_GROUPS.vulnerable.color}
            rows={walkBike.map(({ i, ped, bike }) => ({
              key: i.id,
              label: (
                <Link
                  href={`/intersections/${i.id}`}
                  className="decoration-accent decoration-2 underline-offset-[3px] hover:underline"
                >
                  {displayName(i.name)}
                </Link>
              ),
              value: ped + bike,
              valueLabel: num(ped + bike),
              detail: `${num(ped)} pedestrian, ${num(bike)} bicycle`,
            }))}
          />
        </Block>

        <Block title="What the fix list asks for">
          <BarRows
            color="var(--ink-secondary)"
            rows={fixGroups.map((g) => ({
              key: g.fix,
              label: g.fix,
              value: g.perYear,
              valueLabel: `${num(g.perYear)} a year`,
              detail: `${g.count} ${g.count === 1 ? "intersection" : "intersections"}`,
            }))}
          />
          <Link href="/fix-list" className="road-link mt-5 inline-block text-sm font-semibold">
            See the fix list
          </Link>
        </Block>
      </div>

      {auditReport?.text && (
        <div className="reveal border-t border-line pt-8">
          <Block title="The audit in brief" source="Written by Gemini from the city figures on this page.">
            <p className="max-w-[70ch] text-base leading-relaxed">{auditReport.text}</p>
          </Block>
        </div>
      )}
    </div>
  );
}
