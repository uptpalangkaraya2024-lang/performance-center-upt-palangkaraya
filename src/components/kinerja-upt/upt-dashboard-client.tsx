"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataUnavailable } from "@/components/dashboard/data-unavailable";
import { ExportExcelButton } from "@/components/dashboard/export-excel-button";
import { PageHero } from "@/components/dashboard/page-hero";
import type { UptKpiCategory, UptPerformanceSnapshot } from "@/types";
import { UptCategorySection } from "./upt-category-section";
import { UptOverallPerformanceSummary } from "./upt-overall-performance";
import { UptTrendChart } from "./upt-trend-chart";

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
  const searchParams = useSearchParams();

  // A Management Attention / Top Issue / Gap to Target link on the Overview
  // dashboard can point here with ?highlight=KEY1,KEY2 — rings the matching
  // KPI card(s) instead of leaving the reader to scan all 19 for the one
  // that was actually flagged. The #kpi-<key> anchor in the same link
  // handles the scroll itself (native hash navigation).
  const highlightKeys = useMemo(() => {
    const raw = searchParams.get("highlight");
    return raw ? new Set(raw.split(",").filter(Boolean)) : undefined;
  }, [searchParams]);

  useEffect(() => {
    if (!highlightKeys || highlightKeys.size === 0) return;
    const timer = setTimeout(() => {
      const first = document.getElementById(`kpi-${[...highlightKeys][0]}`);
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    return () => clearTimeout(timer);
  }, [highlightKeys]);

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
          <>
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
            <ExportExcelButton
              filename={`Kinerja-UPT-${snapshot.period}.xlsx`}
              sheets={[
                {
                  name: "Kinerja UPT",
                  rows: snapshot.kpis.map((kpi) => ({
                    KPI: kpi.displayName,
                    Kategori: kpi.category,
                    Target: kpi.targetLabel ?? "",
                    Realisasi: kpi.actualLabel ?? "",
                    "Achievement (%)": kpi.achievement ?? "",
                    Status: kpi.status,
                    Arah: kpi.direction ?? "",
                    Bobot: kpi.weightInfo?.weight ?? "",
                    "Kontribusi Bobot": kpi.weightInfo?.weightedScore ?? "",
                    "Bobot Digabung Dengan": kpi.weightInfo?.sharedWith ?? "",
                  })),
                },
              ]}
            />
          </>
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
            <UptCategorySection
              key={category}
              category={category}
              kpis={kpisByCategory.get(category) ?? []}
              highlightKeys={highlightKeys}
            />
          ))}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Kinerja UPT — Historical Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <UptTrendChart kpis={snapshot.kpis} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
