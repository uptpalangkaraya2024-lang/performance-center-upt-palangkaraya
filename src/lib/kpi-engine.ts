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
