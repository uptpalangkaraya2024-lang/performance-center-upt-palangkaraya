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

// Input Kapasitor's own 4 Evaluasi AHI sub-parameters — fully mapped,
// confirmed live column-by-column (every one has a clear, unambiguous raw
// source, same confidence as Input NGR's own 5/5).
const KAPASITOR_RAW_MAPPINGS: Record<string, RawSource[]> = {
  "Tahanan Isolasi Primer": [{ kind: "single", label: "Hasil Uji Tahanan Isolasi (Mega Ohm)" }],
  "Resistansi AC": [{ kind: "single", label: "Deviasi Hasil Ukur Resistansi AC bank Kapasitor (%)" }],
  Thermovisi: [{ kind: "group", label: "Thermovisi Body" }],
  "Kondisi Visual": [{ kind: "single", label: "Inspeksi Visual #1 - Kondisi Sel Kapasitor" }],
};

// Bay Kapasitor equipment: Kapasitor (own sheet, one row per unit, not
// phase-pivoted), LA/CT/PMT reused from Bay Line's own sheets, and PMS's
// DS BUS A/B PLUS a 3rd role confirmed live only here — "DS KAPASITOR", a
// dedicated capacitor-bank disconnector distinct from a bus disconnector.
// Real equipment, not a data-entry mistake like Bay Trafo's stray "DS
// LINE" rows (see ahi-bay-trafo-report.ts), so it's included rather than
// filtered out. This sheet also carries one other UIP3B Kalimantan UPT's
// own capacitor row (GI Sei Raya, UPT Pontianak) — excluded automatically
// by the bayPrefix filter below (that row's own identifier text doesn't
// start with "BAY KAPASITOR"), same safeguard already in place for every
// other equipment type. Only 1 capacitor bay exists system-wide (GI
// Palangkaraya) — small, built the same way as every other bay kind.
const EQUIPMENT_TYPES: EquipmentTypeConfig[] = [
  { sheetName: "Input Kapasitor", roleFixed: "Kapasitor", phasePivot: false, rawMappings: KAPASITOR_RAW_MAPPINGS },
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
    roleFilter: (role) => role === "DS BUS A" || role === "DS BUS B" || role === "DS KAPASITOR",
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

const ROLE_ORDER = [
  "Kapasitor",
  "Lightning Arrester",
  "Current Transformer",
  "Circuit Breaker",
  "DS BUS A",
  "DS BUS B",
  "DS KAPASITOR",
];

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
  bayPrefix: "BAY KAPASITOR",
  roleOrder: ROLE_ORDER,
});

export async function getBayKapasitorOptions(): Promise<BayLineOption[]> {
  return service.getOptions();
}

export async function getBayKapasitorReport(bay: string): Promise<BayLineReport | null> {
  return service.getReport(bay);
}

export async function getAllBayKapasitorReports(): Promise<BayLineReport[]> {
  return service.getAllReports();
}

export async function getAllBayKapasitorReportsWithHistory(): Promise<BayLineReport[]> {
  return service.getAllReportsWithHistory();
}
