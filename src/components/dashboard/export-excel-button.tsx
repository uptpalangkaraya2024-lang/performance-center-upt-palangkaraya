"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

export interface ExcelSheetSpec {
  /** Truncated to 31 chars — Excel's own sheet-name limit. */
  name: string;
  rows: Record<string, string | number | null>[];
}

// Exports whatever data the calling page already fetched/computed — no
// separate export-only data fetch, no server route. Uses the `xlsx` package
// already in package.json (client-side write via XLSX.writeFile, which
// triggers a normal browser download). Loaded on demand so its cost only
// ever hits a page where the button is actually clicked.
export function ExportExcelButton({
  filename,
  sheets,
  label = "Export Excel",
}: {
  filename: string;
  sheets: ExcelSheetSpec[];
  label?: string;
}) {
  const [pending, setPending] = useState(false);

  async function handleExport() {
    setPending(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      for (const sheet of sheets) {
        const ws = XLSX.utils.json_to_sheet(sheet.rows);
        XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
      }
      XLSX.writeFile(wb, filename);
    } finally {
      setPending(false);
    }
  }

  return (
    <Button variant="outline" size="sm" className="gap-1.5 bg-card" onClick={handleExport} disabled={pending}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
      {label}
    </Button>
  );
}
