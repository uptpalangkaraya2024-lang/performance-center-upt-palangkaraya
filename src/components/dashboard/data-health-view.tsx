import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

import { cn } from "@/lib/utils";
import type { DataHealthCheck, GiNamePair } from "@/lib/data-health";

function CheckRow({ check }: { check: DataHealthCheck }) {
  const Icon = check.severity === "warning" ? AlertTriangle : Info;
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border p-3",
        check.severity === "warning" ? "border-warning/40 bg-warning/10" : "border-border bg-secondary",
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className={cn("size-4 shrink-0", check.severity === "warning" ? "text-warning-foreground" : "text-muted-foreground")} />
        <span className="text-sm font-bold text-foreground">{check.title}</span>
        <span className="rounded-full border bg-card px-2 py-0.5 text-xs font-medium text-muted-foreground">{check.module}</span>
      </div>
      <p className="text-xs text-muted-foreground">{check.detail}</p>
      {check.samples.length > 0 ? (
        <p className="text-xs text-foreground">Contoh: {check.samples.join(", ")}</p>
      ) : null}
    </div>
  );
}

/** Renders buildDataHealthReport's output — every check it found, plus the
 *  near-duplicate GI name pairs, grouped so a clean report (the common
 *  case) reads as a clear "all clear" rather than an empty, ambiguous
 *  page. */
export function DataHealthView({ checks, giNamePairs }: { checks: DataHealthCheck[]; giNamePairs: GiNamePair[] }) {
  const warnings = checks.filter((c) => c.severity === "warning");
  const infos = checks.filter((c) => c.severity === "info");
  const allClear = checks.length === 0 && giNamePairs.length === 0;

  if (allClear) {
    return (
      <div className="flex items-center gap-2 py-8 text-center text-sm text-success">
        <CheckCircle2 className="size-5 shrink-0" />
        Tidak ada masalah kualitas data yang terdeteksi saat ini.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {warnings.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-bold tracking-wide text-foreground uppercase">
            Perlu Diperiksa ({warnings.length})
          </h3>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {warnings.map((c) => (
              <CheckRow key={c.id} check={c} />
            ))}
          </div>
        </div>
      ) : null}

      {giNamePairs.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-bold tracking-wide text-foreground uppercase">
            Nama GI Mirip ({giNamePairs.length})
          </h3>
          <p className="text-xs text-muted-foreground">
            Pasangan nama GI (dari CE/RENUS/AHI) yang hampir identik — kemungkinan dua ejaan untuk GI yang sama,
            yang membuat data GI tersebut terpecah di tabel per-GI manapun. Bukan bukti pasti salah, hanya layak
            dicek manual.
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/70 text-left text-xs text-muted-foreground uppercase">
                  <th className="px-3 py-2 font-bold">Nama A</th>
                  <th className="px-3 py-2 font-bold">Nama B</th>
                  <th className="px-3 py-2 text-right font-bold">Jarak Edit</th>
                </tr>
              </thead>
              <tbody>
                {giNamePairs.map((p) => (
                  <tr key={`${p.a}-${p.b}`} className="border-b last:border-0">
                    <td className="px-3 py-2 text-foreground">{p.a}</td>
                    <td className="px-3 py-2 text-foreground">{p.b}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{p.distance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {infos.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-bold tracking-wide text-foreground uppercase">Informasi ({infos.length})</h3>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {infos.map((c) => (
              <CheckRow key={c.id} check={c} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
