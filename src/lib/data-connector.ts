import "server-only";

import { after } from "next/server";

import { DATA_CACHE_TTL_MS } from "@/config/cache";
import type { DataSourceConfig, SheetRef } from "@/config/data-sources";
import { getDataProvider } from "@/lib/data-provider-registry";
import { DataSourceError } from "@/lib/errors";
import type { DriveFileRef, SpreadsheetDataProvider } from "@/lib/data-provider";
import { SharedCache } from "@/lib/shared-cache";
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
//
// Backed by Upstash Redis when configured (see src/lib/shared-cache.ts) so
// every serverless instance shares one cache instead of each starting cold
// — a request landing on a freshly-spun-up instance no longer re-triggers
// a full Apps Script read if another instance already fetched the same
// sheet moments ago.
const rawCache = new SharedCache<Record<string, string>[]>("raw");

function cacheKey(provider: string, file: string, sheet: string): string {
  return `${provider}::${file}::${sheet}`;
}

// Stale-while-revalidate: a cache entry past DATA_CACHE_TTL_MS but still
// present (Redis's own 24h hard expiry hasn't hit) is served to the CURRENT
// request immediately instead of blocking on a live re-fetch — Apps
// Script's own latency is measured at 5-30s per call (see
// src/app/dashboard/data-sync/page.tsx), so waiting on it inline is exactly
// the "18-second cold load" problem this exists to fix. The refresh itself
// still happens, just after this response is already on its way to the
// browser (via Next's after()), so the NEXT request sees fresh data without
// any request ever having to pay that latency synchronously except the
// very first one for a given sheet (a true cache miss, nothing to serve
// yet, so that one has no choice but to block).
async function revalidateRecordsInBackground(
  source: DataSourceConfig,
  fileSource: DataSourceConfig["sources"][number],
  file: DriveFileRef,
  staleSheets: SheetRef[],
  provider: SpreadsheetDataProvider,
) {
  try {
    if (staleSheets.length > 1 && provider.readSheetsBatch) {
      const batch = await provider.readSheetsBatch(file, staleSheets);
      for (const sheetRef of staleSheets) {
        const outcome = batch.get(sheetRef.name);
        if (outcome?.ok) {
          await rawCache.set(cacheKey(provider.name, fileSource.file, sheetRef.name), outcome.value);
          recordSyncSuccess({ module: source.label, file: fileSource.file, sheet: sheetRef.name, provider: provider.name, rows: outcome.value.length });
        }
        // A failed background revalidation leaves the still-usable stale entry in
        // place untouched — the next request just tries again later, no need to
        // record an error here (the foreground path already did when this same
        // sheet was last read live).
      }
    } else {
      await Promise.all(
        staleSheets.map(async (sheetRef) => {
          try {
            const records = await provider.readSheet(file, sheetRef);
            await rawCache.set(cacheKey(provider.name, fileSource.file, sheetRef.name), records);
            recordSyncSuccess({ module: source.label, file: fileSource.file, sheet: sheetRef.name, provider: provider.name, rows: records.length });
          } catch {
            // Best-effort — keep serving the stale value already cached.
          }
        }),
      );
    }
  } catch {
    // Batch call itself failed — keep serving the stale values already cached.
  }
}

async function revalidateRawInBackground(
  source: DataSourceConfig,
  fileSource: DataSourceConfig["sources"][number],
  file: DriveFileRef,
  staleSheets: SheetRef[],
  provider: SpreadsheetDataProvider,
) {
  try {
    if (staleSheets.length > 1 && provider.readSheetsRawBatch) {
      const batch = await provider.readSheetsRawBatch(file, staleSheets);
      for (const sheetRef of staleSheets) {
        const outcome = batch.get(sheetRef.name);
        if (outcome?.ok) {
          await rawRowsCache.set(cacheKey(provider.name, fileSource.file, sheetRef.name), outcome.value);
          recordSyncSuccess({ module: source.label, file: fileSource.file, sheet: sheetRef.name, provider: provider.name, rows: outcome.value.length });
        }
      }
    } else {
      await Promise.all(
        staleSheets.map(async (sheetRef) => {
          try {
            const rows = await provider.readSheetRaw(file, sheetRef);
            await rawRowsCache.set(cacheKey(provider.name, fileSource.file, sheetRef.name), rows);
            recordSyncSuccess({ module: source.label, file: fileSource.file, sheet: sheetRef.name, provider: provider.name, rows: rows.length });
          } catch {
            // Best-effort — keep serving the stale value already cached.
          }
        }),
      );
    }
  } catch {
    // Batch call itself failed — keep serving the stale values already cached.
  }
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
  const provider = await getDataProvider();

  // Every (file, sheet) pair is an independent network call to the same
  // gateway. Reading them one at a time via a sequential for-await loop was
  // the dashboard's original biggest source of slow page loads on a cache
  // miss; running them "in parallel" via Promise.all helped but direct
  // measurement showed each apps-script call still pays a fixed ~1.6-1.8s
  // dispatch/network cost regardless of payload, and the gateway's own
  // concurrency appears to serialize simultaneous calls to the same
  // deployment anyway (6 sheets "in parallel" still took ~11s). The real
  // win is provider.readSheetsBatch — one Apps Script execution reading
  // every cache-miss sheet from the same already-open file (measured: the
  // same 6 sheets in one batch call took ~7s instead of ~22s sequential).
  // A provider without that capability (e.g. google-api) falls back to the
  // per-sheet Promise.all path exactly as before.
  const perFileSource = await Promise.all(
    source.sources.map(async (fileSource): Promise<SheetReadResult[]> => {
      if (fileSource.enabled === false) return []; // not a failure — deliberately not ready yet

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
        return [];
      }

      const hits: SheetReadResult[] = [];
      const misses: (typeof fileSource.sheets)[number][] = [];
      const staleToRevalidate: (typeof fileSource.sheets)[number][] = [];
      await Promise.all(
        fileSource.sheets.map(async (sheetRef) => {
          const key = cacheKey(provider.name, fileSource.file, sheetRef.name);
          const cached = await rawCache.get(key);
          if (!cached) {
            misses.push(sheetRef); // nothing to serve yet — has to block
            return;
          }
          // Stale-while-revalidate: an entry past its freshness window is
          // still served right away (Apps Script's own 5-30s latency makes
          // blocking on a live re-fetch here the exact slowness this is
          // meant to avoid) — a background refresh is scheduled below so the
          // *next* request gets fresh data instead.
          hits.push({ file: fileSource.file, sheet: sheetRef.name, purpose: sheetRef.purpose, records: cached.value });
          if (Date.now() - cached.fetchedAt >= DATA_CACHE_TTL_MS) staleToRevalidate.push(sheetRef);
        }),
      );
      if (staleToRevalidate.length > 0) {
        after(() => revalidateRecordsInBackground(source, fileSource, file, staleToRevalidate, provider));
      }
      if (misses.length === 0) return hits;

      let fetched: SheetReadResult[];
      if (misses.length > 1 && provider.readSheetsBatch) {
        const batch = await provider.readSheetsBatch(file, misses);
        fetched = (
          await Promise.all(
            misses.map(async (sheetRef): Promise<SheetReadResult[]> => {
              const key = cacheKey(provider.name, fileSource.file, sheetRef.name);
              const outcome = batch.get(sheetRef.name);
              if (outcome?.ok) {
                await rawCache.set(key, outcome.value);
                recordSyncSuccess({
                  module: source.label,
                  file: fileSource.file,
                  sheet: sheetRef.name,
                  provider: provider.name,
                  rows: outcome.value.length,
                });
                return [{ file: fileSource.file, sheet: sheetRef.name, purpose: sheetRef.purpose, records: outcome.value }];
              }
              recordSyncError({
                module: source.label,
                file: fileSource.file,
                sheet: sheetRef.name,
                provider: provider.name,
                error: outcome?.message ?? "Sheet tidak ada pada hasil batch.",
              });
              const stale = await rawCache.get(key);
              return stale ? [{ file: fileSource.file, sheet: sheetRef.name, purpose: sheetRef.purpose, records: stale.value }] : [];
            }),
          )
        ).flat();
      } else {
        const perSheet = await Promise.all(
          misses.map(async (sheetRef): Promise<SheetReadResult | null> => {
            const key = cacheKey(provider.name, fileSource.file, sheetRef.name);
            try {
              const records = await provider.readSheet(file, sheetRef);
              await rawCache.set(key, records);
              recordSyncSuccess({
                module: source.label,
                file: fileSource.file,
                sheet: sheetRef.name,
                provider: provider.name,
                rows: records.length,
              });
              return { file: fileSource.file, sheet: sheetRef.name, purpose: sheetRef.purpose, records };
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
              const stale = await rawCache.get(key);
              return stale ? { file: fileSource.file, sheet: sheetRef.name, purpose: sheetRef.purpose, records: stale.value } : null;
            }
          }),
        );
        fetched = perSheet.filter((r): r is SheetReadResult => r !== null);
      }

      return [...hits, ...fetched];
    }),
  );

  return perFileSource.flat();
}

export interface RawSheetReadResult {
  file: string;
  sheet: string;
  purpose?: string;
  rows: unknown[][];
}

// Separate from rawCache above — same (provider, file, sheet) key space would
// otherwise let a raw-grid read and a header-keyed read silently overwrite
// each other's cache entry despite returning differently-shaped data. Same
// Redis-backed two-tier cache as rawCache (see src/lib/shared-cache.ts).
const rawRowsCache = new SharedCache<unknown[][]>("raw-rows");

/**
 * Raw-grid counterpart of readConfiguredSource() — for a report-layout sheet
 * where a single header row can't uniquely name every column (see
 * SpreadsheetDataProvider.readSheetRaw), so the header-keyed path would
 * silently drop data. Same file discovery / cache / sync-status behavior,
 * just returning the untouched grid instead of Record<string,string>[].
 */
export async function readConfiguredSourceRaw(source: DataSourceConfig): Promise<RawSheetReadResult[]> {
  const provider = await getDataProvider();

  // Same reasoning as readConfiguredSource above: prefer one batched Apps
  // Script execution (provider.readSheetsRawBatch) over one HTTP round trip
  // per sheet whenever there's more than one cache-miss sheet to fetch —
  // measured to cut a real 6-sheet, ~22s-sequential read down to ~7s. A
  // provider without that capability falls back to the per-sheet
  // Promise.all path exactly as before.
  const perFileSource = await Promise.all(
    source.sources.map(async (fileSource): Promise<RawSheetReadResult[]> => {
      if (fileSource.enabled === false) return [];

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
        return [];
      }

      const hits: RawSheetReadResult[] = [];
      const misses: (typeof fileSource.sheets)[number][] = [];
      const staleToRevalidate: (typeof fileSource.sheets)[number][] = [];
      await Promise.all(
        fileSource.sheets.map(async (sheetRef) => {
          const key = cacheKey(provider.name, fileSource.file, sheetRef.name);
          const cached = await rawRowsCache.get(key);
          if (!cached) {
            misses.push(sheetRef); // nothing to serve yet — has to block
            return;
          }
          // Stale-while-revalidate — see the same comment in readConfiguredSource above.
          hits.push({ file: fileSource.file, sheet: sheetRef.name, purpose: sheetRef.purpose, rows: cached.value });
          if (Date.now() - cached.fetchedAt >= DATA_CACHE_TTL_MS) staleToRevalidate.push(sheetRef);
        }),
      );
      if (staleToRevalidate.length > 0) {
        after(() => revalidateRawInBackground(source, fileSource, file, staleToRevalidate, provider));
      }
      if (misses.length === 0) return hits;

      let fetched: RawSheetReadResult[];
      if (misses.length > 1 && provider.readSheetsRawBatch) {
        const batch = await provider.readSheetsRawBatch(file, misses);
        fetched = (
          await Promise.all(
            misses.map(async (sheetRef): Promise<RawSheetReadResult[]> => {
              const key = cacheKey(provider.name, fileSource.file, sheetRef.name);
              const outcome = batch.get(sheetRef.name);
              if (outcome?.ok) {
                await rawRowsCache.set(key, outcome.value);
                recordSyncSuccess({
                  module: source.label,
                  file: fileSource.file,
                  sheet: sheetRef.name,
                  provider: provider.name,
                  rows: outcome.value.length,
                });
                return [{ file: fileSource.file, sheet: sheetRef.name, purpose: sheetRef.purpose, rows: outcome.value }];
              }
              recordSyncError({
                module: source.label,
                file: fileSource.file,
                sheet: sheetRef.name,
                provider: provider.name,
                error: outcome?.message ?? "Sheet tidak ada pada hasil batch.",
              });
              const stale = await rawRowsCache.get(key);
              return stale ? [{ file: fileSource.file, sheet: sheetRef.name, purpose: sheetRef.purpose, rows: stale.value }] : [];
            }),
          )
        ).flat();
      } else {
        const perSheet = await Promise.all(
          misses.map(async (sheetRef): Promise<RawSheetReadResult | null> => {
            const key = cacheKey(provider.name, fileSource.file, sheetRef.name);
            try {
              const rows = await provider.readSheetRaw(file, sheetRef);
              await rawRowsCache.set(key, rows);
              recordSyncSuccess({
                module: source.label,
                file: fileSource.file,
                sheet: sheetRef.name,
                provider: provider.name,
                rows: rows.length,
              });
              return { file: fileSource.file, sheet: sheetRef.name, purpose: sheetRef.purpose, rows };
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
              const stale = await rawRowsCache.get(key);
              return stale ? { file: fileSource.file, sheet: sheetRef.name, purpose: sheetRef.purpose, rows: stale.value } : null;
            }
          }),
        );
        fetched = perSheet.filter((r): r is RawSheetReadResult => r !== null);
      }

      return [...hits, ...fetched];
    }),
  );

  return perFileSource.flat();
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
