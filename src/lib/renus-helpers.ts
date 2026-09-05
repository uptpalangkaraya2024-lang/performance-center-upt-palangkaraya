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
