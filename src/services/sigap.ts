import "server-only";

import { DATA_CACHE_TTL_MS } from "@/config/cache";
import { SharedCache } from "@/lib/shared-cache";

// SIGAP (UIP3B Kalimantan's own tower alert/monitoring tool, api-docs at
// https://sigap.uip3bkal.com/api-docs) — NOT a source this app's own
// data-sources.ts/data-connector.ts pipeline can read (that pipeline is
// Drive-spreadsheet-specific), so this is a small, self-contained, best-
// effort HTTP client instead. Only the public, unauthenticated GET
// /api/chart-analysis endpoint is used (confirmed live — its own docs say
// "Tidak mengirim WhatsApp dan tidak membutuhkan token service").
//
// SIGAP also exposes a POST /api/sigap-service (and
// /api/:relay/:tower/sigap-service) which actually SENDS a WhatsApp alert
// to an operational group, gated by an x-sigap-token — the user explicitly
// shared that token but also explicitly said to stay out of "hal lain"
// (other matters) and only pull tower data. That endpoint is never called
// from this app, the token is not stored anywhere in this codebase, and it
// isn't needed anyway: chart-analysis already returns everything below
// without any authentication.
const CHART_ANALYSIS_URL = "https://sigap.uip3bkal.com/api/chart-analysis";

interface SigapTowerMetadataRaw {
  funcLoc?: string;
  bayLine?: string;
}

interface SigapDatasetRaw {
  label?: string;
  type?: string;
  data?: (number | null)[];
}

interface SigapChartAnalysisResponse {
  success?: boolean;
  analysis?: {
    charts?: {
      chartJs?: {
        labels?: string[];
        datasets?: SigapDatasetRaw[];
        towerMetadata?: SigapTowerMetadataRaw[];
      };
    }[];
  };
}

export interface SigapYearValue {
  year: string;
  value: number;
}

/** Everything SIGAP's own "chart-analysis" tracks for one tower (one array
 *  index, confirmed live to be shared across labels/towerMetadata/every
 *  dataset — all 3486 entries long, perfectly index-aligned). Years are
 *  read off the dataset's own label text (e.g. "Sambaran 2026") rather
 *  than hardcoded, so a new year SIGAP adds later shows up automatically.
 *  Zero/null years are left out of the by-year arrays — a tower with no
 *  recorded strikes a given year just has no entry for it, never a
 *  fabricated 0. */
export interface SigapTowerInsight {
  bayLine: string;
  tinggiTowerM: number | null;
  elevasiM: number | null;
  arusTertinggiKa: number | null;
  sambaranPerTahun: SigapYearValue[]; // "Sambaran <year>" (bar) — lightning strike count
  gangguanPerTahun: SigapYearValue[]; // "Gangguan <year>" (line) — recorded disturbance count/flag
}

const cache = new SharedCache<Record<string, SigapTowerInsight>>("sigap-tower-insights");
const CACHE_KEY = "map";

function yearFromLabel(prefix: string, label: string | undefined): string | null {
  if (!label) return null;
  const m = new RegExp(`^${prefix}\\s+(\\d{4})$`).exec(label.trim());
  return m ? m[1] : null;
}

function singleValueDataset(datasets: SigapDatasetRaw[], ...labels: string[]): (number | null)[] | null {
  for (const label of labels) {
    const ds = datasets.find((d) => d.label === label);
    if (ds?.data) return ds.data;
  }
  return null;
}

function buildInsights(data: SigapChartAnalysisResponse): Record<string, SigapTowerInsight> {
  const chart = (data.analysis?.charts ?? [])[0];
  const towerMetadata = chart?.chartJs?.towerMetadata ?? [];
  const datasets = chart?.chartJs?.datasets ?? [];
  if (towerMetadata.length === 0 || datasets.length === 0) return {};

  const tinggi = singleValueDataset(datasets, "Tinggi Tower", "Tinggi");
  const elevasi = singleValueDataset(datasets, "Elevasi");
  const arusTertinggi = singleValueDataset(datasets, "Arus Tertinggi");
  const sambaranDatasets = datasets
    .map((d) => ({ year: yearFromLabel("Sambaran", d.label), data: d.data }))
    .filter((d): d is { year: string; data: (number | null)[] } => d.year !== null && !!d.data);
  const gangguanDatasets = datasets
    .map((d) => ({ year: yearFromLabel("Gangguan", d.label), data: d.data }))
    .filter((d): d is { year: string; data: (number | null)[] } => d.year !== null && !!d.data);

  const result: Record<string, SigapTowerInsight> = {};
  towerMetadata.forEach((t, i) => {
    if (!t.funcLoc) return;
    const sambaranPerTahun: SigapYearValue[] = [];
    for (const { year, data } of sambaranDatasets) {
      const v = data[i];
      if (typeof v === "number") sambaranPerTahun.push({ year, value: v });
    }
    const gangguanPerTahun: SigapYearValue[] = [];
    for (const { year, data } of gangguanDatasets) {
      const v = data[i];
      if (typeof v === "number") gangguanPerTahun.push({ year, value: v });
    }
    result[t.funcLoc] = {
      bayLine: t.bayLine ?? "",
      tinggiTowerM: typeof tinggi?.[i] === "number" ? tinggi[i] : null,
      elevasiM: typeof elevasi?.[i] === "number" ? elevasi[i] : null,
      arusTertinggiKa: typeof arusTertinggi?.[i] === "number" ? arusTertinggi[i] : null,
      sambaranPerTahun: sambaranPerTahun.sort((a, b) => a.year.localeCompare(b.year)),
      gangguanPerTahun: gangguanPerTahun.sort((a, b) => a.year.localeCompare(b.year)),
    };
  });
  return result;
}

/** Best-effort: SIGAP being slow, down, or changing shape must never break
 *  the fault locator itself — any failure here just means no SIGAP data is
 *  shown, nothing else degrades. Falls back to the last known-good cached
 *  map (even past its freshness window) over returning nothing, the same
 *  stale-while-revalidate spirit as src/lib/data-connector.ts. */
export async function getSigapTowerInsights(): Promise<Record<string, SigapTowerInsight>> {
  const cached = await cache.get(CACHE_KEY);
  if (cached && Date.now() - cached.fetchedAt < DATA_CACHE_TTL_MS) return cached.value;

  try {
    const res = await fetch(CHART_ANALYSIS_URL, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return cached?.value ?? {};
    const data = (await res.json()) as SigapChartAnalysisResponse;
    const map = buildInsights(data);
    if (Object.keys(map).length === 0) return cached?.value ?? {};
    await cache.set(CACHE_KEY, map);
    return map;
  } catch {
    return cached?.value ?? {};
  }
}
