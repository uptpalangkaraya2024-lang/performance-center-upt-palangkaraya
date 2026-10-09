import { Fragment } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AhiUltgEquipmentRow, AhiUltgResumeEntry } from "@/lib/ahi-compute";
import { formatPercent } from "./format";

function UltgResumeTable({ entries }: { entries: AhiUltgResumeEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Belum ada data anomali untuk breakdown per ULTG.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/70 text-left text-xs text-muted-foreground uppercase">
            <th className="px-3 py-2.5 font-bold">ULTG</th>
            <th className="px-3 py-2.5 font-bold text-right">Total Anomali</th>
            <th className="px-3 py-2.5 font-bold text-right">Critical</th>
            <th className="px-3 py-2.5 font-bold text-right">Poor</th>
            <th className="px-3 py-2.5 font-bold text-right">% Critical</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.ultg} className="border-b last:border-0">
              <td className="px-3 py-2 font-medium text-foreground">{entry.ultg}</td>
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{entry.total}</td>
              <td className="px-3 py-2 text-right tabular-nums text-critical">{entry.critical}</td>
              <td className="px-3 py-2 text-right tabular-nums text-warning-foreground">{entry.poor}</td>
              <td className="px-3 py-2 text-right font-bold tabular-nums">{formatPercent(entry.percentCritical)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Detail view behind UltgResumeTable's own per-ULTG summary — one row per
// equipment type, each ULTG's own total & Critical count shown side by
// side, so "which ULTG is worst" can be narrowed to "on which equipment."
function UltgEquipmentMatrixTable({ rows }: { rows: AhiUltgEquipmentRow[] }) {
  if (rows.length === 0 || rows[0].byUltg.length === 0) {
    return <p className="text-sm text-muted-foreground">Belum ada data untuk breakdown ini.</p>;
  }
  const ultgLabels = rows[0].byUltg.map((c) => c.ultg);
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/70 text-left text-xs text-muted-foreground uppercase">
            <th className="px-3 py-2 font-bold" rowSpan={2}>
              Jenis Aset
            </th>
            <th className="border-l px-3 py-2 text-right font-bold" colSpan={2}>
              Total
            </th>
            {ultgLabels.map((ultg) => (
              <th key={ultg} className="border-l px-3 py-2 text-right font-bold" colSpan={2}>
                {ultg}
              </th>
            ))}
          </tr>
          <tr className="border-b bg-muted/70 text-right text-xs text-muted-foreground uppercase">
            <th className="border-l px-3 py-1.5 font-bold">Total</th>
            <th className="px-3 py-1.5 font-bold">Critical</th>
            {ultgLabels.map((ultg) => (
              <Fragment key={ultg}>
                <th className="border-l px-3 py-1.5 font-bold">Total</th>
                <th className="px-3 py-1.5 font-bold">Critical</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.jenisAset} className="border-b last:border-0">
              <td className="px-3 py-2 text-foreground">{row.jenisAset}</td>
              <td className="border-l px-3 py-2 text-right tabular-nums text-muted-foreground">{row.total}</td>
              <td className="px-3 py-2 text-right tabular-nums text-critical">{row.critical}</td>
              {row.byUltg.map((cell) => (
                <Fragment key={cell.ultg}>
                  <td className="border-l px-3 py-2 text-right tabular-nums text-muted-foreground">{cell.total}</td>
                  <td
                    className={cn("px-3 py-2 text-right tabular-nums", cell.critical > 0 ? "text-critical" : "text-muted-foreground")}
                  >
                    {cell.critical}
                  </td>
                </Fragment>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AhiUltgResumeCard({
  resume,
  matrix,
}: {
  resume: AhiUltgResumeEntry[];
  matrix: AhiUltgEquipmentRow[];
}) {
  return (
    <Card id="ahi-ultg-resume" className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="text-lg font-extrabold">Resume Anomali per ULTG</CardTitle>
        <p className="text-xs text-muted-foreground">
          Dihitung dari seluruh rekap anomali Poor &amp; Critical (MTU &amp; Trafo) di bawah, dikelompokkan per ULTG
          dan per jenis aset.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <UltgResumeTable entries={resume} />
        <UltgEquipmentMatrixTable rows={matrix} />
      </CardContent>
    </Card>
  );
}
