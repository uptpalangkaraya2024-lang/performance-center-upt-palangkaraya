"use client";

// Risk-based maintenance/replacement proposal list (features #6 + #9) —
// every proposal is traceable back to plain counts from already-computed
// data (never a fabricated judgment), explicitly framed as a suggestion
// for engineering review rather than an automated decision, matching the
// user's own stated goal: "usulan jadi lebih mudah dipertahankan" (a
// proposal that's easier to defend needs its reasoning visible, not just
// a ranked number).
import { useMemo, useState } from "react";
import { AlertTriangle, Info, ShieldAlert, Wrench } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ExportExcelButton } from "@/components/dashboard/export-excel-button";
import { cn } from "@/lib/utils";
import type { MaintenanceProposal, ProposalAction } from "@/lib/maintenance-proposals";

const ALL = "__all__";

const ACTION_STYLE: Record<ProposalAction, string> = {
  Penggantian: "border-critical/40 bg-critical/10 text-critical",
  "Pemeliharaan Prioritas": "border-warning/50 bg-warning/10 text-warning-foreground",
  Monitor: "border-border bg-muted text-muted-foreground",
};
const ACTION_ICON: Record<ProposalAction, typeof Wrench> = {
  Penggantian: ShieldAlert,
  "Pemeliharaan Prioritas": Wrench,
  Monitor: Info,
};

function klasifikasiPillClass(k: string): string {
  if (k === "CRITICAL") return "border-critical/40 bg-critical/20 text-critical";
  if (k === "POOR") return "border-warning/50 bg-warning/20 text-warning-foreground";
  return "border-border bg-muted text-muted-foreground";
}

export function UsulanPrioritasClient({ proposals }: { proposals: MaintenanceProposal[] }) {
  const [action, setAction] = useState<ProposalAction | typeof ALL>(ALL);
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () =>
      proposals.filter(
        (p) => (action === ALL || p.action === action) && (search.trim() === "" || p.gi.toLowerCase().includes(search.trim().toLowerCase())),
      ),
    [proposals, action, search],
  );

  const countByAction = useMemo(() => {
    const m: Record<ProposalAction, number> = { Penggantian: 0, "Pemeliharaan Prioritas": 0, Monitor: 0 };
    for (const p of proposals) m[p.action]++;
    return m;
  }, [proposals]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2 rounded-lg border border-info/40 bg-info/10 p-3 text-sm text-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-info" />
        <p>
          Usulan ini dihasilkan otomatis dari data historis (AHI, Common Enemy, Gangguan, RENUS) — bukan keputusan
          otomatis. Setiap alasan dapat ditelusuri kembali ke data aslinya; tinjau kembali sebelum dimasukkan ke
          perencanaan anggaran tahun depan.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="overflow-hidden rounded-lg border bg-muted">
          <div className="h-1.5 w-full bg-critical" />
          <div className="p-3">
            <div className="text-xl font-extrabold tabular-nums text-critical">{countByAction.Penggantian}</div>
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Usul Penggantian</div>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border bg-muted">
          <div className="h-1.5 w-full bg-warning" />
          <div className="p-3">
            <div className="text-xl font-extrabold tabular-nums text-warning-foreground">{countByAction["Pemeliharaan Prioritas"]}</div>
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Pemeliharaan Prioritas</div>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border bg-muted">
          <div className="h-1.5 w-full bg-primary" />
          <div className="p-3">
            <div className="text-xl font-extrabold tabular-nums text-foreground">{countByAction.Monitor}</div>
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Monitor</div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={action} onValueChange={(v) => v && setAction(v as ProposalAction | typeof ALL)}>
            <SelectTrigger size="sm" className="w-[200px]">
              <SelectValue placeholder="Usulan">{action === ALL ? "Semua Usulan" : action}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Semua Usulan</SelectItem>
              <SelectItem value="Penggantian">Penggantian</SelectItem>
              <SelectItem value="Pemeliharaan Prioritas">Pemeliharaan Prioritas</SelectItem>
              <SelectItem value="Monitor">Monitor</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari GI..."
            className="h-8 w-[180px] text-sm"
          />
        </div>
        <ExportExcelButton
          filename="Usulan-Prioritas-Pemeliharaan-UPT-Palangkaraya.xlsx"
          sheets={[
            {
              name: "Usulan Prioritas",
              rows: filtered.map((p) => ({
                GI: p.gi,
                Usulan: p.action,
                "Skor Risiko": p.riskScore,
                "AHI Critical": p.ahiCritical,
                "AHI Poor": p.ahiPoor,
                "CE Open": p.ceOpen,
                Gangguan: p.gangguanTotal,
                "RENUS Overdue": p.renusOverdue,
                "Tren Memburuk": p.degradingCount,
                Alasan: p.reasons.join(" | "),
              })),
            },
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Tidak ada GI dengan usulan pada filter ini.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((p) => {
            const Icon = ACTION_ICON[p.action];
            return (
              <Card key={p.gi}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-lg font-extrabold">GI {p.gi}</CardTitle>
                      <p className="text-xs text-muted-foreground">Skor risiko: {p.riskScore}</p>
                    </div>
                    <span className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold whitespace-nowrap", ACTION_STYLE[p.action])}>
                      <Icon className="size-3.5" /> {p.action}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <ul className="flex flex-col gap-1.5">
                    {p.reasons.map((reason, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                        {reason}
                      </li>
                    ))}
                  </ul>
                  {p.equipmentFlags.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 border-t pt-2.5">
                      {p.equipmentFlags.map((e, i) => (
                        <span
                          key={i}
                          className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold", klasifikasiPillClass(e.klasifikasi))}
                          title={`${e.bay}${e.merk ? ` · ${e.merk}` : ""}`}
                        >
                          {e.role}
                          {e.techident ? ` (${e.techident})` : ""} — {e.klasifikasi}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
