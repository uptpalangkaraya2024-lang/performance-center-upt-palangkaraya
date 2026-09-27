import { AlertTriangle, CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StatusLevel } from "@/types";

// Labels reflect what the status actually measures here — presence of Poor/
// Critical findings in the sheet's own distribution, not a scored threshold
// (none is stated in the source — see src/services/ahi-performance.ts).
const STATUS_CONFIG: Record<StatusLevel, { label: string; icon: typeof CheckCircle2; className: string }> = {
  good: { label: "Sehat", icon: CheckCircle2, className: "bg-success/20 text-success border-success/40" },
  warning: {
    label: "Perlu Perhatian",
    icon: AlertTriangle,
    className: "bg-warning/20 text-warning-foreground border-warning/50",
  },
  critical: { label: "Kritis", icon: XCircle, className: "bg-critical/20 text-critical border-critical/40" },
  none: { label: "No Data", icon: CircleDashed, className: "bg-muted text-muted-foreground border-border" },
};

export function AhiStatusBadge({ status, className }: { status: StatusLevel; className?: string }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold",
        config.className,
        className,
      )}
    >
      <Icon className="size-3.5" />
      {config.label}
    </span>
  );
}
