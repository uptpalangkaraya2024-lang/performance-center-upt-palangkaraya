import { Suspense } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { LoadingScreen } from "@/components/dashboard/loading-screen";
import { PageHero } from "@/components/dashboard/page-hero";
import { ExportPdfButton } from "@/components/dashboard/export-pdf-button";
import { buildUltgRanking } from "@/components/kinerja-ultg/ultg-ranking-table";
import { buildGiCorrelation } from "@/lib/asset-correlation";
import { buildMaintenanceProposals } from "@/lib/maintenance-proposals";
import { findAhiDegradationAlerts } from "@/lib/ahi-degradation";
import { buildAhiTrendProjections } from "@/lib/ahi-trend-projection";
import { buildManagementAttention } from "@/lib/executive-insights";
import { buildNarrativeReport } from "@/lib/narrative-report";
import { buildAboSnapshotComputed, defaultAboWeekLabel } from "@/lib/abo-proteksi-compute";
import { buildFourDxWigs, resolvePeriodRange } from "@/lib/four-dx-compute";
import { getUptPerformance } from "@/services/upt-performance";
import { getUltgPerformance } from "@/services/ultg-performance";
import { getDisturbances } from "@/services/disturbances";
import { getAhiPerformance } from "@/services/ahi-performance";
import { getAllBayLineReportsWithHistory } from "@/services/ahi-bay-line-report";
import { getRenusData } from "@/services/renus";
import { getAboProteksiSnapshot } from "@/services/abo-proteksi";
import { getAboHargiSnapshot } from "@/services/abo-hargi";
import { getFourDxSnapshot } from "@/services/four-dx";
import { getCeSnapshot } from "@/services/ce-proteksi";
import { getSuttSnapshot } from "@/services/sutt-asset";
import { isRenusOverdue } from "@/lib/renus-helpers";
import { formatDataAsOfOldest } from "@/lib/sync-status";
import { buildDataHealthReport } from "@/lib/data-health";
import { calculateAchievedPercentage } from "@/lib/kpi-engine";
import {
  buildGangguanMonthComparison,
  buildKpiTrendComparison,
  buildRenusOverdueComparison,
} from "@/lib/executive-period-compare";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// --- Streaming redesign -------------------------------------------------
//
// This page used to `await Promise.all([...11 services...])` before
// rendering ANY html, blocking the whole page's first byte on the slowest
// of 11 separate Apps Script round trips (measured live: 12-18s on a cold
// cache) — exactly the anti-pattern the homepage itself used to have and
// was already fixed for (see src/app/dashboard/page.tsx's own header
// comment). Unlike the homepage, this report is ONE combined narrative
// (buildNarrativeReport) whose sections cross-reference nearly every
// source at once (e.g. "Risiko Utama" needs Gangguan+AHI+CE+RENUS,
// "Kualitas Data" needs essentially everything) — splitting it into many
// independently-streamed sections the way the homepage's many independent
// cards are split would not actually parallelize anything further (every
// section would still end up waiting on most of the same 11 promises).
// What DOES help, and is applied here: every fetch is kicked off
// immediately (NOT awaited) at the top of this plain (non-async) page
// component, and the entire narrative build + render moves into one small
// async child component wrapped in <Suspense> — so the page shell
// (PageHero, the "Export PDF" button) streams to the browser immediately
// instead of the whole route hanging until all 11 sources resolve.
export default function LaporanEksekutifPage() {
  const uptPromise = getUptPerformance();
  const ultgPromise = getUltgPerformance();
  const disturbancesPromise = getDisturbances();
  const ahiPromise = getAhiPerformance();
  const bayLineReportsPromise = getAllBayLineReportsWithHistory();
  const renusPromise = getRenusData();
  const aboProteksiPromise = getAboProteksiSnapshot();
  const aboHargiPromise = getAboHargiSnapshot();
  const fourDxPromise = getFourDxSnapshot();
  const cePromise = getCeSnapshot();
  const suttPromise = getSuttSnapshot();

  return (
    <div className="flex flex-col gap-6">
      <PageHero
        title="Laporan Eksekutif"
        description="Ringkasan naratif kinerja UPT, risiko utama, RENUS, dan Gangguan — disusun otomatis dari data yang sama dengan seluruh dashboard."
        actions={<ExportPdfButton landscape={false} />}
      />

      <Suspense fallback={<NarrativeReportFallback />}>
        <NarrativeReportBody
          uptPromise={uptPromise}
          ultgPromise={ultgPromise}
          disturbancesPromise={disturbancesPromise}
          ahiPromise={ahiPromise}
          bayLineReportsPromise={bayLineReportsPromise}
          renusPromise={renusPromise}
          aboProteksiPromise={aboProteksiPromise}
          aboHargiPromise={aboHargiPromise}
          fourDxPromise={fourDxPromise}
          cePromise={cePromise}
          suttPromise={suttPromise}
        />
      </Suspense>
    </div>
  );
}

function NarrativeReportFallback() {
  return (
    <Card className="print:shadow-none">
      <CardContent className="py-6">
        <LoadingScreen />
      </CardContent>
    </Card>
  );
}

async function NarrativeReportBody({
  uptPromise,
  ultgPromise,
  disturbancesPromise,
  ahiPromise,
  bayLineReportsPromise,
  renusPromise,
  aboProteksiPromise,
  aboHargiPromise,
  fourDxPromise,
  cePromise,
  suttPromise,
}: {
  uptPromise: ReturnType<typeof getUptPerformance>;
  ultgPromise: ReturnType<typeof getUltgPerformance>;
  disturbancesPromise: ReturnType<typeof getDisturbances>;
  ahiPromise: ReturnType<typeof getAhiPerformance>;
  bayLineReportsPromise: ReturnType<typeof getAllBayLineReportsWithHistory>;
  renusPromise: ReturnType<typeof getRenusData>;
  aboProteksiPromise: ReturnType<typeof getAboProteksiSnapshot>;
  aboHargiPromise: ReturnType<typeof getAboHargiSnapshot>;
  fourDxPromise: ReturnType<typeof getFourDxSnapshot>;
  cePromise: ReturnType<typeof getCeSnapshot>;
  suttPromise: ReturnType<typeof getSuttSnapshot>;
}) {
  const [upt, ultg, disturbances, ahi, bayLineReports, renus, aboProteksi, aboHargi, fourDx, ce, sutt] = await Promise.all([
    uptPromise,
    ultgPromise,
    disturbancesPromise,
    ahiPromise,
    bayLineReportsPromise,
    renusPromise,
    aboProteksiPromise,
    aboHargiPromise,
    fourDxPromise,
    cePromise,
    suttPromise,
  ]);

  const aboWeekLabel = defaultAboWeekLabel();
  const fourDxPeriod = resolvePeriodRange(fourDx.currentPeriodLabel, fourDx.periodBoundaries, fourDx.currentYear);
  const fourDxWigs = fourDx.error ? null : buildFourDxWigs(fourDx.wigs, fourDxPeriod, fourDx.realizations, fourDx.monitoring);

  const managementAttention = buildManagementAttention({
    upt: upt.data,
    transmisi: disturbances.error ? null : disturbances.transmisi,
    trafoHv: disturbances.error ? null : disturbances.trafoHv,
    trafoLv: disturbances.error ? null : disturbances.trafoLv,
    ahi: ahi.data,
    bayLineReports: bayLineReports.length > 0 ? bayLineReports : null,
    renusReminders: renus.error ? null : renus.reminders,
    abo:
      aboProteksi.error || aboHargi.error
        ? null
        : {
            proteksiPrograms: buildAboSnapshotComputed(aboProteksi, aboWeekLabel),
            hargiPrograms: buildAboSnapshotComputed(aboHargi, aboWeekLabel),
            weekLabel: aboWeekLabel,
          },
    fourDx: fourDxWigs,
    ce: ce.error ? null : ce,
  });

  const giCorrelation =
    !disturbances.error && ahi.data
      ? buildGiCorrelation({
          trafoGi: [...disturbances.trafoHv.giBreakdown, ...disturbances.trafoLv.giBreakdown],
          transmisiGi: disturbances.transmisi.giBreakdown,
          anomalies: ahi.data.anomalies,
          ceItems: ce.error ? [] : ce.items,
          renusRows: renus.error ? [] : renus.rows,
        })
      : [];
  const degradationAlerts = findAhiDegradationAlerts(bayLineReports);
  const trendProjections = buildAhiTrendProjections(bayLineReports);
  const disturbanceEvents = disturbances.error
    ? []
    : [...disturbances.transmisi.bayEvents, ...disturbances.trafoHv.bayEvents, ...disturbances.trafoLv.bayEvents];
  const topProposals = buildMaintenanceProposals({
    giCorrelation,
    bayLineReports,
    degradationAlerts,
    trendProjections,
    renusRows: renus.error ? [] : renus.rows,
    disturbanceEvents,
  });

  // Previously re-derived "overdue" inline here (`!realisasiDate && ...`),
  // which missed the TECO/COMPLETED completion signal every other RENUS
  // overdue count in this app already checks (see isRenusOverdue's own
  // comment in src/lib/renus-helpers.ts) — that over-counted overdue work
  // by treating already-finished-but-blank-REALISASI rows as still
  // outstanding (211 vs the correct 48, confirmed against live data). Now
  // uses the same shared predicate as the RENUS page, the homepage
  // reminder, and the sidebar badge.
  const renusOverdueCount = renus.error ? 0 : renus.rows.filter((r) => isRenusOverdue(r, renus.today)).length;

  const fourDxLms = fourDxWigs ? fourDxWigs.flatMap((w) => w.lms) : [];
  const dataHealthChecks = buildDataHealthReport({
    ceItems: ce.error ? [] : ce.items,
    renusRows: renus.error ? [] : renus.rows,
    anomalies: ahi.data ? ahi.data.anomalies : [],
    aboSnapshots: [
      { label: "Proteksi", snapshot: aboProteksi },
      { label: "Hargi", snapshot: aboHargi },
    ].filter((s) => !s.snapshot.error),
    fourDxLms,
    uptKpis: upt.data?.kpis ?? [],
    ultgKpis: ultg.data?.flatMap((s) => s.kpis) ?? [],
    suttRuasList: sutt.ruasList,
    giRegistryDropped: sutt.giRegistryDropped,
    todayISO: renus.error
      ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date())
      : renus.today,
  }).checks;

  const todayISO = renus.error
    ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date())
    : renus.today;

  const sections = buildNarrativeReport({
    periodLabel: upt.data?.periodLabel ?? new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric" }),
    upt: upt.data,
    ultgRanking: ultg.data ? buildUltgRanking(ultg.data) : [],
    topProposals,
    renusSummary: renus.error ? null : renus.summary,
    renusOverdueCount,
    renusRows: renus.error ? [] : renus.rows,
    ceItems: ce.error ? [] : ce.items,
    disturbanceTotal: disturbances.error ? null : disturbances.transmisi.summary.total,
    disturbanceTrip: disturbances.error ? null : disturbances.transmisi.summary.trip,
    disturbanceTopCause: disturbances.error ? null : (disturbances.transmisi.causePareto[0]?.cause ?? null),
    disturbanceYearRange: disturbances.error ? null : disturbances.dataYearRange,
    managementAttentionCritical: managementAttention.filter((i) => i.tone === "critical"),
    kpiTrend: upt.data ? buildKpiTrendComparison(upt.data.kpis) : null,
    renusOverdueComparison: renus.error ? null : buildRenusOverdueComparison(renus.rows, renus.today),
    gangguanMonthComparison: disturbances.error
      ? null
      : buildGangguanMonthComparison(
          [disturbances.transmisi.monthlyByYear, disturbances.trafoHv.monthlyByYear, disturbances.trafoLv.monthlyByYear],
          todayISO,
        ),
    dataQuality: {
      uptNoDataKpiCount: upt.data ? calculateAchievedPercentage(upt.data.overall).noDataCount : 0,
      dataHealthChecks,
    },
    todayISO,
  });

  const generatedAt = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date());
  // Oldest sync among the modules this report draws numbers from — distinct
  // from `generatedAt` above (that's when this PAGE was rendered; this is
  // when the underlying sheet data was last actually pulled, which can be
  // hours earlier).
  const dataAsOf = formatDataAsOfOldest(["Kinerja UPT", "Kinerja ULTG", "RENUS", "Gangguan", "CE Proteksi", "AHI UPT"]);

  return (
    <Card className="print:shadow-none">
      <CardContent className="flex flex-col gap-6 py-6">
        <div className="border-b pb-3">
          <h1 className="text-xl font-extrabold text-foreground">Laporan Eksekutif — UPT Palangkaraya</h1>
          <p className="text-xs text-muted-foreground">
            Disusun otomatis pada {generatedAt} WIB.{dataAsOf ? ` ${dataAsOf} (modul paling lama belum sinkron ulang).` : ""}
          </p>
        </div>
        {sections.length === 0 ? (
          <p className="text-sm text-muted-foreground">Data belum cukup untuk menyusun laporan.</p>
        ) : (
          sections.map((section) => (
            <div key={section.heading} className="flex flex-col gap-2">
              <h2 className="text-base font-extrabold text-foreground">{section.heading}</h2>
              {section.paragraphs.map((p, i) => (
                <p key={i} className="text-sm leading-relaxed text-foreground">
                  {p}
                </p>
              ))}
              {section.table ? (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/70 text-left text-xs text-muted-foreground uppercase">
                        {section.table.headers.map((h) => (
                          <th key={h} className="px-3 py-2 font-bold">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {section.table.rows.map((row, i) => (
                        <tr key={i} className="border-b last:border-0">
                          {row.map((cell, j) => (
                            <td key={j} className={`px-3 py-2 ${j === 0 ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {section.items && section.items.length > 0 ? (
                <ol className="flex flex-col gap-1.5 text-sm text-foreground">
                  {section.items.map((item, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="shrink-0 font-bold text-muted-foreground">{i + 1}.</span>
                      <span className="leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          ))
        )}
        <p className="border-t pt-3 text-[11px] text-muted-foreground">
          Laporan ini disusun otomatis dari data yang sama dengan seluruh dashboard (bukan hasil AI generatif) —
          setiap kalimat dapat ditelusuri kembali ke angka aslinya di modul masing-masing. Tinjau kembali sebelum
          digunakan sebagai laporan resmi.
        </p>
      </CardContent>
    </Card>
  );
}
