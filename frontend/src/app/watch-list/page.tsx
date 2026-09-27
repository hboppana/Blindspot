import { getIntersections, getWatchList } from "@/lib/api";
import { displayName, monthYear } from "@/lib/format";
import { gradeOf } from "@/lib/grade";
import { crashStory } from "@/lib/plain";
import { GradeChip } from "@/components/GradeChip";
import { CardLine, CrossLink, ListCard, ListHero, RankSign } from "@/components/ListParts";
import { NumberTicker } from "@/components/viz/NumberTicker";
import { YearTrend } from "@/components/viz/YearTrend";

// The Watch List: intersections whose crashes are climbing year after year.
// Not the worst in the city yet, which is the point: these are the ones to
// catch before they make the Red List. Same shape as the Red List, on amber.

const fmt = (v: number) => (v >= 10 ? String(Math.round(v)) : v.toFixed(1));

export default async function WatchListPage() {
  const [watch, intersections] = await Promise.all([getWatchList(), getIntersections()]);
  const byId = new Map(intersections.map((i) => [i.id, i]));
  const rows = watch.rows.map((r) => {
    const i = byId.get(r.id);
    const rise = r.per_year_now - r.per_year_before;
    const pct = r.per_year_before > 0 ? Math.round((rise / r.per_year_before) * 100) : null;
    return { ...r, i, rise, pct, grade: i ? gradeOf(i) : null };
  });
  const added = rows.reduce((n, r) => n + r.rise, 0);
  const halfOrMore = rows.filter((r) => r.pct != null && r.pct >= 50).length;
  const year = watch.through.slice(0, 4);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 pb-16 sm:px-6 md:pt-12">
      <ListHero
        title="The Watch List"
        lead="Intersections where crashes are climbing year after year. Not the worst yet, but heading that way: the ones to fix before they make the Red List."
        light="amber"
        stats={[
          { value: <NumberTicker value={rows.length} />, label: "intersections getting worse" },
          { value: <NumberTicker value={Math.round(added)} suffix="" />, label: "more crashes a year than in 2022-23", tone: "warn" },
          { value: <NumberTicker value={halfOrMore} />, label: "up by half or more" },
        ]}
      />

      <section className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <h2 className="text-2xl font-extrabold tracking-tight">Fastest climb first</h2>
          <p className="flex items-center gap-2 text-sm text-muted">
            <span
              className="h-3.5 w-4 rounded-sm border border-dashed border-[var(--series-2)]"
              style={{
                background:
                  "repeating-linear-gradient(135deg, color-mix(in oklab, var(--series-2) 35%, transparent) 0 3px, transparent 3px 7px)",
              }}
            />
            {year}* is on pace: crashes so far this year, projected to a full year
          </p>
        </div>

        <ol className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r, k) => {
            const wide = k === 0;
            const excess = r.i?.excess_per_year ?? null;
            const figures = (
              <>
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-muted tabular-nums">{fmt(r.per_year_before)}</span>
                  <span className="text-muted" aria-hidden>
                    →
                  </span>
                  <span className={`font-extrabold tracking-tight tabular-nums ${wide ? "text-6xl" : "text-4xl"}`}>
                    {fmt(r.per_year_now)}
                  </span>
                  <span className="text-muted">crashes a year</span>
                </p>
                {r.pct != null && (
                  <p className="mt-1 text-sm font-bold text-[var(--series-2)]">Up {r.pct}% since 2022-23</p>
                )}
                <div className="mt-4">
                  <YearTrend years={r.by_year} size={wide ? "lg" : "md"} />
                </div>
              </>
            );
            const story = (
              <dl className="space-y-3">
                <CardLine label="What keeps happening">{crashStory(r.i?.main_factor ?? null)}</CardLine>
                <CardLine label="Where it stands">
                  {excess != null && excess >= 1
                    ? `Already about ${Math.round(excess)} more crashes a year than an intersection with the same traffic.`
                    : "Still close to what an intersection with the same traffic sees, but climbing."}
                </CardLine>
                {r.i?.recommended_fix_name && (
                  <CardLine label="A fix that fits">{r.i.recommended_fix_name.replace(/\s*\(.*\)\s*$/, "")}</CardLine>
                )}
              </dl>
            );
            return (
              <ListCard key={r.id} href={`/intersections/${r.id}`} wide={wide} i={k}>
                <div className="flex items-start gap-3">
                  <RankSign rank={r.rank} tone="orange" size={wide ? "lg" : "md"} />
                  <h3
                    className={`min-w-0 flex-1 leading-snug font-extrabold decoration-[var(--series-2)] decoration-2 underline-offset-4 group-hover:underline ${wide ? "self-center text-3xl" : "text-lg"}`}
                  >
                    {displayName(r.name)}
                  </h3>
                  <GradeChip grade={r.grade} size={wide ? "lg" : "md"} />
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

      <section className="mt-12 rounded-2xl border border-line bg-surface p-6">
        <h2 className="text-lg font-extrabold">How an intersection gets on this list</h2>
        <ul className="mt-3 grid gap-x-8 gap-y-2 text-sm text-muted sm:grid-cols-2">
          <li>
            <strong className="text-foreground">It&apos;s climbing:</strong> crashes in {Number(year) - 1} and this
            year&apos;s pace, against 2022 and 2023.
          </li>
          <li>
            <strong className="text-foreground">It&apos;s steady, not a blip:</strong> each year since is at least as
            bad as two years before.
          </li>
          <li>
            <strong className="text-foreground">It&apos;s real:</strong> at least 8 crashes a year lately, so a couple
            of bad weeks can&apos;t put it here.
          </li>
          <li>
            <strong className="text-foreground">It&apos;s not already on the Red List,</strong> which covers the worst
            ten today.
          </li>
        </ul>
        <p className="mt-4 text-xs text-muted">
          Crash data from dataGNV, January 2022 to {monthYear(watch.through)}.
        </p>
      </section>

      <CrossLink
        href="/fix-plan"
        question="What would fixing the worst of them take?"
        label="See the Fix Plan"
      />
    </div>
  );
}
