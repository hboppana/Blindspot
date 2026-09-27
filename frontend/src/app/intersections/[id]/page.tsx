import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowBendUpLeft,
  ArrowLeft,
  ArrowRight,
  Car,
  Columns,
  DownloadSimple,
  Gauge,
  MapTrifold,
  PersonSimpleWalk,
  RoadHorizon,
  SealCheck,
  TrafficSignal,
} from "@phosphor-icons/react/ssr";
import { API_BASE_URL, getCitySummary, getIntersection, getIntersections } from "@/lib/api";
import type { IntersectionDetail, YesNo } from "@/lib/types";
import {
  capitalize,
  displayName,
  effectRange,
  factorLabel,
  hour12,
  medianPerYear,
  monthYear,
  num,
  titleCase,
  yearsIn,
} from "@/lib/format";
import { gradeOf } from "@/lib/grade";
import { GradeChip } from "@/components/GradeChip";
import { Button } from "@/components/ui/button";
import { CaseImagery } from "@/components/CaseImagery";
import { PrintButton } from "@/components/PrintButton";
import { CrashScale } from "@/components/viz/CrashScale";
import { NumberTicker } from "@/components/viz/NumberTicker";
import { TrafficLight, lightFor } from "@/components/viz/TrafficLight";

// One intersection's report as a dashboard: the verdict and a one-sentence
// summary on top, then every figure an auditor needs on one screen of cards,
// then the camera angles below. The model's full write-up stays at the end.

const EXTRA = "#c8102e";
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const COST_STEPS = ["low", "medium", "high"] as const;

// Source strings carry statistics in brackets ("(..., p = 2e-07)"); the page
// keeps the sentence and leaves the maths to the PDF.
const plain = (s: string) => capitalize(s.replace(/\s*\([^)]*\)/g, "").trim());
const effectText = (value: string, measure: string) =>
  `${value} ${plain(measure).replace(/^Reduction in /i, "fewer ")}`;
const perYearText = (v: number) => (v >= 10 ? String(Math.round(v)) : v.toFixed(1));
const listText = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

export default async function ReportPage(props: PageProps<"/intersections/[id]">) {
  const { id } = await props.params;
  const [x, city, all] = await Promise.all([getIntersection(id), getCitySummary(), getIntersections()]);
  if (!x) notFound();

  const years = yearsIn(city.summary.period);
  const periodEnd = city.summary.period.split(" to ")[1];
  const name = displayName(x.name);
  const grade = gradeOf(x);
  const cf = x.case_file;
  const text = cf?.case_file;
  const facts = cf?.facts ?? null;
  const profile = cf?.crash_profile ?? null;
  const described = x.has_gemini_description;
  const fix = described ? (x.countermeasures[0] ?? null) : null;
  const alsoFix = described ? x.countermeasures[1] : undefined;
  const fixCost = facts?.countermeasures.find((c) => c.id === fix?.id)?.cost;
  const distinctive = described ? (facts?.distinctive_crash_types ?? []) : [];
  const precedent = described ? facts?.gainesville_precedent : null;

  const perYear = x.crashes_since_2022 / years;
  const similarPerYear = x.predicted != null ? x.predicted / years : null;
  const median = medianPerYear(all, years);
  const times = similarPerYear ? perYear / similarPerYear : null;
  // The crash type can come from older records; only claim "most crashes here"
  // when there are enough recent crashes to back it.
  const mainType = x.main_factor && x.main_factor !== "other" && x.crashes_since_2022 >= 5 ? x.main_factor : null;
  const range = fix?.effects[0] ? effectRange(fix.effects[0].value) : null;
  const avoided = range ? [Math.round(perYear * range[0]), Math.round(perYear * range[1])] : null;
  const busiest = [...(facts?.busiest_hours ?? [])].map((h) => Number(h.slice(0, 2))).sort((a, b) => a - b);
  const byWeekday = profile ? WEEKDAYS.map((d) => ({ day: d, n: profile.by_weekday[d] ?? 0 })) : [];
  const worstDay = byWeekday.reduce((a, b) => (b.n > a.n ? b : a), { day: "", n: -1 });

  const summary = [
    grade && times
      ? `About ${perYearText(perYear)} crashes a year, ${times.toFixed(1)}× what a similar intersection sees.`
      : `${num(x.crashes_since_2022)} crashes since January 2022${grade ? "." : ", too few to compare with similar intersections."}`,
    mainType &&
      `Most are ${factorLabel(mainType).toLowerCase()} crashes${
        distinctive.length ? `; ${listText(distinctive.map((d) => d.type))} crashes stand out.` : "."
      }`,
    fix && `Suggested fix: ${plain(fix.name).toLowerCase()}.`,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <article className="mx-auto max-w-6xl px-4 pt-6 pb-16 sm:px-6 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/map" className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-foreground">
          <ArrowLeft weight="bold" aria-hidden />
          City Map
        </Link>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <a href="#camera">
              <MapTrifold weight="bold" aria-hidden />
              Camera Angles
            </a>
          </Button>
          {API_BASE_URL ? (
            <Button asChild variant="outline" size="sm">
              <a href={`/intersections/${x.id}/report`} target="_blank">
                <DownloadSimple weight="bold" aria-hidden />
                Download PDF
              </a>
            </Button>
          ) : (
            <PrintButton />
          )}
        </div>
      </div>

      {/* The verdict */}
      <header className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex items-center gap-3">
          <TrafficLight lit={lightFor(grade)} size="md" />
          <span className="pop" style={{ "--i": 1 } as React.CSSProperties}>
            <GradeChip grade={grade} size="hero" />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl">{name}</h1>
            {x.fix_list_rank && (
              <Link
                href="/red-list"
                className="rounded-full bg-accent-soft px-3 py-1 text-sm font-bold text-accent-ink"
              >
                #{x.fix_list_rank} on the Red List
              </Link>
            )}
          </div>
          <p className="mt-1.5 max-w-[80ch] text-muted">
            {grade ? <span className="font-bold text-foreground">Grade {grade}. </span> : null}
            {summary}
          </p>
        </div>
      </header>

      {described && x.confidence === "low" && facts && facts.confidence_reasons.length > 0 && (
        <p className="mt-4 rounded-xl bg-accent-soft px-4 py-2.5 text-sm text-accent-ink">
          <span className="font-bold">Read with care.</span> This pattern is less certain:{" "}
          {facts.confidence_reasons.join("; ")}.
        </p>
      )}

      {/* Everything on one screen of cards */}
      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Crashes a year against both references */}
        <Card title="Crashes a year" className="md:col-span-2" i={0}>
          <p className="flex items-baseline gap-3">
            <NumberTicker
              value={perYear >= 10 ? Math.round(perYear) : perYear}
              decimals={perYear >= 10 ? 0 : 1}
              className={`text-5xl leading-none font-extrabold tracking-tight ${grade === "F" || grade === "D" ? "text-danger-ink" : ""}`}
            />
            <span className="text-muted">
              {times ? (
                <>
                  <strong className="text-foreground">{times.toFixed(1)}×</strong> a similar intersection
                </>
              ) : (
                "not graded"
              )}
            </span>
          </p>
          {similarPerYear != null ? (
            <div className="mt-5">
              <CrashScale
                size="card"
                value={perYear}
                similar={similarPerYear}
                median={median}
                max={Math.max(perYear, similarPerYear) * 1.12}
              />
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted">
              Gainesville&apos;s median intersection has {median.toFixed(1)} a year. Too few crashes here to compare with
              similar intersections.
            </p>
          )}
        </Card>

        {/* Rate for the traffic it carries, or people on foot and bikes */}
        {x.crash_rate_vs_similar ? (
          <Card title="Crash rate for its traffic" i={1}>
            <NumberTicker
              value={x.crash_rate_vs_similar}
              decimals={1}
              suffix="×"
              className="text-5xl leading-none font-extrabold tracking-tight"
            />
            <p className="mt-2 text-sm text-muted">the median similar intersection, per car driving through</p>
            {facts?.crash_rate && (
              <p className="mt-auto pt-3 text-xs text-muted">
                {facts.crash_rate.per_million_entering_vehicles} vs {facts.crash_rate.similar_corners_median} crashes per
                million cars
              </p>
            )}
          </Card>
        ) : (
          <Card title="People walking or biking" i={1}>
            <NumberTicker
              value={(x.pedestrian_crashes ?? 0) + (x.bicycle_crashes ?? 0)}
              className="text-5xl leading-none font-extrabold tracking-tight"
            />
            <p className="mt-2 text-sm text-muted">crashes since 2022 involved someone walking or on a bike</p>
          </Card>
        )}

        {/* Total, by year */}
        <Card title="Since January 2022" i={2}>
          <NumberTicker value={x.crashes_since_2022} className="text-5xl leading-none font-extrabold tracking-tight" />
          <p className="mt-2 text-sm text-muted">crashes in total</p>
          {profile && (
            <>
              <YearBars byYear={profile.by_year} lastYear={periodEnd.slice(0, 4)} />
              <p className="mt-2 text-xs text-muted">
                {num(x.pedestrian_crashes ?? 0)} walking, {num(x.bicycle_crashes ?? 0)} on a bike,{" "}
                {profile.fatal_crashes ? `${profile.fatal_crashes} fatal` : "none fatal"}
              </p>
            </>
          )}
        </Card>

        {/* What stands out */}
        <Card title="What stands out" className="md:col-span-2" i={3}>
          {distinctive.length > 0 ? (
            <ul className="space-y-4">
              {distinctive.map((d) => (
                <TypeRow key={d.type} type={d.type} here={d.crashes} similar={d.expected_at_similar_corners} />
              ))}
            </ul>
          ) : (
            <p className="text-lg">
              {mainType
                ? `Mostly ${factorLabel(mainType).toLowerCase()} crashes, at about the usual share for an intersection like this.`
                : "No one kind of crash stands out here."}
            </p>
          )}
          {distinctive.length > 0 && (
            <p className="mt-auto pt-4 text-xs text-muted">
              Crash types from FDOT records, {distinctive[0].period?.replace(/\s*\(.*\)/, "") ?? "2015-2018"}, the latest
              years with that detail.
            </p>
          )}
        </Card>

        {/* When */}
        <Card title="When crashes happen" className="md:col-span-2" i={4}>
          {profile ? (
            <>
              <p className="text-lg">
                {busiest.length > 0 && (
                  <>
                    Busiest{" "}
                    <strong>
                      {hour12(busiest[0])} to {hour12((busiest[busiest.length - 1] + 1) % 24)}
                    </strong>
                  </>
                )}
                {worstDay.n > 0 && (
                  <>
                    {busiest.length > 0 ? ", worst on " : "Worst on "}
                    <strong>{worstDay.day}s</strong>
                  </>
                )}
                .
              </p>
              <HourStrip byHour={profile.by_hour} />
              <DayBars days={byWeekday} worst={worstDay.day} />
            </>
          ) : (
            <p className="text-muted">Not enough crashes to show a pattern by time or day.</p>
          )}
        </Card>

        {/* The fix */}
        <Card title="The fix" dark className="md:col-span-2" i={5}>
          {fix ? (
            <div className="grid gap-5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              <div>
                <p className="text-2xl leading-tight font-extrabold tracking-tight">{plain(fix.name)}</p>
                <ul className="mt-3 space-y-1.5">
                  {fix.effects.map((e) => (
                    <li key={e.measure} className="flex items-start gap-2 text-sm">
                      <SealCheck weight="fill" className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                      <span>
                        <strong>{effectText(e.value, e.measure)}</strong>
                        <span className="text-white/60"> where it&apos;s been tried</span>
                      </span>
                    </li>
                  ))}
                </ul>
                {fixCost && (
                  <p className="mt-4 flex items-center gap-2.5 text-sm">
                    <span className="text-white/60">Cost</span>
                    <span className="flex gap-1" aria-hidden>
                      {COST_STEPS.map((c, k) => (
                        <span
                          key={c}
                          className={`h-2 w-6 rounded-full ${k <= COST_STEPS.indexOf(fixCost) ? "bg-accent" : "bg-white/15"}`}
                        />
                      ))}
                    </span>
                    <strong>{capitalize(fixCost)}</strong>
                  </p>
                )}
                {fix.url && (
                  <a
                    href={fix.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline print:hidden"
                  >
                    How this fix works
                    <ArrowRight weight="bold" aria-hidden />
                  </a>
                )}
              </div>
              <div className="space-y-3">
                {avoided && avoided[1] > 0 && (
                  <div className="rounded-xl bg-white/[0.06] p-4 ring-1 ring-white/10">
                    <p className="text-3xl leading-none font-extrabold text-accent tabular-nums">
                      {avoided[0] === avoided[1] ? avoided[0] : `${avoided[0]} to ${avoided[1]}`}
                    </p>
                    <p className="mt-1.5 text-sm font-semibold">fewer crashes a year, if it works as well as elsewhere</p>
                  </div>
                )}
                {precedent && (
                  <p className="text-sm text-white/70">
                    <span className="font-bold text-[#5fd3a2]">Worked in Gainesville: </span>
                    {titleCase(precedent.intersection)}, {plain(precedent.effect).replace(/^A/, "a")}.
                  </p>
                )}
                {alsoFix && <p className="text-sm text-white/60">Also worth a look: {plain(alsoFix.name)}</p>}
              </div>
            </div>
          ) : (
            <p className="text-lg">
              {cf
                ? "No single fix fits. The crashes here are a mix of kinds, so this needs an engineer's eye."
                : "Not enough crashes to match a fix to a pattern."}
            </p>
          )}
        </Card>

        {/* The road */}
        <Card title="The intersection" className="md:col-span-2" i={6}>
          <FeatureGrid x={x} />
          <p className="mt-auto pt-3 text-xs text-muted">
            {x.has_imagery_labels && x.imagery_from
              ? `Read from imagery taken ${monthYear(`${x.imagery_from}-15`)} to ${monthYear(`${x.imagery_to}-15`)}. Speed, lanes and traffic from FDOT.`
              : "From OpenStreetMap and FDOT road records."}
          </p>
        </Card>
      </div>

      {/* Camera angles */}
      <section id="camera" className="mt-14 scroll-mt-10">
        <h2 className="text-2xl font-extrabold tracking-tight">Camera angles</h2>
        <p className="mt-1 text-muted">From above, and from the street. Turn the street view to look down each road.</p>
        <div className="mt-5 print:hidden">
          <CaseImagery apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY} lat={x.lat} lon={x.lon} name={name} />
        </div>
      </section>

      {(text?.audit_text || text?.factor_explanations?.length) && (
        <details className="group mt-10 rounded-2xl border border-line bg-surface">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-bold">
            Read the full write-up
            <ArrowRight weight="bold" className="transition-transform group-open:rotate-90" aria-hidden />
          </summary>
          <div className="max-w-[70ch] space-y-3 px-5 pb-5 text-sm leading-relaxed text-muted">
            {text?.audit_text && <p>{text.audit_text}</p>}
            {text?.factor_explanations?.map((e) => (
              <p key={e.factor}>
                <span className="font-semibold text-foreground">{capitalize(e.factor)}.</span> {e.explanation}
              </p>
            ))}
            <p className="text-xs">Written by Gemini from the numbers on this page.</p>
          </div>
        </details>
      )}

      <footer className="mt-10 border-t border-line pt-5 text-sm text-muted">
        Crashes since 2022 from dataGNV, through {monthYear(periodEnd)}. Crash types from FDOT. Fixes from the FHWA.
      </footer>
    </article>
  );
}

function Card({
  title,
  dark,
  className = "",
  i,
  children,
}: {
  title: string;
  dark?: boolean;
  className?: string;
  i: number;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rise flex flex-col rounded-2xl p-5 ${dark ? "bg-brand text-white ring-1 ring-line" : "border border-line bg-surface"} ${className}`}
      style={{ "--i": i + 2 } as React.CSSProperties}
    >
      <h2 className={`mb-3 text-sm font-bold ${dark ? "text-accent" : "text-muted"}`}>{title}</h2>
      {children}
    </section>
  );
}

// One crash type, here against a similar intersection, on its own small scale.
function TypeRow({ type, here, similar }: { type: string; here: number; similar: number }) {
  const max = Math.max(here, similar, 1);
  const times = similar > 0 ? here / similar : null;
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-bold">{capitalize(type)} crashes</span>
        <span className="text-sm">
          <strong className="tabular-nums">{here}</strong> <span className="text-muted">here vs</span>{" "}
          <strong className="tabular-nums">{Math.round(similar)}</strong>{" "}
          {times != null && times >= 1.1 && <span className="font-bold text-danger-ink">({times.toFixed(1)}×)</span>}
        </span>
      </div>
      <div className="mt-1.5 space-y-1" aria-hidden>
        <div className="reveal-grow h-2 rounded-full" style={{ width: `${(here / max) * 100}%`, background: EXTRA }} />
        <div className="reveal-grow h-2 rounded-full bg-[var(--baseline)]" style={{ width: `${(similar / max) * 100}%` }} />
      </div>
    </li>
  );
}

function YearBars({ byYear, lastYear }: { byYear: Record<string, number>; lastYear: string }) {
  const entries = Object.entries(byYear);
  const max = Math.max(...entries.map(([, n]) => n), 1);
  return (
    <div className="mt-auto pt-4">
      <div className="flex h-12 items-end gap-1.5" aria-hidden>
        {entries.map(([y, n]) => (
          <span
            key={y}
            className="flex-1 rounded-t-sm bg-[var(--series-1)]"
            style={{ height: `${(n / max) * 100}%`, opacity: y === lastYear ? 0.55 : 1 }}
            title={`${y}: ${n}`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>{entries[0]?.[0]}</span>
        <span>{lastYear} so far</span>
      </div>
    </div>
  );
}

// 24 hours as a strip: darker red, more crashes.
function HourStrip({ byHour }: { byHour: number[] }) {
  const max = Math.max(...byHour, 1);
  return (
    <div className="mt-4">
      <div className="grid grid-cols-[repeat(24,minmax(0,1fr))] gap-0.5" aria-hidden>
        {byHour.map((n, h) => (
          <span
            key={h}
            className="h-8 rounded-[3px]"
            style={{ background: EXTRA, opacity: 0.08 + 0.92 * (n / max) }}
            title={`${hour12(h)}: ${n}`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>Midnight</span>
        <span>6 AM</span>
        <span>Noon</span>
        <span>6 PM</span>
        <span>11 PM</span>
      </div>
    </div>
  );
}

function DayBars({ days, worst }: { days: { day: string; n: number }[]; worst: string }) {
  const max = Math.max(...days.map((d) => d.n), 1);
  return (
    <div className="mt-4 grid grid-cols-7 items-end gap-2" aria-hidden>
      {days.map((d) => (
        <div key={d.day} className="flex flex-col items-center gap-1">
          <span
            className={`w-full rounded-t-sm ${d.day === worst ? "" : "bg-[var(--baseline)]"}`}
            style={{ height: `${Math.max(4, (d.n / max) * 36)}px`, background: d.day === worst ? EXTRA : undefined }}
            title={`${d.day}: ${d.n}`}
          />
          <span className="text-[11px] text-muted">{d.day.slice(0, 3)}</span>
        </div>
      ))}
    </div>
  );
}

const yesNo = (v: YesNo) => (v === "yes" ? "Yes" : v === "no" ? "No" : null);

function FeatureGrid({ x }: { x: IntersectionDetail }) {
  const items = [
    { Icon: TrafficSignal, label: "Signal", value: yesNo(x.traffic_signal) },
    { Icon: PersonSimpleWalk, label: "Crosswalk", value: yesNo(x.crosswalk) },
    { Icon: ArrowBendUpLeft, label: "Left-turn lane", value: yesNo(x.left_turn_lane) },
    { Icon: Columns, label: "Median", value: yesNo(x.median) },
    { Icon: Gauge, label: "Speed limit", value: x.speed_limit ? `${x.speed_limit} mph` : null },
    { Icon: RoadHorizon, label: "Widest road", value: x.fdot_lanes_max ? `${x.fdot_lanes_max} lanes` : null },
    { Icon: Car, label: "Cars a day", value: x.daily_traffic_max ? num(x.daily_traffic_max) : null },
  ];
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
      {items.map(({ Icon, label, value }) => (
        <li key={label} className="flex items-center gap-2.5">
          <Icon size={20} weight="bold" className="shrink-0 text-muted" aria-hidden />
          <span className="min-w-0 leading-tight">
            <span className={`block font-bold ${value ? "" : "text-muted"}`}>{value ?? "Unknown"}</span>
            <span className="block text-xs text-muted">{label}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
