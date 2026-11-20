"use client";

import type { ReactNode } from "react";
import { FileDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  CE_STATUS_ORDER,
  buildBayHotspots,
  buildBreakdown,
  buildBudgetGroups,
  buildCeCandidates,
  buildKpis,
  buildSystemicIssues,
  buildTargetTimeline,
  buildUltgRows,
  buildUltgStreamRecap,
  formatRupiah,
  giList,
  isInCe,
  isOverdue,
  shortUltg,
  type RecapRow,
} from "@/lib/ce-analysis";
import type { CeItem } from "@/types";

// Print-only CE report. The interactive CE view (cards, scroll boxes,
// collapsibles, dialogs) is hidden in print and this document is shown
// instead: A4 landscape, its own fixed light palette (so a dark-mode
// session still prints black-on-white), every table fully expanded with
// wrapping cells (nothing clipped), headers repeated on each page, rows
// never split across pages, and page numbers in the page margin.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const monthLabel = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
/** "PALANGKARAYA" -> "Palangkaraya": shorter in narrow columns. */
const ultgName = (s: string) => shortUltg(s).toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
const pctOf = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");

export type CeReportPeriode = "all" | "ce" | "belum";
const PERIODE_TEXT: Record<CeReportPeriode, string> = {
  all: "Semua anomali (CE 2026 dan belum masuk CE)",
  ce: "Hanya anomali yang masuk CE 2026",
  belum: "Hanya anomali yang belum masuk CE",
};

const CSS = `
@media screen { .cer { display: none !important; } }
@media print {
  @page {
    size: A4 landscape;
    margin: 10mm 10mm 13mm 10mm;
    @bottom-left { content: "Laporan Common Enemy (CE) · UPT Palangkaraya"; font-family: "Segoe UI", Arial, sans-serif; font-size: 7.5pt; color: #6b7280; }
    @bottom-right { content: "Halaman " counter(page) " dari " counter(pages); font-family: "Segoe UI", Arial, sans-serif; font-size: 7.5pt; color: #6b7280; }
  }
  html, body { background: #fff !important; }
  [data-slot="sidebar-inset"] { background: #fff !important; }
  [data-slot="sidebar-inset"] > div:has(.cer) { padding: 0 !important; }
  .cer { display: block !important; }
}
.cer { font-family: var(--font-geist-sans), "Segoe UI", Arial, sans-serif; color: #111827; font-size: 8.5pt; line-height: 1.35; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.cer * { box-sizing: border-box; }
.cer h1 { font-size: 17pt; font-weight: 800; margin: 0; letter-spacing: -0.01em; }
.cer h2 { font-size: 11.5pt; font-weight: 800; margin: 0 0 1.5mm; color: #0f2f5c; break-after: avoid; page-break-after: avoid; }
.cer h3 { font-size: 9pt; font-weight: 700; margin: 0 0 1mm; break-after: avoid; }
.cer .sec { margin-top: 5mm; }
.cer .sec-head { break-inside: avoid; break-after: avoid; }
.cer .note { color: #4b5563; font-size: 7.5pt; margin: 0 0 2mm; }
.cer .page { break-before: page; page-break-before: always; }
.cer .avoid { break-inside: avoid; page-break-inside: avoid; }
.cer .cover { border-bottom: 2.5pt solid #0f2f5c; padding-bottom: 3mm; display: flex; justify-content: space-between; align-items: flex-end; gap: 6mm; }
.cer .cover .eyebrow { font-size: 8pt; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #2457a6; }
.cer .cover .meta { text-align: right; font-size: 8pt; color: #374151; }
.cer .cover .meta b { color: #111827; }
.cer .kpis { display: grid; grid-template-columns: repeat(6, 1fr); gap: 2.5mm; margin-top: 4mm; }
.cer .kpi { border: 0.75pt solid #d1d5db; border-radius: 2mm; padding: 2mm 2.5mm; break-inside: avoid; }
.cer .kpi .l { font-size: 7.5pt; font-weight: 700; color: #4b5563; }
.cer .kpi .v { font-size: 15pt; font-weight: 800; font-variant-numeric: tabular-nums; }
.cer .kpi .h { font-size: 7pt; color: #6b7280; }
.cer .kpi.warn { border-color: #f59e0b; background: #fffbeb; }
.cer .kpi.crit { border-color: #f87171; background: #fef2f2; }
.cer .points { margin: 0; padding-left: 4.5mm; columns: 2; column-gap: 10mm; }
.cer .points li { break-inside: avoid; }
.cer .points li { margin: 0.6mm 0; }
.cer .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; align-items: start; }
.cer table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 7.5pt; }
.cer thead { display: table-header-group; }
.cer th { background: #0f2f5c; color: #fff; font-weight: 700; text-align: left; padding: 1.2mm 1.5mm; vertical-align: bottom; border: 0.5pt solid #0f2f5c; overflow-wrap: normal; line-height: 1.2; }
.cer td { padding: 1mm 1.5mm; border: 0.5pt solid #d1d5db; vertical-align: top; overflow-wrap: anywhere; word-break: normal; }
.cer tr { break-inside: avoid; page-break-inside: avoid; }
.cer tbody tr:nth-child(even) td { background: #f8fafc; }
.cer .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.cer .ctr { text-align: center; }
.cer .muted { color: #6b7280; }
.cer .b { font-weight: 700; }
.cer tr.sub td { background: #e8eef7 !important; font-weight: 800; }
.cer tr.grand td { background: #0f2f5c !important; color: #fff; font-weight: 800; border-color: #0f2f5c; }
.cer tr.group td { background: #f1f5f9 !important; font-weight: 800; color: #0f2f5c; }
.cer .pill { display: inline-block; border-radius: 1mm; padding: 0.2mm 1.2mm; font-size: 6.5pt; font-weight: 700; white-space: nowrap; }
.cer .st-NO { background: #f3f4f6; color: #4b5563; }
.cer .st-ON { background: #dbeafe; color: #1e40af; }
.cer .st-LAG { background: #fee2e2; color: #b91c1c; }
.cer .st-FL { background: #dcfce7; color: #166534; }
.cer .st-FLAG { background: #fef3c7; color: #92400e; }
.cer .open { color: #b91c1c; font-weight: 700; }
.cer .close { color: #166534; font-weight: 700; }
.cer .bar { display: flex; gap: 0.5mm; height: 3mm; align-items: center; }
.cer .bar span { display: block; height: 3mm; }
.cer .bar .ce { background: #2457a6; border-radius: 0.6mm 0 0 0.6mm; }
.cer .bar .be { background: #d97706; border-radius: 0 0.6mm 0.6mm 0; }
.cer .bar .only { border-radius: 0.6mm; }
.cer .legend { display: flex; gap: 4mm; font-size: 7pt; color: #4b5563; margin-bottom: 1.5mm; }
.cer .legend i { display: inline-block; width: 2.5mm; height: 2.5mm; border-radius: 0.5mm; margin-right: 1mm; vertical-align: -0.3mm; }
.cer .tag { display: inline-block; background: #f1f5f9; border-radius: 1mm; padding: 0.2mm 1.2mm; margin: 0 0.8mm 0.6mm 0; font-size: 6.5pt; white-space: nowrap; }
`;

function statusClass(s: string): string {
  switch (s) {
    case "NO TARGET":
      return "st-NO";
    case "ON TARGET":
      return "st-ON";
    case "LAGGING":
      return "st-LAG";
    case "FINISH (LEAD)":
      return "st-FL";
    case "FINISH (LAGGING)":
      return "st-FLAG";
    default:
      return "st-NO";
  }
}

function Pill({ status }: { status: string }) {
  return <span className={`pill ${statusClass(status)}`}>{status || "—"}</span>;
}

function SplitBar({ inCe, notInCe, max }: { inCe: number; notInCe: number; max: number }) {
  const w = (n: number) => `${(n / Math.max(1, max)) * 100}%`;
  return (
    <div className="bar">
      {inCe > 0 && <span className={`ce${notInCe === 0 ? " only" : ""}`} style={{ width: w(inCe) }} />}
      {notInCe > 0 && <span className={`be${inCe === 0 ? " only" : ""}`} style={{ width: w(notInCe) }} />}
    </div>
  );
}

function Legend() {
  return (
    <div className="legend">
      <span>
        <i style={{ background: "#2457a6" }} />
        Masuk CE 2026
      </span>
      <span>
        <i style={{ background: "#d97706" }} />
        Belum masuk CE
      </span>
    </div>
  );
}

function Sec({
  title,
  note,
  children,
  page,
}: {
  title: string;
  note?: ReactNode;
  children: ReactNode;
  page?: boolean;
}) {
  return (
    <section className={page ? "page" : "sec"}>
      <div className="sec-head">
        <h2>{title}</h2>
        {note && <p className="note">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function RecapTr({ r, cls, label }: { r: RecapRow; cls?: string; label?: string }) {
  return (
    <tr className={cls}>
      <td>{label ?? r.label}</td>
      <td className="num">{r.total}</td>
      <td className="num">{r.inCe}</td>
      <td className="num">{r.notInCe}</td>
      <td className="num">{r.close}</td>
      <td className="num">{r.open}</td>
      <td className="num">{pctOf(r.close, r.total)}</td>
    </tr>
  );
}

function ItemTable({ items, showUltg }: { items: CeItem[]; showUltg?: boolean }) {
  return (
    <table>
      <colgroup>
        <col style={{ width: "3.5%" }} />
        {showUltg && <col style={{ width: "7%" }} />}
        <col style={{ width: showUltg ? "10%" : "11%" }} />
        <col style={{ width: showUltg ? "10%" : "12%" }} />
        <col style={{ width: "9%" }} />
        <col style={{ width: "7%" }} />
        <col style={{ width: showUltg ? "18%" : "20%" }} />
        <col style={{ width: showUltg ? "14%" : "16%" }} />
        <col style={{ width: "6.5%" }} />
        <col style={{ width: "8%" }} />
        <col style={{ width: "7%" }} />
        <col style={{ width: "5%" }} />
      </colgroup>
      <thead>
        <tr>
          <th className="ctr">No</th>
          {showUltg && <th>ULTG</th>}
          <th>Gardu Induk</th>
          <th>Bay</th>
          <th>Jenis aset / fasa</th>
          <th>Stream</th>
          <th>Anomali</th>
          <th>Action plan</th>
          <th>Periode</th>
          <th>Status</th>
          <th>Target</th>
          <th className="ctr">C/O</th>
        </tr>
      </thead>
      <tbody>
        {items.map((i, idx) => (
          <tr key={i.id}>
            <td className="ctr muted">{idx + 1}</td>
            {showUltg && <td>{ultgName(i.ultg)}</td>}
            <td>{giList(i).join(", ")}</td>
            <td>{i.bay || "—"}</td>
            <td>
              {i.jenisAsset || "—"}
              {i.phasa && i.phasa !== "-" ? <span className="muted"> · {i.phasa}</span> : null}
            </td>
            <td>{i.stream || "—"}</td>
            <td>{i.anomaliPemicu || <span className="muted">—</span>}</td>
            <td>{i.actionPlan || <span className="muted">belum ada</span>}</td>
            <td>{isInCe(i) ? "CE 2026" : "Belum CE"}</td>
            <td>
              <Pill status={i.status} />
            </td>
            <td className="num">{formatDate(i.tanggalTarget)}</td>
            <td className={`ctr ${i.done ? "close" : "open"}`}>{i.done ? "CLOSE" : "OPEN"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CePdfReport({
  items,
  ultg,
  periode,
  todayISO,
}: {
  /** Already narrowed to the selected ULTG (all ULTGs when none). */
  items: CeItem[];
  /** Selected ULTG short name, or null for all. */
  ultg: string | null;
  periode: CeReportPeriode;
  todayISO: string;
}) {
  const scoped = periode === "all" ? items : items.filter((i) => (periode === "ce" ? isInCe(i) : !isInCe(i)));
  const k = buildKpis(items, todayISO);
  const ultgRows = buildUltgRows(items, todayISO);
  const recap = buildUltgStreamRecap(items);
  const streams = buildBreakdown(items, (i) => i.stream);
  const jenis = buildBreakdown(scoped, (i) => i.jenisAsset).slice(0, 12);
  const systemic = buildSystemicIssues(scoped);
  const candidates = buildCeCandidates(items).slice(0, 15);
  const bays = buildBayHotspots(scoped);
  const timeline = buildTargetTimeline(items, todayISO);
  const overdue = items
    .filter((i) => isOverdue(i, todayISO))
    .sort((a, b) => (a.tanggalTarget ?? "").localeCompare(b.tanggalTarget ?? ""));
  const budgetByPos = buildBudgetGroups(scoped, (i) =>
    [i.budget?.pos, i.budget?.tahun].filter(Boolean).join(" ") || "Pos/tahun belum diisi",
  );
  const budgetByStream = buildBudgetGroups(scoped, (i) => i.stream);

  const maxStream = Math.max(1, ...streams.map((s) => s.total));
  const maxJenis = Math.max(1, ...jenis.map((s) => s.total));
  const topStream = streams[0];
  const topOpenUltg = [...ultgRows].sort((a, b) => b.total - b.close - (a.total - a.close))[0];
  const listByUltg = [...new Set(scoped.map((i) => shortUltg(i.ultg)))]
    .sort()
    .map((u) => ({ ultg: u, items: scoped.filter((i) => shortUltg(i.ultg) === u) }));

  const scopeText = ultg ? `ULTG ${ultg}` : "Seluruh ULTG";

  return (
    <div className="cer" aria-hidden>
      <style>{CSS}</style>

      {/* ---------- halaman 1: ringkasan ---------- */}
      <header className="cover">
        <div>
          <div className="eyebrow">PLN UPT Palangkaraya · Performance Center</div>
          <h1>Laporan Common Enemy (CE)</h1>
          <div style={{ fontSize: "9.5pt", color: "#374151", marginTop: "1mm" }}>
            Monitoring anomali aset, status penyelesaian, dan rencana tindak lanjut
          </div>
        </div>
        <div className="meta">
          <div>
            Cakupan: <b>{scopeText}</b>
          </div>
          <div>
            Daftar &amp; analisa: <b>{PERIODE_TEXT[periode]}</b>
          </div>
          <div>
            Tanggal laporan: <b>{formatDate(todayISO)}</b>
          </div>
        </div>
      </header>

      <div className="kpis">
        <div className="kpi">
          <div className="l">Total anomali</div>
          <div className="v">{k.total}</div>
          <div className="h">
            {k.open} OPEN · {k.close} CLOSE ({pctOf(k.close, k.total)})
          </div>
        </div>
        <div className="kpi">
          <div className="l">Masuk CE 2026</div>
          <div className="v">{k.inCe}</div>
          <div className="h">
            {k.ceClose} close ({pctOf(k.ceClose, k.inCe)})
          </div>
        </div>
        <div className={`kpi${k.notInCe > 0 ? " warn" : ""}`}>
          <div className="l">Belum masuk CE</div>
          <div className="v">{k.notInCe}</div>
          <div className="h">{pctOf(k.notInCe, k.total)} dari semua anomali</div>
        </div>
        <div className={`kpi${k.overdue > 0 ? " crit" : ""}`}>
          <div className="l">Lewat target</div>
          <div className="v">{k.overdue}</div>
          <div className="h">{k.lagging} berstatus LAGGING</div>
        </div>
        <div className={`kpi${k.noActionPlan > 0 ? " warn" : ""}`}>
          <div className="l">OPEN tanpa action plan</div>
          <div className="v">{k.noActionPlan}</div>
          <div className="h">dari {k.open} anomali OPEN</div>
        </div>
        <div className="kpi">
          <div className="l">Anggaran teridentifikasi</div>
          <div className="v" style={{ fontSize: "12.5pt" }}>
            {formatRupiah(k.budgetTotal)}
          </div>
          <div className="h">{k.withBudget} anomali punya nilai RAB</div>
        </div>
      </div>

      <div className="sec avoid">
        <h2>Poin Utama</h2>
        <ul className="points">
          <li>
            <b>{k.close}</b> dari <b>{k.total}</b> anomali sudah CLOSE ({pctOf(k.close, k.total)}); <b>{k.open}</b> masih
            OPEN.
          </li>
          <li>
            Program CE 2026 mencakup <b>{k.inCe}</b> anomali, <b>{k.ceClose}</b> sudah selesai (
            {pctOf(k.ceClose, k.inCe)}). Masih ada <b>{k.notInCe}</b> anomali yang belum masuk CE.
          </li>
          {k.overdue > 0 && (
            <li>
              <b>{k.overdue}</b> anomali OPEN sudah melewati tanggal target (rincian di Lampiran A).
            </li>
          )}
          {k.noActionPlan > 0 && (
            <li>
              <b>{k.noActionPlan}</b> anomali OPEN belum punya action plan.
            </li>
          )}
          {topStream && (
            <li>
              Stream dengan anomali terbanyak: <b>{topStream.label}</b> ({topStream.total} anomali, {topStream.open}{" "}
              OPEN).
            </li>
          )}
          {!ultg && topOpenUltg && (
            <li>
              ULTG dengan anomali OPEN terbanyak: <b>ULTG {ultgName(topOpenUltg.ultg)}</b> (
              {topOpenUltg.total - topOpenUltg.close} OPEN dari {topOpenUltg.total}).
            </li>
          )}
          {systemic[0] && (
            <li>
              Masalah sistemik terbesar: <b>{systemic[0].jenisAsset}</b>, {systemic[0].anomaly} ({systemic[0].items.length}{" "}
              item di {systemic[0].gis.length} GI).
            </li>
          )}
          {candidates[0] && (
            <li>
              Kandidat utama masuk CE berikutnya: <b>{candidates[0].jenisAsset}</b>, {candidates[0].anomaly} (
              {candidates[0].items.length} item).
            </li>
          )}
        </ul>
      </div>

      <div className="sec avoid">
        <h2>Status per ULTG</h2>
        <p className="note">
          Close / open dari kolom CLS/OPN; sebaran status dari kolom STATUS di sheet. Lewat target = OPEN dengan tanggal
          target sudah terlewati.
        </p>
        <table>
          <colgroup>
            <col style={{ width: "13%" }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2}>ULTG</th>
              <th className="num" rowSpan={2}>Total</th>
              <th className="num" rowSpan={2}>CE 2026</th>
              <th className="num" rowSpan={2}>Belum CE</th>
              <th className="num" rowSpan={2}>Close</th>
              <th className="num" rowSpan={2}>% close</th>
              <th className="num" rowSpan={2}>Lewat target</th>
              <th className="ctr" colSpan={CE_STATUS_ORDER.length} style={{ borderBottom: "0.5pt solid #3b5b8a" }}>
                STATUS
              </th>
              <th className="num" rowSpan={2}>Anggaran</th>
            </tr>
            <tr>
              {CE_STATUS_ORDER.map((s) => (
                <th key={s} className="num">
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ultgRows.map((r) => (
              <tr key={r.ultg}>
                <td className="b">{ultgName(r.ultg)}</td>
                <td className="num">{r.total}</td>
                <td className="num">{r.inCe}</td>
                <td className="num">{r.notInCe}</td>
                <td className="num">{r.close}</td>
                <td className="num">{pctOf(r.close, r.total)}</td>
                <td className={`num${r.overdue ? " open" : ""}`}>{r.overdue}</td>
                {CE_STATUS_ORDER.map((s) => (
                  <td key={s} className="num">
                    {r.byStatus[s] ?? 0}
                  </td>
                ))}
                <td className="num">{r.budget > 0 ? formatRupiah(r.budget) : "—"}</td>
              </tr>
            ))}
            {ultgRows.length > 1 && (
              <tr className="grand">
                <td>UPT Palangkaraya</td>
                <td className="num">{k.total}</td>
                <td className="num">{k.inCe}</td>
                <td className="num">{k.notInCe}</td>
                <td className="num">{k.close}</td>
                <td className="num">{pctOf(k.close, k.total)}</td>
                <td className="num">{k.overdue}</td>
                {CE_STATUS_ORDER.map((s) => (
                  <td key={s} className="num">
                    {ultgRows.reduce((n, r) => n + (r.byStatus[s] ?? 0), 0)}
                  </td>
                ))}
                <td className="num">{formatRupiah(k.budgetTotal)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ---------- rekap ULTG x stream ---------- */}
      <Sec
        page
        title="Rekap per ULTG & Stream"
        note="Jumlah anomali per ULTG dan per stream, dipisah CE 2026 / belum masuk CE dan CLOSE / OPEN."
      >
        <div className="grid2">
          {[...recap.groups, ...(recap.upt ? [recap.upt] : [])].map((g) => (
            <table key={g.ultg} className="avoid" style={{ marginBottom: "3mm" }}>
              <colgroup>
                <col style={{ width: "34%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>{g.ultg === "UPT Palangkaraya" ? g.ultg : `ULTG ${g.ultg}`} · stream</th>
                  <th className="num">Total</th>
                  <th className="num">CE 2026</th>
                  <th className="num">Belum</th>
                  <th className="num">Close</th>
                  <th className="num">Open</th>
                  <th className="num">% close</th>
                </tr>
              </thead>
              <tbody>
                {g.streams.map((r) => (
                  <RecapTr key={r.label} r={r} />
                ))}
                <RecapTr r={g.subtotal} cls={g.ultg === "UPT Palangkaraya" ? "grand" : "sub"} label="TOTAL" />
              </tbody>
            </table>
          ))}
        </div>
      </Sec>

      {/* ---------- stream + jenis aset + timeline ---------- */}
      <Sec page title="Sebaran Anomali" note="Panjang batang sebanding dengan jumlah anomali.">
        <div className="grid2">
          <div className="avoid">
            <h3>Anomali per stream</h3>
            <Legend />
            <table>
              <colgroup>
                <col style={{ width: "26%" }} />
                <col />
                <col style={{ width: "11%" }} />
                <col style={{ width: "11%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Stream</th>
                  <th>CE 2026 | belum</th>
                  <th className="num">Total</th>
                  <th className="num">Open</th>
                </tr>
              </thead>
              <tbody>
                {streams.map((s) => (
                  <tr key={s.label}>
                    <td className="b">{s.label}</td>
                    <td style={{ verticalAlign: "middle" }}>
                      <SplitBar inCe={s.inCe} notInCe={s.notInCe} max={maxStream} />
                    </td>
                    <td className="num">{s.total}</td>
                    <td className="num">{s.open}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="avoid">
            <h3>Jenis aset terbanyak</h3>
            <Legend />
            <table>
              <colgroup>
                <col style={{ width: "30%" }} />
                <col />
                <col style={{ width: "11%" }} />
                <col style={{ width: "11%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Jenis aset</th>
                  <th>CE 2026 | belum</th>
                  <th className="num">Total</th>
                  <th className="num">Open</th>
                </tr>
              </thead>
              <tbody>
                {jenis.map((s) => (
                  <tr key={s.label}>
                    <td className="b">{s.label}</td>
                    <td style={{ verticalAlign: "middle" }}>
                      <SplitBar inCe={s.inCe} notInCe={s.notInCe} max={maxJenis} />
                    </td>
                    <td className="num">{s.total}</td>
                    <td className="num">{s.open}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {timeline.length > 0 && (
          <div className="sec avoid">
            <h3>Target penyelesaian per bulan</h3>
            <table style={{ width: `${Math.min(100, 16 + timeline.length * 8)}%` }}>
              <thead>
                <tr>
                  <th style={{ width: "13%" }}>Status</th>
                  {timeline.map((t) => (
                    <th key={t.key} className="num">
                      {monthLabel(t.key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="b">Target</td>
                  {timeline.map((t) => (
                    <td key={t.key} className="num">
                      {t.target}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="b">Close</td>
                  {timeline.map((t) => (
                    <td key={t.key} className="num close">
                      {t.closed || "·"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="b">Berjalan</td>
                  {timeline.map((t) => (
                    <td key={t.key} className="num">
                      {t.open || "·"}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="b">Lewat target</td>
                  {timeline.map((t) => (
                    <td key={t.key} className={`num${t.overdue ? " open" : ""}`}>
                      {t.overdue || "·"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Sec>

      {/* ---------- masalah sistemik & kandidat ---------- */}
      <Sec
        page
        title="Masalah Sistemik (Lintas GI)"
        note="Anomali yang sama pada jenis aset yang sama dan muncul di 2 GI atau lebih; lebih efisien diselesaikan sebagai satu program."
      >
        {systemic.length === 0 ? (
          <p className="muted">Tidak ada masalah sistemik.</p>
        ) : (
          <table>
            <colgroup>
              <col style={{ width: "3.5%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "27%" }} />
              <col style={{ width: "5%" }} />
              <col style={{ width: "5%" }} />
              <col style={{ width: "29%" }} />
              <col style={{ width: "9.5%" }} />
              <col style={{ width: "9%" }} />
            </colgroup>
            <thead>
              <tr>
                <th className="ctr">No</th>
                <th>Jenis aset</th>
                <th>Anomali</th>
                <th className="num">Item</th>
                <th className="num">Open</th>
                <th>Gardu induk</th>
                <th>Periode</th>
                <th className="num">Anggaran</th>
              </tr>
            </thead>
            <tbody>
              {systemic.map((s, idx) => (
                <tr key={`${s.jenisAsset}-${s.anomaly}`}>
                  <td className="ctr muted">{idx + 1}</td>
                  <td className="b">{s.jenisAsset}</td>
                  <td>{s.anomaly}</td>
                  <td className="num">{s.items.length}</td>
                  <td className="num">{s.open}</td>
                  <td>{s.gis.join(", ")}</td>
                  <td>
                    {s.inCe === s.items.length
                      ? "CE 2026"
                      : s.inCe === 0
                        ? "Belum masuk CE"
                        : `${s.inCe} CE · ${s.items.length - s.inCe} belum`}
                  </td>
                  <td className="num">{s.budget > 0 ? formatRupiah(s.budget) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Sec>

      <Sec
        title="Kandidat Masuk CE Berikutnya"
        note="Anomali OPEN yang belum masuk CE, dikelompokkan per masalah dan diurutkan dari yang paling siap dan berdampak."
      >
        {candidates.length === 0 ? (
          <p className="muted">Tidak ada kandidat.</p>
        ) : (
          <table>
            <colgroup>
              <col style={{ width: "3.5%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "27%" }} />
              <col style={{ width: "5%" }} />
              <col style={{ width: "22%" }} />
              <col style={{ width: "21.5%" }} />
            </colgroup>
            <thead>
              <tr>
                <th className="ctr">No</th>
                <th>Jenis aset</th>
                <th>Stream</th>
                <th>Anomali</th>
                <th className="num">Item</th>
                <th>Gardu induk</th>
                <th>Alasan / kesiapan</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c, idx) => (
                <tr key={`${c.jenisAsset}-${c.anomaly}`}>
                  <td className="ctr muted">{idx + 1}</td>
                  <td className="b">{c.jenisAsset}</td>
                  <td>{c.stream}</td>
                  <td>{c.anomaly}</td>
                  <td className="num">{c.items.length}</td>
                  <td>{c.gis.join(", ")}</td>
                  <td>
                    {c.reasons.map((r) => (
                      <span key={r} className="tag">
                        {r}
                      </span>
                    ))}
                    {c.budget > 0 && <div className="muted">RAB {formatRupiah(c.budget)}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Sec>

      {/* ---------- bay menumpuk & anggaran ---------- */}
      <Sec
        page
        title="Bay dengan Anomali Menumpuk"
        note="Bay (atau GI untuk anomali tingkat gardu) dengan 3 anomali atau lebih; pekerjaannya bisa digabung dalam satu kali padam/pemeliharaan."
      >
        {bays.length === 0 ? (
          <p className="muted">Tidak ada bay dengan 3 anomali atau lebih.</p>
        ) : (
          <table>
            <colgroup>
              <col style={{ width: "3.5%" }} />
              <col style={{ width: "17%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "6%" }} />
              <col style={{ width: "6%" }} />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th className="ctr">No</th>
                <th>Bay</th>
                <th>Gardu induk</th>
                <th>ULTG</th>
                <th className="num">Anomali</th>
                <th className="num">Open</th>
                <th>Jenis aset yang bermasalah</th>
              </tr>
            </thead>
            <tbody>
              {bays.map((b, idx) => (
                <tr key={`${b.ultg}-${b.bay}`}>
                  <td className="ctr muted">{idx + 1}</td>
                  <td className="b">{b.bay}</td>
                  <td>{b.gi}</td>
                  <td>{ultgName(b.ultg)}</td>
                  <td className="num">{b.items.length}</td>
                  <td className="num">{b.open}</td>
                  <td>{b.jenis.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Sec>

      <Sec title="Anggaran Penyelesaian Anomali" note="Nilai RAB dari sheet ALOKASI ANGGARAN; satu paket RAB yang dipakai beberapa anomali dihitung sekali.">
        <div className="grid2">
          {[
            { title: "Per pos & tahun anggaran", rows: budgetByPos },
            { title: "Per stream", rows: budgetByStream },
          ].map((t) => (
            <div key={t.title} className="avoid">
              <h3>{t.title}</h3>
              <table>
                <colgroup>
                  <col style={{ width: "50%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>{t.title.startsWith("Per pos") ? "Pos / tahun" : "Stream"}</th>
                    <th className="num">Anomali ber-RAB</th>
                    <th className="num">Nilai</th>
                  </tr>
                </thead>
                <tbody>
                  {t.rows.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="muted">
                        Belum ada nilai RAB.
                      </td>
                    </tr>
                  ) : (
                    t.rows.map((b) => (
                      <tr key={b.label}>
                        <td className="b">{b.label}</td>
                        <td className="num">{b.count}</td>
                        <td className="num">{formatRupiah(b.nilai)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </Sec>

      {/* ---------- lampiran ---------- */}
      <Sec
        page
        title={`Lampiran A · Anomali OPEN Lewat Target (${overdue.length})`}
        note="Diurutkan dari tanggal target yang paling lama terlewati."
      >
        {overdue.length === 0 ? (
          <p className="muted">Tidak ada anomali OPEN yang melewati tanggal target.</p>
        ) : (
          <ItemTable items={overdue} showUltg={!ultg} />
        )}
      </Sec>

      <Sec
        page
        title={`Lampiran B · Daftar Anomali (${scoped.length})`}
        note={`${PERIODE_TEXT[periode]}, dikelompokkan per ULTG. C/O = CLOSE / OPEN.`}
      >
        {listByUltg.map((g, gi) => (
          <div key={g.ultg} className={gi > 0 ? "page" : undefined}>
            <h3 style={{ color: "#0f2f5c" }}>
              ULTG {ultgName(g.ultg)} · {g.items.length} anomali ({g.items.filter((i) => !i.done).length} OPEN)
            </h3>
            <ItemTable items={g.items} />
          </div>
        ))}
      </Sec>
    </div>
  );
}

/** Saves the report: the browser's print-to-PDF dialog; PrintEnhancer
 *  pre-fills the file name from data-print-filename. */
export function CePdfButton({ filename }: { filename: string }) {
  return (
    <Button variant="outline" size="sm" className="gap-1.5 bg-card" onClick={() => window.print()}>
      <FileDown className="size-3.5" />
      Report PDF
      <span hidden data-print-filename={filename} />
    </Button>
  );
}
