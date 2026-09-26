import Link from "next/link";
import { getCitySummary, getIntersections, getTrend } from "@/lib/api";
import { num } from "@/lib/format";
import { StatTile } from "@/components/StatTile";
import { CityView } from "@/components/CityView";
import { CityTrend } from "@/components/Charts";

export default async function CityPage() {
  const [city, intersections, trend] = await Promise.all([
    getCitySummary(),
    getIntersections(),
    getTrend(),
  ]);
  const s = city.summary;
  const first = trend[0]?.month;
  const last = trend.at(-1)?.month;

  return (
    <div className="flex h-[calc(100vh-49px)] flex-col">
      <section className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
        <StatTile
          value={num(s.intersections_investigated)}
          label="Intersections investigated"
          note="every corner with a crash history since 2015"
        />
        <StatTile
          value={num(s.with_repeat_crashes)}
          label="With repeat crashes"
          note="5+ crashes since 2022"
        />
        <StatTile
          value={num(s.with_clear_fixable_pattern)}
          label="With a clear fixable cause"
          note="crash type above similar corners + an FHWA fix"
        />
        <Link href="/fix-list" className="block">
          <StatTile
            value={num(s.fix_list_crashes_per_year)}
            label="Crashes a year at the top 10 →"
            note={`${num(s.fix_list_excess_crashes_per_year)} above similar corners`}
          />
        </Link>
      </section>

      <details className="px-4 pb-3">
        <summary className="cursor-pointer text-sm opacity-80">
          Citywide crashes per month, {first} to {last} (dataGNV)
        </summary>
        <CityTrend months={trend} />
      </details>

      <CityView
        intersections={intersections}
        apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY}
      />
    </div>
  );
}
