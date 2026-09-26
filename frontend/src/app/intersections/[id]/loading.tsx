import { Bone, FigureStripSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-5 px-6 pt-5 pb-10" aria-busy="true" aria-label="Loading the case file">
      <Bone className="h-4 w-36" />
      <div className="space-y-3">
        <Bone className="h-6 w-56" />
        <Bone className="h-10 w-96 max-w-full" />
        <Bone className="h-5 w-[32rem] max-w-full" />
      </div>
      <FigureStripSkeleton />
      <div className="grid gap-4 md:grid-cols-2">
        <Bone className="h-64" />
        <Bone className="h-64" />
      </div>
    </div>
  );
}
