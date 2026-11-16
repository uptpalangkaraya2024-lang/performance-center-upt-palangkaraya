import "server-only";

import { dataSources } from "@/config/data-sources";
import { readConfiguredSource } from "@/lib/data-connector";
import { classifyJob, type FollowUpItem, type FollowUpJob } from "@/lib/follow-up-aging";
import { extractCircuitSuffix, lineGiPairKey } from "@/lib/gi-name";
import { labelCause } from "@/services/disturbances";

// Reads the same REKAP GANGGUAN sheet as the rest of the Gangguan page
// (readConfiguredSource caches per sheet, so no new network call).
const SOURCE = dataSources.disturbances;
const EXPECTED_FILE = SOURCE.sources[0].file;
const EXPECTED_SHEET = SOURCE.sources[0].sheets[0].name;

const text = (v: string | undefined) => (v ?? "").trim();

function isoDate(raw: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(raw.trim());
  return m ? m[1] : null;
}

function progress(raw: string): number | null {
  const n = Number(raw.replace(",", "."));
  return raw !== "" && Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : null;
}

function daysBetween(fromISO: string, toISO: string): number {
  return Math.max(0, Math.round((Date.parse(toISO) - Date.parse(fromISO)) / 86_400_000));
}

/** Each planned job's own text + tick box. Primary and secondary columns
 *  are spelled differently in the sheet ("STATUS TINDAK LANJUT n PRMRY" vs
 *  "STATUS TNDKLNJT n SCDRY"). A job is done only when its box is "true". */
function jobsOf(r: Record<string, string>): { done: number; total: number; pending: FollowUpJob[] } {
  let done = 0;
  let total = 0;
  const pending: FollowUpJob[] = [];
  for (let i = 1; i <= 5; i++) {
    const cols: [FollowUpJob["side"], string, string][] = [
      ["Primer", `TINDAK LANJUT ${i} PRMRY`, `STATUS TINDAK LANJUT ${i} PRMRY`],
      ["Sekunder", `TINDAK LANJUT ${i} SCDRY`, `STATUS TNDKLNJT ${i} SCDRY`],
    ];
    for (const [side, jobCol, statusCol] of cols) {
      const job = text(r[jobCol]);
      if (!job) continue;
      total++;
      if (text(r[statusCol]).toLowerCase() === "true") done++;
      else pending.push({ side, text: job, type: classifyJob(job, side) });
    }
  }
  return { done, total, pending };
}

export interface FollowUpAgingResult {
  items: FollowUpItem[];
  /** OPEN rows before merging both-end reports — matches the page's "TL Open" tally. */
  openRows: number;
  todayISO: string;
  error: string | null;
}

export async function getFollowUpAging(): Promise<FollowUpAgingResult> {
  const todayISO = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const results = await readConfiguredSource(SOURCE);
  const sheet = results.find((r) => r.file === EXPECTED_FILE && r.sheet === EXPECTED_SHEET);
  if (!sheet) return { items: [], openRows: 0, todayISO, error: `Gagal membaca sheet "${EXPECTED_SHEET}".` };

  // Same scope as the page's own follow-up tally: MASUK KINERJA rows only.
  // A line trip is often filed by both end GIs with identical jobs; those
  // share date, GI pair, circuit and trip time and are merged into one.
  const byIncident = new Map<string, FollowUpItem>();
  let openRows = 0;
  for (const r of sheet.records) {
    if (text(r["JUSTIFIKASI KINERJA"]) !== "MASUK KINERJA") continue;
    if (text(r["STATUS TINDAK LANJUT GGN"]).toUpperCase() !== "OPEN") continue;
    const dateISO = isoDate(text(r["TGL"]));
    const bay = text(r["NAMA BAY GANGGUAN"]);
    if (!dateISO || !bay) continue;
    openRows++;

    const kodeBay = text(r["KODE BAY"]);
    const isLine = kodeBay.startsWith("T/L");
    const pair = isLine ? (lineGiPairKey(bay) ?? bay.toUpperCase()) : `${text(r["GARDU INDUK"])}|${bay}`;
    const circuit = isLine ? (extractCircuitSuffix(bay) ?? "") : "";
    const key = `${dateISO}|${pair}|${circuit}|${text(r["WAKTU TRIP"]).slice(-8, -3)}`;

    const jobs = jobsOf(r);
    const pptRaw = text(r["PPT LINK CLICKABLE"]);
    const item: FollowUpItem = {
      id: /^#\d+/.exec(text(r["ID GANGGUAN"]))?.[0] ?? "",
      dateISO,
      ageDays: daysBetween(dateISO, todayISO),
      ultg: text(r["ULTG"]).replace(/^ULTG\s+/i, ""),
      gi: text(r["GARDU INDUK"]).replace(/^GIS?\s*\d+\s*KV\s*/i, ""),
      bay: text(r["NAMA SIRKIT"]) && isLine ? `${text(r["NAMA SIRKIT"])}${circuit ? ` ${circuit}` : ""}` : bay,
      category: isLine ? "Transmisi" : "Trafo",
      cause: labelCause(text(r["PENYEBAB"]) || "LAINNYA"),
      progressPrimary: progress(text(r["PROGRESS TINDAKLANJUT PRMRY"])),
      progressSecondary: progress(text(r["PROGRESS TINDAKLANJUT SCDRY"])),
      jobsDone: jobs.done,
      jobsTotal: jobs.total,
      pending: jobs.pending,
      plannedISO: isoDate(text(r["TANGGAL RENCANA TINDAK LANJUT"])),
      reports: 1,
      pptUrl: /^https:\/\/(docs|drive)\.google\.com\//.test(pptRaw) ? pptRaw : null,
    };

    const prev = byIncident.get(key);
    if (!prev) {
      byIncident.set(key, item);
      continue;
    }
    // Keep whichever report is further along; the other end's copy usually
    // just lags behind on ticking the same jobs.
    const keep = item.jobsDone > prev.jobsDone ? item : prev;
    byIncident.set(key, { ...keep, reports: prev.reports + 1, plannedISO: keep.plannedISO ?? prev.plannedISO ?? item.plannedISO });
  }

  const items = [...byIncident.values()].sort((a, b) => b.ageDays - a.ageDays);
  return { items, openRows, todayISO, error: null };
}
