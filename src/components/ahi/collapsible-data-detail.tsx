"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AhiSectionSummary } from "@/types";
import { AhiDataDetail } from "./ahi-data-detail";

export function CollapsibleDataDetail({ sections }: { sections: AhiSectionSummary[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-fit items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50"
      >
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        {open ? "Sembunyikan Data Detail" : "Tampilkan Data Detail"}
      </button>
      {open ? <AhiDataDetail sections={sections} /> : null}
    </div>
  );
}
