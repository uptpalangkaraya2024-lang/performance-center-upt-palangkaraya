import "server-only";

import type { SpreadsheetDataProvider } from "@/lib/data-provider";
import { appsScriptProvider } from "@/lib/providers/apps-script-provider";
import { googleApiProvider } from "@/lib/providers/google-api-provider";

// Backward-compatible default: an existing Phase 2.1 deployment (service
// account already configured) keeps working unchanged until DATA_PROVIDER
// is explicitly set to "apps-script" — see AGENTS.md section 17 (migration
// strategy). Switch the default here only once Apps Script is validated.
export function getDataProvider(): SpreadsheetDataProvider {
  return process.env.DATA_PROVIDER === "apps-script" ? appsScriptProvider : googleApiProvider;
}
