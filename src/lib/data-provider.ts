// The abstraction that lets src/lib/data-connector.ts (and everything above
// it — services, KPI engine, dashboard) stay ignorant of HOW spreadsheet
// data actually gets fetched. Two implementations exist: google-api-provider
// (Phase 2.1 — Drive API + service account) and apps-script-provider (Phase
// 2.2 — HTTP gateway). Selected at runtime by DATA_PROVIDER — see
// src/lib/data-provider-registry.ts.
import type { SheetRef } from "@/config/data-sources";

/** Per-sheet outcome of a batched read — a sheet failing on its own must
 *  never fail the whole batch (same independence guarantee as calling
 *  readSheet/readSheetRaw per sheet and catching each failure separately). */
export type BatchOutcome<T> = { ok: true; value: T } | { ok: false; message: string };

export interface DriveFileRef {
  id: string;
  name: string;
  /** Provider-internal metadata (e.g. mimeType for google-api). Opaque to callers — never inspected outside the provider that set it. */
  raw?: unknown;
}

export interface SpreadsheetDataProvider {
  readonly name: "google-api" | "apps-script";
  /** Resolves a configured file name to a concrete file. Throws DataSourceError("FILE_NOT_FOUND" | "AMBIGUOUS_SOURCE", ...) on failure. */
  findFile(fileName: string): Promise<DriveFileRef>;
  /** Reads one sheet/tab from a file already resolved by findFile(). Throws DataSourceError("SHEET_NOT_FOUND" | "UNSUPPORTED_FORMAT", ...) on failure. */
  readSheet(file: DriveFileRef, sheet: SheetRef): Promise<Record<string, string>[]>;
  /**
   * Same read, without the header-keyed Record<string,string> conversion —
   * for report-layout sheets where a single header row can't uniquely name
   * every column (e.g. a value repeated across side-by-side blocks), so
   * readSheet() would silently drop data no matter which row is chosen as
   * headerRow. Added for AHI UPT Palangkaraya (Phase 3B) — see
   * src/services/ahi-performance.ts. Row 0 is the sheet's literal first row
   * (no header offset applied); callers index into it themselves.
   */
  readSheetRaw(file: DriveFileRef, sheet: SheetRef): Promise<unknown[][]>;
  /**
   * Optional: reads several sheets from the SAME file in one round trip
   * instead of one readSheet() call per sheet — added after direct
   * measurement showed each apps-script call pays a ~1.6-1.8s fixed
   * dispatch/network cost regardless of payload, and that cost doesn't
   * shrink by firing several calls "in parallel" from this client (the
   * gateway's own concurrency appears to serialize them anyway). Only
   * apps-script-provider implements this today; a provider without it is
   * used exactly as before (data-connector.ts falls back to per-sheet
   * calls, still run concurrently via Promise.all — a real improvement
   * over the old sequential loop, just not as good as true batching).
   * A sheet that fails independently comes back with its own `{ ok: false }`
   * outcome, matching a per-sheet readSheet() failure being caught and
   * recorded separately by the caller — never silently dropped.
   */
  readSheetsBatch?(file: DriveFileRef, sheets: SheetRef[]): Promise<Map<string, BatchOutcome<Record<string, string>[]>>>;
  /** Same batching, for the readSheetRaw() shape. */
  readSheetsRawBatch?(file: DriveFileRef, sheets: SheetRef[]): Promise<Map<string, BatchOutcome<unknown[][]>>>;
  /** Cheap reachability check for the Data & Sync page — never throws. */
  health(): Promise<{ healthy: boolean; message?: string }>;
}
