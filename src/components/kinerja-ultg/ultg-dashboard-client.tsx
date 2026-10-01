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
import { ExportPdfButton } from "@/components/dashboard/export-pdf-button";
import { PageHero } from "@/components/dashboard/page-hero";
import { UptOverallPerformanceSummary } from "@/components/kinerja-upt/upt-overall-performance";
import type { UltgPerformanceSnapshot } from "@/types";
import { CATEGORY_ORDER, UltgCategorySection } from "./ultg-category-section";
import { UltgTrendChart } from "./ultg-trend-chart";
import { buildUltgRanking, UltgRankingTable } from "./ultg-ranking-table";

export function UltgDashboardClient({ snapshots }: { snapshots: UltgPerformanceSnapshot[] }) {
  const ranking = useMemo(() => buildUltgRanking(snapshots), [snapshots]);
  const [selectedSlug, setSelectedSlug] = useState(ranking[0]?.snapshot.ultgSlug ?? "");
  const selected = snapshots.find((s) => s.ultgSlug === selectedSlug) ?? snapshots[0];

  const [selectedPeriod, setSelectedPeriod] = useState(selected.period);
  // Reset the period selector back to the newly-selected ULTG's own current
  // period whenever the ULTG changes — each ULTG's sheet can be synced to a
  // different reporting month, so keeping the old selection could silently
  // point at a period the new ULTG has no data for. Adjusted during render
  // (React's own documented pattern for this — see "Adjusting state when a
  // prop changes" in the React docs) rather than in an effect, which would
  // cause an extra cascading re-render for the exact same result.
  const [prevSlug, setPrevSlug] = useState(selected.ultgSlug);
  if (selected.ultgSlug !== prevSlug) {
    setPrevSlug(selected.ultgSlug);
    setSelectedPeriod(selected.period);
  }

  const searchParams = useSearchParams();
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

  const selectedOption = selected.periodOptions.find((option) => option.value === selectedPeriod);
  const selectedLabel = selectedOption?.label ?? selected.periodLabel;
  const isCurrentPeriod = selectedPeriod === selected.period;

  const kpisByCategory = useMemo(() => {
    const map = new Map<(typeof CATEGORY_ORDER)[number], typeof selected.kpis>();
    for (const category of CATEGORY_ORDER) map.set(category, []);
    for (const kpi of selected.kpis) {
      map.get(kpi.category)?.push(kpi);
    }
    return map;
  }, [selected]);

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        title="Kinerja ULTG"
        description={`${selected.ultg} — Kinerja s.d. ${selectedLabel.toUpperCase()}`}
        status={
          <>
            <span className={isCurrentPeriod ? "size-1.5 rounded-full bg-success" : "size-1.5 rounded-full bg-muted-foreground"} />
            {isCurrentPeriod ? "Data synchronized" : "Belum ada data untuk periode ini"}
            {selected.lastUpdate ? ` · Last update: ${selected.lastUpdate}` : null}
          </>
        }
        actions={
          <>
            <Select value={selectedSlug} onValueChange={(value) => value && setSelectedSlug(value)}>
              <SelectTrigger size="sm" className="w-[190px] bg-card">
                <SelectValue placeholder="ULTG">{selected.ultg}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {snapshots.map((s) => (
                  <SelectItem key={s.ultgSlug} value={s.ultgSlug}>
                    {s.ultg}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedPeriod} onValueChange={(value) => value && setSelectedPeriod(value)}>
              <SelectTrigger size="sm" className="w-[190px] bg-card">
                <SelectValue placeholder="Periode">{selectedLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {selected.periodOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                    {!option.hasData ? " (belum ada data)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ExportPdfButton />
            <ExportExcelButton
              filename={`Kinerja-${selected.ultg.replace(/\s+/g, "-")}-${selected.period}.xlsx`}
              sheets={[
                {
                  name: "Kinerja ULTG",
                  rows: selected.kpis.map((kpi) => ({
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

      <UltgRankingTable ranking={ranking} selectedSlug={selected.ultgSlug} onSelect={setSelectedSlug} />

      {!isCurrentPeriod ? (
        <Card>
          <CardContent className="py-8">
            <DataUnavailable message={`No data available for this period — ${selectedLabel}.`} />
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-extrabold tracking-tight">Overall Performance — {selected.ultg}</h2>
            <UptOverallPerformanceSummary overall={selected.overall} />
          </section>

          {CATEGORY_ORDER.map((category) => (
            <UltgCategorySection
              key={category}
              category={category}
              kpis={kpisByCategory.get(category) ?? []}
              highlightKeys={highlightKeys}
            />
          ))}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-extrabold">{selected.ultg} — Historical Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <UltgTrendChart key={selected.ultgSlug} kpis={selected.kpis} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
