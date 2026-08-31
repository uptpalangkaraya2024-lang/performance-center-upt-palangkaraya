import "server-only";

import { DRIVE_DISCOVERY_CACHE_TTL_MS } from "@/config/cache";
import { DataSourceError } from "@/lib/errors";
import { getGoogleClients } from "@/lib/google-drive-client";

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string | null;
  size: string | null;
}

// One env var is the entire root config — every spreadsheet is discovered
// by name inside this single folder, never referenced by ID in code or env.
function resolveFolderId(): string {
  const id = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!id) {
    throw new Error("GOOGLE_DRIVE_FOLDER_ID belum diset — lihat .env.example");
  }
  return id;
}

// Folder contents rarely change minute-to-minute (new spreadsheets are added
// deliberately, not continuously), so this is cached far longer than a
// sheet's own data — see DRIVE_DISCOVERY_CACHE_TTL_MS vs. DATA_CACHE_TTL_MS
// (src/config/cache.ts).
let folderCache: { files: DriveFile[]; fetchedAt: number } | null = null;

// Root-level only, deliberately — files.list's default `q` here has no
// recursive traversal into subfolders (see AGENTS.md section 31). Add a
// breadth-first subfolder walk here later if that's ever needed.
async function listFolderFiles(): Promise<DriveFile[]> {
  if (folderCache && Date.now() - folderCache.fetchedAt < DRIVE_DISCOVERY_CACHE_TTL_MS) {
    return folderCache.files;
  }

  const { drive } = getGoogleClients();
  const folderId = resolveFolderId();
  const files: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, modifiedTime, size, shortcutDetails)",
      pageSize: 200,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    for (const file of response.data.files ?? []) {
      if (!file.id || !file.name || !file.mimeType) continue;
      // A folder can hold a shortcut instead of the file itself (Drive's
      // own "Add shortcut to Drive") — its own id/mimeType are for the
      // shortcut object, which has no readable content, so resolve to
      // whatever it actually points at before this file is ever used.
      const isShortcut = file.mimeType === "application/vnd.google-apps.shortcut";
      const targetId = isShortcut ? file.shortcutDetails?.targetId : undefined;
      const targetMimeType = isShortcut ? file.shortcutDetails?.targetMimeType : undefined;
      if (isShortcut && (!targetId || !targetMimeType)) continue;

      files.push({
        id: targetId ?? file.id,
        name: file.name,
        mimeType: targetMimeType ?? file.mimeType,
        modifiedTime: file.modifiedTime ?? null,
        size: file.size ?? null,
      });
    }
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  folderCache = { files, fetchedAt: Date.now() };
  return files;
}

const KNOWN_SPREADSHEET_EXTENSIONS = /\.(xlsx|xls)$/i;

// A configured name like "Kinerja ULTG" must match both a native Google
// Sheet named exactly that AND a file literally named "Kinerja ULTG.xlsx" —
// the extension is Drive/Excel plumbing, not part of the data source's
// identity (see AGENTS.md section 21).
function normalizeFileName(name: string): string {
  return name.replace(KNOWN_SPREADSHEET_EXTENSIONS, "").trim().toLowerCase();
}

export async function findFileInDriveFolder(configuredName: string): Promise<DriveFile | null> {
  const files = await listFolderFiles();
  const target = normalizeFileName(configuredName);
  const matches = files.filter((file) => normalizeFileName(file.name) === target);

  if (matches.length > 1) {
    // Picking one silently would make the dashboard's data source
    // non-deterministic (which copy "wins" could flip between syncs) — an
    // admin needs to rename/remove the duplicate, not have it guessed at.
    throw new DataSourceError(
      "AMBIGUOUS_SOURCE",
      configuredName,
      undefined,
      `${matches.length} file bernama "${configuredName}" ditemukan di folder Google Drive — hapus atau ganti nama salah satunya agar tidak ambigu.`,
    );
  }

  return matches[0] ?? null;
}

/** Bypasses the discovery cache — for a future manual "Sync now" action. */
export function invalidateFolderDiscoveryCache() {
  folderCache = null;
}
