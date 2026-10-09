import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { UltgAttentionRollupEntry } from "@/lib/ultg-attention-rollup";

const MODULE_COLUMNS: { key: keyof UltgAttentionRollupEntry; label: string; href: string }[] = [
  { key: "abo", label: "ABO", href: "/dashboard/abo" },
  { key: "fourDx", label: "4DX", href: "/dashboard/4dx" },
  { key: "ce", label: "CE", href: "/dashboard/ce" },
  { key: "ahi", label: "AHI", href: "/dashboard/ahi" },
  { key: "renus", label: "RENUS", href: "/dashboard/renus" },
  { key: "disturbances", label: "Gangguan", href: "/dashboard/disturbances" },
  { key: "dataAset", label: "Data Aset", href: "/dashboard/assets" },
];

function cellValue(entry: UltgAttentionRollupEntry, key: keyof UltgAttentionRollupEntry): number {
  const v = entry[key];
  return typeof v === "number" ? v : 0;
}

/** One row per ULTG, one column per module's own "belum/open/overdue/
 *  critical" count (each module's own already-established definition — see
 *  buildUltgAttentionRollup's own field comments), plus a summed Total
 *  column. Answers "which ULTG needs the most attention, overall" without
 *  opening all 7 module pages — the gap noted in the dashboard evaluation:
 *  every module already had its own per-ULTG view, but nothing combined
 *  them. Sorted by Total descending so the ULTG needing the most attention
 *  is always the first row. */
export function UltgAttentionRollupTable({ entries }: { entries: UltgAttentionRollupEntry[] }) {
  const sorted = [...entries].sort((a, b) => b.total - a.total);
  const maxTotal = Math.max(1, ...sorted.map((e) => e.total));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-extrabold">Perhatian per ULTG — Lintas Modul</CardTitle>
        <p className="text-xs text-muted-foreground">
          Jumlah item &quot;perlu perhatian&quot; (belum tercapai / open / overdue / critical, sesuai definisi
          masing-masing modul) per ULTG, dijumlahkan di seluruh modul. Klik header modul untuk membuka halamannya.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/70 text-left text-xs text-muted-foreground uppercase">
                <th className="px-3 py-2.5 font-bold">ULTG</th>
                {MODULE_COLUMNS.map((col) => (
                  <th key={col.key} className="px-3 py-2.5 text-right font-bold">
                    <a href={col.href} className="hover:text-foreground hover:underline">
                      {col.label}
                    </a>
                  </th>
                ))}
                <th className="border-l px-3 py-2.5 text-right font-bold">Total</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((entry) => (
                <tr key={entry.ultg} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium text-foreground">{entry.ultg}</td>
                  {MODULE_COLUMNS.map((col) => {
                    const value = cellValue(entry, col.key);
                    return (
                      <td
                        key={col.key}
                        className={cn("px-3 py-2 text-right tabular-nums", value > 0 ? "text-warning-foreground" : "text-muted-foreground")}
                      >
                        {value}
                      </td>
                    );
                  })}
                  <td className="border-l px-3 py-2 text-right">
                    <span className="inline-flex items-center gap-2">
                      <span className="font-bold tabular-nums text-foreground">{entry.total}</span>
                      <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:inline-block">
                        <span
                          className={cn("block h-full rounded-full", entry.total > 0 ? "bg-critical" : "bg-success")}
                          style={{ width: `${Math.round((entry.total / maxTotal) * 100)}%` }}
                        />
                      </span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
