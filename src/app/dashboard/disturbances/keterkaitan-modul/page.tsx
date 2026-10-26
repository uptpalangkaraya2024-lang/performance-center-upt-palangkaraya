import Link from "next/link";
import { AlertTriangle, ArrowLeft, Info, Link2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { PageHero } from "@/components/dashboard/page-hero";
import { DataUnavailable } from "@/components/dashboard/data-unavailable";
import { cn } from "@/lib/utils";
import { getDisturbances } from "@/services/disturbances";
import { getAhiPerformance } from "@/services/ahi-performance";
import { getCeSnapshot } from "@/services/ce-proteksi";
import { findRootCauseLinks } from "@/lib/root-cause-links";

export const dynamic = "force-dynamic";

function klasifikasiPillClass(kategori: number): string {
  return kategori === 5
    ? "border-critical/40 bg-critical/20 text-critical"
    : "border-warning/50 bg-warning/20 text-warning-foreground";
}

export default async function KeterkaitanModulPage() {
  const [result, ahi, ce] = await Promise.all([getDisturbances(), getAhiPerformance(), getCeSnapshot()]);

  const links = result.error
    ? []
    : findRootCauseLinks({
        events: [...result.transmisi.bayEvents, ...result.trafoHv.bayEvents, ...result.trafoLv.bayEvents],
        anomalies: ahi.data ? ahi.data.anomalies : [],
        ceItems: ce.error ? [] : ce.items,
        todayISO: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date()),
      });

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        title="Keterkaitan Antar Modul"
        description="Gangguan 90 hari terakhir yang terjadi di GI dengan temuan AHI Poor/Critical atau Common Enemy OPEN — dicek otomatis, bukan bukti penyebab pasti."
        actions={
          <Link href="/dashboard/disturbances" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <ArrowLeft className="size-3.5" />
            Kembali ke Gangguan
          </Link>
        }
      />

      <div className="flex items-start gap-2 rounded-lg border border-info/40 bg-info/10 p-3 text-sm text-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-info" />
        <p>
          Ini adalah pengecekan silang berbasis GI dan rentang waktu, bukan analisis sebab-akibat — secara historis
          sebagian besar gangguan di sini memang tidak terbukti berkaitan dengan temuan AHI/CE/4DX. Tetap
          ditampilkan sebagai pemeriksaan tambahan yang layak dicek manual, bukan kesimpulan otomatis.
        </p>
      </div>

      {result.error ? (
        <Card>
          <CardContent className="py-8">
            <DataUnavailable message="Sinkronisasi Rekap Gangguan belum berhasil. Lihat halaman Data & Sync untuk detail." />
          </CardContent>
        </Card>
      ) : links.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Tidak ada gangguan 90 hari terakhir yang bertepatan dengan temuan AHI/CE terbuka di GI yang sama.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {links.map((link, i) => (
            <Card key={i} className="border-warning/40">
              <CardContent className="flex flex-col gap-3 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
                  <div className="flex items-center gap-2">
                    <Link2 className="size-4 shrink-0 text-warning-foreground" />
                    <p className="font-bold text-foreground">
                      {link.event.date} · {link.event.bay}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    GI {link.event.gi} · {link.event.cause} · {link.event.kind}
                  </span>
                </div>

                {link.relatedAhiFindings.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                      Temuan AHI Terkait ({link.relatedAhiFindings.length})
                    </p>
                    <ul className="flex flex-col gap-1.5">
                      {link.relatedAhiFindings.map((a, j) => (
                        <li
                          key={j}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground" title={a.bay}>
                              {a.bay}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {a.keterangan || a.parameterPemicuAhi || "—"}
                            </p>
                          </div>
                          <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-xs font-bold", klasifikasiPillClass(a.kategoriAhi))}>
                            <AlertTriangle className="mr-1 inline size-3" />
                            Kategori {a.kategoriAhi}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {link.relatedCeFindings.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                      Temuan Common Enemy Terkait ({link.relatedCeFindings.length})
                    </p>
                    <ul className="flex flex-col gap-1.5">
                      {link.relatedCeFindings.map((c, j) => (
                        <li
                          key={j}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground" title={c.namaProgram || c.anomaliPemicu}>
                              {c.namaProgram || c.anomaliPemicu || c.bay || `Temuan #${c.id}`}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {c.kriteriaBefore || "—"} → {c.kriteriaAfter || "—"}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-full border border-critical/40 bg-critical/20 px-2 py-0.5 text-xs font-bold text-critical">
                            <AlertTriangle className="mr-1 inline size-3" />
                            OPEN
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
