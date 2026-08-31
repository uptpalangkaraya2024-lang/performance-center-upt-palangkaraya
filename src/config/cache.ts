// Centralized, env-configurable cache durations. Every service shares these
// defaults unless it has a genuine reason to override — see AGENTS.md
// section 16 ("buat cache configurable").
function readMinutesEnv(envVar: string, defaultMinutes: number): number {
  const raw = process.env[envVar];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed * 60 * 1000 : defaultMinutes * 60 * 1000;
}

/** How long a data source's normalized rows stay cached before the next request re-reads Drive. */
export const DATA_CACHE_TTL_MS = readMinutesEnv("DATA_CACHE_TTL_MINUTES", 5);

/** How long the Drive folder's file listing (name -> fileId) stays cached. Longer than DATA_CACHE_TTL_MS
 *  because new files/renames happen far less often than a sheet's own row data changing. */
export const DRIVE_DISCOVERY_CACHE_TTL_MS = readMinutesEnv("DRIVE_DISCOVERY_CACHE_TTL_MINUTES", 30);
