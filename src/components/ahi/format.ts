export function formatPercent(value: number | null): string {
  if (value === null) return "-";
  return `${(value * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;
}

export function formatCount(value: number | null): string {
  if (value === null) return "-";
  return value.toLocaleString("id-ID");
}
