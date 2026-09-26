"use client";

// Mock mode has no PDF endpoint; the browser's print-to-PDF uses the print styles.
export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded border border-black/15 px-3 py-1.5 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/5"
    >
      Print report
    </button>
  );
}
