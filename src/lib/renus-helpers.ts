import type { RenusRow } from "@/types";

// Shared, client-safe (no "server-only") predicates for RENUS rows — used by
// the server-side service/insight builder and the client-side filter UI, so
// "overdue"/"cancelled" mean exactly the same thing everywhere.

// STATUS WORK ORDER (SAP) = "TECO" ("technically completed") is a real
// completion signal even when the business-level STATUS/REALISASI columns
// were never updated — confirmed against live data that a large share of
// past-dated rows carry TECO despite blank REALISASI, so ignoring it would
// wildly over-count "overdue" work that was actually already done.
export function isRenusDone(row: RenusRow): boolean {
  return row.realisasiDate !== null || row.status === "COMPLETED" || row.sapWoStatus === "TECO";
}

// Cancelled either at the business level (STATUS = BATAL) or in SAP
// (STATUS WORK ORDER (SAP) = CANC) — either one means this row shouldn't
// count toward overdue/upcoming/high-risk operational totals.
export function isRenusCancelled(row: RenusRow): boolean {
  return row.status === "BATAL" || row.sapWoStatus === "CANC";
}

export function isRenusHighRisk(row: RenusRow): boolean {
  return row.risk === "HIGH" || row.risk === "EXTREME-CRITICAL";
}

/** The single "overdue" definition for every RENUS surface in this app —
 *  a row counts as overdue when it's not cancelled, not done (see
 *  isRenusDone's own comment on why TECO/COMPLETED count even with a
 *  blank REALISASI), and its own rencana date has already passed. Before
 *  this was centralized, one surface (Laporan Eksekutif) re-derived its
 *  own inline version that checked only `!realisasiDate`, silently
 *  missing the TECO/COMPLETED signal — so it counted a large share of
 *  already-finished work as still overdue (211 vs the correct 48,
 *  confirmed against live data). Every surface now calls this one
 *  function instead of rebuilding the condition. */
export function isRenusOverdue(row: RenusRow, todayISO: string): boolean {
  return !isRenusCancelled(row) && !isRenusDone(row) && row.rencanaDate < todayISO;
}

/** Four-state label derived purely from the fields above — "ada realisasi
 *  (atau TECO/COMPLETED) = Selesai; tidak ada realisasi dan rencana sudah
 *  lewat = Overdue; selain itu = Rencana", plus a separate Batal bucket
 *  for cancelled rows (excluded from the other three everywhere else in
 *  this app, kept excluded here too rather than silently lumped into
 *  Rencana). Never stored — always derived fresh against the current
 *  date, same "today" convention every other overdue check in this app
 *  uses (Asia/Jakarta calendar date, see each service's own `todayISO`). */
export type RenusStatusLabel = "Selesai" | "Overdue" | "Rencana" | "Batal";

export function deriveRenusStatus(row: RenusRow, todayISO: string): RenusStatusLabel {
  if (isRenusCancelled(row)) return "Batal";
  if (isRenusDone(row)) return "Selesai";
  if (row.rencanaDate < todayISO) return "Overdue";
  return "Rencana";
}
