import "server-only";

import type { SheetRef } from "@/config/data-sources";
import { DataSourceError, type DataSourceErrorKind } from "@/lib/errors";
import type { DriveFileRef, SpreadsheetDataProvider } from "@/lib/data-provider";

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
  health,
};
