import Link from "next/link";
import { getCitySummary, getFixList } from "@/lib/api";
import { num } from "@/lib/format";

export default async function FixListPage() {
  const [{ summary: s }, fixes] = await Promise.all([
    getCitySummary(),
    getFixList(),
  ]);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-semibold">
        Fix these {fixes.length} intersections to address{" "}
        {num(s.fix_list_crashes_per_year)} crashes a year
      </h1>
      <p className="mt-1 opacity-70">
        {num(s.fix_list_excess_crashes_per_year)} a year above what similar
        corners have. Crashes a year averaged over {s.period}.
      </p>

      <table className="mt-6 w-full text-sm">
        <thead className="text-left opacity-60">
          <tr>
            <th className="py-2">Rank</th>
            <th>Intersection</th>
            <th className="text-right">Crashes / yr</th>
            <th className="text-right">Excess / yr</th>
            <th className="pl-6">Recommended fix</th>
          </tr>
        </thead>
        <tbody>
          {fixes.map((f) => (
            <tr key={f.id} className="border-t border-black/10 dark:border-white/15">
              <td className="py-2 tabular-nums">#{f.rank}</td>
              <td>
                <Link href={`/intersection/${f.id}`} className="underline">
                  {f.name}
                </Link>
              </td>
              <td className="text-right tabular-nums">{f.crashes_per_year}</td>
              <td className="text-right tabular-nums">
                {f.excess_crashes_per_year}
              </td>
              <td className="pl-6">{f.recommended_fix}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
