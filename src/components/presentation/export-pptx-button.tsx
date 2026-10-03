"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PresentationSlide } from "@/types";

// Every other export in this app (ExportExcelButton, ExportPdfButton) is
// print/XLSX-based — there's no existing .pptx precedent to follow, so this
// is the first. pptxgenjs is dynamically imported inside the click handler
// (not a static top-level import) because it touches `document`/Blob APIs
// at module-eval time, which would break this file being imported into a
// server-rendered tree; dynamic import keeps it strictly client-only and
// out of the initial bundle for a page that may never use it.
export function ExportPptxButton({ slides, title }: { slides: PresentationSlide[]; title: string }) {
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    if (slides.length === 0 || busy) return;
    setBusy(true);
    try {
      const PptxGenJS = (await import("pptxgenjs")).default;
      const pptx = new PptxGenJS();
      pptx.defineLayout({ name: "A4_LANDSCAPE", width: 13.33, height: 7.5 });
      pptx.layout = "A4_LANDSCAPE";

      for (const slide of slides) {
        const s = pptx.addSlide();
        s.addText(slide.title, { x: 0.5, y: 0.3, w: 12.3, h: 0.7, fontSize: 24, bold: true, color: "1F2937" });
        if (slide.subtitle) {
          s.addText(slide.subtitle, { x: 0.5, y: 0.95, w: 12.3, h: 0.4, fontSize: 13, color: "6B7280" });
        }
        if (slide.aiGenerated) {
          s.addText("Analisis AI — bukan data operasional langsung", {
            x: 0.5,
            y: 1.35,
            w: 8,
            h: 0.35,
            fontSize: 10,
            italic: true,
            color: "2563EB",
          });
        }

        let cursorY = slide.subtitle ? 1.8 : 1.4;

        if (slide.stats && slide.stats.length > 0) {
          const cols = Math.min(slide.stats.length, 4);
          const cellW = 12.3 / cols;
          slide.stats.forEach((stat, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            s.addText([{ text: `${stat.value}\n`, options: { fontSize: 20, bold: true, color: "111827" } }, { text: stat.label, options: { fontSize: 10, color: "6B7280" } }], {
              x: 0.5 + col * cellW,
              y: cursorY + row * 0.95,
              w: cellW - 0.15,
              h: 0.85,
              align: "center",
              valign: "middle",
              fill: { color: "F3F4F6" },
              line: { color: "E5E7EB", width: 1 },
            });
          });
          cursorY += Math.ceil(slide.stats.length / cols) * 0.95 + 0.25;
        }

        if (slide.bullets.length > 0) {
          s.addText(
            slide.bullets.map((b) => ({ text: b, options: { bullet: true, breakLine: true } })),
            { x: 0.5, y: cursorY, w: 12.3, h: Math.min(4.5, 0.4 * slide.bullets.length + 0.3), fontSize: 14, color: "1F2937", valign: "top" },
          );
          cursorY += Math.min(4.5, 0.4 * slide.bullets.length + 0.3) + 0.2;
        }

        if (slide.table) {
          const rows = [
            slide.table.headers.map((h) => ({ text: h, options: { bold: true, fill: { color: "E5E7EB" }, fontSize: 11 } })),
            ...slide.table.rows.map((r) => r.map((cell) => ({ text: cell, options: { fontSize: 11 } }))),
          ];
          s.addTable(rows, { x: 0.5, y: cursorY, w: 12.3, autoPage: false });
        }

        if (slide.sourceNote) {
          s.addText(slide.sourceNote, { x: 0.5, y: 6.95, w: 12.3, h: 0.4, fontSize: 9, italic: true, color: "9CA3AF" });
        }
      }

      const fileName = `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pptx`;
      await pptx.writeFile({ fileName });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExport} disabled={slides.length === 0 || busy}>
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileDown className="size-3.5" />}
      Unduh PPTX
    </Button>
  );
}
