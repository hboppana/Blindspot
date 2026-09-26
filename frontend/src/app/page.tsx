import Link from "next/link";
import { getCitySummary, getIntersections } from "@/lib/api";
import { displayName, factorLabel, num } from "@/lib/format";
import { StatTile } from "@/components/StatTile";

export default async function CityPage() {
  const [city, intersections] = await Promise.all([
    getCitySummary(),
    getIntersections(),
  ]);
  const s = city.summary;
  const ranked = [...intersections].sort((a, b) => a.rank - b.rank);

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

      <div className="flex min-h-0 flex-1">
        {/* TODO: Google Maps with clustered markers, colored by main factor */}
        <div className="flex flex-1 items-center justify-center bg-black/5 text-sm opacity-60 dark:bg-white/5">
          Map goes here ({num(intersections.length)} intersections)
        </div>

        <ol className="w-96 overflow-y-auto border-l border-black/10 dark:border-white/15">
          {ranked.map((i) => (
            <li key={i.id}>
              <Link
                href={`/intersection/${i.id}`}
                className="flex gap-3 border-b border-black/5 px-4 py-2 text-sm hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
              >
                <span className="w-10 tabular-nums opacity-60">#{i.rank}</span>
                <span className="flex-1">
                  <span className="block">{displayName(i.name)}</span>
                  <span className="text-xs opacity-60">
                    {factorLabel(i.main_factor)}
                    {i.confidence === "low" && " · low confidence"}
                  </span>
                </span>
                <span className="tabular-nums">{num(i.crashes_since_2022)}</span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
