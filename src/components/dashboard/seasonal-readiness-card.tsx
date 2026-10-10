import { AlertTriangle, CalendarClock, CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { SeasonalReadinessEntry } from "@/lib/seasonal-readiness";

function monthsAheadLabel(monthsAhead: number): string {
  if (monthsAhead === 0) return "Bulan ini";
  if (monthsAhead === 1) return "Bulan depan";
  return `${monthsAhead} bulan lagi`;
}

/** The actionable slice of buildSeasonalReadiness — the next few calendar
 *  months ranked by historical disturbance risk, each shown against how
 *  much RENUS/ABO preventive work is actually scheduled in that same
 *  month. A month with real historical risk but 0 scheduled on either side
 *  is flagged — not proof nothing is planned (a program could still be
 *  mid-year ahead of schedule), but a genuine "go check this" signal worth
 *  a look before that month arrives. */
export function SeasonalReadinessCard({ months }: { months: SeasonalReadinessEntry[] }) {
  if (months.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Data historis Gangguan belum cukup untuk menilai kesiapan musiman.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Rata-rata gangguan historis (Transmisi + Trafo HV + Trafo LV, dijumlahkan di seluruh tahun data yang ada)
        per bulan kalender, dibandingkan dengan jumlah pekerjaan preventif RENUS &amp; ABO yang sudah terjadwal di
        bulan kalender yang sama — bukan tahun yang sama, karena kedua program ini direncanakan ulang setiap tahun.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {months.map((m) => {
          const noSchedule = m.renusScheduled === 0 && m.aboScheduled === 0;
          return (
            <div
              key={m.monthIndex}
              className={cn(
                "flex flex-col gap-2 rounded-lg border p-3",
                noSchedule ? "border-warning/40 bg-warning/10" : "border-border bg-secondary",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-extrabold text-foreground">{m.month}</span>
                <span className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  <CalendarClock className="size-3" />
                  {monthsAheadLabel(m.monthsAhead)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Peringkat risiko <span className="font-bold text-foreground">#{m.rank}</span> dari 12 — rata-rata{" "}
                <span className="font-bold text-foreground">{m.avgPerYear.toFixed(1)}</span> gangguan/tahun
                ({m.yearsCounted} tahun data)
              </p>
              <div className="flex items-center gap-3 text-sm">
                <span className="font-bold tabular-nums text-foreground">{m.renusScheduled}</span>
                <span className="text-xs text-muted-foreground">RENUS terjadwal</span>
                <span className="font-bold tabular-nums text-foreground">{m.aboScheduled}</span>
                <span className="text-xs text-muted-foreground">ruas ABO terjadwal</span>
              </div>
              <div
                className={cn(
                  "flex items-center gap-1.5 text-xs font-medium",
                  noSchedule ? "text-warning-foreground" : "text-success",
                )}
              >
                {noSchedule ? (
                  <>
                    <AlertTriangle className="size-3.5 shrink-0" />
                    Belum ada RENUS/ABO terjadwal menjelang bulan rawan ini
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="size-3.5 shrink-0" />
                    Sudah ada pekerjaan preventif terjadwal
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
