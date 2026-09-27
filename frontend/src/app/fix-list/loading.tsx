import { Bone } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 md:pt-12" aria-busy="true" aria-label="Loading the Wreck List">
      <div className="flex flex-wrap items-center justify-between gap-8">
        <div className="w-full max-w-lg min-w-0 space-y-4">
          <Bone className="h-14 w-[26rem] max-w-full" />
          <Bone className="h-5 w-[30rem] max-w-full" />
        </div>
        <Bone className="h-36 w-full max-w-80 rounded-2xl" />
      </div>
      <div className="mt-12 space-y-px overflow-hidden rounded-2xl border border-line">
        {Array.from({ length: 6 }, (_, i) => (
          <Bone key={i} className="h-[72px] rounded-none" />
        ))}
      </div>
    </div>
  );
}
