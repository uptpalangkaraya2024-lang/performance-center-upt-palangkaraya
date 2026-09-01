// Formatting only — no business logic (achievement/status are already
// computed in src/services/upt-performance.ts).
export function formatKpiValue(value: number | null, label: string | null, unit: string | null): string {
  if (value === null) return label ?? "-";
  const rounded = Math.round(value * 100) / 100;
  const formatted = rounded.toLocaleString("id-ID", { maximumFractionDigits: 2 });
  if (!unit) return formatted;
  return unit === "%" ? `${formatted}%` : `${formatted} ${unit}`;
}

export function formatAchievement(achievement: number | null): string {
  if (achievement === null) return "-";
  return `${(Math.round(achievement * 100) / 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;
}
