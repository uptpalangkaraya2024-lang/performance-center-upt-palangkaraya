"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ExportExcelButton, type ExcelSheetSpec } from "@/components/dashboard/export-excel-button";

// Same idea as the Gangguan presentation view's own useLandscapePrint — a
// plain global @page rule in globals.css would apply everywhere it's
// loaded, so it's injected/removed here instead, scoped to this toolbar's
// own mount lifetime (i.e. for as long as the Overview page is open).
// Landscape prints this page's wide sections (Pareto chart, GI correlation
// table, performance status banners) without them being squeezed into a
// portrait column.
function useLandscapePrint() {
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = "@page { size: landscape; margin: 12mm; }";
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);
}

/** "Export PDF" reuses the browser's own print-to-PDF (window.print()) —
 *  the dashboard layout already hides the sidebar/header via print:hidden
 *  (see src/app/dashboard/layout.tsx), so this needs no special per-page
 *  print markup beyond the landscape orientation above. "Export Excel"
 *  reuses the existing ExportExcelButton (src/components/dashboard/
 *  export-excel-button.tsx), fed whatever KPI rows the Overview page itself
 *  already fetched — no separate export-only data fetch. */
export function OverviewExportToolbar({ sheets }: { sheets: ExcelSheetSpec[] }) {
  useLandscapePrint();
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <Button variant="outline" size="sm" className="gap-1.5 bg-card" onClick={() => window.print()}>
        <Printer className="size-3.5" />
        Export PDF
      </Button>
      <ExportExcelButton
        filename={`Overview-Kinerja-UPT-Palangkaraya-${new Date().toISOString().slice(0, 10)}.xlsx`}
        sheets={sheets}
      />
    </div>
  );
}
