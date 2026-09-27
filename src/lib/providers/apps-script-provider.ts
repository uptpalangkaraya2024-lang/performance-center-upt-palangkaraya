import "server-only";

import { after } from "next/server";

import type { SheetRef } from "@/config/data-sources";
import { DRIVE_DISCOVERY_CACHE_TTL_MS } from "@/config/cache";
import { DataSourceError, type DataSourceErrorKind } from "@/lib/errors";
import type { BatchOutcome, DriveFileRef, SpreadsheetDataProvider } from "@/lib/data-provider";
import { SharedCache } from "@/lib/shared-cache";

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

// File discovery (name -> id) had NO caching at all until this — every
// readConfiguredSource()/readConfiguredSourceRaw() call re-resolved every
// configured file's id via a live findFile gateway call regardless of
// whether that file's SHEET data was already cached, unlike the legacy
// google-api provider (see src/services/google-drive.ts's own
// DRIVE_DISCOVERY_CACHE_TTL_MS-backed folder listing cache). Confirmed by
// direct measurement this was the dominant cost behind "why does even a
// fully warm page still take seconds" — Apps Script's own fixed ~1.6-1.8s
// per-call dispatch cost (see readSheetsBatchRaw's own comment below)
// applies here too, once per distinct FILE a page's data sources touch
// (e.g. the homepage alone references Kinerja UPT, Gangguan, AHI, ABO x2,
// 4DX, CE, RENUS — several distinct files), and Apps Script appears to
// serialize concurrent calls to the same deployment rather than truly
// running them in parallel, so this cost was being paid mostly
// sequentially on every single page load. A file's id practically never
// changes (only a rename/recreate in Drive would do it), so this reuses
// the same generous 30-minute default already defined for exactly this
// kind of lookup. Measured impact: a single-file service call (Kinerja
// UPT) dropped from ~2000-2800ms to ~800ms once this was warm.
const fileIdCache = new SharedCache<{ id: string; name: string }>("apps-script-file-id");

async function fetchAndCacheFileId(fileName: string): Promise<{ id: string; name: string }> {
  const data = await callGateway<{ id: string; name: string }>(
    { action: "findFile", fileName },
    { file: fileName },
  );
  await fileIdCache.set(fileName, data);
  return data;
}

async function findFile(fileName: string): Promise<DriveFileRef> {
  const cached = await fileIdCache.get(fileName);
  if (!cached) {
    // True first-ever lookup for this file — nothing to serve yet, has to block.
    const data = await fetchAndCacheFileId(fileName);
    return { id: data.id, name: data.name };
  }

  // Stale-while-revalidate, same principle as the sheet-data cache in
  // src/lib/data-connector.ts: a file's id practically never changes, so
  // once we've resolved it once, every later request just reuses that
  // value immediately and — only past the TTL — quietly re-checks in the
  // background via after(), instead of ever blocking a real request on
  // Apps Script's ~1.6-1.8s dispatch cost again.
  if (Date.now() - cached.fetchedAt >= DRIVE_DISCOVERY_CACHE_TTL_MS) {
    after(() => fetchAndCacheFileId(fileName).catch(() => {}));
  }
  return { id: cached.value.id, name: cached.value.name };
}

interface BatchFileResult {
  ok: boolean;
  file?: { id: string; name: string };
  error?: { code: string; message: string };
}

/** Resolves several names against ONE Apps Script execution (one folder
 *  scan server-side — see apps-script/drive-service.gs's findFilesByNames)
 *  instead of one findFile gateway call per name. Caches each resolved name
 *  individually, same fileIdCache as findFile(), so a later single findFile()
 *  call for one of these names is still a cache hit. */
async function fetchAndCacheFileIdsBatch(fileNames: string[]): Promise<Map<string, { id: string; name: string } | string>> {
  const data = await callGateway<Record<string, BatchFileResult>>(
    { action: "findFiles", fileNames },
    { file: fileNames.join(", ") },
  );
  const out = new Map<string, { id: string; name: string } | string>();
  await Promise.all(
    fileNames.map(async (fileName) => {
      const entry = data[fileName];
      if (entry?.ok && entry.file) {
        await fileIdCache.set(fileName, entry.file);
        out.set(fileName, entry.file);
      } else {
        out.set(fileName, entry?.error?.message ?? `Gagal resolve file "${fileName}".`);
      }
    }),
  );
  return out;
}

async function findFilesBatch(fileNames: string[]): Promise<Map<string, BatchOutcome<DriveFileRef>>> {
  const out = new Map<string, BatchOutcome<DriveFileRef>>();
  const toResolve: string[] = [];
  const toRevalidate: string[] = [];

  await Promise.all(
    fileNames.map(async (fileName) => {
      const cached = await fileIdCache.get(fileName);
      if (!cached) {
        toResolve.push(fileName);
        return;
      }
      out.set(fileName, { ok: true, value: { id: cached.value.id, name: cached.value.name } });
      if (Date.now() - cached.fetchedAt >= DRIVE_DISCOVERY_CACHE_TTL_MS) toRevalidate.push(fileName);
    }),
  );

  if (toRevalidate.length > 0) {
    after(() => fetchAndCacheFileIdsBatch(toRevalidate).catch(() => {}));
  }
  if (toResolve.length === 0) return out;

  try {
    const resolved = await fetchAndCacheFileIdsBatch(toResolve);
    for (const [name, result] of resolved) {
      out.set(name, typeof result === "string" ? { ok: false, message: result } : { ok: true, value: result });
    }
  } catch (error) {
    // The whole batch call failed at the network/gateway level (not a
    // per-file error) — every still-unresolved name fails together, same
    // as a plain findFile() throwing for each of them individually.
    const message = error instanceof Error ? error.message : String(error);
    for (const name of toResolve) out.set(name, { ok: false, message });
  }
  return out;
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
  findFilesBatch,
  readSheet,
  readSheetRaw,
  readSheetsBatch,
  readSheetsRawBatch,
  health,
};
