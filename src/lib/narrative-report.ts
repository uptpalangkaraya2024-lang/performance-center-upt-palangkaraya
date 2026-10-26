// Narrative executive report ("Laporan Eksekutif Otomatis") — compiles
// data already computed elsewhere in this app (KPI snapshots, top risk
// proposals, RENUS summary, Gangguan summary, Management Attention) into
// readable Indonesian prose, template-based sentence construction only —
// no LLM call, same "rule-based insight explicitly permitted, an AI
// backend is not" principle AGENTS.md already states for
// executive-insights.ts. Every sentence is built from a real number
// already shown elsewhere on the dashboard; nothing here is invented.
import type { AiInsight, RenusSummary, UltgPerformanceSnapshot, UptPerformanceSnapshot } from "@/types";
import type { MaintenanceProposal } from "@/lib/maintenance-proposals";
import { calculateAchievedPercentage } from "@/lib/kpi-engine";

export interface NarrativeReportParams {
  periodLabel: string;
  upt: UptPerformanceSnapshot | null;
  ultgRanking: { rank: number; snapshot: UltgPerformanceSnapshot }[];
  topProposals: MaintenanceProposal[];
  renusSummary: RenusSummary | null;
  renusOverdueCount: number;
  disturbanceTotal: number | null;
  disturbanceTrip: number | null;
  disturbanceTopCause: string | null;
  managementAttentionCritical: AiInsight[];
}

export interface NarrativeSection {
  heading: string;
  paragraphs: string[];
}

function pct(n: number | null): string {
  return n === null ? "tidak tersedia" : `${n.toFixed(1)}%`;
}

export function buildNarrativeReport(params: NarrativeReportParams): NarrativeSection[] {
  const {
    periodLabel,
    upt,
    ultgRanking,
    topProposals,
    renusSummary,
    renusOverdueCount,
    disturbanceTotal,
    disturbanceTrip,
    disturbanceTopCause,
    managementAttentionCritical,
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
    sections.push({
      heading: "Kinerja UPT Palangkaraya",
      paragraphs: [
        `Kinerja UPT Palangkaraya periode ${upt.periodLabel} mencatat ${upt.overall.achieved} dari ${upt.overall.total} KPI tercapai target (${pct(achievementPct)})${noDataNote}, dengan ${upt.overall.warning} KPI berstatus warning dan ${upt.overall.critical} KPI berstatus critical. Skor Kontrak (Bobot Resmi) tercatat sebesar ${scoreText}.`,
        upt.overall.critical > 0
          ? `Sebanyak ${upt.overall.critical} KPI dalam kondisi critical perlu mendapat perhatian khusus pada rapat evaluasi berikutnya.`
          : `Tidak ada KPI dalam kondisi critical pada periode ini — kinerja UPT secara umum dalam kondisi terkendali.`,
      ],
    });
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
        `Dari ${ultgRanking.length} ULTG, ${best.snapshot.ultg} menempati peringkat #1 dengan ${pct(bestPct)} KPI tercapai, sementara ${worst.snapshot.ultg} berada di peringkat terakhir dengan ${pct(worstPct)} dan ${worst.snapshot.overall.critical} KPI critical.`,
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
    const names = top.map((p) => `GI ${p.gi} (skor ${p.riskScore})`).join(", ");
    const penggantianCount = top.filter((p) => p.action === "Penggantian").length;
    const sisaCount = top.length - penggantianCount;
    const actionSentence =
      sisaCount > 0
        ? `${penggantianCount} dari ${top.length} GI tersebut diusulkan untuk penggantian peralatan, ${sisaCount} sisanya pemeliharaan prioritas.`
        : `Seluruh ${top.length} GI tersebut diusulkan untuk penggantian peralatan.`;
    sections.push({
      heading: "Risiko Utama & Usulan Prioritas",
      paragraphs: [
        `Berdasarkan gabungan skor risiko AHI, Common Enemy, gangguan, dan RENUS, ${top.length} GI dengan risiko tertinggi periode ini adalah: ${names}.`,
        `${actionSentence} Rincian alasan tiap usulan tersedia pada halaman Usulan Prioritas Pemeliharaan.`,
      ],
    });
  }

  // --- RENUS ---
  if (renusSummary) {
    sections.push({
      heading: "Rencana & Realisasi Pemeliharaan (RENUS)",
      paragraphs: [
        `Tercatat ${renusSummary.total} pekerjaan RENUS aktif, dengan ${renusSummary.highRisk} di antaranya berisiko tinggi dan ${renusOverdueCount} pekerjaan melewati tanggal rencana.`,
      ],
    });
  }

  // --- Gangguan ---
  if (disturbanceTotal !== null) {
    sections.push({
      heading: "Gangguan Transmisi",
      paragraphs: [
        `Tercatat ${disturbanceTotal} kejadian gangguan transmisi, dengan ${disturbanceTrip ?? 0} di antaranya berstatus Trip.${
          disturbanceTopCause ? ` Penyebab terbesar adalah ${disturbanceTopCause}.` : ""
        }`,
      ],
    });
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
