import { ArrowDown, ArrowUp, Minus } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { YoyCompareRow } from "@/lib/disturbance-yoy-compare";

/** Red = more gangguan than last year (worse), green = fewer (better) —
 *  same framing used everywhere else on this page (critical/success
 *  colors), regardless of which category the row is about. */
function ChangeBadge({ row }: { row: YoyCompareRow }) {
  if (row.current === row.previous) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground">
        <Minus className="size-3" /> 0%
      </span>
    );
  }
  const up = row.current > row.previous;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-bold", up ? "text-critical" : "text-success")}>
      {up ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {Math.abs(row.pctChange).toFixed(2)}%
    </span>
  );
}

export function YoyCompareTable({
  title,
  rows,
  currentYear,
  previousYear,
}: {
  title: string;
  rows: YoyCompareRow[];
  currentYear: string;
  previousYear: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-extrabold">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">
          Perbandingan jumlah kejadian {previousYear} vs {currentYear} — merah berarti naik (lebih banyak gangguan),
          hijau berarti turun dibanding tahun sebelumnya.
        </p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Belum ada data untuk dibandingkan.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/70 text-left text-xs text-muted-foreground uppercase">
                  <th className="px-3 py-2.5 font-bold">Kategori</th>
                  <th className="px-3 py-2.5 text-right font-bold">{previousYear}</th>
                  <th className="px-3 py-2.5 text-right font-bold">{currentYear}</th>
                  <th className="px-3 py-2.5 text-right font-bold">Perubahan %</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.category} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium text-foreground">{row.category}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{row.previous}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">{row.current}</td>
                    <td className="px-3 py-2 text-right">
                      <ChangeBadge row={row} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
