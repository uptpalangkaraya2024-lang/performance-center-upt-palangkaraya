// Centralized KPI calculation — the one place formulas live, so every page
// that shows achievement/status/trend agrees with every other. See AGENTS.md
// section 43 ("KPI Engine"): formulas must not be scattered across components.
import type { StatusLevel, UptOverallPerformance } from "@/types";

export function calculateAchievement(target: number, actual: number): number {
  if (target === 0) return 0;
  return Math.round((actual / target) * 1000) / 10;
}

const STATUS_THRESHOLDS = { good: 100, warning: 90 } as const;

export function calculateStatus(achievement: number): StatusLevel {
  if (achievement >= STATUS_THRESHOLDS.good) return "good";
  if (achievement >= STATUS_THRESHOLDS.warning) return "warning";
  return "critical";
}

export interface AchievedPercentage {
  /** null when there's nothing scoreable at all this period (every KPI is
   *  "none"/no-data) — never silently shown as 0%, which would read as
   *  "achieved nothing" rather than "nothing to score yet". */
  pct: number | null;
  /** KPIs actually counted in the percentage (achieved+warning+critical). */
  scoredCount: number;
  /** Every KPI in the config, including ones with no data this period. */
  totalCount: number;
  noDataCount: number;
}

/**
 * The ONE place "% KPI tercapai" gets computed from a status breakdown —
 * before this, the homepage, Laporan Eksekutif, and (implicitly, by never
 * showing it) Kinerja ULTG each had their own idea of the denominator.
 * Confirmed live: the homepage divided by (achieved+warning+critical),
 * excluding no-data KPIs, while Laporan Eksekutif divided by the full KPI
 * count including no-data ones — same underlying achieved/warning/critical
 * counts, two different percentages, shown side by side as if they were
 * the same number (e.g. "72%" vs "69,7%"). A KPI with no data this period
 * genuinely has nothing to score yet, so it's excluded from BOTH the
 * numerator and denominator here — same rule FASE 1.1 applies to the
 * no-data status itself, kept consistent in one place rather than redone
 * ad hoc wherever a percentage is shown.
 */
export function calculateAchievedPercentage(overall: UptOverallPerformance): AchievedPercentage {
  const scoredCount = overall.achieved + overall.warning + overall.critical;
  return {
    pct: scoredCount > 0 ? Math.round((overall.achieved / scoredCount) * 1000) / 10 : null,
    scoredCount,
    totalCount: overall.total,
    noDataCount: overall.noData,
  };
}

/** Indonesian-locale percentage string, one decimal place, the single
 *  formatting convention every achieved-% display in this app now shares
 *  ("72,4%", never "72%" in one place and "72,4%" in another). */
export function formatAchievedPercentage(pct: number | null): string {
  return pct === null ? "-" : `${pct.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/**
 * Status "none" (NO_DATA) already applied when the sheet's own Pencapaian
 * cell is blank (achievement === null) — this extends it to one more
 * concrete, unambiguous case: BOTH Target and Realisasi are blank too,
 * which some rows reach with a non-null achievement of exactly 0 (a
 * spreadsheet formula default, not a real figure) rather than a blank
 * Pencapaian cell. Deliberately narrow — does NOT reclassify a KPI with a
 * real target and a real (possibly zero) actual value as "none", since a
 * literal 0 actual is a legitimate, sometimes the BEST possible, result
 * for a LOWER_IS_BETTER KPI (e.g. zero gangguan) and misreading it as
 * "no data" would hide a genuine achievement, not just a genuine problem.
 */
export function deriveKpiStatus(
  achievement: number | null,
  actualValue: number | null,
  targetValue: number | null,
): StatusLevel {
  if (achievement === null) return "none";
  if (actualValue === null && targetValue === null) return "none";
  return calculateStatus(achievement);
}

export function calculateTrend(current: number, previous: number | null): "up" | "down" | "flat" {
  if (previous === null) return "flat";
  if (current > previous) return "up";
  if (current < previous) return "down";
  return "flat";
}

export interface KpiGap {
  /** Signed raw difference (actual - target), in the KPI's own unit. */
  value: number | null;
  /** Direction-aware, human-readable wording — never just a signed number on
   *  its own, since for a LOWER_IS_BETTER KPI a positive raw difference means
   *  a worse outcome, not a better one. Does not recompute or replace the
   *  sheet's own Achievement value — purely an interpretation aid. */
  label: string;
}

/**
 * Explicit Target-vs-Realisasi gap for display, direction-aware so a
 * LOWER_IS_BETTER KPI reading "above target" is never confused with "ahead of
 * target". Does not touch calculateAchievement/calculateStatus — those stay
 * exactly as sourced from the sheet's own Pencapaian column.
 */
export function computeGap(
  targetValue: number | null,
  actualValue: number | null,
  direction: "HIGHER_IS_BETTER" | "LOWER_IS_BETTER" | null,
  unit: string | null,
): KpiGap {
  if (targetValue === null || actualValue === null) return { value: null, label: "-" };

  const diff = Math.round((actualValue - targetValue) * 100) / 100;
  const abs = Math.abs(diff).toLocaleString("id-ID", { maximumFractionDigits: 2 });
  const unitSuffix = unit === "%" ? " pp" : unit ? ` ${unit}` : "";

  if (diff === 0) return { value: 0, label: "Sesuai target" };

  if (direction === "LOWER_IS_BETTER") {
    return diff > 0
      ? { value: diff, label: `+${abs}${unitSuffix} di atas target` }
      : { value: diff, label: `${abs}${unitSuffix} di bawah target` };
  }
  if (direction === "HIGHER_IS_BETTER") {
    return diff < 0
      ? { value: diff, label: `${abs}${unitSuffix} di bawah target` }
      : { value: diff, label: `+${abs}${unitSuffix} di atas target` };
  }

  // Direction unresolved from the source (e.g. POLARITAS "Range") — show the
  // raw difference without asserting whether it's good or bad.
  const sign = diff > 0 ? "+" : "-";
  return { value: diff, label: `${sign}${abs}${unitSuffix} dari target` };
}
