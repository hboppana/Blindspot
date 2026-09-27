import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/ssr";
import { getCitySummary, getFixList, getIntersections } from "@/lib/api";
import type { FixListItem } from "@/lib/types";
import { displayName, factorLabel, groupByFix, medianPerYear, monthYear, num, yearsIn } from "@/lib/format";
import { GradeChip } from "@/components/GradeChip";
import { CrashScale } from "@/components/viz/CrashScale";
import { NumberTicker } from "@/components/viz/NumberTicker";
import { TrafficLight } from "@/components/viz/TrafficLight";

// The Wreck List: the ten intersections with the most crashes beyond what a
// similar intersection sees. One screen says how bad (the signal and three
// figures); one ranked list says who and by how much (each row on the same
// crash scale); the fixes close it, drawn as highway guide signs.

const REVIEW = "Needs an engineer's review";
const reviewNeeded = (f: FixListItem) => f.recommended_fix.startsWith("review needed");
const fixText = (f: FixListItem) => (reviewNeeded(f) ? REVIEW : f.recommended_fix);
const similarPerYear = (f: FixListItem) => Math.max(f.crashes_per_year - f.excess_crashes_per_year, 0);
const stagger = (i: number) => ({ "--i": i }) as React.CSSProperties;

export default async function WreckListPage() {
  const [{ summary: s }, fixes, intersections] = await Promise.all([
    getCitySummary(),
    getFixList(),
    getIntersections(),
  ]);
  const median = medianPerYear(intersections, yearsIn(s.period));
  const max = Math.max(...fixes.map((f) => f.crashes_per_year), 1) * 1.04;
  const groups = groupByFix(fixes);
  const provenFixes = groups.filter((g) => g.fix !== REVIEW);
  const covered = fixes.filter((f) => !reviewNeeded(f)).length;
  const through = monthYear(s.period.split(" to ")[1]);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 pb-16 sm:px-6 md:pt-12">
      {/* How bad */}
      <section className="grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <h1 className="rise text-5xl leading-none font-extrabold tracking-tight sm:text-6xl" style={stagger(0)}>
            The Wreck List
          </h1>
          <p className="rise mt-4 max-w-[50ch] text-lg text-muted" style={stagger(1)}>
            The {fixes.length} Gainesville intersections with the most crashes beyond what they should have. Fixing
            these first does the most good.
          </p>
        </div>
        <div className="rise flex items-center gap-6" style={stagger(2)}>
          <TrafficLight lit="red" size="lg" />
          <dl className="grid gap-3">
            <div className="flex items-baseline gap-3">
              <dt className="sr-only">Crashes a year at these intersections</dt>
              <dd className="w-20 text-right text-3xl font-extrabold">
                <NumberTicker value={s.fix_list_crashes_per_year} />
              </dd>
              <dd className="text-muted">crashes a year, together</dd>
            </div>
            <div className="flex items-baseline gap-3">
              <dt className="sr-only">Crashes above what similar intersections see</dt>
              <dd className="w-20 text-right text-3xl font-extrabold text-danger-ink">
                <NumberTicker value={s.fix_list_excess_crashes_per_year} />
              </dd>
              <dd className="text-muted">more than similar intersections</dd>
            </div>
            <div className="flex items-center gap-3">
              <dt className="sr-only">Grade</dt>
              <dd className="flex w-20 justify-end">
                <GradeChip grade="F" size="lg" />
              </dd>
              <dd className="text-muted">all {fixes.length} graded F</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Who, and by how much */}
      <section className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <h2 className="text-2xl font-extrabold tracking-tight">Crashes a year, worst first</h2>
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted">
            <li className="flex items-center gap-2">
              <span className="size-3.5 rounded-full bg-[#c8102e]" />
              This intersection
            </li>
            <li className="flex items-center gap-2">
              <span className="size-3.5 rounded-full border-2 border-muted" />
              A similar intersection
            </li>
            <li className="flex items-center gap-2">
              <span className="h-3.5 w-0.5 rounded-full bg-muted" />
              Gainesville&apos;s median intersection ({median.toFixed(1)})
            </li>
          </ul>
        </div>

        <ol className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface">
          {fixes.map((f, i) => {
            const similar = similarPerYear(f);
            const times = similar > 0 ? f.crashes_per_year / similar : null;
            return (
              <li key={f.id} className="reveal border-line not-first:border-t not-first:border-dashed" style={stagger(i)}>
                <Link
                  href={`/intersections/${f.id}`}
                  className="group grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-brand-soft md:grid-cols-[2.75rem_minmax(0,17rem)_minmax(0,1fr)_7.5rem] md:gap-x-6 md:px-5"
                >
                  <RankSign rank={f.rank} />
                  <span className="min-w-0">
                    <span className="block truncate font-bold decoration-accent decoration-2 underline-offset-4 group-hover:underline">
                      {displayName(f.name)}
                    </span>
                    <span className="block truncate text-sm text-muted">
                      Mostly {factorLabel(f.main_factor).toLowerCase()} crashes. Fix:{" "}
                      <span className={reviewNeeded(f) ? "italic" : "text-foreground"}>{fixText(f)}</span>
                    </span>
                  </span>
                  {/* On phones the scale drops to its own row under the name. */}
                  <span className="col-span-3 row-start-2 md:col-span-1 md:col-start-3 md:row-start-1">
                    <CrashScale value={f.crashes_per_year} similar={similar} median={median} max={max} />
                  </span>
                  <span className="text-right leading-tight">
                    <span className="block text-lg font-extrabold tabular-nums">{f.crashes_per_year} a year</span>
                    {times && (
                      <span className="block text-sm font-semibold text-danger-ink">{times.toFixed(1)}× similar</span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      {/* What fixing them takes */}
      <section className="mt-12">
        <h2 className="text-2xl font-extrabold tracking-tight">
          {provenFixes.length} proven {provenFixes.length === 1 ? "fix covers" : "fixes cover"}{" "}
          {covered === fixes.length ? `all ${fixes.length}` : `${covered} of the ${fixes.length}`}
        </h2>
        <p className="mt-1 text-muted">Each is matched to the kind of crash that keeps happening there.</p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {groups.map((g, i) =>
            g.fix === REVIEW ? (
              <li key={g.fix} className="reveal rounded-xl border border-dashed border-line p-1.5" style={stagger(i)}>
                <div className="h-full rounded-lg p-4">
                  <p className="font-bold">{g.fix}</p>
                  <p className="mt-3 text-sm text-muted">
                    {g.count} {g.count === 1 ? "intersection" : "intersections"} where no single fix fits,{" "}
                    {num(g.perYear)} crashes a year
                  </p>
                </div>
              </li>
            ) : (
              // Drawn like a highway guide sign: green panel, white inset border.
              <li key={g.fix} className="reveal rounded-xl bg-[#00613a] p-1.5 text-white" style={stagger(i)}>
                <div className="flex h-full flex-col rounded-lg border-2 border-white/85 p-4">
                  <p className="leading-snug font-bold">{g.fix}</p>
                  <p className="mt-auto pt-3 text-sm text-white/80">
                    <span className="text-xl font-extrabold text-white tabular-nums">{g.count}</span>{" "}
                    {g.count === 1 ? "intersection" : "intersections"}, {num(g.perYear)} crashes a year
                  </p>
                </div>
              </li>
            ),
          )}
        </ul>
      </section>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6 text-sm text-muted">
        <p>Crashes averaged from January 2022 to {through}. Crash data from dataGNV.</p>
        <Link href="/backtest" className="inline-flex items-center gap-1.5 font-semibold text-foreground hover:underline">
          Would we have caught these before 2022? How We Tested This
          <ArrowRight weight="bold" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

// The rank on a yellow diamond warning sign.
function RankSign({ rank }: { rank: number }) {
  return (
    <span className="relative grid size-11 place-items-center" aria-label={`Rank ${rank}`}>
      <span className="absolute inset-[6px] rotate-45 rounded-[5px] bg-accent ring-2 ring-[#1f2226] ring-inset" />
      <span className="relative text-sm font-extrabold text-[#1f2226] tabular-nums">{rank}</span>
    </span>
  );
}
