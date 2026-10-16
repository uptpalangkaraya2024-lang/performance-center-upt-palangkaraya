import "server-only";

import { dataSources } from "@/config/data-sources";
import { readConfiguredSource } from "@/lib/data-connector";
import type { SuttRuas, SuttSnapshot, SuttTower } from "@/types";

const SOURCE = dataSources.suttAsset;
const EXPECTED_FILE = SOURCE.sources[0].file;
const EXPECTED_SHEET = SOURCE.sources[0].sheets[0].name;

// Same prefix the Gangguan service strips off GARDU INDUK/GARDU_INDUK values
// everywhere else in this app ("GI 150 KV X" / "GIS 150 KV X" -> "X").
function normalizeGiName(raw: string): string {
  return raw.replace(/^GIS?\s*\d+\s*KV\s*/i, "").trim();
}

function num(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const text = raw.trim();
  if (text === "") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

// A handful of header names in this sheet carry an embedded newline (e.g.
// "PENANGANAN\nTOWER KRITIS") — rather than hardcoding the literal
// whitespace/newline, this finds the record key whose normalized form
// (collapse all whitespace, uppercase) matches, same defensive spirit as
// findCol()'s normalize() elsewhere in this app.
function pick(record: Record<string, string>, ...targets: string[]): string {
  const normTargets = targets.map((t) => t.replace(/\s+/g, " ").trim().toUpperCase());
  for (const key of Object.keys(record)) {
    const normKey = key.replace(/\s+/g, " ").trim().toUpperCase();
    if (normTargets.includes(normKey)) return record[key].trim();
  }
  return "";
}

/** "LAT,LONG" is the one reliable combined coordinate column — the sheet's
 *  own "LONGITUDE"-labeled column actually holds latitude (confirmed live:
 *  its values match the first half of "LAT,LONG", not the second), so it's
 *  never read directly; only this composite column is trusted. */
function parseLatLong(raw: string): { lat: number | null; lon: number | null } {
  const parts = raw.split(",").map((p) => Number(p.trim()));
  if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) {
    return { lat: null, lon: null };
  }
  return { lat: parts[0], lon: parts[1] };
}

/** Natural sort key for NO TOWER — confirmed live this column is never
 *  purely numeric: sub-towers suffixed with letters ("001A", "001B") and,
 *  on at least one ruas (PALANGKARAYA - KASONGAN), genuine decimals listed
 *  in descending row order (185.5, 185.4, ..., 185.1). Sorting by
 *  (numeric prefix, alpha suffix) gives the correct physical sequence
 *  regardless of raw row order or suffix style. */
function naturalTowerKey(raw: string): [number, string] {
  const s = raw.trim();
  const m = /^(\d+(?:\.\d+)?)(.*)$/.exec(s);
  if (!m) return [Number.POSITIVE_INFINITY, s];
  return [Number(m[1]), m[2]];
}

interface RawTower {
  record: Record<string, string>;
  towerNo: string;
  gi: string;
}

/** Groups by NAMA_SECTION (the ruas identity — see data-sources.ts's own
 *  comment on `suttAsset` for why not NO TOWER, GARDU_INDUK, or
 *  NAMA_SIRKIT), sorts each group into true physical tower sequence, then
 *  self-computes cumulative distance from SPAN (M) rather than trusting
 *  the sheet's own TOTAL SPAN (KM) — confirmed broken for at least one
 *  ruas (values in the thousands ending in a literal "#REF!"), and
 *  confirmed to reproduce the sheet's own good values exactly everywhere
 *  else it isn't broken. */
function buildRuasList(records: Record<string, string>[]): SuttRuas[] {
  const bySection = new Map<string, RawTower[]>();
  for (const record of records) {
    const section = record["NAMA_SECTION"]?.trim();
    if (!section) continue;
    const list = bySection.get(section) ?? [];
    list.push({
      record,
      towerNo: record["NO TOWER"]?.trim() ?? "",
      gi: record["GARDU_INDUK"]?.trim() ?? "",
    });
    bySection.set(section, list);
  }

  const ruasList: SuttRuas[] = [];
  for (const [section, raws] of bySection) {
    const sorted = [...raws].sort((a, b) => {
      const ka = naturalTowerKey(a.towerNo);
      const kb = naturalTowerKey(b.towerNo);
      if (ka[0] !== kb[0]) return ka[0] - kb[0];
      return ka[1].localeCompare(kb[1]);
    });

    let cumKm = 0;
    const towers: SuttTower[] = sorted.map(({ record, towerNo, gi }) => {
      const spanM = num(record["SPAN (M)"]);
      cumKm += spanM !== null ? spanM / 1000 : 0;
      const { lat, lon } = parseLatLong(record["LAT,LONG"] ?? "");
      return {
        towerNo,
        penghantar: record["NAMA_PENGHANTAR"]?.trim() ?? "",
        gi,
        distanceKm: cumKm,
        lat,
        lon,
        tegangan: record["TEGANGAN"]?.trim() ?? "",
        jenisTower: record["JENIS TOWER"]?.trim() ?? "",
        tipeTower: record["TIPETOWER"]?.trim() ?? "",
        tahunOperasi: record["TAHUN OPERASI"]?.trim() ?? "",
        vegetasiLokasi: record["VEGETASI/LOKASI TOWER"]?.trim() ?? "",
        historyGangguan: record["HISTORY GANGGUAN"]?.trim() ?? "",
        historyGangguanPetir: record["HISTORI GANGGUAN PETIR"]?.trim() ?? "",
        towerKritisPenanganan: pick(record, "PENANGANAN TOWER KRITIS"),
        towerKritisMitigasi: record["MITIGASI_TOWER KRITIS"]?.trim() ?? "",
        towerKritisTglEksekusi: record["TGL EKSEKUSI TOWER KRITIS"]?.trim() ?? "",
      };
    });
    if (towers.length === 0) continue;

    const unit = sorted[0].record["UNIT"]?.trim() ?? "";
    const originGiRaw = towers[0].gi;
    // The far end only shows up as a literal GARDU_INDUK value when the
    // ruas crosses a GI handover partway through (confirmed live on 5 of
    // 23 ruas, e.g. BUNTOK - MUARA TEWEH) — otherwise (most ruas) every
    // row shares the same GARDU_INDUK and the far end is only ever named
    // in the NAMA_SECTION string itself, so that's the fallback.
    const laterDistinctGi = towers.find((t) => t.gi && t.gi !== originGiRaw)?.gi ?? null;
    let farEndLabel: string;
    if (laterDistinctGi) {
      farEndLabel = normalizeGiName(laterDistinctGi);
    } else {
      const originNorm = normalizeGiName(originGiRaw).toUpperCase();
      const parts = section.split(/\s*-\s*/).map((p) => p.trim());
      farEndLabel = parts.find((p) => p.toUpperCase() !== originNorm) ?? parts[parts.length - 1] ?? section;
    }

    ruasList.push({
      section,
      unit,
      originGi: originGiRaw,
      originLabel: normalizeGiName(originGiRaw),
      farEndLabel,
      lengthKm: towers[towers.length - 1].distanceKm,
      towers,
    });
  }

  return ruasList.sort((a, b) => a.section.localeCompare(b.section));
}

export async function getSuttSnapshot(): Promise<SuttSnapshot> {
  const results = await readConfiguredSource(SOURCE);
  const sheetResult = results.find((r) => r.file === EXPECTED_FILE && r.sheet === EXPECTED_SHEET);

  if (!sheetResult || sheetResult.records.length === 0) {
    return {
      ruasList: [],
      error: `Gagal membaca sheet "${EXPECTED_SHEET}" dari file "${EXPECTED_FILE}" — lihat halaman Data & Sync.`,
    };
  }

  const ruasList = buildRuasList(sheetResult.records);
  return { ruasList, error: ruasList.length === 0 ? "Data ruas SUTT belum tersedia." : null };
}
