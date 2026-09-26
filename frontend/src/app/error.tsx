"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="p-6">
      <p className="font-medium">Couldn&apos;t load this page.</p>
      <p className="mt-1 text-sm opacity-70">
        The data service may be down or still starting.
      </p>
      <button onClick={reset} className="mt-3 rounded border px-3 py-1.5 text-sm">
        Try again
      </button>
    </div>
  );
}
