// Loading placeholders shaped like the page they stand in for. The pulse is
// skipped for people who prefer reduced motion.
export function Bone({ className = "" }: { className?: string }) {
  return <div className={`rounded-md bg-line/70 motion-safe:animate-pulse ${className}`} />;
}

export function FigureStripSkeleton() {
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-md border border-line bg-surface md:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="space-y-2 border-line p-4 md:border-l md:first:border-l-0">
          <Bone className="h-7 w-16" />
          <Bone className="h-4 w-32" />
          <Bone className="h-3 w-40" />
        </div>
      ))}
    </div>
  );
}
