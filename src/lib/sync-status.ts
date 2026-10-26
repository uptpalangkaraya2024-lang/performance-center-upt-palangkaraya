import "server-only";

// In-memory sync status registry, keyed per (module, file, sheet) — a
// module spanning several files/sheets (see FileSource in data-sources.ts)
// gets one row per sheet, matching how the Data & Sync page presents it.
// Resets on server restart and isn't shared across serverless instances;
// good enough while there's no database — see AGENTS.md section 16/31.
export interface SyncStatusEntry {
  key: string;
  module: string;
  file: string;
  sheet: string;
  provider: string;
  lastSync: Date | null;
  rows: number;
  status: "healthy" | "error";
  error: string | null;
}

const registry = new Map<string, SyncStatusEntry>();

function keyFor(module: string, file: string, sheet: string): string {
  return `${module}::${file}::${sheet}`;
}

// Bounded rolling log per (module, file, sheet) — same in-memory, resets-on-
// restart nature as `registry` above, just keeping the last N events instead
// of only the latest. Lets Data & Sync show "kapan gagal, kapan pulih" for
// this server's uptime without a database.
export interface SyncHistoryEvent {
  timestamp: Date;
  status: "healthy" | "error";
  rows: number | null;
  error: string | null;
}
const MAX_HISTORY_PER_KEY = 20;
const history = new Map<string, SyncHistoryEvent[]>();

function pushHistory(key: string, event: SyncHistoryEvent) {
  const list = history.get(key) ?? [];
  list.push(event);
  if (list.length > MAX_HISTORY_PER_KEY) list.shift();
  history.set(key, list);
}

export function recordSyncSuccess(params: {
  module: string;
  file: string;
  sheet: string;
  provider: string;
  rows: number;
}) {
  const key = keyFor(params.module, params.file, params.sheet);
  const timestamp = new Date();
  registry.set(key, {
    key,
    module: params.module,
    file: params.file,
    sheet: params.sheet,
    provider: params.provider,
    lastSync: timestamp,
    rows: params.rows,
    status: "healthy",
    error: null,
  });
  pushHistory(key, { timestamp, status: "healthy", rows: params.rows, error: null });
}

export function recordSyncError(params: {
  module: string;
  file: string;
  sheet: string;
  provider: string;
  error: string;
}) {
  const key = keyFor(params.module, params.file, params.sheet);
  const existing = registry.get(key);
  const timestamp = new Date();
  registry.set(key, {
    key,
    module: params.module,
    file: params.file,
    sheet: params.sheet,
    provider: params.provider,
    lastSync: existing?.lastSync ?? null,
    rows: existing?.rows ?? 0,
    status: "error",
    error: params.error,
  });
  pushHistory(key, { timestamp, status: "error", rows: null, error: params.error });
}

export function listSyncStatus(): SyncStatusEntry[] {
  return [...registry.values()];
}

/** "Data per 12 Okt 2026, 14.30 WIB" for one module's most recent sync
 *  across however many files/sheets it reads — the LATEST of them, since
 *  a page showing combined data is only as current as its stalest input.
 *  Null when nothing has synced yet this server run (never fabricated as
 *  "just now"). Every module-page caption that says "data per [tanggal
 *  sinkron]" should go through this one function so the wording and
 *  freshness-source stay consistent. */
export function formatDataAsOf(module: string): string | null {
  const entries = listSyncStatus().filter((e) => e.module === module && e.lastSync !== null);
  if (entries.length === 0) return null;
  const latest = entries.reduce((a, b) => (a.lastSync! > b.lastSync! ? a : b));
  return formatSyncDate(latest.lastSync!);
}

/** Same idea as formatDataAsOf, but across SEVERAL modules at once (for a
 *  page like Kesehatan Data that reads 9 different modules) — takes the
 *  OLDEST sync among them, not the newest, since a combined view is only
 *  as current as its stalest input. */
export function formatDataAsOfOldest(modules: string[]): string | null {
  const entries = listSyncStatus().filter((e) => modules.includes(e.module) && e.lastSync !== null);
  if (entries.length === 0) return null;
  const oldest = entries.reduce((a, b) => (a.lastSync! < b.lastSync! ? a : b));
  return formatSyncDate(oldest.lastSync!);
}

function formatSyncDate(date: Date): string {
  const d = date.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  const t = date.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  return `Data per ${d}, ${t} WIB`;
}

/** Most-recent-first history for one entry's key — see SyncStatusEntry.key. */
export function listSyncHistory(key: string): SyncHistoryEvent[] {
  return [...(history.get(key) ?? [])].reverse();
}
