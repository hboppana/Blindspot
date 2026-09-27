import { Bone } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6" aria-busy="true" aria-label="Loading the report">
      <Bone className="h-4 w-24" />
      <div className="mt-5 flex items-center gap-5">
        <Bone className="size-16 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1 space-y-3">
          <Bone className="h-9 w-[28rem] max-w-full" />
          <Bone className="h-5 w-[36rem] max-w-full" />
        </div>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Bone className="h-48 rounded-2xl md:col-span-2" />
        <Bone className="h-48 rounded-2xl" />
        <Bone className="h-48 rounded-2xl" />
        <Bone className="h-52 rounded-2xl md:col-span-2" />
        <Bone className="h-52 rounded-2xl md:col-span-2" />
      </div>
    </div>
  );
}
