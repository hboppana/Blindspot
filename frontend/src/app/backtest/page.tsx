import Link from "next/link";
import { getBacktest } from "@/lib/api";
import { num } from "@/lib/format";

export default async function BacktestPage() {
  const b = await getBacktest();
  const flagged = (rank: number | null) => rank != null && rank <= b.top;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="max-w-3xl">
        <h1 className="text-[28px] leading-tight font-extrabold tracking-tight">
          Using only pre-2022 data, StreetSmart flagged {b.flagged_in_top_20} of today&apos;s top {b.top}
        </h1>
        <p className="mt-2 max-w-[65ch] text-[15px]">
          We rebuilt the ranking from 2015 to 2021 crashes alone, then looked up today&apos;s {b.top} worst
          intersections in it. {b.flagged_in_top_10} were already in its top 10, and{" "}
          {b.flagged_in_top_50} in its top 50.
        </p>
      </header>

      {/* The claim as a picture: one tile per intersection in today's top 20. */}
      <section className="mt-8 rounded-md border border-line bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-extrabold tracking-tight">Today&apos;s top {b.top}</h2>
          <ul className="flex gap-4 text-xs text-muted">
            <li className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-foreground" />
              In the 2015 to 2021 top {b.top}
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm border border-dashed border-muted" />
              Not in it
            </li>
          </ul>
        </div>
        <ol className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-10">
          {b.rows.map((r) => {
            const hit = flagged(r.rank_before_2022);
            return (
              <li key={r.id}>
                <Link
                  href={`/intersections/${r.id}`}
                  title={`${r.name}: #${r.rank_now} now, ${
                    r.rank_before_2022 ? `#${r.rank_before_2022}` : "not ranked"
                  } using 2015 to 2021 data`}
                  className={`flex aspect-square flex-col items-center justify-center rounded-md text-center transition-transform active:translate-y-px ${
                    hit
                      ? "bg-foreground text-background hover:opacity-90"
                      : "border border-dashed border-muted text-muted hover:bg-brand-soft"
                  }`}
                >
                  <span className="text-lg leading-none font-extrabold tabular-nums">{r.rank_now}</span>
                  <span className={`mt-1 text-[11px] tabular-nums ${hit ? "text-accent dark:text-background/70" : ""}`}>
                    {r.rank_before_2022 ? `was #${r.rank_before_2022}` : "unranked"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
        <p className="mt-4 max-w-[70ch] text-sm text-muted">
          What this shows: today&apos;s worst corners were already visible before 2022. The ranking here
          is by crash count, so it shows hotspots persist; it doesn&apos;t test whether the contributing
          factors predict change.
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-extrabold tracking-tight">All {b.top}, in detail</h2>
        <div className="mt-3 overflow-hidden rounded-md border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line bg-brand-soft text-left text-[13px] font-semibold whitespace-nowrap text-muted">
              <tr>
                <th className="py-2.5 pl-4">Rank now</th>
                <th className="px-3">Intersection</th>
                <th className="px-3 text-right">Crashes since 2022</th>
                <th className="pr-4 text-right">Rank using 2015 to 2021</th>
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r) => (
                <tr key={r.id} className="border-t border-line hover:bg-brand-soft">
                  <td className="py-2.5 pl-4 font-bold tabular-nums">#{r.rank_now}</td>
                  <td className="px-3">
                    <Link
                      href={`/intersections/${r.id}`}
                      className="font-semibold decoration-accent decoration-2 underline-offset-[3px] hover:underline"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-3 text-right tabular-nums">{num(r.crashes_now)}</td>
                  <td className="pr-4 text-right tabular-nums">
                    {r.rank_before_2022 ? `#${r.rank_before_2022}` : "not ranked"}{" "}
                    {flagged(r.rank_before_2022) ? (
                      <span className="ml-1 rounded bg-good-soft px-2 py-0.5 text-xs font-semibold text-good-ink">
                        flagged
                      </span>
                    ) : (
                      <span className="ml-1 text-xs text-muted">outside the top {b.top}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">
          Source: dataGNV crashes. Intersections matched between the two rankings by location (within 40
          m). Method: scripts/backtest.py.
        </p>
      </section>
    </div>
  );
}
