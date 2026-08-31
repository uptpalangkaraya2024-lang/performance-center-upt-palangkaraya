import "server-only";

import * as XLSX from "xlsx";

import type { SheetRef } from "@/config/data-sources";
import { DataSourceError } from "@/lib/errors";
import { getGoogleClients } from "@/lib/google-drive-client";
import type { DriveFile } from "@/services/google-drive";

const NATIVE_SHEET_MIME = "application/vnd.google-apps.spreadsheet";
const XLSX_MIME_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
]);

// Shared by both readers below so a native Google Sheet and an uploaded
// .xlsx file produce identically-shaped records — everything downstream
// (normalizers in src/services/*.ts) stays agnostic of which one it was.
// `headerRow` is 1-indexed (matches how a human reads the sheet) — some
// spreadsheets have a helper row (e.g. numbered column references) above
// the real header row, hence this isn't always row 1 — see SheetRef.headerRow.
function rowsToRecords(rows: unknown[][], headerRow: number): Record<string, string>[] {
  const headerIndex = Math.max(0, headerRow - 1);
  if (rows.length <= headerIndex) return [];
  const headers = rows[headerIndex].map((header) => String(header ?? "").trim());
  return rows.slice(headerIndex + 1).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (!header) return;
      record[header] = String(row[index] ?? "").trim();
    });
    return record;
  });
}

async function readNativeSheet(file: DriveFile, sheet: SheetRef): Promise<Record<string, string>[]> {
  const { sheets } = getGoogleClients();

  // Confirmed up front — the Sheets API's own error for a range naming a
  // missing tab is a generic 400, not distinguishable from other request
  // problems, so this is the only way to report SHEET_NOT_FOUND accurately.
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: file.id,
    fields: "sheets.properties.title",
  });
  const titles = (meta.data.sheets ?? [])
    .map((s) => s.properties?.title)
    .filter((title): title is string => Boolean(title));
  if (!titles.includes(sheet.name)) {
    throw new DataSourceError(
      "SHEET_NOT_FOUND",
      file.name,
      sheet.name,
      `Sheet "${sheet.name}" tidak ditemukan di file "${file.name}"`,
    );
  }

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: file.id,
    range: sheet.name,
    // Raw numbers, not locale-formatted display strings — see parse.ts.
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  return rowsToRecords((response.data.values ?? []) as unknown[][], sheet.headerRow ?? 1);
}

async function readXlsxSheet(file: DriveFile, sheet: SheetRef): Promise<Record<string, string>[]> {
  const { drive } = getGoogleClients();
  const response = await drive.files.get(
    { fileId: file.id, alt: "media" },
    { responseType: "arraybuffer" },
  );
  const workbook = XLSX.read(Buffer.from(response.data as ArrayBuffer), { type: "buffer" });

  if (!workbook.SheetNames.includes(sheet.name)) {
    throw new DataSourceError(
      "SHEET_NOT_FOUND",
      file.name,
      sheet.name,
      `Sheet "${sheet.name}" tidak ditemukan di file "${file.name}"`,
    );
  }

  const worksheet = workbook.Sheets[sheet.name];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, blankrows: false });
  return rowsToRecords(rows, sheet.headerRow ?? 1);
}

/**
 * Reads one sheet/tab out of one Drive file, dispatching to the native
 * Sheets API or the xlsx parser by mimeType — the one place that distinction
 * matters. Everything above this (src/lib/data-connector.ts and up) only
 * ever sees `Record<string, string>[]`.
 */
export async function readSheetFromDriveFile(
  file: DriveFile,
  sheet: SheetRef,
): Promise<Record<string, string>[]> {
  if (file.mimeType === NATIVE_SHEET_MIME) return readNativeSheet(file, sheet);
  if (XLSX_MIME_TYPES.has(file.mimeType)) return readXlsxSheet(file, sheet);
  throw new DataSourceError(
    "UNSUPPORTED_FORMAT",
    file.name,
    sheet.name,
    `Format file "${file.mimeType}" tidak didukung untuk "${file.name}"`,
  );
}
