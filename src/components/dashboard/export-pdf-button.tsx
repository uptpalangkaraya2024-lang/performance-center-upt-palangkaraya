"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

// Same idea as the Gangguan presentation view's own useLandscapePrint — a
// plain global @page rule in globals.css would apply everywhere it's
// loaded, so it's injected/removed here instead, scoped to this button's
// own mount lifetime (i.e. for as long as the page is open). Landscape
// prints a page's wide tables/charts without squeezing them into a
// portrait column; pass `landscape={false}` for a page that's genuinely
// narrow/text-heavy instead.
function useLandscapePrint(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const style = document.createElement("style");
    style.textContent = "@page { size: landscape; margin: 12mm; }";
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, [enabled]);
}

/** "Export PDF" reuses the browser's own print-to-PDF (window.print()) —
 *  the dashboard layout already hides the sidebar/header for every page via
 *  print:hidden (see src/app/dashboard/layout.tsx), so this needs no extra
 *  per-page print markup beyond the optional landscape orientation above.
 *  Drop this in next to ExportExcelButton (src/components/dashboard/
 *  export-excel-button.tsx) wherever that one already exists, so every
 *  page offering an Excel export offers a PDF one too. */
export function ExportPdfButton({ landscape = true }: { landscape?: boolean }) {
  useLandscapePrint(landscape);
  return (
    <Button variant="outline" size="sm" className="gap-1.5 bg-card" onClick={() => window.print()}>
      <Printer className="size-3.5" />
      Export PDF
    </Button>
  );
}
