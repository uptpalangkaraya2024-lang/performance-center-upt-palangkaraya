// Centralized, env-configurable cache durations. Every service shares these
// defaults unless it has a genuine reason to override — see AGENTS.md
// section 16 ("buat cache configurable").
function readMinutesEnv(envVar: string, defaultMinutes: number): number {
  const raw = process.env[envVar];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed * 60 * 1000 : defaultMinutes * 60 * 1000;
}

/** How long a data source's normalized rows are considered FRESH — past this,
 *  src/lib/data-connector.ts still serves the cached value immediately
 *  (stale-while-revalidate) and refreshes it in the background rather than
 *  blocking the request, so this mainly controls how often that background
 *  refresh fires rather than how fast a page feels. Raised 5 -> 10 -> 20
 *  minutes: Apps Script's own latency (5-30s per call, see
 *  src/app/dashboard/data-sync/page.tsx) makes a short TTL mostly just extra
 *  background calls for data that doesn't change that often anyway, and
 *  stale-while-revalidate means a longer TTL costs nothing in perceived
 *  speed — it only means fewer background Apps Script calls as more modules
 *  (more distinct files/sheets) get added over time. */
export const DATA_CACHE_TTL_MS = readMinutesEnv("DATA_CACHE_TTL_MINUTES", 20);

/** How long the Drive folder's file listing (name -> fileId) stays cached —
 *  also stale-while-revalidate now (see src/lib/providers/apps-script-
 *  provider.ts), so, same reasoning as above, a longer window just means
 *  fewer background re-checks for something that's essentially permanent
 *  data (a file's id only changes on a deliberate rename/recreate). */
export const DRIVE_DISCOVERY_CACHE_TTL_MS = readMinutesEnv("DRIVE_DISCOVERY_CACHE_TTL_MINUTES", 60);
