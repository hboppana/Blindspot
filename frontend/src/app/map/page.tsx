import { getIntersections } from "@/lib/api";
import { CityView } from "@/components/CityView";

// The map fills everything under the header; all controls float over it.
export default async function MapPage() {
  const intersections = await getIntersections();
  return (
    <div className="relative h-[calc(100dvh-100px)] sm:h-[calc(100dvh-122px)] min-h-[480px] overflow-hidden">
      <CityView
        intersections={intersections}
        apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY}
      />
    </div>
  );
}
