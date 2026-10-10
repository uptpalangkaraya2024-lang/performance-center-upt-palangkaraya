import "server-only";

import { dataSources } from "@/config/data-sources";
import { createBayReportService, type EquipmentTypeConfig, type RawSource } from "@/lib/ahi-bay-report-shared";
import type { BayLineOption, BayLineReport } from "@/types";

const SOURCE = dataSources.ahiPerformance;
const HISTORY_SOURCE = dataSources.ahiHistory;

// Bay Kopel (bus coupler) has no equipment of its own — confirmed live its
// BAY column only ever shows up in Input PMS/PMT/CT (15 distinct "BAY
// KOPEL ..." bays), never in Input LA or Input PT (0 rows either place) —
// a coupler bay is just a breaker + CTs + bus-side disconnectors, no surge
// arrester or voltage transformer. So unlike Trafo/Reaktor/Kapasitor, this
// report reuses 3 of Bay Line's own sheets with no dedicated sheet added.
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

const EQUIPMENT_TYPES: EquipmentTypeConfig[] = [
  {
    sheetName: "Input PMT",
    roleFixed: "Circuit Breaker",
    phasePivot: false,
    excludeParameterLabels: ["Kevakuman", "BDV Minyak"],
    mergeParameterLabels: [{ into: "Pengujian SF6", from: ["Purity", "Dew Point", "SO2"] }],
    rawMappings: PMT_RAW_MAPPINGS,
  },
  { sheetName: "Input CT", roleFixed: "Current Transformer", phasePivot: true, rawMappings: CT_RAW_MAPPINGS },
  {
    sheetName: "Input PMS",
    roleColumnLabel: "Keterangan Alat",
    phasePivot: false,
    // Confirmed live: every BAY KOPEL row in Input PMS is already clean
    // ("DS BUS A"/"DS BUS B" only, no stray "DS LINE" like Bay Trafo had)
    // — this filter is kept anyway for defense-in-depth, since a coupler
    // bay genuinely has no line-side disconnector to show.
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

const ROLE_ORDER = ["Current Transformer", "Circuit Breaker", "DS BUS A", "DS BUS B"];

const HISTORY_SHEET_MAP: Record<string, string> = {
  "Input PMS": "Riwayat PMS",
  "Input PMT": "Riwayat PMT",
  "Input CT": "Riwayat CT",
};

const service = createBayReportService({
  source: SOURCE,
  historySource: HISTORY_SOURCE,
  equipmentTypes: EQUIPMENT_TYPES,
  historySheetMap: HISTORY_SHEET_MAP,
  bayPrefix: "BAY KOPEL",
  roleOrder: ROLE_ORDER,
});

export async function getBayKopelOptions(): Promise<BayLineOption[]> {
  return service.getOptions();
}

export async function getBayKopelReport(bay: string): Promise<BayLineReport | null> {
  return service.getReport(bay);
}

export async function getAllBayKopelReports(): Promise<BayLineReport[]> {
  return service.getAllReports();
}

export async function getAllBayKopelReportsWithHistory(): Promise<BayLineReport[]> {
  return service.getAllReportsWithHistory();
}
