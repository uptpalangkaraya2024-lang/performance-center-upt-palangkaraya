import "server-only";

import { dataSources } from "@/config/data-sources";
import { readConfiguredSource, readConfiguredSourceRaw } from "@/lib/data-connector";
import { parseNumber, requireText } from "@/lib/parse";
import type {
  AssetAnomaliRow,
  AssetBpuBayLineRow,
  AssetMpuBayLineRow,
  AssetMpuBusproRow,
  AssetRelayObsoleteRow,
  AssetScanningResult,
} from "@/types";

const SOURCE = dataSources.assetScanning;
const EXPECTED_FILE = SOURCE.sources[0].file;

function text(row: Record<string, string>, key: string): string {
  return requireText(row[key]) ?? "";
}
function textOrNull(row: Record<string, string>, key: string): string | null {
  return requireText(row[key]);
}
function num(row: Record<string, string>, key: string): number | null {
  return parseNumber(row[key]);
}

// Columns already surfaced as dedicated fields on each curated row — left
// out of `raw` so the detail view's auto-generated key:value grid doesn't
// repeat the same value twice under two different labels.
const MPU_BAY_LINE_CURATED = new Set([
  "ULTG", "dari GI", "ke GI", "Line", "Bay", "Anomali", "ID BAY", "Jarak (km)", "Merk", "Tipe", "Serial Number", "Tahun Operasi", "Remote Relai",
]);
const BPU_BAY_LINE_CURATED = new Set([
  "ULTG", "dari GI", "ke GI", "Line", "Bay", "Anomali", "Merk", "Tipe", "Serial Number", "Tahun Operasi", "Remote Relai",
]);
const MPU_BUSPRO_CURATED = new Set([
  "ULTG", "Gardu Induk", "Ada/Tidak", "Merk", "Tipe", "Serial Number", "Tahun Operasi", "Remote Relai", "Fungsi", "Normal/ Abnormal",
]);

function rawBag(row: Record<string, string>, curated: Set<string>): Record<string, string> {
  const bag: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    if (curated.has(key)) continue;
    const v = requireText(value);
    if (v !== null) bag[key] = v;
  }
  return bag;
}

function normalizeMpuBayLine(row: Record<string, string>): AssetMpuBayLineRow | null {
  const ultg = text(row, "ULTG");
  const bay = text(row, "Bay");
  if (!ultg || !bay) return null;
  return {
    ultg,
    dariGi: text(row, "dari GI"),
    keGi: text(row, "ke GI"),
    line: textOrNull(row, "Line"),
    bay,
    anomaliStatus: text(row, "Anomali") || "—",
    idBay: textOrNull(row, "ID BAY"),
    jarakKm: num(row, "Jarak (km)"),
    merk: text(row, "Merk"),
    tipe: text(row, "Tipe"),
    serialNumber: textOrNull(row, "Serial Number"),
    tahunOperasi: num(row, "Tahun Operasi"),
    remoteRelai: textOrNull(row, "Remote Relai"),
    raw: rawBag(row, MPU_BAY_LINE_CURATED),
  };
}

function normalizeBpuBayLine(row: Record<string, string>): AssetBpuBayLineRow | null {
  const ultg = text(row, "ULTG");
  const bay = text(row, "Bay");
  if (!ultg || !bay) return null;
  return {
    ultg,
    dariGi: text(row, "dari GI"),
    keGi: text(row, "ke GI"),
    line: textOrNull(row, "Line"),
    bay,
    anomaliStatus: text(row, "Anomali") || "—",
    merk: text(row, "Merk"),
    tipe: text(row, "Tipe"),
    serialNumber: textOrNull(row, "Serial Number"),
    tahunOperasi: num(row, "Tahun Operasi"),
    remoteRelai: textOrNull(row, "Remote Relai"),
    raw: rawBag(row, BPU_BAY_LINE_CURATED),
  };
}

function normalizeMpuBuspro(row: Record<string, string>): AssetMpuBusproRow | null {
  const ultg = text(row, "ULTG");
  const gardu = text(row, "Gardu Induk");
  if (!ultg || !gardu) return null;
  return {
    ultg,
    gardu,
    adaTidak: text(row, "Ada/Tidak") || "—",
    merk: textOrNull(row, "Merk"),
    tipe: textOrNull(row, "Tipe"),
    serialNumber: textOrNull(row, "Serial Number"),
    tahunOperasi: num(row, "Tahun Operasi"),
    remoteRelai: textOrNull(row, "Remote Relai"),
    fungsi: textOrNull(row, "Fungsi"),
    normalAbnormal: textOrNull(row, "Normal/ Abnormal"),
    raw: rawBag(row, MPU_BUSPRO_CURATED),
  };
}

function cell(row: unknown[], idx: number): string {
  const v = row[idx];
  return requireText(v != null ? String(v) : undefined) ?? "";
}
function cellOrNull(row: unknown[], idx: number): string | null {
  const v = row[idx];
  return requireText(v != null ? String(v) : undefined);
}
function cellNum(row: unknown[], idx: number): number | null {
  const v = row[idx];
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  return parseNumber(v != null ? String(v) : undefined);
}

/** ANOMALI's main table (header at row 0: NO, ULTG, BAY/GI, ... up to the
 *  SECOND "KETERANGAN" at column 17) plus its second, separate "relay
 *  obsolescence" block further down — found by content match on its own
 *  "TYPE EKSISTING" header, same defensive approach as every other
 *  multi-block sheet in this app (ABO, 4DX TARGET WIG). Both reads are
 *  positional (column index), not header-keyed, since the main table's own
 *  "KETERANGAN" header repeats and would otherwise collide. */
function parseAnomaliSheet(raw: unknown[][]): { anomali: AssetAnomaliRow[]; relayObsolete: AssetRelayObsoleteRow[] } {
  const anomali: AssetAnomaliRow[] = [];
  const relayObsolete: AssetRelayObsoleteRow[] = [];

  let secondHeaderIdx = -1;
  for (let i = 1; i < raw.length; i++) {
    const row = raw[i];
    if (String(row?.[5] ?? "").trim().toUpperCase() === "NO" && String(row?.[10] ?? "").trim().toUpperCase().includes("TYPE EKSISTING")) {
      secondHeaderIdx = i;
      break;
    }
  }
  const firstBlockEnd = secondHeaderIdx >= 0 ? secondHeaderIdx : raw.length;

  for (let i = 1; i < firstBlockEnd; i++) {
    const row = raw[i];
    const ultg = cell(row, 1);
    const bayGi = cell(row, 2);
    if (!ultg || !bayGi) continue; // blank separator row
    anomali.push({
      no: cellNum(row, 0),
      ultg,
      bayGi,
      peralatan: cell(row, 3),
      merk: cellOrNull(row, 4),
      type: cellOrNull(row, 5),
      sn: cellOrNull(row, 6),
      anomali: cell(row, 7),
      keteranganAnomali: cellOrNull(row, 8),
      tindakLanjut: cellOrNull(row, 9),
      merkPengganti: cellOrNull(row, 10),
      typePengganti: cellOrNull(row, 11),
      snPengganti: cellOrNull(row, 12),
      target: cellOrNull(row, 13),
      realisasi: cellOrNull(row, 14),
      hasil: cellOrNull(row, 15),
      status: cellOrNull(row, 16),
      keteranganLanjutan: cellOrNull(row, 17),
    });
  }

  if (secondHeaderIdx >= 0) {
    for (let i = secondHeaderIdx + 1; i < raw.length; i++) {
      const row = raw[i];
      const ultg = cell(row, 6);
      const gi = cell(row, 7);
      if (!ultg || !gi) continue;
      relayObsolete.push({
        no: cellNum(row, 5),
        ultg,
        gi,
        bay: cell(row, 8),
        anomali: cell(row, 9),
        tipeEksisting: cellOrNull(row, 10),
        merk: cellOrNull(row, 12),
        tipePengganti: cellOrNull(row, 13),
      });
    }
  }

  return { anomali, relayObsolete };
}

export async function getAssetScanning(): Promise<AssetScanningResult> {
  const [results, rawResults] = await Promise.all([
    readConfiguredSource(SOURCE),
    readConfiguredSourceRaw(SOURCE),
  ]);

  const mpuBayLineSheet = results.find((r) => r.file === EXPECTED_FILE && r.sheet === "MPU BAY LINE");
  const bpuBayLineSheet = results.find((r) => r.file === EXPECTED_FILE && r.sheet === "BPU BAY LINE");
  const mpuBusproSheet = results.find((r) => r.file === EXPECTED_FILE && r.sheet === "MPU BUSPRO");
  const anomaliRawSheet = rawResults.find((r) => r.file === EXPECTED_FILE && r.sheet === "ANOMALI");

  if (!mpuBayLineSheet && !bpuBayLineSheet && !mpuBusproSheet && !anomaliRawSheet) {
    return {
      data: null,
      error: `Gagal membaca sheet dari file "${EXPECTED_FILE}" — lihat halaman Data & Sync.`,
    };
  }

  const mpuBayLine = mpuBayLineSheet
    ? mpuBayLineSheet.records.map(normalizeMpuBayLine).filter((r): r is AssetMpuBayLineRow => r !== null)
    : [];
  const bpuBayLine = bpuBayLineSheet
    ? bpuBayLineSheet.records.map(normalizeBpuBayLine).filter((r): r is AssetBpuBayLineRow => r !== null)
    : [];
  const mpuBuspro = mpuBusproSheet
    ? mpuBusproSheet.records.map(normalizeMpuBuspro).filter((r): r is AssetMpuBusproRow => r !== null)
    : [];
  const { anomali, relayObsolete } = anomaliRawSheet
    ? parseAnomaliSheet(anomaliRawSheet.rows)
    : { anomali: [], relayObsolete: [] };

  return {
    data: { mpuBayLine, bpuBayLine, mpuBuspro, anomali, relayObsolete },
    error: null,
  };
}
