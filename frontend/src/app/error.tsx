"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="p-6">
      <p className="font-medium">Couldn&apos;t load this page.</p>
      <p className="mt-1 text-sm opacity-70">
        The data service may be down or still starting.
      </p>
      <button onClick={reset} className="mt-3 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover active:translate-y-px">
        Try again
      </button>
    </div>
  );
}
