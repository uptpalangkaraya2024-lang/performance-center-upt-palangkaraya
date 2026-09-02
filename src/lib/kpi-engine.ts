// Centralized KPI calculation — the one place formulas live, so every page
// that shows achievement/status/trend agrees with every other. See AGENTS.md
// section 43 ("KPI Engine"): formulas must not be scattered across components.
import type { StatusLevel } from "@/types";

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
