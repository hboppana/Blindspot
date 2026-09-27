"use client";

import { Printer } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

// Mock mode has no PDF endpoint; the browser's print-to-PDF uses the print styles.
export function PrintButton() {
  return (
    <Button variant="outline" size="sm" onClick={() => window.print()}>
      <Printer weight="bold" aria-hidden />
      Print Report
    </Button>
  );
}
