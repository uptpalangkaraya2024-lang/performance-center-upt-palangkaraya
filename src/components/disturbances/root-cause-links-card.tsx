import { Link2, AlertTriangle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { RootCauseLink } from "@/lib/root-cause-links";

function klasifikasiPillClass(kategori: number): string {
  return kategori === 5 ? "border-critical/40 bg-critical/20 text-critical" : "border-warning/50 bg-warning/20 text-warning-foreground";
}

/** Shows each recent disturbance alongside any AHI/CE finding already on
 *  record at the same GI — a plain GI + time-window join (see
 *  root-cause-links.ts), explicitly framed as "worth checking," never a
 *  confirmed cause. Renders nothing when there are no links, so a clean
 *  period doesn't show an empty, confusing card. */
export function RootCauseLinksCard({ links }: { links: RootCauseLink[] }) {
  if (links.length === 0) return null;

  return (
    <Card className="border-warning/40 bg-warning/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-base font-extrabold">
          <Link2 className="size-4.5 text-warning-foreground" />
          Kemungkinan Keterkaitan Antar Modul
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Gangguan 90 hari terakhir yang terjadi di GI dengan temuan AHI Poor/Critical atau Common Enemy OPEN —
          bukan bukti penyebab pasti, hanya layak dicek lebih lanjut.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {links.slice(0, 10).map((link, i) => (
          <div key={i} className="flex flex-col gap-1.5 rounded-lg border bg-card p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-foreground">
                {link.event.date} · {link.event.bay} · GI {link.event.gi}
              </p>
              <span className="text-xs text-muted-foreground">
                {link.event.cause} · {link.event.kind}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {[...link.relatedAhiFindings].sort((a, b) => b.kategoriAhi - a.kategoriAhi).slice(0, 3).map((a, j) => (
                <span key={`ahi-${j}`} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold", klasifikasiPillClass(a.kategoriAhi))}>
                  <AlertTriangle className="size-3" /> AHI {a.bay} — Kategori {a.kategoriAhi}
                </span>
              ))}
              {link.relatedCeFindings.slice(0, 3).map((c, j) => (
                <span key={`ce-${j}`} className="inline-flex items-center gap-1 rounded-full border border-critical/40 bg-critical/10 px-2 py-0.5 text-xs font-semibold text-critical">
                  <AlertTriangle className="size-3" /> CE OPEN — {c.namaProgram || c.anomaliPemicu || c.bay || `temuan #${c.id}`}
                </span>
              ))}
              {link.relatedAhiFindings.length + link.relatedCeFindings.length > 6 ? (
                <span className="text-xs text-muted-foreground">
                  +{link.relatedAhiFindings.length + link.relatedCeFindings.length - 6} temuan lain di GI ini
                </span>
              ) : null}
            </div>
          </div>
        ))}
        {links.length > 10 ? (
          <p className="text-xs text-muted-foreground">+{links.length - 10} keterkaitan lain tidak ditampilkan.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
