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

export function recordSyncSuccess(params: {
  module: string;
  file: string;
  sheet: string;
  provider: string;
  rows: number;
}) {
  const key = keyFor(params.module, params.file, params.sheet);
  registry.set(key, {
    key,
    module: params.module,
    file: params.file,
    sheet: params.sheet,
    provider: params.provider,
    lastSync: new Date(),
    rows: params.rows,
    status: "healthy",
    error: null,
  });
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
}

export function listSyncStatus(): SyncStatusEntry[] {
  return [...registry.values()];
}
