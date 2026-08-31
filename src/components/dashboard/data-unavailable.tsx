import { AlertTriangle } from "lucide-react";

export function DataUnavailable({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-center">
      <AlertTriangle className="size-5 text-warning" />
      <p className="text-sm font-medium">Data source temporarily unavailable.</p>
      {message ? (
        <p className="max-w-sm text-xs text-muted-foreground">{message}</p>
      ) : null}
    </div>
  );
}
