import type { OpenCaseSummary } from "@/types";

const ITEMS: { key: keyof OpenCaseSummary; label: string; className: string }[] = [
  { key: "total", label: "Total", className: "text-foreground" },
  { key: "overdue", label: "Overdue", className: "text-critical" },
  { key: "dueSoon", label: "Due Soon", className: "text-warning-foreground" },
  { key: "inProgress", label: "In Progress", className: "text-primary" },
];

export function OpenCaseSummaryGrid({ data }: { data: OpenCaseSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {ITEMS.map((item) => (
        <div key={item.key} className="rounded-lg border p-3">
          <div className={`text-xl font-semibold tabular-nums ${item.className}`}>
            {data[item.key]}
          </div>
          <div className="text-xs text-muted-foreground">{item.label}</div>
        </div>
      ))}
    </div>
  );
}
