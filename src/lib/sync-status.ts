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

/** Most-recent-first history for one entry's key — see SyncStatusEntry.key. */
export function listSyncHistory(key: string): SyncHistoryEvent[] {
  return [...(history.get(key) ?? [])].reverse();
}
