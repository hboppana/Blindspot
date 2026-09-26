import { Bone } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6" aria-busy="true" aria-label="Loading the fix list">
      <Bone className="h-8 w-[36rem] max-w-full" />
      <Bone className="mt-3 h-4 w-96 max-w-full" />
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-3 rounded-md border border-line bg-surface p-5">
          {Array.from({ length: 6 }, (_, i) => (
            <Bone key={i} className="h-14" />
          ))}
        </div>
        <Bone className="h-64" />
      </div>
    </div>
  );
}
