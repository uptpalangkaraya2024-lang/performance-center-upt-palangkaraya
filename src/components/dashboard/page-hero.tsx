import type { ReactNode } from "react";

import { PrintDate } from "@/components/dashboard/print-enhancer";

// The one highlighted header treatment every dashboard page should use —
// gradient card, bold title, optional status line and right-aligned actions
// (filters, a select, a sync button). Originally introduced on the main
// Overview page (see dashboard-filters.tsx) and Kinerja UPT; every other
// page's header now goes through this so a future palette/style tweak only
// has one place to change.
//
// In print / Export PDF the card is swapped for a report header (same look
// as the CE report: eyebrow, title, description, print date, navy rule),
// and the page title goes into the page footer next to the page number —
// see the print block at the end of globals.css.
export function PageHero({
  title,
  description,
  status,
  actions,
}: {
  title: string;
  description?: string;
  status?: ReactNode;
  actions?: ReactNode;
}) {
  const footer = `${title} · UPT Palangkaraya`.replace(/["\\]/g, "");
  return (
    <>
      <div
        className="flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between print:hidden"
        style={{ backgroundImage: "var(--gradient-hero)" }}
      >
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{title}</h1>
          {description ? <p className="mt-1 max-w-xl text-sm text-muted-foreground">{description}</p> : null}
          {status ? <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">{status}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <header className="print-header hidden print:flex">
        <div>
          <div className="ph-eyebrow">PLN UPT Palangkaraya · Performance Center</div>
          <h1 data-print-title>{title}</h1>
          {description ? <div className="ph-desc">{description}</div> : null}
        </div>
        <div className="ph-meta">
          Tanggal cetak: <b><PrintDate /></b>
        </div>
      </header>
      <style>{`@media print { @page { @bottom-left { content: "${footer}"; } } }`}</style>
    </>
  );
}
