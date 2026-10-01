"use client";

import { ExportExcelButton, type ExcelSheetSpec } from "@/components/dashboard/export-excel-button";
import { ExportPdfButton } from "@/components/dashboard/export-pdf-button";

/** "Export PDF" / "Export Excel" for the Overview page — see
 *  export-pdf-button.tsx and export-excel-button.tsx for how each works.
 *  Excel is fed whatever KPI rows the Overview page itself already
 *  fetched — no separate export-only data fetch. */
export function OverviewExportToolbar({ sheets }: { sheets: ExcelSheetSpec[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <ExportPdfButton />
      <ExportExcelButton
        filename={`Overview-Kinerja-UPT-Palangkaraya-${new Date().toISOString().slice(0, 10)}.xlsx`}
        sheets={sheets}
      />
    </div>
  );
}
