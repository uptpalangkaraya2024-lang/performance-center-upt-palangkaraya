"use client";

// Risk-based maintenance/replacement proposal list (features #6 + #9) —
// every proposal is traceable back to plain counts from already-computed
// data (never a fabricated judgment), explicitly framed as a suggestion
// for engineering review rather than an automated decision, matching the
// user's own stated goal: "usulan jadi lebih mudah dipertahankan" (a
// proposal that's easier to defend needs its reasoning visible, not just
// a ranked number).
import { useMemo, useState } from "react";
import { AlertTriangle, Calculator, CheckCircle2, ClipboardX, Info, ShieldAlert, Wrench } from "lucide-react";

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

function formatRupiah(n: number): string {
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`;
}

// Default per-proposal cost ASSUMPTIONS, not real financial data — this
// app has no cost data source anywhere (every module here is read-only
// over Google Sheets with no budget/cost column). Shown and adjustable
// right in the UI, never presented as an authoritative figure, so the
// calculator stays honest about what it actually is: a what-if allocator
// over a transparent, user-editable assumption, not real procurement data.
const DEFAULT_COST_PENGGANTIAN = 150_000_000;
const DEFAULT_COST_PEMELIHARAAN = 40_000_000;

/** Greedy budget allocator — ranks actionable proposals (excludes Monitor,
 *  which has no proposed spend) by risk-covered-per-rupiah, then takes as
 *  many as fit under the given budget. A simple greedy pass, not a true
 *  knapsack optimum, but transparent and instant — the right trade-off for
 *  a live "what-if" calculator a planner is dragging a slider on, not a
 *  one-shot optimization. */
function BudgetCalculator({ proposals }: { proposals: MaintenanceProposal[] }) {
  const [budget, setBudget] = useState(1_000_000_000);
  const [costPenggantian, setCostPenggantian] = useState(DEFAULT_COST_PENGGANTIAN);
  const [costPemeliharaan, setCostPemeliharaan] = useState(DEFAULT_COST_PEMELIHARAAN);

  const { selected, cut, totalCost, totalRiskCovered } = useMemo(() => {
    const actionable = proposals
      .filter((p) => p.action !== "Monitor")
      .map((p) => ({
        proposal: p,
        cost: p.action === "Penggantian" ? costPenggantian : costPemeliharaan,
      }))
      .sort((a, b) => b.proposal.riskScore / b.cost - a.proposal.riskScore / a.cost);

    const selected: { proposal: MaintenanceProposal; cost: number }[] = [];
    const cut: { proposal: MaintenanceProposal; cost: number }[] = [];
    let remaining = budget;
    for (const item of actionable) {
      if (item.cost <= remaining) {
        selected.push(item);
        remaining -= item.cost;
      } else {
        cut.push(item);
      }
    }
    return {
      selected,
      cut,
      totalCost: budget - remaining,
      totalRiskCovered: selected.reduce((s, i) => s + i.proposal.riskScore, 0),
    };
  }, [proposals, budget, costPenggantian, costPemeliharaan]);

  const totalRiskAll = proposals.filter((p) => p.action !== "Monitor").reduce((s, p) => s + p.riskScore, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-base font-extrabold">
          <Calculator className="size-4.5 text-primary" />
          Kalkulator Alokasi Anggaran
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Tidak ada data biaya riil di sistem ini — asumsi biaya per usulan di bawah dapat disesuaikan. Kalkulator
          memilih kombinasi usulan dengan cakupan risiko terbesar per rupiah, sampai anggaran habis.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Total Anggaran (Rp)
            <Input
              type="number"
              min={0}
              step={10_000_000}
              value={budget}
              onChange={(e) => setBudget(Math.max(0, Number(e.target.value) || 0))}
              className="h-8 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Asumsi Biaya Penggantian (Rp)
            <Input
              type="number"
              min={0}
              step={10_000_000}
              value={costPenggantian}
              onChange={(e) => setCostPenggantian(Math.max(0, Number(e.target.value) || 0))}
              className="h-8 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Asumsi Biaya Pemeliharaan Prioritas (Rp)
            <Input
              type="number"
              min={0}
              step={5_000_000}
              value={costPemeliharaan}
              onChange={(e) => setCostPemeliharaan(Math.max(0, Number(e.target.value) || 0))}
              className="h-8 text-sm"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="text-lg font-extrabold tabular-nums text-foreground">{selected.length}</div>
            <div className="text-xs text-muted-foreground">GI Terpilih</div>
          </div>
          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="text-lg font-extrabold tabular-nums text-foreground">{formatRupiah(totalCost)}</div>
            <div className="text-xs text-muted-foreground">Anggaran Terpakai</div>
          </div>
          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="text-lg font-extrabold tabular-nums text-foreground">{formatRupiah(Math.max(0, budget - totalCost))}</div>
            <div className="text-xs text-muted-foreground">Sisa Anggaran</div>
          </div>
          <div className="rounded-lg border bg-muted/40 p-3">
            <div className="text-lg font-extrabold tabular-nums text-foreground">
              {totalRiskAll > 0 ? Math.round((totalRiskCovered / totalRiskAll) * 100) : 0}%
            </div>
            <div className="text-xs text-muted-foreground">Cakupan Skor Risiko</div>
          </div>
        </div>

        {selected.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/70 text-left text-xs text-muted-foreground uppercase">
                  <th className="px-3 py-2 font-bold">GI</th>
                  <th className="px-3 py-2 font-bold">Usulan</th>
                  <th className="px-3 py-2 text-right font-bold">Skor Risiko</th>
                  <th className="px-3 py-2 text-right font-bold">Estimasi Biaya</th>
                </tr>
              </thead>
              <tbody>
                {selected.map(({ proposal, cost }) => (
                  <tr key={proposal.gi} className="border-b last:border-0">
                    <td className="px-3 py-2 font-medium text-foreground">{proposal.gi}</td>
                    <td className="px-3 py-2 text-muted-foreground">{proposal.action}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{proposal.riskScore}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{formatRupiah(cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Anggaran belum cukup untuk usulan manapun pada asumsi biaya saat ini.</p>
        )}

        {cut.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            {cut.length} GI belum masuk alokasi karena anggaran habis: {cut.map((c) => c.proposal.gi).slice(0, 8).join(", ")}
            {cut.length > 8 ? ", dll." : "."}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
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

      <BudgetCalculator proposals={proposals} />

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
                "Ada Rencana RENUS": p.hasActiveRenusPlan ? "Ya" : "Tidak",
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
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold whitespace-nowrap", ACTION_STYLE[p.action])}>
                        <Icon className="size-3.5" /> {p.action}
                      </span>
                      {p.action !== "Monitor" ? (
                        p.hasActiveRenusPlan ? (
                          <span className="flex items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-3 py-1 text-xs font-bold whitespace-nowrap text-success">
                            <CheckCircle2 className="size-3.5" /> Sudah ada rencana RENUS
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 rounded-full border border-warning/50 bg-warning/10 px-3 py-1 text-xs font-bold whitespace-nowrap text-warning-foreground">
                            <ClipboardX className="size-3.5" /> Belum ada rencana RENUS
                          </span>
                        )
                      ) : null}
                    </div>
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
