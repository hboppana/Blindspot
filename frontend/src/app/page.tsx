import { getCitySummary, getIntersections } from "@/lib/api";
import { num } from "@/lib/format";
import { StatTile } from "@/components/StatTile";
import { CityView } from "@/components/CityView";

export default async function CityPage() {
  const [city, intersections] = await Promise.all([
    getCitySummary(),
    getIntersections(),
  ]);
  const s = city.summary;

  return (
    <div className="flex h-[calc(100vh-49px)] flex-col">
      <section className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
        <StatTile
          value={num(s.intersections_investigated)}
          label="intersections investigated"
          note="crash history since 2015"
        />
        <StatTile
          value={num(s.with_repeat_crashes)}
          label="with repeat crashes"
          note="5+ crashes since 2022"
        />
        <StatTile
          value={num(s.with_clear_fixable_pattern)}
          label="with a clear fixable cause"
        />
        <StatTile
          value={`${s.worst_crash_rate_times_similar_corners}×`}
          label={`crash rate at ${s.worst_intersection}`}
          note="vs. similar corners"
        />
      </section>
      <CityView
        intersections={intersections}
        apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
      />
    </div>
  );
}
