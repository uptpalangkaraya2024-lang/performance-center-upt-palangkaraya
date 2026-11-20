"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

// Every page prints A4 landscape by default (see the print block in
// globals.css); a narrow, text-heavy page passes `landscape={false}` and
// this switches it to portrait only while that page is open.
function usePortraitPrint(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const style = document.createElement("style");
    style.textContent = "@media print { @page { size: A4 portrait; } }";
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, [enabled]);
}

/** "Export PDF" reuses the browser's own print-to-PDF (window.print()).
 *  The shared print styles do the rest: the dashboard layout hides the
 *  sidebar/header, PageHero prints as a report header with the title and
 *  date, pages are numbered, dark mode prints white, scroll boxes and
 *  wide tables open up so nothing is cut, and the file name is pre-filled
 *  from the page title (PrintEnhancer). */
export function ExportPdfButton({ landscape = true }: { landscape?: boolean }) {
  usePortraitPrint(!landscape);
  return (
    <Button variant="outline" size="sm" className="gap-1.5 bg-card" onClick={() => window.print()}>
      <Printer className="size-3.5" />
      Export PDF
    </Button>
  );
}
