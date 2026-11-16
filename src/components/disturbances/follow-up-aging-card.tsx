"use client";

import { useMemo, useState } from "react";
import { ClipboardList, ExternalLink } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  AGE_BUCKETS,
  WORK_TYPES,
  ageBucketIndex,
  formatAge,
  type FollowUpItem,
  type WorkType,
} from "@/lib/follow-up-aging";

const ALL = "__all__";

// Same green → red ramp per age bucket, so the bar chart, the age badge in
// the table and the KPI tile all read the same.
const BUCKET_TONE = [
  "bg-success/15 text-success",
  "bg-success/15 text-success",
  "bg-warning/20 text-warning-foreground",
  "bg-critical/15 text-critical",
  "bg-critical text-white",
];
const BUCKET_BAR = ["bg-success/70", "bg-success", "bg-warning", "bg-critical/70", "bg-critical"];

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className={cn("rounded-lg border px-3 py-2.5", tone)}>
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <div className="text-2xl font-extrabold tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** Incidents whose follow-up is still OPEN, oldest first: how long each has
 *  been open, how far along it is, and which planned jobs are still not
 *  ticked. The "jenis pekerjaan" bars double as a filter, so a meeting can
 *  jump straight to e.g. every pending isolator replacement. */
export function FollowUpAgingCard({
  items,
  openRows,
  todayISO,
}: {
  items: FollowUpItem[];
  openRows: number;
  todayISO: string;
}) {
  const [ultg, setUltg] = useState<string>(ALL);
  const [workType, setWorkType] = useState<WorkType | null>(null);

  const ultgs = useMemo(() => [...new Set(items.map((i) => i.ultg))].sort(), [items]);

  const view = useMemo(() => {
    const scoped = ultg === ALL ? items : items.filter((i) => i.ultg === ultg);
    const buckets = AGE_BUCKETS.map(() => 0);
    for (const i of scoped) buckets[ageBucketIndex(i.ageDays)]++;
    const typeCounts = new Map<WorkType, number>();
    for (const i of scoped) for (const p of i.pending) typeCounts.set(p.type, (typeCounts.get(p.type) ?? 0) + 1);
    const types = WORK_TYPES.map((t) => ({ type: t, count: typeCounts.get(t) ?? 0 }))
      .filter((t) => t.count > 0)
      .sort((a, b) => b.count - a.count);
    const perUltg = ultgs.map((u) => {
      const list = items.filter((i) => i.ultg === u);
      const prog = list.map((i) => i.progressPrimary).filter((p): p is number => p !== null);
      return {
        ultg: u,
        open: list.length,
        over180: list.filter((i) => i.ageDays >= 180).length,
        oldest: Math.max(0, ...list.map((i) => i.ageDays)),
        avgProgress: prog.length ? prog.reduce((a, b) => a + b, 0) / prog.length : null,
      };
    });
    const rows = workType ? scoped.filter((i) => i.pending.some((p) => p.type === workType)) : scoped;
    return {
      scoped,
      buckets,
      types,
      perUltg,
      rows,
      over180: scoped.filter((i) => i.ageDays >= 180).length,
      median: median(scoped.map((i) => i.ageDays)),
      noPlan: scoped.filter((i) => !i.plannedISO).length,
    };
  }, [items, ultg, ultgs, workType]);

  if (items.length === 0) return null;
  const maxBucket = Math.max(1, ...view.buckets);
  const maxType = Math.max(1, ...view.types.map((t) => t.count));

  return (
    <Card className="min-w-0">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-1.5 text-lg font-extrabold">
            <ClipboardList className="size-5 text-primary" />
            Tindak Lanjut Gangguan Belum Selesai
          </CardTitle>
          <Select value={ultg} onValueChange={(v) => v && setUltg(v)}>
            <SelectTrigger size="sm" className="w-[190px]" aria-label="ULTG">
              <SelectValue>{ultg === ALL ? "Semua ULTG" : `ULTG ${ultg}`}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Semua ULTG</SelectItem>
              {ultgs.map((u) => (
                <SelectItem key={u} value={u}>
                  ULTG {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-muted-foreground">
          Gangguan masuk kinerja yang status tindak lanjutnya masih OPEN, diurutkan dari yang paling lama. Umur dihitung
          dari tanggal gangguan sampai hari ini. Laporan dari kedua ujung saluran untuk kejadian yang sama digabung (
          {openRows} laporan menjadi {items.length} kejadian). Pekerjaan tertunda adalah butir Tindak Lanjut 1–5 yang
          belum dicentang selesai.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Kpi label="Kejadian masih OPEN" value={String(view.scoped.length)} />
          <Kpi
            label="Lebih dari 180 hari"
            value={String(view.over180)}
            hint={view.scoped.length ? `${Math.round((view.over180 / view.scoped.length) * 100)}% dari yang OPEN` : undefined}
            tone={view.over180 > 0 ? "border-critical/40 bg-critical/5" : undefined}
          />
          <Kpi label="Median umur" value={view.median === null ? "—" : formatAge(view.median)} />
          <Kpi
            label="Tanpa tanggal rencana"
            value={String(view.noPlan)}
            hint="Kolom TANGGAL RENCANA TINDAK LANJUT kosong"
            tone={view.noPlan > 0 ? "border-warning/50 bg-warning/5" : undefined}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="rounded-lg border p-3">
            <h3 className="mb-2 text-sm font-bold">Umur tindak lanjut</h3>
            <div className="flex flex-col gap-1.5">
              {AGE_BUCKETS.map((b, i) => (
                <div key={b.label} className="grid grid-cols-[92px_1fr_28px] items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{b.label}</span>
                  <div className="h-4 rounded bg-muted/50">
                    <div
                      className={cn("h-4 rounded", BUCKET_BAR[i])}
                      style={{ width: `${(view.buckets[i] / maxBucket) * 100}%` }}
                    />
                  </div>
                  <span className="text-right font-bold tabular-nums">{view.buckets[i]}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold">Pekerjaan tertunda per jenis</h3>
              {workType && (
                <button
                  type="button"
                  onClick={() => setWorkType(null)}
                  className="text-xs text-primary underline underline-offset-2"
                >
                  Hapus filter
                </button>
              )}
            </div>
            <div className="flex flex-col gap-1">
              {view.types.map((t) => (
                <button
                  key={t.type}
                  type="button"
                  onClick={() => setWorkType(workType === t.type ? null : t.type)}
                  className={cn(
                    "grid grid-cols-[150px_1fr_24px] items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-muted/60",
                    workType === t.type && "bg-primary/10 ring-1 ring-primary/40",
                  )}
                  title="Klik untuk menyaring tabel"
                >
                  <span className="truncate">{t.type}</span>
                  <div className="h-3 rounded bg-muted/50">
                    <div className="h-3 rounded bg-primary/70" style={{ width: `${(t.count / maxType) * 100}%` }} />
                  </div>
                  <span className="text-right font-bold tabular-nums">{t.count}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border p-3">
            <h3 className="mb-2 text-sm font-bold">Per ULTG</h3>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pb-1 font-semibold">ULTG</th>
                  <th className="pb-1 text-right font-semibold">Open</th>
                  <th className="pb-1 text-right font-semibold">&gt;180 hr</th>
                  <th className="pb-1 text-right font-semibold">Terlama</th>
                  <th className="pb-1 text-right font-semibold">Progres</th>
                </tr>
              </thead>
              <tbody>
                {view.perUltg.map((u) => (
                  <tr key={u.ultg} className={cn("border-t", ultg === u.ultg && "bg-primary/5 font-semibold")}>
                    <td className="py-1.5">{u.ultg}</td>
                    <td className="py-1.5 text-right tabular-nums">{u.open}</td>
                    <td className="py-1.5 text-right tabular-nums text-critical">{u.over180}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatAge(u.oldest)}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {u.avgProgress === null ? "—" : `${Math.round(u.avgProgress * 100)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-muted-foreground">Progres = rata-rata progres tindak lanjut primer.</p>
          </div>
        </div>

        <div className="relative max-h-[520px] overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b bg-muted text-left text-xs text-muted-foreground uppercase">
                <th className="px-3 py-2.5 font-bold">Umur</th>
                <th className="px-3 py-2.5 font-bold">Gangguan</th>
                <th className="px-3 py-2.5 font-bold">Penyebab</th>
                <th className="px-3 py-2.5 font-bold">Progres</th>
                <th className="px-3 py-2.5 font-bold">
                  Pekerjaan tertunda{workType ? `: ${workType}` : ""}
                </th>
                <th className="px-3 py-2.5 font-bold">Rencana</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((i) => {
                const overdue = i.plannedISO !== null && i.plannedISO < todayISO;
                const pct = i.progressPrimary ?? (i.jobsTotal ? i.jobsDone / i.jobsTotal : 0);
                return (
                  <tr key={`${i.id}-${i.dateISO}-${i.bay}`} className="border-b align-top last:border-0">
                    <td className="px-3 py-2">
                      <span
                        className={cn(
                          "inline-block rounded px-1.5 py-0.5 text-xs font-bold whitespace-nowrap tabular-nums",
                          BUCKET_TONE[ageBucketIndex(i.ageDays)],
                        )}
                      >
                        {formatAge(i.ageDays)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-semibold">{i.bay}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(i.dateISO)} · ULTG {i.ultg}
                        {i.id && ` · ${i.id}`}
                        {i.pptUrl && (
                          <a
                            href={i.pptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-1.5 inline-flex items-center gap-0.5 text-primary hover:underline"
                          >
                            PPT <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{i.cause}</td>
                    <td className="px-3 py-2">
                      <div className="flex w-28 items-center gap-1.5">
                        <div className="h-2 flex-1 rounded bg-muted">
                          <div className="h-2 rounded bg-primary" style={{ width: `${Math.round(pct * 100)}%` }} />
                        </div>
                        <span className="text-xs font-bold tabular-nums">{Math.round(pct * 100)}%</span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {i.jobsDone}/{i.jobsTotal} pekerjaan selesai
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {i.pending.length === 0 ? (
                        <span className="text-xs text-muted-foreground">
                          Semua butir sudah dicentang, status belum diubah ke CLOSED
                        </span>
                      ) : (
                        <ul className="flex flex-col gap-1">
                          {i.pending.map((p, idx) => (
                            <li
                              key={idx}
                              className={cn(
                                "text-xs",
                                workType && p.type !== workType && "text-muted-foreground/60",
                              )}
                            >
                              <span className="mr-1 rounded bg-muted px-1 py-px text-[10px] font-semibold text-muted-foreground">
                                {p.side === "Primer" ? "P" : "S"}
                              </span>
                              {p.text}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {i.plannedISO ? (
                        <span className={cn(overdue && "font-bold text-critical")}>
                          {formatDate(i.plannedISO)}
                          {overdue && <div className="font-normal">lewat rencana</div>}
                        </span>
                      ) : (
                        <span className="text-warning-foreground">Belum ada</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground">
          P = tindak lanjut primer, S = tindak lanjut sekunder. Jenis pekerjaan dikelompokkan otomatis dari teks butir
          tindak lanjut.
        </p>
      </CardContent>
    </Card>
  );
}
