"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, RefreshCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

export function DataUnavailable({ message }: { message?: string }) {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/30 py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-warning/15 text-warning-foreground">
        <AlertTriangle className="size-5" />
      </span>
      <div>
        <p className="text-sm font-semibold text-foreground">Data belum tersedia</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
          {message ?? "Data source sedang tidak tersedia. Silakan periksa kembali koneksi sumber data."}
        </p>
      </div>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => router.refresh()}>
        <RefreshCcw className="size-3.5" />
        Refresh
      </Button>
    </div>
  );
}
