import "server-only";

import type { SpreadsheetDataProvider } from "@/lib/data-provider";

// Dynamic import (not a static one) is deliberate, not just style: statically
// importing googleApiProvider pulled in the whole `googleapis` package (a
// ~200MB dependency, since it bundles every Google API's client, not just
// Drive/Sheets) into every build regardless of which provider actually runs.
// Vercel's generous function-size limit hid this; Cloudflare Workers' 64MB
// hard cap did not — a build came back at ~90MB uncompressed until this
// changed to a dynamic import, which dropped it to ~8MB (confirmed by
// measuring .open-next/server-functions/default/handler.mjs before/after).
// This provider is legacy anyway ("Phase 2.1", superseded by apps-script —
// see the comment below) — nobody pays its weight unless DATA_PROVIDER is
// actually set to something other than "apps-script".
export async function getDataProvider(): Promise<SpreadsheetDataProvider> {
  if (process.env.DATA_PROVIDER === "apps-script") {
    const { appsScriptProvider } = await import("@/lib/providers/apps-script-provider");
    return appsScriptProvider;
  }
  // Backward-compatible default: an existing Phase 2.1 deployment (service
  // account already configured) keeps working unchanged until DATA_PROVIDER
  // is explicitly set to "apps-script" — see AGENTS.md section 17 (migration
  // strategy). Switch the default here only once Apps Script is validated.
  const { googleApiProvider } = await import("@/lib/providers/google-api-provider");
  return googleApiProvider;
}
