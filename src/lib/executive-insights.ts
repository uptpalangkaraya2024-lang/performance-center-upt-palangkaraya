// Rule-based executive insights for the Overview dashboard — plain
// if/else over already-computed service data, no AI/LLM call of any kind.
// See AGENTS.md "AI ASSISTANT" section: rule-based insight is explicitly
// permitted, an AI backend is not.
import { isRenusCancelled, isRenusDone, isRenusHighRisk } from "@/lib/renus-helpers";
import { collectAboAttentionItems } from "@/lib/abo-proteksi-compute";
import type {
  AboProgramComputed,
  AhiSnapshot,
  AiInsight,
  BayLineReport,
  DisturbanceCategoryResult,
  FourDxWig,
  RenusData,
  UptPerformanceSnapshot,
} from "@/types";

/** Both ABO sub-modules (Proteksi + Hargi), already computed at "today"'s
 *  period — the homepage doesn't offer a month/week filter, so this is
 *  always the current period, same as the sidebar badge (src/lib/nav-badges.ts). */
export interface AboExecutiveInput {
  proteksiPrograms: AboProgramComputed[];
  hargiPrograms: AboProgramComputed[];
  weekLabel: string;
}

export function monthOverMonth(
  category: DisturbanceCategoryResult,
): { current: number; previous: number; pctChange: number } | null {
  const year = category.years.at(-1);
  if (!year) return null;
  let lastIdx = -1;
  for (let i = category.monthlyByYear.length - 1; i >= 0; i--) {
    if (Number(category.monthlyByYear[i][year] ?? 0) > 0) {
      lastIdx = i;
      break;
    }
  }
  if (lastIdx <= 0) return null;
  const current = Number(category.monthlyByYear[lastIdx][year] ?? 0);
  const previous = Number(category.monthlyByYear[lastIdx - 1][year] ?? 0);
  if (previous === 0) return null;
  return { current, previous, pctChange: ((current - previous) / previous) * 100 };
}

/** Trend + dominant-cause pair shared by Transmisi, Trafo HV, and Trafo Low
 *  Voltage — same two rules, just parameterized by category + anchor. */
function pushDisturbanceAttention(
  push: (tone: AiInsight["tone"], text: string, href?: string) => void,
  category: DisturbanceCategoryResult,
  label: string,
  anchorId: string,
) {
  if (category.summary.total === 0) return;

  const trend = monthOverMonth(category);
  if (trend) {
    const tone = trend.pctChange > 0 ? "warning" : trend.pctChange < 0 ? "good" : "none";
    const direction = trend.pctChange > 0 ? "meningkat" : trend.pctChange < 0 ? "menurun" : "stabil";
    push(
      tone,
      `Gangguan ${label} ${direction} ${Math.abs(trend.pctChange).toFixed(0)}% dibanding bulan sebelumnya (${trend.previous} → ${trend.current} kejadian).`,
      `/dashboard/disturbances#${anchorId}`,
    );
  }
  const topCause = category.causePareto[0];
  if (topCause) {
    const pct = Math.round((topCause.count / category.summary.total) * 100);
    push(
      "none",
      `Penyebab gangguan ${label} terbesar: ${topCause.cause} (${pct}% dari total).`,
      `/dashboard/disturbances?cause=${encodeURIComponent(topCause.cause)}#${anchorId}`,
    );
  }
}

export function buildManagementAttention(params: {
  upt: UptPerformanceSnapshot | null;
  transmisi: DisturbanceCategoryResult | null;
  trafoHv: DisturbanceCategoryResult | null;
  trafoLv: DisturbanceCategoryResult | null;
  ahi: AhiSnapshot | null;
  bayLineReports: BayLineReport[] | null;
  renusReminders: AiInsight[] | null;
  abo: AboExecutiveInput | null;
  fourDx: FourDxWig[] | null;
}): AiInsight[] {
  const insights: AiInsight[] = [];
  let nextId = 0;
  const push = (tone: AiInsight["tone"], text: string, href?: string) =>
    insights.push({ id: String(nextId++), tone, text, href });

  const { upt, transmisi, trafoHv, trafoLv, ahi, bayLineReports, renusReminders, abo, fourDx } = params;

  if (upt) {
    if (upt.overall.critical > 0) {
      const critical = upt.kpis.filter((k) => k.status === "critical");
      const names = critical.map((k) => k.abbreviation ?? k.displayName).join(", ");
      push(
        "critical",
        `${upt.overall.critical} KPI UPT dalam kondisi kritis: ${names}.`,
        `/dashboard/performance/upt?highlight=${critical.map((k) => k.key).join(",")}#kpi-${critical[0].key}`,
      );
    }
    if (upt.overall.warning > 0) {
      const warning = upt.kpis.filter((k) => k.status === "warning");
      const names = warning.map((k) => k.abbreviation ?? k.displayName).join(", ");
      push(
        "warning",
        `${upt.overall.warning} KPI UPT di bawah target: ${names}.`,
        `/dashboard/performance/upt?highlight=${warning.map((k) => k.key).join(",")}#kpi-${warning[0].key}`,
      );
    }
    if (upt.overall.critical === 0 && upt.overall.warning === 0 && upt.overall.achieved > 0) {
      push(
        "good",
        `Seluruh ${upt.overall.achieved} KPI UPT yang tersedia datanya telah mencapai target periode ${upt.periodLabel}.`,
        "/dashboard/performance/upt",
      );
    }
  }

  if (transmisi) pushDisturbanceAttention(push, transmisi, "Transmisi", "transmisi");
  if (trafoHv) pushDisturbanceAttention(push, trafoHv, "Trafo HV", "trafo-hv");
  if (trafoLv) pushDisturbanceAttention(push, trafoLv, "Trafo Low Voltage", "trafo-lv");

  if (renusReminders) {
    for (const reminder of renusReminders) insights.push(reminder);
  }

  if (ahi) {
    const critical = ahi.sections.filter((s) => s.status === "critical");
    const warning = ahi.sections.filter((s) => s.status === "warning");
    if (critical.length > 0) {
      push(
        "critical",
        `${critical.map((s) => s.displayName).join(", ")} dalam kondisi kritis (ada hasil Critical).`,
        `/dashboard/kpi/ahi?section=${critical[0].key}#ahi-detail`,
      );
    }
    if (warning.length > 0) {
      push(
        "warning",
        `${warning.map((s) => s.displayName).join(", ")} perlu perhatian (ada hasil Poor).`,
        `/dashboard/kpi/ahi?section=${warning[0].key}#ahi-detail`,
      );
    }
    if (critical.length === 0 && warning.length === 0) {
      push("good", "Seluruh kategori AHI dalam kondisi sehat.", "/dashboard/kpi/ahi");
    }
  }

  // AHI Report (Bay Line): per-equipment Mandatory Pengujian / Pengujian
  // Ulang, rolled up across every bay line — same flags the Report tab
  // itself shows per unit, just aggregated here so a Poor/Critical/overdue
  // result buried in one specific bay's card doesn't go unnoticed.
  if (bayLineReports && bayLineReports.length > 0) {
    let retestUnits = 0;
    let mandatoryUnits = 0;
    const retestBays = new Set<string>();
    const mandatoryBays = new Set<string>();
    for (const report of bayLineReports) {
      for (const unit of report.units) {
        if (unit.parameters.some((p) => p.pengujianUlang)) {
          retestUnits += 1;
          retestBays.add(report.bay);
        }
        if (unit.parameters.some((p) => p.mandatoryPengujian)) {
          mandatoryUnits += 1;
          mandatoryBays.add(report.bay);
        }
      }
    }
    if (retestUnits > 0) {
      push(
        "critical",
        `${retestUnits} peralatan di ${retestBays.size} bay line memerlukan Pengujian Ulang (AHI Report).`,
        "/dashboard/kpi/ahi",
      );
    }
    if (mandatoryUnits > 0) {
      push(
        "warning",
        `${mandatoryUnits} peralatan di ${mandatoryBays.size} bay line memerlukan Mandatory Pengujian (AHI Report).`,
        "/dashboard/kpi/ahi",
      );
    }
  }

  if (abo) {
    const allPrograms = [...abo.proteksiPrograms, ...abo.hargiPrograms];
    const belum = allPrograms.filter((p) => p.status === "belum");
    if (belum.length > 0) {
      push(
        "warning",
        `${belum.length} program ABO belum tercapai target periode ini: ${belum
          .slice(0, 3)
          .map((p) => p.code)
          .join(", ")}${belum.length > 3 ? ", dll." : "."}`,
        "/dashboard/kpi/abo",
      );
    } else if (allPrograms.length > 0) {
      push("good", "Seluruh program ABO (Proteksi & Hargi) tercapai target periode ini.", "/dashboard/kpi/abo");
    }

    const attentionItems = [
      ...collectAboAttentionItems(abo.proteksiPrograms, abo.weekLabel),
      ...collectAboAttentionItems(abo.hargiPrograms, abo.weekLabel),
    ];
    const baMissing = attentionItems.filter((i) => i.issue === "BA belum diupload").length;
    if (baMissing > 0) {
      push("warning", `${baMissing} ruas ABO sudah direalisasi namun Berita Acara belum diupload.`, "/dashboard/kpi/abo");
    }
    const notOk = attentionItems.filter((i) => i.issue === "Kondisi NOT OK").length;
    if (notOk > 0) {
      push("critical", `${notOk} ruas ABO terealisasi dengan kondisi NOT OK — perlu tindak lanjut.`, "/dashboard/kpi/abo");
    }
  }

  if (fourDx) {
    const lms = fourDx.flatMap((w) => w.lms);
    const belum = lms.filter((lm) => lm.status === "belum");
    if (belum.length > 0) {
      push(
        "warning",
        `${belum.length} Lead Measure 4DX belum tercapai periode ini: ${belum
          .slice(0, 3)
          .map((lm) => `LM ${lm.code}`)
          .join(", ")}${belum.length > 3 ? ", dll." : "."}`,
        "/dashboard/kpi/4dx",
      );
    } else if (lms.length > 0) {
      push("good", "Seluruh Lead Measure 4DX tercapai periode ini.", "/dashboard/kpi/4dx");
    }
  }

  return insights;
}

/** Per-category automated commentary for the Gangguan page itself (trend +
 *  dominant cause) — same rule-based approach as buildManagementAttention. */
export function buildDisturbanceInsights(category: DisturbanceCategoryResult, label: string): AiInsight[] {
  const insights: AiInsight[] = [];
  let nextId = 0;
  const push = (tone: AiInsight["tone"], text: string) => insights.push({ id: String(nextId++), tone, text });

  if (category.summary.total === 0) return insights;

  const trend = monthOverMonth(category);
  if (trend) {
    const tone = trend.pctChange > 0 ? "warning" : trend.pctChange < 0 ? "good" : "none";
    const direction = trend.pctChange > 0 ? "meningkat" : trend.pctChange < 0 ? "menurun" : "stabil";
    push(
      tone,
      `Jumlah gangguan ${label} ${direction} ${Math.abs(trend.pctChange).toFixed(0)}% dibanding bulan sebelumnya (${trend.previous} → ${trend.current} kejadian).`,
    );
  }

  const topCause = category.causePareto[0];
  if (topCause) {
    const pct = Math.round((topCause.count / category.summary.total) * 100);
    push("none", `Penyebab ${label} terbesar: ${topCause.cause}, menyumbang ${pct}% dari total gangguan.`);
  }

  const topBay = category.topBay[0];
  if (topBay) {
    push("none", `Bay dengan gangguan terbanyak: ${topBay.bay} (${topBay.count} kejadian).`);
  }

  const topUltg = category.ultgBreakdown[0];
  if (topUltg) {
    const openPct = Math.round((topUltg.followUp.open / topUltg.total) * 100);
    const tone = openPct >= 40 ? "warning" : "none";
    push(
      tone,
      `${topUltg.ultg} — gangguan ${label} terbanyak (${topUltg.total} kejadian), ${topUltg.followUp.open} masih Open (${openPct}%).`,
    );
  }

  return insights;
}

export interface TopIssue {
  tone: AiInsight["tone"];
  text: string;
  href?: string;
}

/** Highest-severity item from each module, most severe first — for the
 *  "what needs attention right now" summary at a glance. */
export function buildTopIssues(params: {
  upt: UptPerformanceSnapshot | null;
  transmisi: DisturbanceCategoryResult | null;
  ahi: AhiSnapshot | null;
  abo: AboExecutiveInput | null;
  fourDx: FourDxWig[] | null;
}): TopIssue[] {
  const issues: TopIssue[] = [];
  const { upt, transmisi, ahi, abo, fourDx } = params;

  if (upt) {
    const worst = [...upt.kpis].filter((k) => k.achievement !== null).sort((a, b) => (a.achievement ?? 0) - (b.achievement ?? 0))[0];
    if (worst && worst.status !== "good") {
      issues.push({
        tone: worst.status,
        text: `${worst.abbreviation ?? worst.displayName} — achievement ${worst.achievement?.toFixed(1)}% (KPI UPT terendah).`,
        href: `/dashboard/performance/upt?highlight=${worst.key}#kpi-${worst.key}`,
      });
    }
  }

  if (transmisi) {
    const topCause = transmisi.causePareto[0];
    if (topCause) {
      const pct = Math.round((topCause.count / Math.max(1, transmisi.summary.total)) * 100);
      issues.push({
        tone: pct >= 40 ? "warning" : "none",
        text: `Penyebab gangguan Transmisi terbesar: ${topCause.cause} (${pct}%).`,
        href: `/dashboard/disturbances?cause=${encodeURIComponent(topCause.cause)}#transmisi`,
      });
    }
  }

  if (ahi) {
    const worst = [...ahi.sections].sort((a, b) => (a.score ?? 1) - (b.score ?? 1))[0];
    if (worst && worst.status !== "good" && worst.score !== null) {
      issues.push({
        tone: worst.status,
        text: `${worst.displayName} — Healthy Index ${Math.round(worst.score * 100)}% (terendah).`,
        href: `/dashboard/kpi/ahi?section=${worst.key}#ahi-detail`,
      });
    }
  }

  if (abo) {
    const allPrograms = [...abo.proteksiPrograms, ...abo.hargiPrograms];
    const worst = [...allPrograms].sort((a, b) => a.percentRealisasi - b.percentRealisasi)[0];
    if (worst && worst.status === "belum") {
      issues.push({
        tone: "warning",
        text: `${worst.code} — realisasi ABO ${Math.round(worst.percentRealisasi * 100)}% terhadap target total (terendah).`,
        href: "/dashboard/kpi/abo",
      });
    }
  }

  if (fourDx) {
    const lms = fourDx.flatMap((w) => w.lms);
    const worst = [...lms]
      .filter((lm) => lm.percentRealisasiMingguan !== null)
      .sort((a, b) => (a.percentRealisasiMingguan ?? 1) - (b.percentRealisasiMingguan ?? 1))[0];
    if (worst && worst.status === "belum") {
      issues.push({
        tone: "warning",
        text: `LM ${worst.code} — realisasi 4DX ${Math.round((worst.percentRealisasiMingguan ?? 0) * 100)}% minggu ini (terendah).`,
        href: "/dashboard/kpi/4dx",
      });
    }
  }

  return issues;
}

/** In-app reminder for RENUS — surfaced when the page loads, no server
 *  notification/cron involved. Priority order: overdue work (not scoped to
 *  any period — it's already late regardless of when "this week" is), then
 *  today's work, then high-risk work within the current Friday–Thursday
 *  period, then the period's total, then next month's workload — a
 *  condition with a zero count is simply not pushed, never rendered as an
 *  empty reminder. */
export function buildRenusReminders(data: RenusData, todayISO: string): AiInsight[] {
  const insights: AiInsight[] = [];
  let nextId = 0;
  const push = (tone: AiInsight["tone"], text: string, href: string) =>
    insights.push({ id: `renus-${nextId++}`, tone, text, href });

  const { rows, weekPeriod } = data;
  const isActive = (r: RenusData["rows"][number]) => !isRenusCancelled(r);

  const overdue = rows.filter((r) => isActive(r) && !isRenusDone(r) && r.rencanaDate < todayISO);
  if (overdue.length > 0) {
    push(
      "critical",
      `${overdue.length} pekerjaan melewati tanggal rencana.`,
      "/dashboard/renus?view=overdue",
    );
  }

  const today = rows.filter((r) => isActive(r) && r.rencanaDate === todayISO);
  if (today.length > 0) {
    push("warning", `${today.length} pekerjaan dijadwalkan hari ini.`, "/dashboard/renus?view=today");
  }

  const highRiskThisWeek = rows.filter(
    (r) => isActive(r) && isRenusHighRisk(r) && r.rencanaDate >= weekPeriod.start && r.rencanaDate <= weekPeriod.end,
  );
  if (highRiskThisWeek.length > 0) {
    push(
      "warning",
      `${highRiskThisWeek.length} pekerjaan berisiko tinggi pada periode ${weekPeriod.label}.`,
      "/dashboard/renus?view=week&risk=high-risk-any",
    );
  }

  if (data.summary.thisWeek > 0) {
    push(
      "none",
      `Terdapat ${data.summary.thisWeek} pekerjaan pemeliharaan pada periode ${weekPeriod.label}.`,
      "/dashboard/renus?view=week",
    );
  }

  const nextMonthActive = data.nextMonth.rows.filter(isActive);
  if (nextMonthActive.length > 0) {
    const nextMonthHighRisk = nextMonthActive.filter((r) => isRenusHighRisk(r));
    const riskNote = nextMonthHighRisk.length > 0 ? `, ${nextMonthHighRisk.length} di antaranya berisiko tinggi` : "";
    push(
      "none",
      `${nextMonthActive.length} pekerjaan direncanakan bulan depan (${data.nextMonth.monthLabel} ${data.nextMonth.year})${riskNote}.`,
      "/dashboard/renus?view=month",
    );
  }

  return insights;
}
