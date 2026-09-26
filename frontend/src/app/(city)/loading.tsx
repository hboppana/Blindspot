import { Bone, FigureStripSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col md:h-[calc(100vh-54px)]" aria-busy="true" aria-label="Loading the city map">
      <div className="px-4 pt-4 pb-3 sm:px-6">
        <FigureStripSkeleton />
      </div>
      <div className="flex gap-4 border-y border-line bg-surface px-4 py-2.5">
        <Bone className="h-7 w-40" />
        <Bone className="h-7 w-32" />
        <Bone className="h-7 w-36" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <Bone className="h-80 rounded-none md:h-auto md:flex-1" />
        <div className="space-y-3 bg-surface p-4 md:w-96 md:border-l md:border-line">
          {Array.from({ length: 8 }, (_, i) => (
            <Bone key={i} className="h-10" />
          ))}
        </div>
      </div>
    </div>
  );
}
