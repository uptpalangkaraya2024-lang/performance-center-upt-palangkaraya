import "server-only";

import { dataSources } from "@/config/data-sources";
import { createBayReportService, type EquipmentTypeConfig, type RawSource } from "@/lib/ahi-bay-report-shared";
import type { BayLineOption, BayLineReport } from "@/types";

const SOURCE = dataSources.ahiPerformance;
const HISTORY_SOURCE = dataSources.ahiHistory;

// "Input LA" / "Input PMT" / "Input CT" / "Input PMS" are the SAME sheets
// ahi-bay-line-report.ts reads — confirmed live every one of them also
// carries "BAY TRAFO ..." rows alongside "BAY LINE ..." rows, so Bay Trafo
// reuses them rather than needing its own copies. Only the raw-mapping
// strings are duplicated here (not imported from the Line config) since
// EquipmentTypeConfig objects are plain data, not worth threading through
// an extra shared constant for 3 equipment types.
const LA_RAW_MAPPINGS: Record<string, RawSource[]> = {
  "Tahanan Isolasi": [{ kind: "group", label: "Hasil Ukur Tahanan Isolasi (Mega Ohm)" }],
  LCM: [{ kind: "group", label: "Hasil LCM (micro Ampere)" }],
  "Thermovisi Bodi LA": [{ kind: "group", label: "Thermovisi pada Bodi LA" }],
  "Kondisi visual": [{ kind: "group", label: "Inpseksi Visual #1 - Kondisi Insulator" }],
};

const PMT_RAW_MAPPINGS: Record<string, RawSource[]> = {
  "Tahanan Isolasi": [{ kind: "group", label: "Hasil Uji Tahanan Isolasi Minimum (Mega Ohm)" }],
  "Tahanan Kontak": [{ kind: "group", label: "Pengujian Tahanan Kontak (mikro Ohm)" }],
  "Closing Time": [{ kind: "group", label: "Pengujian Closing Time (ms)" }],
  "Opening Time": [{ kind: "group", label: "Pengujian Opening Time (ms)" }],
  Keserempakan: [],
  "Pengujian SF6": [
    { kind: "single", label: "Purity (%)" },
    { kind: "single", label: "Dew Point (deg Celcius)" },
    { kind: "single", label: "SO2 (ppmv)" },
  ],
  "Thermovisi Body PMT": [{ kind: "group", label: "Thermovisi Body Insulator" }],
  "Kondisi Visual": [
    { kind: "single", label: "Inspeksi Visual #2 - Kebocoran PMT" },
    { kind: "single", label: "Inpseksi Visual #1 - Kondisi Insulator" },
  ],
};

const CT_RAW_MAPPINGS: Record<string, RawSource[]> = {
  "Tahanan Isolasi Primer": [{ kind: "group", label: "Uji Tahanan Insulasi" }],
  "Tan Delta": [{ kind: "group", label: "Hasil Uji Tan Delta (%)" }],
  Ratio: [{ kind: "group", label: "Deviasi/ Error Hasil Uji Rasio (%)" }],
  "V knee point": [{ kind: "group", label: "Perbandingan Hasil Ukur dengan V knee Nameplate (%)" }],
  Thermovisi: [{ kind: "group", label: "Thermovisi Body Insulator" }],
  "Kondisi Visual": [
    { kind: "single", label: "Inspeksi Visual #3 - Terminal Sekunder CT (shutdown inspection)" },
    { kind: "single", label: "Inspeksi Visual #2 - Kebocoran CT" },
    { kind: "single", label: "Inpseksi Visual #1 - Kondisi Insulator" },
  ],
};

// Input Trafo's own 28 Evaluasi AHI sub-parameters, mapped by column index
// confirmed live (headerRow 1 = group label, row 2 = sub-label):
//  15-17 Hasil Uji Tahanan Isolasi menit ke 1 (Core-Frame/Core-Ground/Frame-Ground) -> Tahanan Isolasi Inti
//  19-24 Hasil Uji Tahanan Isolasi menit ke 10 (Prim-Sek...Ter-Gnd)       -> Tahanan Isolasi Belitan
//  26-31 Index Polarity (Prim-Sek...Ter-Gnd)                              -> Indeks Polarisasi
//  45-50 Pengujian Tan Delta Belitan (%)                                  -> Tan Delta Belitan
//  62    MAX Error/Deviasi Nilai Kapasitansi Belitan thd FAT/SAT/sblmnya  -> Deviasi Cap Belitan
//  52-59 Pengujian Tan Delta Bushing (%)                                  -> Tan Delta Bushing
//  61    MAX Error/Deviasi Nilai Kapasitansi Bushing thd Nameplate        -> Deviasi Cap Bushing
//  63    MAX Error/Deviasi Nilai Ratio Trafo thd Nameplate                -> Deviasi Ratio
//  64    MAX Error/Deviasi Nilai RDC Belitan dengan hasil sblmnya         -> Deviasi RDC
//  65    Pengujian Dinamic Resistance / Kontinuitas Tap                  -> Kontuinitas On Load Tap Changer
//  66    Evaluasi SFRA — itself the score input, no separate raw reading -> SFRA (left unmapped, same precedent as PMT's Keserempakan)
//  67-71 Karakteristik Minyak (Acidity/BDV/Color-Test/IFT/Moisture)       -> OIL CHAR * (5 single columns, matched by their own row 2 label)
//  83    Thermovisi pada tangki utama dan radiator                       -> Thermovisi
//  84-87 Kondisi Visual #1-#4 (4 distinct row-1 labels, not a group)      -> Kondisi Visual
//  72-80 DGA group (CO/CO2/H2/CH4/C2H6/C2H4/C2H2/TDCG/CO2-CO)             -> TDCG + 8x "DGA <gas>" (matched by row 2 label, no "DGA " prefix there)
//  81-82 Pengujian Aging Kertas Isolasi (DP/Furan)                        -> DP / FURAN
// Not every one of the 28 could be traced to an unambiguous raw column —
// those are simply left out of this map (never guessed); the parameter's
// own Evaluasi AHI score/klasifikasi/Mandatory/Retest flags are unaffected
// either way, since those are read straight from the Evaluasi AHI columns
// themselves, not derived from this map (this map only feeds the
// expandable "Hasil Uji (nilai mentah)" rows under each parameter).
const TRAFO_RAW_MAPPINGS: Record<string, RawSource[]> = {
  "Tahanan Isolasi Inti": [{ kind: "group", label: "Hasil Uji Tahanan Isolasi menit ke 1 (Mega Ohm)" }],
  "Tahanan Isolasi Belitan": [{ kind: "group", label: "Hasil Uji Tahanan Isolasi menit ke 10 (Mega Ohm)" }],
  "Indeks Polarisasi": [{ kind: "group", label: "Index Polarity" }],
  "Tan Delta Belitan": [{ kind: "group", label: "Pengujian Tan Delta Belitan (%)" }],
  "Deviasi Cap Belitan": [
    { kind: "single", label: "MAX Error/Deviasi Nilai Kapasitansi Belitan terhadap Hasil FAT / SAT / Pengukuran Sebelumnya (%)" },
  ],
  "Tan Delta Bushing": [{ kind: "group", label: "Pengujian Tan Delta Bushing (%)" }],
  "Deviasi Cap Bushing": [{ kind: "single", label: "MAX Error/Deviasi Nilai Kapasitansi Bushing terhadap Nameplate (%)" }],
  "Deviasi Ratio": [{ kind: "single", label: "MAX Error/Deviasi Nilai Ratio Trafo terhadap Nameplate (%)" }],
  "Deviasi RDC": [
    { kind: "single", label: "MAX Error/Deviasi Nilai RDC Belitan dengan hasil FAT / SAT / pengukuran sebelumnya / phasa lain (%)" },
  ],
  "Kontuinitas On Load Tap Changer": [{ kind: "single", label: "Pengujian Dinamic Resistance / Kontinuitas Tap" }],
  "OIL CHAR Acidity (mg KOH/g)": [{ kind: "single", label: "Acidity (mg KOH/g)" }],
  "OIL CHAR BDV Oil Main Tank (kV at 2.5 mm)": [{ kind: "single", label: "BDV Oil Main Tank (kV at 2.5 mm)" }],
  "OIL CHAR Color-Test (score according to IEEE C57.152)": [
    { kind: "single", label: "Color-Test (score according to IEEE C57.152)" },
  ],
  "OIL CHAR IFT (mN/m)": [{ kind: "single", label: "IFT (mN/m)" }],
  "OIL CHAR Moisture (ppm) *Inferred from Moisture in Oil Test": [
    { kind: "single", label: "Moisture (ppm) *Inferred from Moisture in Oil Test" },
  ],
  Thermovisi: [{ kind: "single", label: "Thermovisi pada tangki utama dan radiator" }],
  "Kondisi Visual": [
    { kind: "single", label: "Kondisi Visual # 1 - Insulator Bushing" },
    { kind: "single", label: "Kondisi Visual # 2 - Kebocoran Minyak Bushing" },
    { kind: "single", label: "Kondisi Visual # 3 - Fasilitas Test Tap" },
    { kind: "single", label: "Kondisi Visual # 4 - Kebocoran Minyak Tangki Utama" },
  ],
  TDCG: [{ kind: "single", label: "TDCG (ppm)" }],
  "DGA CO (ppm)": [{ kind: "single", label: "CO (ppm)" }],
  "DGA CO2 (ppm)": [{ kind: "single", label: "CO2 (ppm)" }],
  "DGA H2 (ppm)": [{ kind: "single", label: "H2 (ppm)" }],
  "DGA CH4 (ppm)": [{ kind: "single", label: "CH4 (ppm)" }],
  "DGA C2H6 (ppm)": [{ kind: "single", label: "C2H6 (ppm)" }],
  "DGA C2H4 (ppm)": [{ kind: "single", label: "C2H4 (ppm)" }],
  "DGA C2H2 (ppm)": [{ kind: "single", label: "C2H2 (ppm)" }],
  "DGA CO2/CO (ppm)": [{ kind: "single", label: "CO2/CO (ppm)" }],
  "DP / FURAN": [{ kind: "group", label: "Pengujian Aging Kertas Isolasi" }],
};

// Input NGR's own 5 Evaluasi AHI sub-parameters — fully mapped, confirmed
// live column-by-column (every one has a clear, unambiguous raw source,
// unlike Input Trafo's SFRA/some Deviasi fields above).
const NGR_RAW_MAPPINGS: Record<string, RawSource[]> = {
  "Tahanan Elemen": [{ kind: "group", label: "Tahanan Elemen NGR (Ohm)" }],
  "Tahanan Isolasi": [{ kind: "single", label: "Pengujian Tahanan Isolasi Minimum (Mega Ohm)" }],
  Thermovisi: [{ kind: "group", label: "Thermovisi  Elemen NGR" }],
  "Riwayat GF": [
    {
      kind: "single",
      label: "Historis Gangguan Akumulasi Jumlah Kejadian Penyulang dengan Arus GF 1,2 * batas desain (kali)",
    },
  ],
  Visual: [{ kind: "single", label: "Inspeksi Visual Elemen *liquid elemen" }],
};

// Bay Trafo's equipment set, per the user's own confirmed order (Trafo, NGR,
// LA, CT, PMT, DS BUS). "Input Trafo"/"Input NGR" are each one row per unit
// (not phase-pivoted — confirmed live: ~1.0-1.4 rows per distinct bay,
// unlike LA/PT/CT's one-row-per-phase). The " Mbl" sheets are the mobile/
// portable transformer variants the user asked to include — their own
// column layout differs slightly from the fixed-unit sheets (confirmed
// live: 156 vs 169 columns) but shares the same first ~20 identity/role
// columns and the same Evaluasi AHI sub-labels for every column that DOES
// exist on both, so the fixed sheet's raw-mapping is reused as-is: a column
// genuinely absent on the Mbl sheet just yields no raw reading for that one
// item (findCol/findAnyLabelCol return -1, never a guess or a crash), not a
// different, hand-verified mapping.
const EQUIPMENT_TYPES: EquipmentTypeConfig[] = [
  { sheetName: "Input Trafo", roleFixed: "Trafo", phasePivot: false, rawMappings: TRAFO_RAW_MAPPINGS },
  { sheetName: "Input Trafo Mbl", roleFixed: "Trafo", phasePivot: false, rawMappings: TRAFO_RAW_MAPPINGS },
  { sheetName: "Input NGR", roleFixed: "NGR", phasePivot: false, rawMappings: NGR_RAW_MAPPINGS },
  { sheetName: "Input NGR Mbl", roleFixed: "NGR", phasePivot: false, rawMappings: NGR_RAW_MAPPINGS },
  { sheetName: "Input LA", roleFixed: "Lightning Arrester", phasePivot: true, rawMappings: LA_RAW_MAPPINGS },
  { sheetName: "Input CT", roleFixed: "Current Transformer", phasePivot: true, rawMappings: CT_RAW_MAPPINGS },
  {
    sheetName: "Input PMT",
    roleFixed: "Circuit Breaker",
    phasePivot: false,
    excludeParameterLabels: ["Kevakuman", "BDV Minyak"],
    mergeParameterLabels: [{ into: "Pengujian SF6", from: ["Purity", "Dew Point", "SO2"] }],
    rawMappings: PMT_RAW_MAPPINGS,
  },
  {
    sheetName: "Input PMS",
    roleColumnLabel: "Keterangan Alat",
    phasePivot: false,
    // Confirmed live: a bay trafo should only ever carry its own bus-side
    // disconnectors (DS BUS A/B) — found exactly 3 rows across the whole
    // sheet where a BAY TRAFO row is mistakenly tagged "DS LINE" (2 at GI
    // BAGENDANG, 1 at GI MINTIN with a garbled "(QEFQSQE)" suffix), which
    // are data entry mistakes in the source sheet, not real Bay Trafo
    // equipment. Excluded here rather than shown — per explicit user
    // confirmation that Bay Trafo has no DS LINE.
    roleFilter: (role) => role === "DS BUS A" || role === "DS BUS B",
    rawMappings: {
      "Tahanan Isolasi": [{ kind: "group", label: "Hasil Uji Tahanan Isolasi Terendah (Mega Ohm)" }],
      "Tahanan Kontak": [{ kind: "group", label: "Pengujian Tahanan Kontak (mikro Ohm)" }],
      "Thermovisi Kontak PMS": [{ kind: "group", label: "Thermovisi pada Kontak Finger/Pisau" }],
      "Kondisi penggerak": [
        { kind: "single", label: "Inspeksi Visual #2 - Kondisi penggerak" },
        { kind: "single", label: "Uji Fungsi Penggerak" },
      ],
      "Kondisi insulator": [{ kind: "single", label: "Inpseksi Visual #1 - Kondisi Insulator" }],
    },
  },
];

const ROLE_ORDER = ["Trafo", "NGR", "Lightning Arrester", "Current Transformer", "Circuit Breaker", "DS BUS A", "DS BUS B"];

// Only the 4 equipment types shared with Bay Line have a Riwayat sheet —
// Input Trafo/NGR (and their Mbl variants) have no history source yet, so
// those units simply get an empty `history` (never an error).
const HISTORY_SHEET_MAP: Record<string, string> = {
  "Input LA": "Riwayat LA",
  "Input PMS": "Riwayat PMS",
  "Input PMT": "Riwayat PMT",
  "Input CT": "Riwayat CT",
};

const service = createBayReportService({
  source: SOURCE,
  historySource: HISTORY_SOURCE,
  equipmentTypes: EQUIPMENT_TYPES,
  historySheetMap: HISTORY_SHEET_MAP,
  bayPrefix: "BAY TRAFO",
  roleOrder: ROLE_ORDER,
});

/** Every "BAY TRAFO ..." entry available across the 8 Input sheets, for the
 *  page's GI/Bay selector — deduplicated, sorted. */
export async function getBayTrafoOptions(): Promise<BayLineOption[]> {
  return service.getOptions();
}

export async function getBayTrafoReport(bay: string): Promise<BayLineReport | null> {
  return service.getReport(bay);
}

export async function getAllBayTrafoReports(): Promise<BayLineReport[]> {
  return service.getAllReports();
}

/** Same as getAllBayTrafoReports(), but LA/PMT/CT/PMS units also get their
 *  `history` filled in from the Riwayat Pengujian file — Trafo/NGR units
 *  always have an empty history (no source sheet for them yet). */
export async function getAllBayTrafoReportsWithHistory(): Promise<BayLineReport[]> {
  return service.getAllReportsWithHistory();
}
