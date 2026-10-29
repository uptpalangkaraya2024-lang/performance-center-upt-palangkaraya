import "server-only";

import { DATA_CACHE_TTL_MS } from "@/config/cache";
import { SharedCache } from "@/lib/shared-cache";

// ROW Watch (the UPT's own right-of-way/vegetation risk map, a Cloudflare
// Worker at row-watch.uptpky.workers.dev) — not a Drive-spreadsheet source
// this app's own data-sources.ts/data-connector.ts pipeline can read, so
// this is a small, self-contained, best-effort HTTP client, same shape as
// src/services/sigap.ts. Only the public, unauthenticated GET
// /api/row-palangkaraya endpoint is used (confirmed live via curl — no
// auth header needed, same origin the map page itself calls client-side).
// Per the user's own request: link the fault locator's matched tower
// straight to that tower's point on ROW Watch's own map, not just a
// generic homepage link (the existing precedent for SIGAP/Lightning
// Watch) — see src/lib/sutt-fault-locator.ts's buildRowWatchTowerIndex/
// buildRowWatchLink for how a tower gets matched to one of these spans.
const ROW_WATCH_API_URL = "https://row-watch.uptpky.workers.dev/api/row-palangkaraya";

interface RowWatchSpanRaw {
  no?: string;
  span?: string;
  ultg?: string;
  gi?: string;
  penghantar?: string;
}

interface RowWatchApiResponse {
  spans?: RowWatchSpanRaw[];
}

/** One row of ROW Watch's own per-span vegetation dataset — only the
 *  fields the fault locator's own tower-matching/deep-link needs, out of
 *  the ~25 columns ROW Watch actually tracks (survey condition, petugas,
 *  prioritas, vegetasi detail, ...), none of which this app shows. `no` +
 *  `span` together are ROW Watch's own marker key (confirmed live in its
 *  own app-map.js: `markerBySpan.set(p.no + '|' + p.span, marker)`, read
 *  back via `location.hash` as `#span=<encodeURIComponent(no + '|' + span)>`
 *  on page load) — this is the exact pair buildRowWatchLink needs to
 *  reconstruct that hash. `span` itself carries the same "SPAN SUTT 150
 *  KV <abbrevGI1> - <abbrevGI2> #NNN-#MMM" shape RENUS's own SPAN/TOWER
 *  column and CE's own span column use (same abbreviation convention,
 *  confirmed live: "BNTOK - MRTWH"), which is what makes it matchable
 *  against this app's own SUTT tower registry. */
export interface RowWatchSpan {
  no: string;
  span: string;
  gi: string;
}

/** Best-effort: ROW Watch being slow, down, or changing shape must never
 *  break the fault locator itself — any failure here just means no ROW
 *  Watch link is shown, nothing else degrades. Falls back to the last
 *  known-good cached list (even past its freshness window) over returning
 *  nothing, same stale-while-revalidate spirit as src/lib/data-connector.ts
 *  and src/services/sigap.ts. */
const cache = new SharedCache<RowWatchSpan[]>("row-watch-spans");
const CACHE_KEY = "palangkaraya";

export async function getRowWatchSpans(): Promise<RowWatchSpan[]> {
  const cached = await cache.get(CACHE_KEY);
  if (cached && Date.now() - cached.fetchedAt < DATA_CACHE_TTL_MS) return cached.value;

  try {
    const res = await fetch(ROW_WATCH_API_URL, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return cached?.value ?? [];
    const data = (await res.json()) as RowWatchApiResponse;
    const spans: RowWatchSpan[] = (data.spans ?? [])
      .filter((s): s is Required<Pick<RowWatchSpanRaw, "no" | "span" | "gi">> => Boolean(s.no && s.span && s.gi))
      .map((s) => ({ no: s.no, span: s.span, gi: s.gi }));
    if (spans.length === 0) return cached?.value ?? [];
    await cache.set(CACHE_KEY, spans);
    return spans;
  } catch {
    return cached?.value ?? [];
  }
}
