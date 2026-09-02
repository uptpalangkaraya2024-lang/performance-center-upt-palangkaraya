import "server-only";

import { DATA_CACHE_TTL_MS } from "@/config/cache";
import type { DataSourceConfig } from "@/config/data-sources";
import { getDataProvider } from "@/lib/data-provider-registry";
import { DataSourceError } from "@/lib/errors";
import { recordSyncError, recordSyncSuccess } from "@/lib/sync-status";

export interface SheetReadResult {
  file: string;
  sheet: string;
  purpose?: string;
  records: Record<string, string>[];
}

// Caches raw records per (provider, file, sheet) — the one place this lives,
// so a new module's service in src/services/*.ts never needs its own cache
// variable (that would just be per-service connector duplication, which
// AGENTS.md section 1 rules out). Keyed by provider name too: switching
// DATA_PROVIDER mid-run (e.g. during local testing) must not serve one
// provider's cached rows under the other's identity.
interface CacheEntry {
  records: Record<string, string>[];
  fetchedAt: number;
}
const rawCache = new Map<string, CacheEntry>();

function cacheKey(provider: string, file: string, sheet: string): string {
  return `${provider}::${file}::${sheet}`;
}

/**
 * Reads every configured file+sheet for one data source, through whichever
 * SpreadsheetDataProvider is active (see src/lib/data-provider-registry.ts —
 * google-api or apps-script; this file doesn't know or care which). This is
 * the one orchestration point: file discovery -> selected-sheet reader ->
 * cache -> sync-status recording. A missing file or a renamed sheet does not
 * abort the rest — each (file, sheet) pair is tried independently, its
 * outcome recorded, and only the ones that actually succeeded are returned.
 * The caller (a src/services/*.ts normalizer) decides whether a partial
 * result is still usable for its shape — see hasAllRequiredSheets() below.
 */
export async function readConfiguredSource(source: DataSourceConfig): Promise<SheetReadResult[]> {
  const provider = getDataProvider();
  const results: SheetReadResult[] = [];

  for (const fileSource of source.sources) {
    if (fileSource.enabled === false) continue; // not a failure — deliberately not ready yet

    let file;
    try {
      file = await provider.findFile(fileSource.file);
    } catch (error) {
      // A config/auth failure (missing GOOGLE_DRIVE_FOLDER_ID / GOOGLE_APPS_SCRIPT_URL,
      // bad credentials, ...) is not the same problem as a genuinely missing
      // file — surface its real message instead of a generic "not found", or
      // an admin ends up hunting through Drive for a file that was never the
      // actual issue.
      const message = error instanceof Error ? error.message : String(error);
      for (const sheetRef of fileSource.sheets) {
        recordSyncError({
          module: source.label,
          file: fileSource.file,
          sheet: sheetRef.name,
          provider: provider.name,
          error: message,
        });
      }
      continue;
    }

    for (const sheetRef of fileSource.sheets) {
      const key = cacheKey(provider.name, fileSource.file, sheetRef.name);
      const cached = rawCache.get(key);
      if (cached && Date.now() - cached.fetchedAt < DATA_CACHE_TTL_MS) {
        results.push({ file: fileSource.file, sheet: sheetRef.name, purpose: sheetRef.purpose, records: cached.records });
        continue; // cache hit — no provider call, no sync-status touch (lastSync stays the real last fetch time)
      }

      try {
        const records = await provider.readSheet(file, sheetRef);
        rawCache.set(key, { records, fetchedAt: Date.now() });
        recordSyncSuccess({
          module: source.label,
          file: fileSource.file,
          sheet: sheetRef.name,
          provider: provider.name,
          rows: records.length,
        });
        results.push({ file: fileSource.file, sheet: sheetRef.name, purpose: sheetRef.purpose, records });
      } catch (error) {
        const message =
          error instanceof DataSourceError || error instanceof Error ? error.message : String(error);
        recordSyncError({
          module: source.label,
          file: fileSource.file,
          sheet: sheetRef.name,
          provider: provider.name,
          error: message,
        });
        // A transient failure shouldn't blank out a dashboard that had good
        // data a moment ago — fall back to the stale (past-TTL) cache entry
        // if one exists, even though the sync status above already recorded
        // this as an error so an admin still sees it's failing.
        if (cached) {
          results.push({ file: fileSource.file, sheet: sheetRef.name, purpose: sheetRef.purpose, records: cached.records });
        }
      }
    }
  }

  return results;
}

export interface RawSheetReadResult {
  file: string;
  sheet: string;
  purpose?: string;
  rows: unknown[][];
}

interface RawCacheEntry {
  rows: unknown[][];
  fetchedAt: number;
}
// Separate from rawCache above — same (provider, file, sheet) key space would
// otherwise let a raw-grid read and a header-keyed read silently overwrite
// each other's cache entry despite returning differently-shaped data.
const rawRowsCache = new Map<string, RawCacheEntry>();

/**
 * Raw-grid counterpart of readConfiguredSource() — for a report-layout sheet
 * where a single header row can't uniquely name every column (see
 * SpreadsheetDataProvider.readSheetRaw), so the header-keyed path would
 * silently drop data. Same file discovery / cache / sync-status behavior,
 * just returning the untouched grid instead of Record<string,string>[].
 */
export async function readConfiguredSourceRaw(source: DataSourceConfig): Promise<RawSheetReadResult[]> {
  const provider = getDataProvider();
  const results: RawSheetReadResult[] = [];

  for (const fileSource of source.sources) {
    if (fileSource.enabled === false) continue;

    let file;
    try {
      file = await provider.findFile(fileSource.file);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      for (const sheetRef of fileSource.sheets) {
        recordSyncError({
          module: source.label,
          file: fileSource.file,
          sheet: sheetRef.name,
          provider: provider.name,
          error: message,
        });
      }
      continue;
    }

    for (const sheetRef of fileSource.sheets) {
      const key = cacheKey(provider.name, fileSource.file, sheetRef.name);
      const cached = rawRowsCache.get(key);
      if (cached && Date.now() - cached.fetchedAt < DATA_CACHE_TTL_MS) {
        results.push({ file: fileSource.file, sheet: sheetRef.name, purpose: sheetRef.purpose, rows: cached.rows });
        continue;
      }

      try {
        const rows = await provider.readSheetRaw(file, sheetRef);
        rawRowsCache.set(key, { rows, fetchedAt: Date.now() });
        recordSyncSuccess({
          module: source.label,
          file: fileSource.file,
          sheet: sheetRef.name,
          provider: provider.name,
          rows: rows.length,
        });
        results.push({ file: fileSource.file, sheet: sheetRef.name, purpose: sheetRef.purpose, rows });
      } catch (error) {
        const message =
          error instanceof DataSourceError || error instanceof Error ? error.message : String(error);
        recordSyncError({
          module: source.label,
          file: fileSource.file,
          sheet: sheetRef.name,
          provider: provider.name,
          error: message,
        });
        if (cached) {
          results.push({ file: fileSource.file, sheet: sheetRef.name, purpose: sheetRef.purpose, rows: cached.rows });
        }
      }
    }
  }

  return results;
}

/**
 * True only if every *required* sheet (required !== false) across every
 * *enabled* file in the source actually came back in `results`. A service
 * can use this to decide "unavailable" vs. "render with what we have" — the
 * connector itself stays neutral on that policy (see AGENTS.md section 15).
 */
export function hasAllRequiredSheets(
  source: DataSourceConfig,
  results: { file: string; sheet: string }[],
): boolean {
  return source.sources
    .filter((fileSource) => fileSource.enabled !== false)
    .every((fileSource) =>
      fileSource.sheets
        .filter((sheetRef) => sheetRef.required !== false)
        .every((sheetRef) => results.some((r) => r.file === fileSource.file && r.sheet === sheetRef.name)),
    );
}
