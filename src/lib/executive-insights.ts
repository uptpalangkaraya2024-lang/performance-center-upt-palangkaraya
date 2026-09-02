// Rule-based executive insights for the Overview dashboard — plain
// if/else over already-computed service data, no AI/LLM call of any kind.
// See AGENTS.md "AI ASSISTANT" section: rule-based insight is explicitly
// permitted, an AI backend is not.
import type { AhiSnapshot, AiInsight, DisturbanceCategoryResult, UptPerformanceSnapshot } from "@/types";

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

export function buildManagementAttention(params: {
  upt: UptPerformanceSnapshot | null;
  transmisi: DisturbanceCategoryResult | null;
  ahi: AhiSnapshot | null;
}): AiInsight[] {
  const insights: AiInsight[] = [];
  let nextId = 0;
  const push = (tone: AiInsight["tone"], text: string) => insights.push({ id: String(nextId++), tone, text });

  const { upt, transmisi, ahi } = params;

  if (upt) {
    if (upt.overall.critical > 0) {
      const names = upt.kpis
        .filter((k) => k.status === "critical")
        .map((k) => k.abbreviation ?? k.displayName)
        .join(", ");
      push("critical", `${upt.overall.critical} KPI UPT dalam kondisi kritis: ${names}.`);
    }
    if (upt.overall.warning > 0) {
      const names = upt.kpis
        .filter((k) => k.status === "warning")
        .map((k) => k.abbreviation ?? k.displayName)
        .join(", ");
      push("warning", `${upt.overall.warning} KPI UPT di bawah target: ${names}.`);
    }
    if (upt.overall.critical === 0 && upt.overall.warning === 0 && upt.overall.achieved > 0) {
      push(
        "good",
        `Seluruh ${upt.overall.achieved} KPI UPT yang tersedia datanya telah mencapai target periode ${upt.periodLabel}.`,
      );
    }
  }

  if (transmisi && transmisi.summary.total > 0) {
    const trend = monthOverMonth(transmisi);
    if (trend) {
      const tone = trend.pctChange > 0 ? "warning" : trend.pctChange < 0 ? "good" : "none";
      const direction = trend.pctChange > 0 ? "meningkat" : trend.pctChange < 0 ? "menurun" : "stabil";
      push(
        tone,
        `Gangguan Transmisi ${direction} ${Math.abs(trend.pctChange).toFixed(0)}% dibanding bulan sebelumnya (${trend.previous} → ${trend.current} kejadian).`,
      );
    }
    const topCause = transmisi.causePareto[0];
    if (topCause) {
      const pct = Math.round((topCause.count / transmisi.summary.total) * 100);
      push("none", `Penyebab gangguan Transmisi terbesar: ${topCause.cause} (${pct}% dari total).`);
    }
  }

  if (ahi) {
    const critical = ahi.sections.filter((s) => s.status === "critical");
    const warning = ahi.sections.filter((s) => s.status === "warning");
    if (critical.length > 0) {
      push("critical", `${critical.map((s) => s.displayName).join(", ")} dalam kondisi kritis (ada hasil Critical).`);
    }
    if (warning.length > 0) {
      push("warning", `${warning.map((s) => s.displayName).join(", ")} perlu perhatian (ada hasil Poor).`);
    }
    if (critical.length === 0 && warning.length === 0) {
      push("good", "Seluruh kategori AHI dalam kondisi sehat.");
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

  return insights;
}

export interface TopIssue {
  tone: AiInsight["tone"];
  text: string;
}

/** Highest-severity item from each module, most severe first — for the
 *  "what needs attention right now" summary at a glance. */
export function buildTopIssues(params: {
  upt: UptPerformanceSnapshot | null;
  transmisi: DisturbanceCategoryResult | null;
  ahi: AhiSnapshot | null;
}): TopIssue[] {
  const issues: TopIssue[] = [];
  const { upt, transmisi, ahi } = params;

  if (upt) {
    const worst = [...upt.kpis].filter((k) => k.achievement !== null).sort((a, b) => (a.achievement ?? 0) - (b.achievement ?? 0))[0];
    if (worst && worst.status !== "good") {
      issues.push({
        tone: worst.status,
        text: `${worst.abbreviation ?? worst.displayName} — achievement ${worst.achievement?.toFixed(1)}% (KPI UPT terendah).`,
      });
    }
  }

  if (transmisi) {
    const topCause = transmisi.causePareto[0];
    if (topCause) {
      const pct = Math.round((topCause.count / Math.max(1, transmisi.summary.total)) * 100);
      issues.push({ tone: pct >= 40 ? "warning" : "none", text: `Penyebab gangguan Transmisi terbesar: ${topCause.cause} (${pct}%).` });
    }
  }

  if (ahi) {
    const worst = [...ahi.sections].sort((a, b) => (a.score ?? 1) - (b.score ?? 1))[0];
    if (worst && worst.status !== "good" && worst.score !== null) {
      issues.push({ tone: worst.status, text: `${worst.displayName} — Healthy Index ${Math.round(worst.score * 100)}% (terendah).` });
    }
  }

  return issues;
}
