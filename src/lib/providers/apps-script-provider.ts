import "server-only";

import type { SheetRef } from "@/config/data-sources";
import { DataSourceError, type DataSourceErrorKind } from "@/lib/errors";
import type { BatchOutcome, DriveFileRef, SpreadsheetDataProvider } from "@/lib/data-provider";

function resolveGatewayUrl(): string {
  const url = process.env.GOOGLE_APPS_SCRIPT_URL;
  if (!url) {
    throw new Error("GOOGLE_APPS_SCRIPT_URL belum diset — lihat .env.example");
  }
  return url;
}

const REQUEST_TIMEOUT_MS = 15_000;
// Total attempts = MAX_RETRIES + 1. Only ever retries a transient failure
// (see isRetryable below) — a missing file/sheet will still be missing on
// attempt two, so retrying it just wastes the Apps Script quota.
const MAX_RETRIES = 1;

interface GatewaySuccess<T> {
  success: true;
  data: T;
}
interface GatewayError {
  success: false;
  error: { code: string; message: string };
}
type GatewayResponse<T> = GatewaySuccess<T> | GatewayError;

const ERROR_CODE_MAP: Record<string, DataSourceErrorKind> = {
  FILE_NOT_FOUND: "FILE_NOT_FOUND",
  AMBIGUOUS_SOURCE: "AMBIGUOUS_SOURCE",
  SHEET_NOT_FOUND: "SHEET_NOT_FOUND",
  UNSUPPORTED_FORMAT: "UNSUPPORTED_FORMAT",
  UNAUTHORIZED: "UNAUTHORIZED",
};

function isRetryable(kind: DataSourceErrorKind | null): boolean {
  return kind === null || kind === "UPSTREAM_ERROR" || kind === "TIMEOUT";
}

async function callGateway<T>(
  body: Record<string, unknown>,
  context: { file: string; sheet?: string },
): Promise<T> {
  const url = resolveGatewayUrl();
  const secret = process.env.GOOGLE_APPS_SCRIPT_SECRET;
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(secret ? { ...body, secret } : body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new DataSourceError(
          "UPSTREAM_ERROR",
          context.file,
          context.sheet,
          `Apps Script gateway mengembalikan status ${response.status}`,
        );
      }

      const payload = (await response.json()) as GatewayResponse<T>;
      if (!payload.success) {
        const kind = ERROR_CODE_MAP[payload.error.code] ?? "UPSTREAM_ERROR";
        throw new DataSourceError(kind, context.file, context.sheet, payload.error.message);
      }
      return payload.data;
    } catch (error) {
      const isAbort = error instanceof Error && error.name === "AbortError";
      const normalized = isAbort
        ? new DataSourceError(
            "TIMEOUT",
            context.file,
            context.sheet,
            `Apps Script gateway tidak merespons dalam ${REQUEST_TIMEOUT_MS / 1000} detik`,
          )
        : error;
      lastError = normalized;

      const kind = normalized instanceof DataSourceError ? normalized.kind : null;
      if (attempt < MAX_RETRIES && isRetryable(kind)) continue;
      throw normalized;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // Unreachable — the loop always either returns or throws — but keeps
  // TypeScript satisfied that every path returns/throws.
  throw lastError;
}

async function findFile(fileName: string): Promise<DriveFileRef> {
  const data = await callGateway<{ id: string; name: string }>(
    { action: "findFile", fileName },
    { file: fileName },
  );
  return { id: data.id, name: data.name };
}

function rowsToRecords(headers: string[], rows: unknown[][]): Record<string, string>[] {
  return rows.map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (!header) return;
      record[header] = String(row[index] ?? "").trim();
    });
    return record;
  });
}

async function readSheet(file: DriveFileRef, sheet: SheetRef): Promise<Record<string, string>[]> {
  const data = await callGateway<{ headers: string[]; rows: unknown[][] }>(
    { action: "readSheet", fileName: file.name, sheetName: sheet.name, headerRow: sheet.headerRow ?? 1 },
    { file: file.name, sheet: sheet.name },
  );
  return rowsToRecords(data.headers ?? [], data.rows ?? []);
}

async function readSheetRaw(file: DriveFileRef, sheet: SheetRef): Promise<unknown[][]> {
  // The gateway's own contract splits the response into "headers" (the row
  // at headerRow) and "rows" (everything after it) — requesting headerRow:1
  // and re-prepending `headers` reconstructs the untouched grid from the
  // sheet's literal first row, with no header-keyed conversion applied.
  const data = await callGateway<{ headers: string[]; rows: unknown[][] }>(
    { action: "readSheet", fileName: file.name, sheetName: sheet.name, headerRow: 1 },
    { file: file.name, sheet: sheet.name },
  );
  return [data.headers ?? [], ...(data.rows ?? [])];
}

interface BatchSheetResult {
  headers?: string[];
  rows?: unknown[][];
  error?: { code: string; message: string };
}

/** One Apps Script execution reading every requested sheet from the SAME
 *  already-open spreadsheet, instead of one HTTP round trip per sheet.
 *  Confirmed by direct measurement: each round trip pays a ~1.6-1.8s fixed
 *  dispatch/network cost regardless of payload size, and the gateway's
 *  concurrency appears to serialize simultaneous requests to the same
 *  deployment anyway — so N sheets requested "in parallel" from this
 *  client still cost roughly N x that overhead. Batching cut a real 6-sheet
 *  read from ~22s (one at a time) to ~7s in that same measurement. A sheet
 *  that individually errors doesn't fail the whole batch — its own outcome
 *  just comes back `ok: false`, same as calling readSheet per-sheet and
 *  catching each failure independently (so Data & Sync still shows the
 *  real per-sheet error message, not a generic batch failure). */
async function readSheetsBatchRaw(
  file: DriveFileRef,
  sheets: { name: string; headerRow: number }[],
): Promise<Map<string, BatchOutcome<{ headers: string[]; rows: unknown[][] }>>> {
  const data = await callGateway<{ file: string; sheets: Record<string, BatchSheetResult> }>(
    { action: "readSheets", fileName: file.name, sheets },
    { file: file.name },
  );
  const out = new Map<string, BatchOutcome<{ headers: string[]; rows: unknown[][] }>>();
  for (const sheet of sheets) {
    const entry = data.sheets[sheet.name];
    if (!entry) {
      out.set(sheet.name, { ok: false, message: "Sheet tidak ditemukan pada hasil batch." });
    } else if (entry.error) {
      out.set(sheet.name, { ok: false, message: entry.error.message });
    } else {
      out.set(sheet.name, { ok: true, value: { headers: entry.headers ?? [], rows: entry.rows ?? [] } });
    }
  }
  return out;
}

async function readSheetsBatch(
  file: DriveFileRef,
  sheets: SheetRef[],
): Promise<Map<string, BatchOutcome<Record<string, string>[]>>> {
  const batch = await readSheetsBatchRaw(
    file,
    sheets.map((s) => ({ name: s.name, headerRow: s.headerRow ?? 1 })),
  );
  const out = new Map<string, BatchOutcome<Record<string, string>[]>>();
  for (const [name, outcome] of batch) {
    out.set(name, outcome.ok ? { ok: true, value: rowsToRecords(outcome.value.headers, outcome.value.rows) } : outcome);
  }
  return out;
}

async function readSheetsRawBatch(
  file: DriveFileRef,
  sheets: SheetRef[],
): Promise<Map<string, BatchOutcome<unknown[][]>>> {
  // Same headerRow:1 + re-prepend convention as readSheetRaw above.
  const batch = await readSheetsBatchRaw(
    file,
    sheets.map((s) => ({ name: s.name, headerRow: 1 })),
  );
  const out = new Map<string, BatchOutcome<unknown[][]>>();
  for (const [name, outcome] of batch) {
    out.set(name, outcome.ok ? { ok: true, value: [outcome.value.headers, ...outcome.value.rows] } : outcome);
  }
  return out;
}

async function health(): Promise<{ healthy: boolean; message?: string }> {
  try {
    await callGateway<{ status: string }>({ action: "health" }, { file: "health" });
    return { healthy: true };
  } catch (error) {
    return { healthy: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export const appsScriptProvider: SpreadsheetDataProvider = {
  name: "apps-script",
  findFile,
  readSheet,
  readSheetRaw,
  readSheetsBatch,
  readSheetsRawBatch,
  health,
};
