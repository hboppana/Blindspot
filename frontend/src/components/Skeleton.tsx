// Loading placeholders shaped like the page they stand in for. The pulse is
// skipped for people who prefer reduced motion.
export function Bone({ className = "" }: { className?: string }) {
  return <div className={`rounded-md bg-line/70 motion-safe:animate-pulse ${className}`} />;
}
