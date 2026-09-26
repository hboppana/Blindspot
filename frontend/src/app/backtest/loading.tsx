import { Bone } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6" aria-busy="true" aria-label="Loading the backtest">
      <Bone className="h-8 w-[36rem] max-w-full" />
      <Bone className="mt-3 h-4 w-96 max-w-full" />
      <div className="mt-8 grid grid-cols-5 gap-2 rounded-md border border-line bg-surface p-5 sm:grid-cols-10">
        {Array.from({ length: 20 }, (_, i) => (
          <Bone key={i} className="aspect-square" />
        ))}
      </div>
    </div>
  );
}
