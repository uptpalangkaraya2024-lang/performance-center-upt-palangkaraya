export type DataSourceErrorKind =
  | "FILE_NOT_FOUND"
  | "AMBIGUOUS_SOURCE"
  | "SHEET_NOT_FOUND"
  | "UNSUPPORTED_FORMAT"
  | "FETCH_FAILED"
  // Apps Script gateway-specific — distinct from the others because they're
  // the only kinds worth retrying (see isRetryable() in apps-script-provider.ts).
  | "TIMEOUT"
  | "UPSTREAM_ERROR"
  | "UNAUTHORIZED";

/**
 * A specific, machine-readable failure for one file+sheet in the data
 * connector pipeline (see src/lib/data-connector.ts). Distinct from a plain
 * Error so the Data & Sync page can show *why* a source is unhealthy
 * (missing file vs. renamed sheet vs. unsupported format) instead of just
 * "something went wrong".
 */
export class DataSourceError extends Error {
  readonly kind: DataSourceErrorKind;
  readonly file: string;
  readonly sheet?: string;

  constructor(kind: DataSourceErrorKind, file: string, sheet: string | undefined, message: string) {
    super(message);
    this.name = "DataSourceError";
    this.kind = kind;
    this.file = file;
    this.sheet = sheet;
  }
}
