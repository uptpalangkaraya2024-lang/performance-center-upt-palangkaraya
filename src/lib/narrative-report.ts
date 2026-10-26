// Narrative executive report ("Laporan Eksekutif Otomatis") — compiles
// data already computed elsewhere in this app (KPI snapshots, top risk
// proposals, RENUS summary, Gangguan summary, Management Attention) into
// readable Indonesian prose, template-based sentence construction only —
// no LLM call, same "rule-based insight explicitly permitted, an AI
// backend is not" principle AGENTS.md already states for
// executive-insights.ts. Every sentence is built from a real number
// already shown elsewhere on the dashboard; nothing here is invented.
import type { AiInsight, CeItem, RenusRow, RenusSummary, UltgPerformanceSnapshot, UptPerformanceSnapshot } from "@/types";
import type { MaintenanceProposal } from "@/lib/maintenance-proposals";
import { calculateAchievedPercentage } from "@/lib/kpi-engine";
import type { GangguanMonthComparison, KpiTrendComparison, RenusOverdueComparison } from "@/lib/executive-period-compare";
import { buildDecisionsNeeded, buildNextTwoWeeksFocus } from "@/lib/executive-focus";
import type { DataHealthCheck } from "@/lib/data-health";

export interface DataQualityInput {
  uptNoDataKpiCount: number;
  dataHealthChecks: DataHealthCheck[];
}

export interface NarrativeReportParams {
  periodLabel: string;
  upt: UptPerformanceSnapshot | null;
  ultgRanking: { rank: number; snapshot: UltgPerformanceSnapshot }[];
  topProposals: MaintenanceProposal[];
  renusSummary: RenusSummary | null;
  renusOverdueCount: number;
  renusRows: RenusRow[];
  ceItems: CeItem[];
  disturbanceTotal: number | null;
  disturbanceTrip: number | null;
  disturbanceTopCause: string | null;
  disturbanceYearRange: string | null;
  managementAttentionCritical: AiInsight[];
  kpiTrend: KpiTrendComparison | null;
  renusOverdueComparison: RenusOverdueComparison | null;
  gangguanMonthComparison: GangguanMonthComparison | null;
  dataQuality: DataQualityInput;
  todayISO: string;
}

export interface NarrativeTable {
  headers: string[];
  rows: string[][];
}

export interface NarrativeSection {
  heading: string;
  paragraphs: string[];
  /** Optional structured breakdown shown after the paragraphs — used
   *  where prose alone can't show a per-item comparison clearly (e.g.
   *  risk-score components for the top 5 GIs). */
  table?: NarrativeTable;
  /** Optional short list rendered as numbered items rather than prose —
   *  used for "Keputusan yang diperlukan" / "Fokus 2 minggu ke depan",
   *  which are checklists, not paragraphs. */
  items?: string[];
}

function pct(n: number | null): string {
  return n === null ? "tidak tersedia" : `${n.toFixed(1)}%`;
}

function trendWord(trend: "naik" | "turun" | "tetap"): string {
  return trend;
}

export function buildNarrativeReport(params: NarrativeReportParams): NarrativeSection[] {
  const {
    periodLabel,
    upt,
    ultgRanking,
    topProposals,
    renusSummary,
    renusOverdueCount,
    renusRows,
    ceItems,
    disturbanceTotal,
    disturbanceTrip,
    disturbanceTopCause,
    disturbanceYearRange,
    managementAttentionCritical,
    kpiTrend,
    renusOverdueComparison,
    gangguanMonthComparison,
    dataQuality,
    todayISO,
  } = params;

  const sections: NarrativeSection[] = [];

  // --- Kinerja UPT ---
  if (upt) {
    // Same calculateAchievedPercentage() every other achieved-% display in
    // this app uses (src/lib/kpi-engine.ts) — this section used to divide
    // by the full KPI count (including no-data KPIs), which read as a
    // different number than the homepage's own banner for the same period.
    const { pct: achievementPct, noDataCount } = calculateAchievedPercentage(upt.overall);
    const scoreText = upt.overallWeightedScore !== null ? `${upt.overallWeightedScore.toFixed(2)}%` : "belum tersedia";
    const noDataNote = noDataCount > 0 ? ` (${noDataCount} KPI belum terisi, tidak dihitung dalam persentase ini)` : "";
    const paragraphs = [
      `Kinerja UPT Palangkaraya periode ${upt.periodLabel} mencatat ${upt.overall.achieved} dari ${upt.overall.total} KPI tercapai target (${pct(achievementPct)})${noDataNote}, dengan ${upt.overall.warning} KPI berstatus warning dan ${upt.overall.critical} KPI berstatus critical. Skor Kontrak (Bobot Resmi) tercatat sebesar ${scoreText}.`,
      upt.overall.critical > 0
        ? `Sebanyak ${upt.overall.critical} KPI dalam kondisi critical perlu mendapat perhatian khusus pada rapat evaluasi berikutnya.`
        : `Tidak ada KPI dalam kondisi critical pada periode ini — kinerja UPT secara umum dalam kondisi terkendali.`,
    ];
    if (kpiTrend) {
      // Deliberately phrased as "tren realisasi", not "capaian" — this
      // compares each KPI's own last two reported monthly cumulative
      // Realisasi points (direction-aware), NOT a reconstruction of PLN's
      // official Pencapaian for the prior month, which this app has no
      // honest way to recompute (only a cumulative-to-date Target/
      // Realisasi is available, no monthly target breakdown) — see
      // KpiTrendComparison's own comment in executive-period-compare.ts.
      paragraphs.push(
        `Dibanding bulan laporan sebelumnya: tren realisasi kumulatif membaik pada ${kpiTrend.improving} KPI, memburuk pada ${kpiTrend.worsening} KPI, dan tetap pada ${kpiTrend.flat} KPI (${kpiTrend.notComparable} KPI belum bisa dibandingkan). Ini membandingkan arah pergerakan realisasi mentah, bukan Pencapaian resmi bulan lalu yang tidak tersedia untuk dihitung ulang.`,
      );
    }
    sections.push({ heading: `Kinerja UPT Palangkaraya (${upt.periodLabel})`, paragraphs });
  }

  // --- Kinerja ULTG ---
  if (ultgRanking.length > 0) {
    const best = ultgRanking[0];
    const worst = ultgRanking[ultgRanking.length - 1];
    const bestPct = calculateAchievedPercentage(best.snapshot.overall).pct;
    const worstPct = calculateAchievedPercentage(worst.snapshot.overall).pct;
    const periodMismatch = new Set(ultgRanking.map((r) => r.snapshot.period)).size > 1;
    sections.push({
      heading: "Kinerja ULTG",
      paragraphs: [
        `Dari ${ultgRanking.length} ULTG, ${best.snapshot.ultg} menempati peringkat #1 dengan ${pct(bestPct)} KPI tercapai (data s.d. ${best.snapshot.periodLabel}), sementara ${worst.snapshot.ultg} berada di peringkat terakhir dengan ${pct(worstPct)} (data s.d. ${worst.snapshot.periodLabel}) dan ${worst.snapshot.overall.critical} KPI critical.`,
        ...(periodMismatch
          ? [
              `Catatan: periode data tidak seragam antar ULTG (${ultgRanking.map((r) => `${r.snapshot.ultg} — ${r.snapshot.periodLabel}`).join(", ")}) — peringkat di atas membandingkan periode yang berbeda, bukan periode yang sama.`,
            ]
          : []),
      ],
    });
  }

  // --- Risiko Utama (Usulan Prioritas) ---
  if (topProposals.length > 0) {
    const top = topProposals.slice(0, 5);
    const names = top.map((p) => `GI ${p.gi} (skor ${p.riskScore100}/100)`).join(", ");
    const byRecommendation = new Map<string, number>();
    for (const p of top) byRecommendation.set(p.recommendation, (byRecommendation.get(p.recommendation) ?? 0) + 1);
    const recommendationSentence = [...byRecommendation.entries()].map(([rec, count]) => `${count} ${rec}`).join(", ");
    sections.push({
      heading: "Risiko Utama & Usulan Prioritas",
      paragraphs: [
        `Berdasarkan gabungan skor risiko AHI, Common Enemy, gangguan, dan RENUS, ${top.length} GI dengan risiko tertinggi periode ini adalah: ${names}. Skor dinormalisasi 0-100 relatif terhadap GI dengan risiko tertinggi saat ini (bukan skala absolut) — angka 100 berarti "paling berisiko dalam daftar ini sekarang", bukan "memenuhi 100 kriteria tetap".`,
        `Rekomendasi per GI: ${recommendationSentence} — dibedakan menurut komponen risiko yang paling dominan di masing-masing GI, bukan satu rekomendasi seragam. Rincian alasan tiap usulan tersedia pada halaman Usulan Prioritas Pemeliharaan.`,
      ],
      table: {
        headers: ["GI", "Skor (0-100)", "AHI", "CE", "Gangguan", "RENUS", "Rekomendasi"],
        // Each component rescaled by the SAME factor as riskScore100 (not
        // shown as raw weighted points) so the 4 component columns are on
        // the same 0-100 basis as the Skor column and sum back to it —
        // showing raw points here (e.g. "2010") next to a 0-100 score
        // read as two different scales side by side.
        rows: top.map((p) => {
          const scale = p.riskScore > 0 ? p.riskScore100 / p.riskScore : 0;
          const scaled = (n: number) => (Math.round(n * scale * 10) / 10).toString();
          return [
            p.gi,
            String(p.riskScore100),
            scaled(p.riskComponents.ahi),
            scaled(p.riskComponents.ce),
            scaled(p.riskComponents.gangguan),
            scaled(p.riskComponents.renus),
            p.recommendation,
          ];
        }),
      },
    });
  }

  // --- RENUS ---
  if (renusSummary) {
    const paragraphs = [
      `Tercatat ${renusSummary.total} pekerjaan RENUS aktif, dengan ${renusSummary.highRisk} di antaranya berisiko tinggi dan ${renusOverdueCount} pekerjaan melewati tanggal rencana (per ${todayISO}).`,
    ];
    if (renusOverdueComparison) {
      paragraphs.push(
        `Dibanding sebulan lalu, jumlah pekerjaan overdue ${trendWord(renusOverdueComparison.trend)} (${renusOverdueComparison.oneMonthAgo} → ${renusOverdueComparison.now}).`,
      );
    }
    sections.push({ heading: "Rencana & Realisasi Pemeliharaan (RENUS)", paragraphs });
  }

  // --- Gangguan ---
  if (disturbanceTotal !== null) {
    const periodNote = disturbanceYearRange ? ` (akumulasi sejak data tersinkron, ${disturbanceYearRange})` : "";
    const paragraphs = [
      `Tercatat ${disturbanceTotal} kejadian gangguan transmisi${periodNote}, dengan ${disturbanceTrip ?? 0} di antaranya berstatus Trip.${
        disturbanceTopCause ? ` Penyebab terbesar adalah ${disturbanceTopCause}.` : ""
      }`,
    ];
    if (gangguanMonthComparison) {
      paragraphs.push(
        `${gangguanMonthComparison.thisMonthLabel} (berjalan): ${gangguanMonthComparison.thisMonth} kejadian, ${trendWord(gangguanMonthComparison.trend)} dibanding ${gangguanMonthComparison.lastMonthLabel} (${gangguanMonthComparison.lastMonth} kejadian) — ${gangguanMonthComparison.thisMonthLabel} masih berjalan, jadi perbandingan ini sementara sampai bulan tersebut selesai.`,
      );
    }
    sections.push({ heading: "Gangguan Transmisi", paragraphs });
  }

  // --- Kualitas Data ---
  {
    const { uptNoDataKpiCount, dataHealthChecks } = dataQuality;
    const issueCount = dataHealthChecks.reduce((s, c) => s + c.count, 0);
    if (uptNoDataKpiCount > 0 || dataHealthChecks.length > 0) {
      const paragraphs = [
        `${uptNoDataKpiCount} KPI UPT belum terisi datanya periode ini (dikeluarkan dari persentase KPI tercapai di atas).${
          dataHealthChecks.length > 0
            ? ` Halaman Kesehatan Data mencatat ${dataHealthChecks.length} jenis masalah kualitas data (total ${issueCount} baris) yang berpotensi memengaruhi angka-angka pada laporan ini.`
            : " Tidak ada masalah kualitas data lain yang tercatat di halaman Kesehatan Data saat ini."
        }`,
        ...(dataHealthChecks.length > 0
          ? [
              `Ringkasan: ${dataHealthChecks
                .slice(0, 5)
                .map((c) => `${c.title} (${c.module}, ${c.count})`)
                .join("; ")}${dataHealthChecks.length > 5 ? `, dan ${dataHealthChecks.length - 5} lainnya` : ""} — lihat halaman Kesehatan Data untuk detail dan baris sumbernya.`,
            ]
          : []),
      ];
      sections.push({ heading: "Kualitas Data", paragraphs });
    }
  }

  // --- Keputusan yang Diperlukan ---
  const decisions = buildDecisionsNeeded({ topProposals, ceItems });
  if (decisions.length > 0) {
    sections.push({ heading: "Keputusan yang Diperlukan", paragraphs: [], items: decisions });
  }

  // --- Fokus 2 Minggu ke Depan ---
  const focus = buildNextTwoWeeksFocus({ renusRows, renusOverdueCount, todayISO });
  if (focus.length > 0) {
    sections.push({ heading: "Fokus 2 Minggu ke Depan", paragraphs: [], items: focus });
  }

  // --- Perhatian Manajemen ---
  if (managementAttentionCritical.length > 0) {
    sections.push({
      heading: "Catatan Perlu Perhatian",
      paragraphs: managementAttentionCritical.slice(0, 6).map((i) => `${i.module ?? "Umum"}: ${i.text}`),
    });
  }

  return sections;
}
