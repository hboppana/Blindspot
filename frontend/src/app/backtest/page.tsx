import Link from "next/link";
import { getBacktest } from "@/lib/api";
import { num } from "@/lib/format";

export default async function BacktestPage() {
  const b = await getBacktest();

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-[28px] leading-tight font-extrabold tracking-tight">
        Using only pre-2022 data, StreetSmart flagged {b.flagged_in_top_20} of
        today&apos;s top {b.top}
      </h1>
      <p className="mt-3 max-w-[65ch] text-[15px]">
        We rebuilt the ranking from 2015-2021 crashes alone, then looked up
        today&apos;s {b.top} worst intersections (crashes since 2022) in it.{" "}
        {b.flagged_in_top_10} were already in the pre-2022 top 10 and{" "}
        {b.flagged_in_top_50} in the top 50.
      </p>
      <p className="mt-2 max-w-[65ch] text-sm text-muted">
        What this shows: today&apos;s worst corners were already visible before
        2022. The ranking here is by crash count, so it shows hotspots persist;
        it doesn&apos;t test whether the contributing factors predict change.
      </p>

      <div className="mt-6 overflow-hidden rounded-md border border-line bg-surface">
      <table className="w-full text-sm">
        <thead className="border-b border-line bg-brand-soft text-left text-[13px] font-semibold whitespace-nowrap text-muted">
          <tr>
            <th className="py-2.5 pl-4">Rank now</th>
            <th>Intersection</th>
            <th className="text-right">Crashes since 2022</th>
            <th className="pr-4 text-right">Rank using 2015-2021 only</th>
          </tr>
        </thead>
        <tbody>
          {b.rows.map((r) => {
            const flagged = r.rank_before_2022 != null && r.rank_before_2022 <= b.top;
            return (
              <tr key={r.id} className="border-t border-line hover:bg-brand-soft">
                <td className="py-2.5 pl-4 font-bold tabular-nums">#{r.rank_now}</td>
                <td>
                  <Link href={`/intersections/${r.id}`} className="font-semibold decoration-accent decoration-2 underline-offset-[3px] hover:underline">
                    {r.name}
                  </Link>
                </td>
                <td className="text-right tabular-nums">{num(r.crashes_now)}</td>
                <td className="pr-4 text-right tabular-nums">
                  {r.rank_before_2022 ? `#${r.rank_before_2022}` : "not found"}{" "}
                  {flagged ? (
                    <span className="ml-1 rounded-full bg-good-soft px-2 py-0.5 text-xs font-semibold text-good-ink">
                      ✓ flagged
                    </span>
                  ) : (
                    <span className="ml-1 opacity-50">–</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <p className="mt-3 text-xs opacity-60">
        Source: dataGNV crashes. Intersections matched between the two rankings
        by location (within 40 m). Method: scripts/backtest.py.
      </p>
    </div>
  );
}
