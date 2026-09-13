"use client";

import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ManagementAttentionList } from "@/components/dashboard/management-attention-list";
import { AiInsightList } from "@/components/dashboard/ai-insight-list";
import type { AiInsight } from "@/types";

interface TopIssue {
  tone: AiInsight["tone"];
  text: string;
  href?: string;
}

// Fetched client-side after mount, deliberately NOT part of the homepage's
// own server-rendered request (src/app/dashboard/page.tsx) — ABO (2 files)
// + 4DX (9 sheets) pushed that request's total data-fetch time over
// Vercel's serverless function duration limit, intermittently returning a
// hard server-error page for every visitor instead of just this one card
// arriving a bit late. Same fix pattern as the sidebar's nav badges (see
// src/components/layout/app-sidebar.tsx).
export function AboFourDxInsights() {
  const [data, setData] = useState<{ managementAttention: AiInsight[]; topIssues: TopIssue[] } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/exec-abo-4dx-insights")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed || (data && data.managementAttention.length === 0 && data.topIssues.length === 0)) return null;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader>
          <div className="flex items-center gap-1.5">
            <Gauge className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">ABO &amp; 4DX</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {data ? (
            <ManagementAttentionList data={data.managementAttention} emptyMessage="Tidak ada catatan ABO/4DX untuk periode ini." />
          ) : (
            <p className="text-sm text-muted-foreground">Memuat ABO &amp; 4DX...</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top Issue ABO/4DX</CardTitle>
        </CardHeader>
        <CardContent>
          {data ? (
            <AiInsightList
              data={data.topIssues.map((issue, index) => ({ id: String(index), tone: issue.tone, text: issue.text, href: issue.href }))}
              title="Top Issue"
              emptyMessage="Tidak ada isu prioritas ABO/4DX saat ini."
            />
          ) : (
            <p className="text-sm text-muted-foreground">Memuat...</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
