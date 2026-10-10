import "server-only";

import { dataSources } from "@/config/data-sources";
import { createBayReportService, type EquipmentTypeConfig, type RawSource } from "@/lib/ahi-bay-report-shared";
import type { BayLineOption, BayLineReport } from "@/types";

const SOURCE = dataSources.ahiPerformance;
const HISTORY_SOURCE = dataSources.ahiHistory;

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

// Input Reaktor's own 28 Evaluasi AHI sub-parameters — confirmed live its
// column layout is near-identical to Input Trafo's (same raw group labels
// for every mapping below, down to the exact text), with exactly ONE
// difference: the DGA group's own "TDCG" sub-column is labeled "TDCG" here
// (Input Trafo's is "TDCG (ppm)"). Every other mapping is copied from
// Input Trafo's own (see ahi-bay-trafo-report.ts's TRAFO_RAW_MAPPINGS
// comment for the full column-by-column confirmation), not re-derived.
const REAKTOR_RAW_MAPPINGS: Record<string, RawSource[]> = {
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
  // The one confirmed difference from Input Trafo — no "(ppm)" suffix here.
  TDCG: [{ kind: "single", label: "TDCG" }],
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

// Bay Reaktor equipment: Reaktor (own sheet, one row per unit — confirmed
// live not phase-pivoted, same as Input Trafo), plus LA/CT/PMT/DS BUS
// reused from Bay Line's own sheets. No NGR (confirmed live: zero "BAY
// REAKTOR" rows in Input NGR or Input NGR Mbl — a reactor has no neutral
// grounding resistor of this kind). Only 2 reactor bays exist system-wide
// (GI Muara Teweh, GI Pangkalan Bun) — a small report, but built the same
// way as every other bay kind rather than special-cased.
const EQUIPMENT_TYPES: EquipmentTypeConfig[] = [
  { sheetName: "Input Reaktor", roleFixed: "Reaktor", phasePivot: false, rawMappings: REAKTOR_RAW_MAPPINGS },
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
    // Confirmed live: every BAY REAKTOR row in Input PMS is already clean
    // (DS BUS A/B only) — kept for the same defense-in-depth reason as
    // Bay Kopel's own config.
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

const ROLE_ORDER = ["Reaktor", "Lightning Arrester", "Current Transformer", "Circuit Breaker", "DS BUS A", "DS BUS B"];

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
  bayPrefix: "BAY REAKTOR",
  roleOrder: ROLE_ORDER,
});

export async function getBayReaktorOptions(): Promise<BayLineOption[]> {
  return service.getOptions();
}

export async function getBayReaktorReport(bay: string): Promise<BayLineReport | null> {
  return service.getReport(bay);
}

export async function getAllBayReaktorReports(): Promise<BayLineReport[]> {
  return service.getAllReports();
}

export async function getAllBayReaktorReportsWithHistory(): Promise<BayLineReport[]> {
  return service.getAllReportsWithHistory();
}
