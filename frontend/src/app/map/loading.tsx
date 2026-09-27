import { Bone } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="map-frame relative" aria-busy="true" aria-label="Loading the city map">
      <Bone className="absolute inset-0 rounded-none" />
      <Bone className="absolute top-4 left-4 h-11 w-64 rounded-full bg-surface" />
    </div>
  );
}
