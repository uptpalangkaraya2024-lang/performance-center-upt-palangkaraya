// The abstraction that lets src/lib/data-connector.ts (and everything above
// it — services, KPI engine, dashboard) stay ignorant of HOW spreadsheet
// data actually gets fetched. Two implementations exist: google-api-provider
// (Phase 2.1 — Drive API + service account) and apps-script-provider (Phase
// 2.2 — HTTP gateway). Selected at runtime by DATA_PROVIDER — see
// src/lib/data-provider-registry.ts.
import type { SheetRef } from "@/config/data-sources";

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
  /** Cheap reachability check for the Data & Sync page — never throws. */
  health(): Promise<{ healthy: boolean; message?: string }>;
}
