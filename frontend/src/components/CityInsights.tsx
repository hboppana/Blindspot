import Link from "next/link";
import type { CitySummary, FixListItem, IntersectionListItem, TrendMonth } from "@/lib/types";
import { FACTOR_GROUPS, displayName, groupByFix, monthYear, num } from "@/lib/format";
import { CityTrend } from "./Charts";

// The sections below the map, for people who scroll: the citywide trend,
// where people walking or biking are hit, what the fix list asks for, and the
// written audit. Everything comes from data the page already loads.

function Section({
  title,
  note,
  children,
  className = "",
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-md border border-line bg-surface p-5 ${className}`}>
      <h2 className="text-lg font-extrabold tracking-tight">{title}</h2>
      {note && <p className="mt-0.5 text-sm text-muted">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

// A ranked list with an inline bar per row (no background track): values are
// always printed, so the bar only reinforces them and colour is never alone.
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
          <div
            className="mt-1 h-2 rounded-full"
            style={{ width: `${(r.value / max) * 100}%`, background: color }}
          />
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
  const periodEnd = monthYear(summary.period.split(" to ")[1]);
  const first = trend[0]?.month;
  const last = trend.at(-1)?.month;

  const walkBike = intersections
    .map((i) => ({ i, ped: i.pedestrian_crashes ?? 0, bike: i.bicycle_crashes ?? 0 }))
    .filter((x) => x.ped + x.bike > 0)
    .sort((a, b) => b.ped + b.bike - (a.ped + a.bike))
    .slice(0, 8);

  const fixGroups = groupByFix(fixes);

  return (
    <div className="mx-auto grid max-w-6xl gap-5 px-4 py-8 sm:px-6 lg:grid-cols-3">
      <Section
        title="Crashes per month"
        note={`Every dataGNV crash in the city, ${first && monthYear(`${first}-01`)} to ${
          last && monthYear(`${last}-01`)
        }`}
        className="lg:col-span-2"
      >
        <CityTrend months={trend} />
        <p className="mt-2 text-xs text-muted">
          Crashes fell about 30% in 2020 and stayed lower, so rankings use 2022 onward.
        </p>
      </Section>

      <Section title="Where crashes happen" note={`January 2022 to ${periodEnd}`}>
        <p className="text-[44px] leading-none font-extrabold tabular-nums">
          {summary.share_of_crashes_at_intersections_pct}%
        </p>
        <p className="mt-2 text-sm font-semibold">of crashes happen at intersections</p>
        <p className="mt-1 text-sm text-muted">
          {num(summary.crashes_at_intersections_since_2022)} of{" "}
          {num(summary.crashes_citywide_since_2022)} crashes citywide. That&apos;s why StreetSmart
          audits intersections first.
        </p>
      </Section>

      <Section
        title="Where people walking or biking are hit most"
        note={`Crashes involving a pedestrian or bicycle, January 2022 to ${periodEnd}`}
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
            detail: `${num(ped)} involved a pedestrian, ${num(bike)} a bicycle`,
          }))}
        />
      </Section>

      <Section title="What the fix list asks for" note="The top 10 intersections, grouped by recommended fix">
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
        <Link href="/fix-list" className="road-link mt-4 inline-block text-sm font-semibold">
          Open the fix list
        </Link>
      </Section>

      {auditReport?.text && (
        <Section title="The city audit in brief" className="lg:col-span-3">
          <p className="max-w-[75ch] leading-relaxed">{auditReport.text}</p>
          <p className="mt-3 text-xs text-muted">
            Written by Gemini from the computed city figures on this page.
          </p>
        </Section>
      )}
    </div>
  );
}
