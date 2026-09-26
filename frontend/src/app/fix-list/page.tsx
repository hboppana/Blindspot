import Link from "next/link";
import { getCitySummary, getFixList } from "@/lib/api";
import { factorLabel, groupByFix, monthYear, num } from "@/lib/format";

// Each bar splits crashes a year into what a similar corner sees (grey) and
// the excess above it (lane yellow), so the reason a corner is on the list is
// visible at a glance. Values are always printed next to the bar.
const EXPECTED = "var(--baseline)";
const EXCESS = "var(--accent)";

export default async function FixListPage() {
  const [{ summary: s }, fixes] = await Promise.all([getCitySummary(), getFixList()]);
  const max = Math.max(...fixes.map((f) => f.crashes_per_year), 1);
  const groups = groupByFix(fixes);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="max-w-3xl">
        <h1 className="text-3xl leading-tight font-extrabold tracking-tight">
          Fix these {fixes.length} intersections to address {num(s.fix_list_crashes_per_year)} crashes a
          year
        </h1>
        <p className="mt-2 text-muted">
          {num(s.fix_list_excess_crashes_per_year)} of those are more than similar corners see. Averaged
          from January 2022 to {monthYear(s.period.split(" to ")[1])}.
        </p>
        <Link href="/backtest" className="road-link mt-3 inline-block text-sm font-semibold">
          Would we have caught these before 2022?
        </Link>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="rounded-md border border-line bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
            <h2 className="text-sm font-bold">Ranked by crashes above similar corners</h2>
            <ul className="flex gap-4 text-xs text-muted">
              <li className="flex items-center gap-1.5">
                <span className="h-2 w-3 rounded-full" style={{ background: EXPECTED }} />
                What a similar corner sees
              </li>
              <li className="flex items-center gap-1.5">
                <span className="h-2 w-3 rounded-full" style={{ background: EXCESS }} />
                Above similar corners
              </li>
            </ul>
          </div>

          <ol>
            {fixes.map((f, i) => {
              const expected = Math.max(f.crashes_per_year - f.excess_crashes_per_year, 0);
              const review = f.recommended_fix.startsWith("review needed");
              return (
                <li key={f.id} className="rise border-b border-line last:border-0" style={{ "--i": i } as React.CSSProperties}>
                  <Link
                    href={`/intersections/${f.id}`}
                    className="group grid grid-cols-[2rem_minmax(0,1fr)_auto] gap-x-4 px-5 py-4 transition-colors duration-150 hover:bg-brand-soft"
                  >
                    <span className="grid h-7 w-7 place-items-center rounded bg-brand text-sm font-bold text-white tabular-nums">
                      {f.rank}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-bold decoration-accent decoration-2 underline-offset-[3px] group-hover:underline">
                        {f.name}
                      </span>
                      <span className={`mt-0.5 block text-sm ${review ? "text-muted italic" : ""}`}>
                        {review ? "Needs an engineer's review: no single FHWA fix fits" : f.recommended_fix}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">
                        Most common crash: {factorLabel(f.main_factor).toLowerCase()}
                      </span>
                      <span
                        className="grow-x mt-2.5 flex h-2 gap-0.5"
                        style={{ width: `${(f.crashes_per_year / max) * 100}%`, "--i": i } as React.CSSProperties}
                        aria-hidden
                      >
                        <span className="rounded-l-full" style={{ flex: expected, background: EXPECTED }} />
                        <span className="rounded-r-full" style={{ flex: f.excess_crashes_per_year, background: EXCESS }} />
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-lg leading-tight font-extrabold tabular-nums">
                        {f.crashes_per_year}
                      </span>
                      <span className="block text-xs text-muted">a year</span>
                      <span className="mt-1 block text-xs font-semibold tabular-nums text-accent-ink">
                        +{f.excess_crashes_per_year} above
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>

        <aside style={{ "--i": 3 } as React.CSSProperties} className="rise self-start border-t border-line pt-5 lg:sticky lg:top-6 lg:border-t-0 lg:pt-0">
          <h2 className="text-xl font-extrabold tracking-tight">By recommended fix</h2>
          <ol className="mt-4 divide-y divide-line">
            {groups.map((g) => (
              <li key={g.fix} className="py-3 first:pt-0">
                <p className="text-sm leading-snug font-semibold">{g.fix}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {g.count} {g.count === 1 ? "intersection" : "intersections"},{" "}
                  <span className="font-semibold text-foreground">{num(g.perYear)} crashes a year</span>
                </p>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
