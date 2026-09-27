// Loading placeholders shaped like the page they stand in for. The pulse is
// skipped for people who prefer reduced motion.
export function Bone({ className = "" }: { className?: string }) {
  return <div className={`rounded-md bg-line/70 motion-safe:animate-pulse ${className}`} />;
}

// The Red List and Watch List: hero with the signal, then a wide first card
// and a grid of cards.
export function ListSkeleton({ label }: { label: string }) {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6 md:pt-12" aria-busy="true" aria-label={label}>
      <div className="flex flex-wrap items-center justify-between gap-8">
        <div className="w-full max-w-lg min-w-0 space-y-4">
          <Bone className="h-14 w-[24rem] max-w-full" />
          <Bone className="h-5 w-[30rem] max-w-full" />
        </div>
        <Bone className="h-36 w-full max-w-80 rounded-2xl" />
      </div>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Bone className="h-64 rounded-2xl sm:col-span-2 lg:col-span-3" />
        {Array.from({ length: 3 }, (_, i) => (
          <Bone key={i} className="h-80 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
