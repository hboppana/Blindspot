import Link from "next/link";
import { getBacktest } from "@/lib/api";
import { num } from "@/lib/format";

export default async function BacktestPage() {
  const b = await getBacktest();

  return (
    <div className="mx-auto max-w-4xl p-6">
      <p className="text-sm opacity-60">Backtest</p>
      <h1 className="mt-1 text-2xl font-semibold">
        Using only pre-2022 data, StreetSmart flagged {b.flagged_in_top_20} of
        today&apos;s top {b.top}
      </h1>
      <p className="mt-2 max-w-3xl opacity-70">
        We rebuilt the ranking from 2015-2021 crashes alone, then looked up
        today&apos;s {b.top} worst intersections (crashes since 2022) in it.{" "}
        {b.flagged_in_top_10} were already in the pre-2022 top 10 and{" "}
        {b.flagged_in_top_50} in the top 50.
      </p>
      <p className="mt-2 max-w-3xl text-sm opacity-60">
        What this shows: today&apos;s worst corners were already visible before
        2022. The ranking here is by crash count, so it shows hotspots persist;
        it doesn&apos;t test whether the contributing factors predict change.
      </p>

      <table className="mt-6 w-full text-sm">
        <thead className="text-left opacity-60">
          <tr>
            <th className="py-2">Rank now</th>
            <th>Intersection</th>
            <th className="text-right">Crashes since 2022</th>
            <th className="text-right">Rank using 2015-2021 only</th>
          </tr>
        </thead>
        <tbody>
          {b.rows.map((r) => {
            const flagged = r.rank_before_2022 != null && r.rank_before_2022 <= b.top;
            return (
              <tr key={r.id} className="border-t border-black/10 dark:border-white/15">
                <td className="py-2 tabular-nums">#{r.rank_now}</td>
                <td>
                  <Link href={`/intersections/${r.id}`} className="underline">
                    {r.name}
                  </Link>
                </td>
                <td className="text-right tabular-nums">{num(r.crashes_now)}</td>
                <td className="text-right tabular-nums">
                  {r.rank_before_2022 ? `#${r.rank_before_2022}` : "not found"}{" "}
                  <span className={flagged ? "" : "opacity-50"}>
                    {flagged ? "✓ flagged" : "–"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-xs opacity-60">
        Source: dataGNV crashes. Intersections matched between the two rankings
        by location (within 40 m). Method: scripts/backtest.py.
      </p>
    </div>
  );
}
