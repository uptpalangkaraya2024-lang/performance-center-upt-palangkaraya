"use client";

// Pairs with the YoY chart (per user request: that chart at half-width,
// a Trip list filling the other half, with its own year filter) — every
// individual Trip event for THIS category only (not Transmisi+Trafo
// combined), newest first. AR Sukses/Tidak Trip rows are excluded on
// purpose: Trip is the real-outage signal, the other two kinds don't
// represent lost supply.
import { useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DisturbanceBayEventRecord } from "@/types";

const ALL = "__all__";

export function TripEventsPanel({ events, years }: { events: DisturbanceBayEventRecord[]; years: string[] }) {
  const [year, setYear] = useState(ALL);

  const trips = useMemo(
    () =>
      events
        .filter((e) => e.kind === "Trip" && (year === ALL || e.year === year))
        .sort((a, b) => b.dateISO.localeCompare(a.dateISO)),
    [events, year],
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg font-extrabold">Daftar Gangguan Trip</CardTitle>
            <p className="text-xs text-muted-foreground">
              {trips.length} kejadian Trip tercatat{year !== ALL ? ` di tahun ${year}` : ""}, terbaru di atas.
            </p>
          </div>
          <Select value={year} onValueChange={(v) => v && setYear(v)}>
            <SelectTrigger size="sm" className="w-[120px]">
              <SelectValue placeholder="Tahun">{year === ALL ? "Semua Tahun" : year}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Semua Tahun</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={y}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {trips.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Tidak ada kejadian Trip pada filter ini.</p>
        ) : (
          <div className="max-h-[320px] overflow-y-auto rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead className="w-10">No</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Bay</TableHead>
                  <TableHead>GI</TableHead>
                  <TableHead>Penyebab</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trips.map((t, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="text-muted-foreground tabular-nums">{idx + 1}</TableCell>
                    <TableCell className="whitespace-nowrap">{t.date}</TableCell>
                    <TableCell className="max-w-[200px] truncate" title={t.bay}>
                      {t.bay}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{t.gi ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{t.cause}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
