import "server-only";

import { dataSources } from "@/config/data-sources";
import { readConfiguredSource } from "@/lib/data-connector";
import { requireText } from "@/lib/parse";
import { buildRenusReminders } from "@/lib/executive-insights";
import { isRenusCancelled, isRenusHighRisk } from "@/lib/renus-helpers";
import type { RenusData, RenusRow, RenusSummary, RenusWeekPeriod } from "@/types";

const SOURCE = dataSources.renus;
const EXPECTED_FILE = SOURCE.sources[0].file;
const EXPECTED_SHEET = SOURCE.sources[0].sheets[0].name;

const MONTH_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

// The sheet's real header text is long and embeds literal newlines/extra
// spaces (e.g. "ULTG\n(1)", "REALISASI  PENORMALAN (JAM)\nHH:MM:SS") — every
// header is still unique, so header-keyed access works (unlike AHI's
// repeated-label report layout), but hardcoding the exact whitespace would
// be fragile. Resolving by a normalized (whitespace-collapsed, upper-cased)
// match against the row's own actual keys avoids that fragility entirely.
function normalizeHeader(h: string): string {
  return h.replace(/\s+/g, " ").trim().toUpperCase();
}

function buildKeyMap(sampleRow: Record<string, string>): Map<string, string> {
  const map = new Map<string, string>();
  for (const key of Object.keys(sampleRow)) {
    map.set(normalizeHeader(key), key);
  }
  return map;
}

function resolveKey(keyMap: Map<string, string>, candidate: string): string | undefined {
  return keyMap.get(normalizeHeader(candidate));
}

function extractDateOnly(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
  return m ? m[1] : null;
}

// RENCANA PADAM (JAM) / REALISASI PENORMALAN (JAM) are Sheets TIME-only
// cells — the apps-script gateway serializes them with a placeholder date
// (Sheets' 1899-12-30 epoch), so only the trailing HH:mm:ss is meaningful.
function extractTimeOnly(raw: string | undefined): string | null {
  if (!raw) return null;
  const m = /(\d{2}:\d{2}:\d{2})$/.exec(raw);
  return m ? m[1] : null;
}

function emptyRenusData(error: string | null): RenusData {
  const todayISO = getJakartaTodayISO();
  return {
    today: todayISO,
    rows: [],
    years: [],
    months: [],
    ultgs: [],
    gis: [],
    bays: [],
    statuses: [],
    risks: [],
    summary: { total: 0, thisWeek: 0, highRisk: 0, upcoming: 0 },
    weekPeriod: getFridayThursdayPeriod(todayISO),
    nextMonth: { ...getNextMonthInfo(todayISO), rows: [] },
    reminders: [],
    error,
  };
}

function normalizeRow(row: Record<string, string>, keyMap: Map<string, string>, sourceRow: number): RenusRow | null {
  const get = (candidate: string): string | undefined => {
    const key = resolveKey(keyMap, candidate);
    return key ? row[key] : undefined;
  };

  // Validity signal confirmed against live data: every blank-TAHUN row is
  // either a broken formula result (RENCANA years of 9998/9999) or a fully
  // blank trailing padding row — never a real work item. TAHUN non-blank
  // cleanly separates 249 real rows from 56 garbage rows.
  const year = requireText(get("TAHUN"));
  if (!year) return null;

  const rencanaDate = extractDateOnly(get("RENCANA DD/MM/YYYY"));
  if (!rencanaDate) return null; // no usable planning date — can't be scheduled/monitored

  const monthRaw = requireText(get("MONTH"));
  const month = monthRaw ? monthRaw.replace(/^\d+\.\s*/, "") : MONTH_ID[Number(rencanaDate.slice(5, 7)) - 1];
  const ultg = requireText(get("ULTG (1)")) ?? "—";
  const gi = requireText(get("GARDU INDUK (2)")) ?? "—";
  const bay = requireText(get("BAY (3)")) ?? "—";
  const workDetail = requireText(get("DETAIL PEKERJAAN")) ?? "—";
  const workDetailAltRaw = requireText(get("DETAIL PEKERJAAN (PASTIKAN CAPSLOCK BIAR RAPI YAA)"));
  const workDetailAlt = workDetailAltRaw && workDetailAltRaw !== workDetail ? workDetailAltRaw : null;

  return {
    id: `renus-${sourceRow}`,
    year,
    month,
    rencanaDate,
    realisasiDate: extractDateOnly(get("REALISASI DD/MM/YYYY")),
    ultg,
    gi,
    bay,
    workDetail,
    workDetailAlt,
    pic: requireText(get("PIC")),
    status: requireText(get("STATUS")) ?? "",
    risk: requireText(get("RESIKO PEKERJAAN")) ?? "",
    kodeBay: requireText(get("KODE BAY")),
    section: requireText(get("SECTION TRANSMISI (BILA ADA PEKERJAAN DI TRANSMISI)")),
    spanTower: requireText(get("SPAN/TOWER")),
    docName: requireText(get("WP & JSA (LINK)")),
    docLink: requireText(get("WP")),
    padamStart: extractTimeOnly(get("RENCANA PADAM (JAM) HH:MM:SS")),
    padamEnd: extractTimeOnly(get("REALISASI PENORMALAN (JAM) HH:MM:SS")),
    sapWoStatus: requireText(get("STATUS WORK ORDER (SAP)")),
    sourceRow,
  };
}

// Asia/Jakarta wall-clock date — the sheet's own dates are naive local
// strings with no timezone info (this org operates in one timezone), so
// "today" only needs to match that same wall-clock day, not perform any
// UTC conversion.
export function getJakartaTodayISO(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function formatShortDate(iso: string): string {
  const [, month, day] = iso.split("-").map(Number) as [number, number, number];
  return `${day} ${MONTH_ID[month - 1].slice(0, 3)}`;
}

// The operational work week here is Friday -> Thursday, not the calendar
// Monday -> Sunday — see AGENTS.md / RENUS spec section 9.
export function getFridayThursdayPeriod(todayISO: string): RenusWeekPeriod {
  const today = new Date(`${todayISO}T00:00:00Z`);
  const dow = today.getUTCDay(); // 0=Sun .. 5=Fri .. 6=Sat
  const daysSinceFriday = (dow - 5 + 7) % 7;
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - daysSinceFriday);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const toISO = (d: Date) => d.toISOString().slice(0, 10);
  const startISO = toISO(start);
  const endISO = toISO(end);
  const year = endISO.slice(0, 4);
  return { start: startISO, end: endISO, label: `${formatShortDate(startISO)} – ${formatShortDate(endISO)} ${year}` };
}

export function getNextMonthInfo(todayISO: string): { year: string; monthIndex: number; monthLabel: string } {
  const [yearStr, monthStr] = todayISO.split("-");
  let year = Number(yearStr);
  let monthIndex = Number(monthStr) - 1 + 1; // 0-based current month, then +1
  if (monthIndex > 11) {
    monthIndex = 0;
    year += 1;
  }
  return { year: String(year), monthIndex, monthLabel: MONTH_ID[monthIndex] };
}

function computeSummary(rows: RenusRow[], todayISO: string, week: RenusWeekPeriod): RenusSummary {
  const isActive = (r: RenusRow) => !isRenusCancelled(r);
  return {
    total: rows.filter(isActive).length,
    thisWeek: rows.filter((r) => isActive(r) && r.rencanaDate >= week.start && r.rencanaDate <= week.end).length,
    highRisk: rows.filter((r) => isActive(r) && isRenusHighRisk(r)).length,
    upcoming: rows.filter((r) => isActive(r) && r.rencanaDate > todayISO).length,
  };
}

export async function getRenusData(): Promise<RenusData> {
  const results = await readConfiguredSource(SOURCE);
  const sheetResult = results.find((r) => r.file === EXPECTED_FILE && r.sheet === EXPECTED_SHEET);

  if (!sheetResult || sheetResult.records.length === 0) {
    return emptyRenusData(
      !sheetResult
        ? `Gagal membaca sheet "${EXPECTED_SHEET}" dari file "${EXPECTED_FILE}" — lihat halaman Data & Sync.`
        : null,
    );
  }

  const keyMap = buildKeyMap(sheetResult.records[0]);
  const rows = sheetResult.records
    .map((record, index) => normalizeRow(record, keyMap, index + 3)) // +3: 1-indexed sheet row, past the helper row (1) and header row (2)
    .filter((row): row is RenusRow => row !== null)
    .sort((a, b) => a.rencanaDate.localeCompare(b.rencanaDate));

  const todayISO = getJakartaTodayISO();
  const weekPeriod = getFridayThursdayPeriod(todayISO);
  const nextMonthInfo = getNextMonthInfo(todayISO);
  const nextMonthRows = rows.filter(
    (r) => r.year === nextMonthInfo.year && r.rencanaDate.slice(5, 7) === String(nextMonthInfo.monthIndex + 1).padStart(2, "0"),
  );

  const distinct = (values: (string | null)[]) =>
    [...new Set(values.filter((v): v is string => !!v))].sort();

  const data: RenusData = {
    today: todayISO,
    rows,
    years: distinct(rows.map((r) => r.year)),
    months: MONTH_ID.filter((m) => rows.some((r) => r.month === m)),
    ultgs: distinct(rows.map((r) => r.ultg)),
    gis: distinct(rows.map((r) => r.gi)),
    bays: distinct(rows.map((r) => r.bay)),
    statuses: distinct(rows.map((r) => r.status || null)),
    risks: distinct(rows.map((r) => r.risk || null)),
    summary: computeSummary(rows, todayISO, weekPeriod),
    weekPeriod,
    nextMonth: { ...nextMonthInfo, rows: nextMonthRows },
    reminders: [],
    error: null,
  };
  data.reminders = buildRenusReminders(data, todayISO);
  return data;
}
