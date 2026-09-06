"use client";

import { useMemo, useState } from "react";
import { ExternalLink, FileText } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AhiKlasifikasi, BayEquipmentUnit, BayLineReport } from "@/types";

const ALL_VALUE = "__all__";

function klasifikasiClass(k: AhiKlasifikasi): string {
  if (k === "CRITICAL") return "border-critical/40 bg-critical/10 text-critical";
  if (k === "POOR") return "border-warning/40 bg-warning/15 text-warning-foreground";
  if (k === "FAIR") return "border-border bg-muted text-muted-foreground";
  if (k === "GOOD" || k === "BEST") return "border-success/40 bg-success/10 text-success";
  return "border-border text-muted-foreground"; // NO DATA
}

function KlasifikasiPill({ value }: { value: AhiKlasifikasi }) {
  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", klasifikasiClass(value))}>
      {value}
    </span>
  );
}

function FlagPill({ active, label, tone }: { active: boolean; label: string; tone: "warning" | "critical" }) {
  if (!active) return <span className="text-xs text-muted-foreground">—</span>;
  const cls = tone === "critical" ? "border-critical/40 bg-critical/10 text-critical" : "border-warning/40 bg-warning/15 text-warning-foreground";
  return <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-medium", cls)}>✔️ {label}</span>;
}

function formatValue(v: string | number | null): string {
  if (v === null || v === "") return "—";
  return String(v);
}

function UnitCard({ unit }: { unit: BayEquipmentUnit }) {
  const mandatoryCount = unit.parameters.filter((p) => p.mandatoryPengujian).length;
  const retestCount = unit.parameters.filter((p) => p.pengujianUlang).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{unit.role}</CardTitle>
          <div className="flex items-center gap-2">
            <KlasifikasiPill value={unit.klasifikasi} />
            {unit.skorAhi !== null ? (
              <span className="text-xs text-muted-foreground">Skor AHI: {unit.skorAhi}</span>
            ) : null}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {unit.merk ?? "—"} {unit.type ?? ""} · Nomor Seri {unit.nomorSeri ?? "—"} · Techident {unit.techident ?? "—"}
          {unit.tanggalPemeliharaanTerakhir ? ` · Pemeliharaan terakhir ${unit.tanggalPemeliharaanTerakhir}` : ""}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {(mandatoryCount > 0 || retestCount > 0) ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {mandatoryCount > 0 ? (
              <span className="rounded-full border border-warning/40 bg-warning/15 px-2.5 py-1 font-medium text-warning-foreground">
                {mandatoryCount} parameter wajib diuji
              </span>
            ) : null}
            {retestCount > 0 ? (
              <span className="rounded-full border border-critical/40 bg-critical/10 px-2.5 py-1 font-medium text-critical">
                {retestCount} parameter perlu diuji ulang
              </span>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-success">Seluruh parameter dalam kondisi baik, tidak ada tindak lanjut wajib.</p>
        )}

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Parameter</th>
                <th className="px-3 py-2 font-medium">R</th>
                <th className="px-3 py-2 font-medium">S</th>
                <th className="px-3 py-2 font-medium">T</th>
                <th className="px-3 py-2 font-medium">Klasifikasi</th>
                <th className="px-3 py-2 font-medium">Mandatory</th>
                <th className="px-3 py-2 font-medium">Pengujian Ulang</th>
              </tr>
            </thead>
            <tbody>
              {unit.parameters.map((p) => (
                <tr key={p.label} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium text-foreground">{p.label}</td>
                  <td className="px-3 py-2 text-muted-foreground">{formatValue(p.r)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{formatValue(p.s)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{formatValue(p.t)}</td>
                  <td className="px-3 py-2">
                    <KlasifikasiPill value={p.klasifikasi} />
                  </td>
                  <td className="px-3 py-2">
                    <FlagPill active={p.mandatoryPengujian} label="Mandatory" tone="warning" />
                  </td>
                  <td className="px-3 py-2">
                    <FlagPill active={p.pengujianUlang} label="Ulang" tone="critical" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {unit.tindakLanjut || unit.sourceLink ? (
          <div className="flex flex-col gap-1 text-xs">
            {unit.tindakLanjut ? (
              <p>
                <span className="text-muted-foreground">Tindak Lanjut: </span>
                {unit.tindakLanjut}
              </p>
            ) : null}
            {unit.sourceLink ? (
              <a
                href={unit.sourceLink}
                target="_blank"
                rel="noreferrer"
                className="flex w-fit items-center gap-1.5 text-primary hover:underline"
              >
                <FileText className="size-3.5 shrink-0" />
                Dokumen sumber
                <ExternalLink className="size-3 shrink-0" />
              </a>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function BayLineReportView({ reports }: { reports: BayLineReport[] }) {
  const giOptions = useMemo(() => [...new Set(reports.map((r) => r.gi))].sort(), [reports]);
  const [gi, setGi] = useState(ALL_VALUE);
  const bayOptions = useMemo(
    () => reports.filter((r) => gi === ALL_VALUE || r.gi === gi).map((r) => r.bay).sort(),
    [reports, gi],
  );
  const [bay, setBay] = useState<string | null>(null);

  const selected = reports.find((r) => r.bay === bay) ?? null;

  if (reports.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Data Bay Line belum tersedia — lihat halaman Data & Sync untuk detail.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={gi}
          onValueChange={(v) => {
            setGi(v ?? ALL_VALUE);
            setBay(null);
          }}
        >
          <SelectTrigger size="sm" className="w-[220px]">
            <SelectValue placeholder="GI">{gi === ALL_VALUE ? "Semua GI" : gi}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Semua GI</SelectItem>
            {giOptions.map((g) => (
              <SelectItem key={g} value={g}>
                {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={bay ?? ""} onValueChange={(v) => setBay(v || null)}>
          <SelectTrigger size="sm" className="w-[320px]">
            <SelectValue placeholder="Pilih Bay Line">{bay ?? "Pilih Bay Line..."}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {bayOptions.map((b) => (
              <SelectItem key={b} value={b}>
                {b}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selected ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Pilih Bay Line untuk melihat detail report.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-sm font-semibold text-foreground">{selected.bay}</p>
            <p className="text-xs text-muted-foreground">
              {selected.ultg} · GI {selected.gi} · {selected.units.length} unit peralatan
            </p>
          </div>
          {selected.units.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Data belum tersedia untuk bay ini.</p>
          ) : (
            selected.units.map((unit) => <UnitCard key={`${unit.role}-${unit.techident ?? unit.nomorSeri}`} unit={unit} />)
          )}
        </div>
      )}
    </div>
  );
}
