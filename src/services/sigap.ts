import "server-only";

import { DATA_CACHE_TTL_MS } from "@/config/cache";
import { SharedCache } from "@/lib/shared-cache";

// SIGAP (UIP3B Kalimantan's own tower alert/monitoring tool, api-docs at
// https://sigap.uip3bkal.com/api-docs) — NOT a source this app's own
// data-sources.ts/data-connector.ts pipeline can read (that pipeline is
// Drive-spreadsheet-specific), so this is a small, self-contained, best-
// effort HTTP client instead. Only the public, unauthenticated GET
// /api/chart-analysis endpoint is used — confirmed live it needs no token.
// SIGAP also exposes a POST /api/sigap-service (and
// /api/:relay/:tower/sigap-service) that actually SENDS a WhatsApp alert to
// an operational group; that one requires an x-sigap-token this app does
// not have and is never called from here — this file is read-only.
const CHART_ANALYSIS_URL = "https://sigap.uip3bkal.com/api/chart-analysis";

interface SigapTowerMetadata {
  funcLoc?: string;
  bayLine?: string;
}

interface SigapChartAnalysisResponse {
  success?: boolean;
  analysis?: {
    charts?: { chartJs?: { towerMetadata?: SigapTowerMetadata[] } }[];
  };
}

// funcLoc -> bayLine. Confirmed live that SIGAP's own "funcLoc" field uses
// the SAME functional-location code format as DATA SUTT UPT PKY's own
// ID_FUNCTLOC column ("TRS-####-###.###-T####" on both sides) — a
// reliable join key between the two, even though the two systems don't
// otherwise share an identifier (SIGAP's "bayLine" shorthand, e.g.
// "PKY-KSG", doesn't always match the SUTT sheet's own NAMA_SECTION text,
// e.g. the SUTT sheet's "KASONGAN - SUDAN" is SIGAP's "KSG-SPT").
const cache = new SharedCache<Record<string, string>>("sigap-funcloc-baylines");
const CACHE_KEY = "map";

/** Best-effort: SIGAP being slow, down, or changing shape must never break
 *  the fault locator itself — any failure here just means no SIGAP bayLine
 *  code is shown, nothing else degrades. Falls back to the last known-good
 *  cached map (even past its freshness window) over returning nothing, the
 *  same stale-while-revalidate spirit as src/lib/data-connector.ts. */
export async function getSigapBayLineByFuncLoc(): Promise<Record<string, string>> {
  const cached = await cache.get(CACHE_KEY);
  if (cached && Date.now() - cached.fetchedAt < DATA_CACHE_TTL_MS) return cached.value;

  try {
    const res = await fetch(CHART_ANALYSIS_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return cached?.value ?? {};
    const data = (await res.json()) as SigapChartAnalysisResponse;
    const map: Record<string, string> = {};
    for (const chart of data.analysis?.charts ?? []) {
      for (const t of chart.chartJs?.towerMetadata ?? []) {
        if (t.funcLoc && t.bayLine) map[t.funcLoc] = t.bayLine;
      }
    }
    if (Object.keys(map).length === 0) return cached?.value ?? {};
    await cache.set(CACHE_KEY, map);
    return map;
  } catch {
    return cached?.value ?? {};
  }
}
