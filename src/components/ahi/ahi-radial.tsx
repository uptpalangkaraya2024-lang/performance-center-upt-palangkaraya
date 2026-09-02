import { cn } from "@/lib/utils";
import type { StatusLevel } from "@/types";

const STROKE_BY_STATUS: Record<StatusLevel, string> = {
  good: "var(--success)",
  warning: "var(--warning)",
  critical: "var(--critical)",
  none: "var(--muted-foreground)",
};

// A small, dependency-free SVG ring — "visual progress/radial ringan" per
// the brief, not a charting-library gauge.
export function AhiRadial({
  value,
  status,
  size = 88,
  strokeWidth = 8,
}: {
  value: number | null; // 0-1 fraction
  status: StatusLevel;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = value === null ? 0 : Math.max(0, Math.min(1, value));
  const offset = circumference * (1 - pct);

  return (
    <div className={cn("relative shrink-0")} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={strokeWidth}
        />
        {value !== null ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={STROKE_BY_STATUS[status]}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.5s ease" }}
          />
        ) : null}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold tabular-nums text-foreground">
          {value === null ? "-" : `${Math.round(value * 100)}%`}
        </span>
      </div>
    </div>
  );
}
