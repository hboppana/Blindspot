import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/ssr";
import { getCitySummary, getFixList, getIntersections } from "@/lib/api";
import type { FixListItem } from "@/lib/types";
import { displayName, groupByFix, medianPerYear, monthYear, num, yearsIn } from "@/lib/format";
import { crashStory, fixStory, shortFixName } from "@/lib/plain";
import { GradeChip } from "@/components/GradeChip";
import { CardLine, CrossLink, ListCard, ListHero, RankSign } from "@/components/ListParts";
import { CrashScale } from "@/components/viz/CrashScale";
import { NumberTicker } from "@/components/viz/NumberTicker";

// The Red List: the ten intersections with the most crashes beyond what an
// intersection with the same traffic and layout sees. The signal and three
// figures say how bad; one card each says where, how much, what keeps
// happening and what fixes it; the fixes close it, drawn as guide signs.

const REVIEW = "Needs an engineer's review";
const reviewNeeded = (f: FixListItem) => f.recommended_fix.startsWith("review needed");
const similarPerYear = (f: FixListItem) => Math.max(f.crashes_per_year - f.excess_crashes_per_year, 0);
const stagger = (i: number) => ({ "--i": i }) as React.CSSProperties;

export default async function RedListPage() {
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
      <ListHero
        title="The Red List"
        lead={`Gainesville's ${fixes.length} most dangerous intersections: the ones that crash far more than intersections with the same traffic and layout. Fix these first.`}
        light="red"
        stats={[
          { value: <NumberTicker value={s.fix_list_crashes_per_year} />, label: "crashes a year, together" },
          {
            value: <NumberTicker value={s.fix_list_excess_crashes_per_year} />,
            label: "more than similar intersections",
            tone: "danger",
          },
          { value: <GradeChip grade="F" size="lg" />, label: `all ${fixes.length} graded F` },
        ]}
      />

      <section className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <h2 className="text-2xl font-extrabold tracking-tight">Worst first</h2>
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted">
            <li className="flex items-center gap-2">
              <span className="size-3.5 rounded-full bg-[#c8102e]" />
              This intersection
            </li>
            <li className="flex items-center gap-2">
              <span className="size-3.5 rounded-full border-2 border-muted" />
              Same traffic and layout
            </li>
            <li className="flex items-center gap-2">
              <span className="h-3.5 w-0.5 rounded-full bg-muted" />
              Gainesville&apos;s median ({median.toFixed(1)})
            </li>
          </ul>
        </div>

        <ol className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {fixes.map((f, i) => {
            const similar = similarPerYear(f);
            const times = similar > 0 ? f.crashes_per_year / similar : null;
            const wide = i === 0;
            const figures = (
              <>
                <p className="flex items-baseline gap-2">
                  <span className={`font-extrabold tracking-tight tabular-nums ${wide ? "text-6xl" : "text-4xl"}`}>
                    {f.crashes_per_year}
                  </span>
                  <span className="text-muted">crashes a year</span>
                </p>
                {times && (
                  <p className="mt-1 text-sm font-semibold text-danger-ink">
                    {times.toFixed(1)}× an intersection with the same traffic ({Math.round(similar)})
                  </p>
                )}
                <div className="mt-4">
                  <CrashScale
                    value={f.crashes_per_year}
                    similar={similar}
                    median={median}
                    max={max}
                    size={wide ? "card" : "row"}
                  />
                </div>
              </>
            );
            const story = (
              <dl className="space-y-3">
                <CardLine label="What keeps happening">{crashStory(f.main_factor)}</CardLine>
                <CardLine label={`The fix: ${shortFixName(f.recommended_fix)}`}>
                  <span className={reviewNeeded(f) ? "italic" : ""}>{fixStory(f.recommended_fix)}</span>
                </CardLine>
              </dl>
            );
            return (
              <ListCard key={f.id} href={`/intersections/${f.id}`} wide={wide} i={i}>
                <div className="flex items-start gap-3">
                  <RankSign rank={f.rank} size={wide ? "lg" : "md"} />
                  <h3
                    className={`min-w-0 flex-1 leading-snug font-extrabold decoration-accent decoration-2 underline-offset-4 group-hover:underline ${wide ? "self-center text-3xl" : "text-lg"}`}
                  >
                    {displayName(f.name)}
                  </h3>
                  <GradeChip grade="F" size={wide ? "lg" : "md"} />
                </div>
                {wide ? (
                  <div className="mt-6 grid gap-8 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                    <div>{figures}</div>
                    {story}
                  </div>
                ) : (
                  <>
                    <div className="mt-4">{figures}</div>
                    <div className="mt-5 border-t border-dashed border-line pt-4">{story}</div>
                  </>
                )}
              </ListCard>
            );
          })}
        </ol>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-extrabold tracking-tight">
          {provenFixes.length} proven {provenFixes.length === 1 ? "fix covers" : "fixes cover"}{" "}
          {covered === fixes.length ? `all ${fixes.length}` : `${covered} of the ${fixes.length}`}
        </h2>
        <p className="mt-1 text-muted">
          Each is on the federal list of proven safety fixes, matched to the crash that keeps happening there.
        </p>
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
                  <p className="leading-snug font-bold">{shortFixName(g.fix)}</p>
                  <p className="mt-1 text-sm text-white/80">{fixStory(g.fix)}</p>
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

      <CrossLink
        href="/watch-list"
        question="Which intersections are getting worse, before they make this list?"
        label="See the Watch List"
      />

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6 text-sm text-muted">
        <p>Crashes averaged from January 2022 to {through}. Crash data from dataGNV.</p>
        <Link href="/backtest" className="inline-flex items-center gap-1.5 font-semibold text-foreground hover:underline">
          Would we have caught these before 2022? How We Tested This
          <ArrowRight weight="bold" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
