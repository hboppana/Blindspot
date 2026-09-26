import { getCitySummary, getIntersections, getTrend } from "@/lib/api";
import { monthYear, num } from "@/lib/format";
import { CityView } from "@/components/CityView";
import { FigureStrip } from "@/components/FigureStrip";
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
    <div className="flex flex-col md:h-[calc(100vh-54px)]">
      <section className="px-4 pt-4 pb-3 sm:px-6">
        <FigureStrip
          figures={[
            {
              value: num(s.intersections_investigated),
              label: "Intersections investigated",
              note: "every corner with a crash history since 2015",
            },
            {
              value: num(s.with_repeat_crashes),
              label: "With repeat crashes",
              note: `5+ crashes, January 2022 to ${monthYear(s.period.split(" to ")[1])}`,
            },
            {
              value: num(s.with_clear_fixable_pattern),
              label: "With a clear fixable cause",
              note: "crash type above similar corners, with an FHWA fix",
            },
            {
              value: num(s.fix_list_crashes_per_year),
              label: "Crashes a year at the top 10",
              note: `${num(s.fix_list_excess_crashes_per_year)} above similar corners. Open the fix list.`,
              emphasis: true,
              href: "/fix-list",
            },
          ]}
        />
      </section>

      <details className="group px-4 pb-3 sm:px-6">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
          <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 transition-transform group-open:rotate-90">
            <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
          <span className="road-link">
            <span className="group-open:hidden">Show</span>
            <span className="hidden group-open:inline">Hide</span> citywide crashes per month,{" "}
            {first && monthYear(`${first}-01`)} to {last && monthYear(`${last}-01`)}
          </span>
        </summary>
        <div className="mt-2 rounded-md border border-line bg-surface p-4">
          <CityTrend months={trend} />
        </div>
      </details>

      <CityView
        intersections={intersections}
        apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY}
      />
    </div>
  );
}
