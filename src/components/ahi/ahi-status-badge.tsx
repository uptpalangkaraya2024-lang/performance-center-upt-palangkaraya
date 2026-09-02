import { AlertTriangle, CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StatusLevel } from "@/types";

// Labels reflect what the status actually measures here — presence of Poor/
// Critical findings in the sheet's own distribution, not a scored threshold
// (none is stated in the source — see src/services/ahi-performance.ts).
const STATUS_CONFIG: Record<StatusLevel, { label: string; icon: typeof CheckCircle2; className: string }> = {
  good: { label: "Sehat", icon: CheckCircle2, className: "bg-success/10 text-success border-success/20" },
  warning: {
    label: "Perlu Perhatian",
    icon: AlertTriangle,
    className: "bg-warning/15 text-warning-foreground border-warning/30",
  },
  critical: { label: "Kritis", icon: XCircle, className: "bg-critical/10 text-critical border-critical/20" },
  none: { label: "No Data", icon: CircleDashed, className: "bg-muted text-muted-foreground border-border" },
};

export function AhiStatusBadge({ status, className }: { status: StatusLevel; className?: string }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        config.className,
        className,
      )}
    >
      <Icon className="size-3" />
      {config.label}
    </span>
  );
}
