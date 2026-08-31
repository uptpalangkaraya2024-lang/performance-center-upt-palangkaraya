import "server-only";

import type { SheetRef } from "@/config/data-sources";
import { DataSourceError } from "@/lib/errors";
import type { DriveFileRef, SpreadsheetDataProvider } from "@/lib/data-provider";
import { readSheetFromDriveFile } from "@/lib/sheet-readers";
import { findFileInDriveFolder, type DriveFile } from "@/services/google-drive";

// Wraps the Phase 2.1 Drive API + service account implementation behind the
// SpreadsheetDataProvider interface — no behavior changes here, see
// src/services/google-drive.ts and src/lib/sheet-readers.ts for the actual logic.
async function findFile(fileName: string): Promise<DriveFileRef> {
  const file = await findFileInDriveFolder(fileName);
  if (!file) {
    throw new DataSourceError(
      "FILE_NOT_FOUND",
      fileName,
      undefined,
      `File "${fileName}" tidak ditemukan di folder Google Drive`,
    );
  }
  // mimeType (needed by readSheetFromDriveFile to pick the native vs. xlsx
  // reader) is google-api-specific — stashed as opaque `raw`, not part of
  // the shared DriveFileRef shape other providers have to fill in too.
  return { id: file.id, name: file.name, raw: file };
}

async function readSheet(file: DriveFileRef, sheet: SheetRef): Promise<Record<string, string>[]> {
  return readSheetFromDriveFile(file.raw as DriveFile, sheet);
}

async function health(): Promise<{ healthy: boolean; message?: string }> {
  try {
    // Any lookup exercises folder resolution + auth + listing — whether the
    // probe name itself matches a real file is irrelevant to reachability.
    await findFileInDriveFolder("__health-check__");
    return { healthy: true };
  } catch (error) {
    return { healthy: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export const googleApiProvider: SpreadsheetDataProvider = {
  name: "google-api",
  findFile,
  readSheet,
  health,
};
