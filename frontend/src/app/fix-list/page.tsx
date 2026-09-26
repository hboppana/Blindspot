import Link from "next/link";
import { getCitySummary, getFixList } from "@/lib/api";
import { monthYear, num } from "@/lib/format";

export default async function FixListPage() {
  const [{ summary: s }, fixes] = await Promise.all([
    getCitySummary(),
    getFixList(),
  ]);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-[28px] leading-tight font-extrabold tracking-tight">
        Fix these {fixes.length} intersections to address{" "}
        {num(s.fix_list_crashes_per_year)} crashes a year
      </h1>
      <p className="mt-2 max-w-[65ch] text-muted">
        {num(s.fix_list_excess_crashes_per_year)} a year above what similar
        corners have. Crashes a year are averaged from January 2022 to {monthYear(s.period.split(" to ")[1])}.
      </p>
      <p className="mt-2 text-sm">
        <Link href="/backtest" className="road-link font-semibold">
          Would we have caught these before 2022?
        </Link>
      </p>

      <div className="mt-6 overflow-hidden rounded-md border border-line bg-surface">
      <table className="w-full text-sm">
        <thead className="border-b border-line bg-brand-soft text-left text-[13px] font-semibold whitespace-nowrap text-muted">
          <tr>
            <th className="py-2.5 pl-4">Rank</th>
            <th className="px-3">Intersection</th>
            <th className="px-3 text-right">Crashes / yr</th>
            <th className="px-3 text-right">Excess / yr</th>
            <th className="pl-6 pr-4">Recommended fix</th>
          </tr>
        </thead>
        <tbody>
          {fixes.map((f) => (
            <tr key={f.id} className="border-t border-line hover:bg-brand-soft">
              <td className="py-2.5 pl-4">
                <span className="inline-grid h-6 w-6 place-items-center rounded bg-brand text-xs font-bold text-white tabular-nums">
                  {f.rank}
                </span>
              </td>
              <td className="px-3">
                <Link href={`/intersections/${f.id}`} className="font-semibold decoration-accent decoration-2 underline-offset-[3px] hover:underline">
                  {f.name}
                </Link>
              </td>
              <td className="px-3 text-right tabular-nums">{f.crashes_per_year}</td>
              <td className="px-3 text-right">
                <span className="font-semibold tabular-nums text-accent-ink">
                  +{f.excess_crashes_per_year}
                </span>
              </td>
              <td className={`pl-6 pr-4 ${f.recommended_fix.startsWith("review") ? "italic opacity-60" : ""}`}>
                {f.recommended_fix}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
