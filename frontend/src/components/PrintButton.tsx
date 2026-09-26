"use client";

// Mock mode has no PDF endpoint; the browser's print-to-PDF uses the print styles.
export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-hover active:translate-y-px"
    >
      Print report
    </button>
  );
}
