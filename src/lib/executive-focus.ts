// "Keputusan yang diperlukan" and "Fokus 2 minggu ke depan" for Laporan
// Eksekutif (FASE 3) — both are plain rule-based selections over data
// already computed elsewhere on this page (top maintenance proposals, CE
// critical findings, upcoming/overdue RENUS work), capped and ranked, never
// a fabricated judgment call. Kept in their own file rather than inline in
// narrative-report.ts since these produce short actionable ITEMS (closer to
// a checklist than prose), not paragraphs.
import type { CeItem, RenusRow } from "@/types";
import type { MaintenanceProposal } from "@/lib/maintenance-proposals";
import { isRenusCancelled, isRenusDone } from "@/lib/renus-helpers";

const MAX_ITEMS = 5;
const FOCUS_WINDOW_DAYS = 14;

function daysBetween(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T00:00:00Z`).getTime();
  const to = new Date(`${toISO}T00:00:00Z`).getTime();
  return Math.round((to - from) / 86400000);
}

/** Up to 5 items that need an actual human decision this period — not
 *  just awareness. Ranked: equipment-replacement proposals first (budget
 *  decision), then open CE Critical findings (escalation decision),
 *  highest-risk score first within each group. */
export function buildDecisionsNeeded(params: { topProposals: MaintenanceProposal[]; ceItems: CeItem[] }): string[] {
  const { topProposals, ceItems } = params;
  const items: string[] = [];

  const replacements = topProposals.filter((p) => p.recommendation === "Penggantian Peralatan").slice(0, 3);
  for (const p of replacements) {
    const reason = p.reasons[0] ?? "risiko tinggi pada gabungan indikator.";
    items.push(`Keputusan penggantian peralatan di GI ${p.gi} (skor risiko ${p.riskScore100}/100) — ${reason}`);
  }

  // CE logs one row per tested/affected parameter for what's often the
  // SAME underlying finding (same GI, same program) — same duplication
  // FASE 2's own merge in action-effectiveness.ts exists to handle,
  // deduped the same way here (GI + program) so this list doesn't show
  // the same finding twice just because the sheet logged it twice.
  const seenCe = new Set<string>();
  const criticalCe: CeItem[] = [];
  for (const c of ceItems) {
    if (c.kriteriaBefore !== "Critical" || c.done) continue;
    const key = `${c.gardu}::${c.namaProgram || c.anomaliPemicu}`;
    if (seenCe.has(key)) continue;
    seenCe.add(key);
    criticalCe.push(c);
    if (criticalCe.length >= MAX_ITEMS - items.length) break;
  }
  for (const c of criticalCe) {
    // c.gardu already carries its own "GI "/"GIS " prefix from the raw
    // sheet (unlike p.gi above, which comes from GiCorrelationRow and has
    // that prefix already stripped) — no prefix added here, or it reads
    // "GI GI BAGENDANG".
    items.push(`Tindak lanjut temuan Common Enemy Critical di ${c.gardu}: ${c.namaProgram || c.anomaliPemicu || `temuan #${c.id}`}.`);
  }

  return items.slice(0, MAX_ITEMS);
}

/** Up to 5 items with a concrete deadline inside the next 14 days —
 *  scheduled RENUS work due soon, plus a reminder of already-overdue work
 *  if any (a catch-up item, not a new deadline). */
export function buildNextTwoWeeksFocus(params: { renusRows: RenusRow[]; renusOverdueCount: number; todayISO: string }): string[] {
  const { renusRows, renusOverdueCount, todayISO } = params;
  const items: string[] = [];

  if (renusOverdueCount > 0) {
    items.push(`Selesaikan ${renusOverdueCount} pekerjaan RENUS yang sudah melewati tanggal rencana (lihat halaman RENUS, filter Overdue).`);
  }

  const upcoming = renusRows
    .filter((r) => !isRenusCancelled(r) && !isRenusDone(r))
    .filter((r) => {
      const d = daysBetween(todayISO, r.rencanaDate);
      return d >= 0 && d <= FOCUS_WINDOW_DAYS;
    })
    .sort((a, b) => {
      // Highest risk first, then soonest date.
      const riskRank = (r: RenusRow) => (r.risk === "EXTREME-CRITICAL" ? 2 : r.risk === "HIGH" ? 1 : 0);
      const rr = riskRank(b) - riskRank(a);
      return rr !== 0 ? rr : a.rencanaDate.localeCompare(b.rencanaDate);
    })
    .slice(0, MAX_ITEMS - items.length);

  for (const r of upcoming) {
    // r.gi already carries its own "GI 150 KV "-style prefix straight from
    // the sheet — not added again here, or it reads "GI GI 150 KV X".
    items.push(`Pelaksanaan RENUS di ${r.gi}: ${r.workDetail} — rencana ${r.rencanaDate}${r.risk ? ` (${r.risk})` : ""}.`);
  }

  return items.slice(0, MAX_ITEMS);
}
