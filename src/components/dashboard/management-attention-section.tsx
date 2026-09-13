"use client";

import { useEffect, useState } from "react";

import { AttentionCards } from "@/components/dashboard/attention-cards";
import type { AiInsight } from "@/types";

// Merges the homepage's own server-rendered insights (Kinerja UPT,
// Gangguan, AHI, RENUS — fast, no Apps Script bottleneck) with ABO + 4DX's
// insights fetched client-side after mount, into ONE unified Management
// Attention list — per user feedback, having a separate "ABO & 4DX" card
// (and a separate "Top Issue" card before that) was confusing about which
// number belonged to which module. ABO/4DX stay client-fetched rather than
// part of the initial SSR request: their combined data-fetch time (2 files
// + 9 sheets) previously pushed this page's total render time over
// Vercel's serverless function duration limit (see
// src/app/api/exec-abo-4dx-insights/route.ts for the full history).
export function ManagementAttentionSection({ initialInsights }: { initialInsights: AiInsight[] }) {
  const [aboFourDx, setAboFourDx] = useState<AiInsight[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/exec-abo-4dx-insights")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((json: { managementAttention: AiInsight[] }) => {
        if (!cancelled) setAboFourDx(json.managementAttention);
      })
      .catch(() => {
        // ABO/4DX simply don't show up in the list — never breaks the rest.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-keyed to avoid colliding with the SSR list's own "0", "1", ... ids
  // once both are rendered together.
  const combined = [...initialInsights, ...aboFourDx.map((item) => ({ ...item, id: `ext-${item.id}` }))];

  return <AttentionCards data={combined} />;
}
