import { getCitySummary, getFixList, getIntersections, getTrend } from "@/lib/api";
import { monthYear, num } from "@/lib/format";
import { CityView } from "@/components/CityView";
import { FigureStrip } from "@/components/FigureStrip";
import { CityInsights } from "@/components/CityInsights";

export default async function CityPage() {
  const [city, intersections, trend, fixes] = await Promise.all([
    getCitySummary(),
    getIntersections(),
    getTrend(),
    getFixList(),
  ]);
  const s = city.summary;

  return (
    <>
    {/* The first screen is the map and ranked list; more city data follows below. */}
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
              note: `${num(s.fix_list_excess_crashes_per_year)} more than similar corners see`,
              emphasis: true,
              href: "/fix-list",
            },
          ]}
        />
      </section>


      <CityView
        intersections={intersections}
        apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY}
      />
    </div>

    <CityInsights
      summary={s}
      auditReport={city.audit_report}
      trend={trend}
      intersections={intersections}
      fixes={fixes}
    />
    </>
  );
}
