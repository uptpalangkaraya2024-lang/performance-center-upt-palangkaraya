"use client";

import { useMemo, useState } from "react";
import { LineChart } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataUnavailable } from "@/components/dashboard/data-unavailable";
import { PageHero } from "@/components/dashboard/page-hero";
import type { UptKpiCategory, UptPerformanceSnapshot } from "@/types";
import { UptCategorySection } from "./upt-category-section";
import { UptOverallPerformanceSummary } from "./upt-overall-performance";

const CATEGORY_ORDER: UptKpiCategory[] = [
  "availability",
  "disturbance",
  "protection",
  "finance",
  "asset-legal",
  "asset-maturity",
];

export function UptDashboardClient({ snapshot }: { snapshot: UptPerformanceSnapshot }) {
  const [selectedPeriod, setSelectedPeriod] = useState(snapshot.period);

  const selectedOption = snapshot.periodOptions.find((option) => option.value === selectedPeriod);
  const selectedLabel = selectedOption?.label ?? snapshot.periodLabel;
  const isCurrentPeriod = selectedPeriod === snapshot.period;

  const kpisByCategory = useMemo(() => {
    const map = new Map<UptKpiCategory, typeof snapshot.kpis>();
    for (const category of CATEGORY_ORDER) map.set(category, []);
    for (const kpi of snapshot.kpis) {
      map.get(kpi.category)?.push(kpi);
    }
    return map;
  }, [snapshot]);

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        title="Kinerja UPT Palangkaraya"
        description={`Kinerja s.d. ${selectedLabel.toUpperCase()}`}
        status={
          <>
            <span className={isCurrentPeriod ? "size-1.5 rounded-full bg-success" : "size-1.5 rounded-full bg-muted-foreground"} />
            {isCurrentPeriod ? "Data synchronized" : "Belum ada data untuk periode ini"}
            {snapshot.lastUpdate ? ` · Last update: ${snapshot.lastUpdate}` : null}
          </>
        }
        actions={
          <Select value={selectedPeriod} onValueChange={(value) => value && setSelectedPeriod(value)}>
            <SelectTrigger size="sm" className="w-[190px] bg-card">
              <SelectValue placeholder="Periode">{selectedLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {snapshot.periodOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                  {!option.hasData ? " (belum ada data)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {!isCurrentPeriod ? (
        <Card>
          <CardContent className="py-8">
            <DataUnavailable message={`No data available for this period — ${selectedLabel}.`} />
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-base font-semibold tracking-tight">Overall Performance</h2>
            <UptOverallPerformanceSummary overall={snapshot.overall} />
          </section>

          {CATEGORY_ORDER.map((category) => (
            <UptCategorySection key={category} category={category} kpis={kpisByCategory.get(category) ?? []} />
          ))}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tren Kinerja</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
                <LineChart className="size-8" />
                <p className="text-sm">Trend data belum tersedia.</p>
                <p className="max-w-sm text-xs">
                  Sheet sumber hanya menyimpan snapshot kumulatif untuk periode berjalan ({snapshot.periodLabel}), belum ada riwayat bulanan yang dapat dibaca melalui provider saat ini.
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
