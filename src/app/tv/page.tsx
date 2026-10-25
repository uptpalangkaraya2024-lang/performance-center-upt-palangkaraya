import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataUnavailable } from "@/components/dashboard/data-unavailable";
import { AttentionCards } from "@/components/dashboard/attention-cards";
import { UptPerformanceStatus } from "@/components/dashboard/upt-performance-status";
import { UptGapToTarget } from "@/components/dashboard/upt-gap-to-target";
import { UltgGapToTarget } from "@/components/kinerja-ultg/ultg-gap-to-target";
import { UltgAttentionRollupTable } from "@/components/dashboard/ultg-attention-rollup-table";
import { DisturbanceParetoChart } from "@/components/charts/disturbance-pareto-chart";
import { buildUltgRanking, RankBadge } from "@/components/kinerja-ultg/ultg-ranking-table";
import { TvRotator, type TvPanel } from "@/components/tv/tv-rotator";
import { getUptPerformance } from "@/services/upt-performance";
import { getUltgPerformance } from "@/services/ultg-performance";
import { getDisturbances } from "@/services/disturbances";
import { getAhiPerformance } from "@/services/ahi-performance";
import { getAllBayLineReports } from "@/services/ahi-bay-line-report";
import { getRenusData } from "@/services/renus";
import { getAboProteksiSnapshot } from "@/services/abo-proteksi";
import { getAboHargiSnapshot } from "@/services/abo-hargi";
import { getFourDxSnapshot } from "@/services/four-dx";
import { getCeSnapshot } from "@/services/ce-proteksi";
import { getAssetScanning } from "@/services/asset-scanning";
import { buildManagementAttention } from "@/lib/executive-insights";
import { buildAboSnapshotComputed, buildAboUltgResume, defaultAboWeekLabel } from "@/lib/abo-proteksi-compute";
import { buildFourDxUltgResume, buildFourDxWigs, resolvePeriodRange } from "@/lib/four-dx-compute";
import { buildCeSummary } from "@/lib/ce-compute";
import { buildAhiUltgResume } from "@/lib/ahi-compute";
import { buildRenusUltgResume } from "@/lib/renus-compute";
import { buildUltgAttentionRollup, type UltgCountEntry } from "@/lib/ultg-attention-rollup";
import type { StatusLevel } from "@/types";

// TV/kiosk board mode (feature #2) — a chrome-free, auto-rotating view
// meant for an actual office TV screen, not an interactive session. Lives
// outside src/app/dashboard/ on purpose, so it skips that layout's sidebar
// and header entirely (see dashboard/layout.tsx) and gets only the root
// layout's fonts/theme. Every panel reuses an already-built, already-
// themed homepage component — this page's own job is just to fetch once
// and hand the right slice to each one; see TvRotator for the rotation
// timer itself.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function TvPage() {
  const [upt, ultg, disturbances, ahi, bayLineReports, renus, aboProteksi, aboHargi, fourDx, ce, assetScanning] =
    await Promise.all([
      getUptPerformance(),
      getUltgPerformance(),
      getDisturbances(),
      getAhiPerformance(),
      getAllBayLineReports(),
      getRenusData(),
      getAboProteksiSnapshot(),
      getAboHargiSnapshot(),
      getFourDxSnapshot(),
      getCeSnapshot(),
      getAssetScanning(),
    ]);

  const aboWeekLabel = defaultAboWeekLabel();
  const fourDxPeriod = resolvePeriodRange(fourDx.currentPeriodLabel, fourDx.periodBoundaries, fourDx.currentYear);
  const fourDxWigs = fourDx.error ? null : buildFourDxWigs(fourDx.wigs, fourDxPeriod, fourDx.realizations, fourDx.monitoring);
  const aboComputed =
    aboProteksi.error || aboHargi.error
      ? null
      : {
          proteksiPrograms: buildAboSnapshotComputed(aboProteksi, aboWeekLabel),
          hargiPrograms: buildAboSnapshotComputed(aboHargi, aboWeekLabel),
          weekLabel: aboWeekLabel,
        };

  // Panel 1 — Management Attention: the full rule-based insight list,
  // computed directly (not the homepage's client-fetched-ABO/4DX split —
  // that split exists purely to keep the homepage's first paint fast for
  // an interactive visitor; a kiosk page has no such concern, so the
  // simpler one-shot server computation is used instead).
  const managementAttention = buildManagementAttention({
    upt: upt.data,
    transmisi: disturbances.error ? null : disturbances.transmisi,
    trafoHv: disturbances.error ? null : disturbances.trafoHv,
    trafoLv: disturbances.error ? null : disturbances.trafoLv,
    ahi: ahi.data,
    bayLineReports: bayLineReports.length > 0 ? bayLineReports : null,
    renusReminders: renus.error ? null : renus.reminders,
    abo: aboComputed,
    fourDx: fourDxWigs,
    ce: ce.error ? null : ce,
  });

  // Panel 2 — Kinerja: same UptPerformanceStatus banner the homepage uses
  // for both the UPT-wide and the per-ULTG (ranked) status.
  const uptStatus: StatusLevel = !upt.data
    ? "none"
    : upt.data.overall.critical > 0
      ? "critical"
      : upt.data.overall.warning > 0
        ? "warning"
        : "good";
  const ultgRanking = ultg.data ? buildUltgRanking(ultg.data) : [];

  // Panel 4 — Perhatian per ULTG — Lintas Modul (same cross-module rollup
  // as the homepage's own table).
  const aboEntries: UltgCountEntry[] =
    aboProteksi.error || aboHargi.error
      ? []
      : buildAboUltgResume([
          ...buildAboSnapshotComputed(aboProteksi, aboWeekLabel),
          ...buildAboSnapshotComputed(aboHargi, aboWeekLabel),
        ]).map((e) => ({ ultg: e.ultg, count: e.programsEvaluated - e.programsTercapai }));
  const fourDxEntries: UltgCountEntry[] = fourDxWigs
    ? buildFourDxUltgResume(fourDxWigs).map((e) => ({ ultg: e.ultg, count: e.lmsEvaluated - e.lmsTercapai }))
    : [];
  const ceEntries: UltgCountEntry[] = ce.error ? [] : buildCeSummary(ce.items).byUltg.map((e) => ({ ultg: e.label, count: e.open }));
  const ahiEntries: UltgCountEntry[] = ahi.data ? buildAhiUltgResume(ahi.data.anomalies).map((e) => ({ ultg: e.ultg, count: e.critical })) : [];
  const renusEntries: UltgCountEntry[] = renus.error ? [] : buildRenusUltgResume(renus.rows, renus.today).map((e) => ({ ultg: e.ultg, count: e.overdue }));
  const disturbanceOpenByUltg = new Map<string, number>();
  if (!disturbances.error) {
    for (const category of [disturbances.transmisi, disturbances.trafoHv, disturbances.trafoLv]) {
      for (const u of category.ultgBreakdown) {
        disturbanceOpenByUltg.set(u.ultg, (disturbanceOpenByUltg.get(u.ultg) ?? 0) + u.followUp.open);
      }
    }
  }
  const disturbanceEntries: UltgCountEntry[] = [...disturbanceOpenByUltg.entries()].map(([ultgName, count]) => ({ ultg: ultgName, count }));
  const assetOpenByUltg = new Map<string, number>();
  if (assetScanning.data) {
    for (const a of assetScanning.data.anomali) {
      if ((a.status ?? "").toUpperCase() === "SELESAI") continue;
      assetOpenByUltg.set(a.ultg, (assetOpenByUltg.get(a.ultg) ?? 0) + 1);
    }
  }
  const assetEntries: UltgCountEntry[] = [...assetOpenByUltg.entries()].map(([ultgName, count]) => ({ ultg: ultgName, count }));
  const rollup = buildUltgAttentionRollup({
    abo: aboEntries,
    fourDx: fourDxEntries,
    ce: ceEntries,
    ahi: ahiEntries,
    renus: renusEntries,
    disturbances: disturbanceEntries,
    dataAset: assetEntries,
  });

  const panels: TvPanel[] = [
    {
      title: "Management Attention",
      content: <AttentionCards data={managementAttention} />,
    },
    {
      title: "Kinerja UPT & ULTG",
      content: upt.data ? (
        <div className="flex flex-col gap-4">
          <UptPerformanceStatus overall={upt.data.overall} periodLabel={upt.data.periodLabel} status={uptStatus} overallWeightedScore={upt.data.overallWeightedScore} />
          {ultgRanking.map(({ rank, snapshot }) => {
            const status: StatusLevel = snapshot.overall.critical > 0 ? "critical" : snapshot.overall.warning > 0 ? "warning" : "good";
            return (
              <div key={snapshot.ultgSlug} className="flex items-center gap-3">
                <RankBadge rank={rank} size="lg" />
                <div className="min-w-0 flex-1">
                  <UptPerformanceStatus
                    title={`#${rank} · ${snapshot.ultg} Performance Status`}
                    overall={snapshot.overall}
                    periodLabel={snapshot.periodLabel}
                    status={status}
                    overallWeightedScore={snapshot.overallWeightedScore}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <DataUnavailable message="Kinerja UPT belum tersedia." />
      ),
    },
    {
      title: "Realisasi & Target",
      content: (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-extrabold">Gap to Target — Kinerja UPT</CardTitle>
            </CardHeader>
            <CardContent>{upt.data ? <UptGapToTarget kpis={upt.data.kpis} /> : <DataUnavailable message="Belum tersedia." />}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-extrabold">Gap to Target — Kinerja ULTG</CardTitle>
            </CardHeader>
            <CardContent>{ultg.data ? <UltgGapToTarget snapshots={ultg.data} /> : <DataUnavailable message="Belum tersedia." />}</CardContent>
          </Card>
        </div>
      ),
    },
    {
      title: "Perhatian per ULTG — Lintas Modul",
      content: <UltgAttentionRollupTable entries={rollup} />,
    },
    {
      title: "Gangguan",
      content: disturbances.error ? (
        <DataUnavailable message="Sinkronisasi Gangguan belum berhasil." />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Total Transmisi", value: disturbances.transmisi.summary.total },
              { label: "Trip", value: disturbances.transmisi.summary.trip },
              { label: "Follow-up Open", value: disturbances.transmisi.followUp.open },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border bg-muted p-4 text-center">
                <div className="text-3xl font-extrabold tabular-nums text-foreground">{s.value.toLocaleString("id-ID")}</div>
                <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{s.label}</div>
              </div>
            ))}
          </div>
          {disturbances.transmisi.causePareto.length > 0 ? (
            <DisturbanceParetoChart data={disturbances.transmisi.causePareto} />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">Belum ada gangguan yang masuk kinerja.</p>
          )}
        </div>
      ),
    },
  ];

  return <TvRotator panels={panels} />;
}
