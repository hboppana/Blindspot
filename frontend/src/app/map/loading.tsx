import { Bone } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="relative h-[calc(100dvh-100px)] sm:h-[calc(100dvh-122px)] min-h-[480px]" aria-busy="true" aria-label="Loading the city map">
      <Bone className="absolute inset-0 rounded-none" />
      <Bone className="absolute top-4 left-4 h-11 w-64 rounded-full bg-surface" />
    </div>
  );
}
