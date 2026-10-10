import "server-only";

import { dataSources } from "@/config/data-sources";
import { createBayReportService, type EquipmentTypeConfig, type RawSource } from "@/lib/ahi-bay-report-shared";
import type { BayLineOption, BayLineReport } from "@/types";

const SOURCE = dataSources.ahiPerformance;
const HISTORY_SOURCE = dataSources.ahiHistory;

// Bay GT (Generator Transformer interconnection bay, at PLTU/PLTD-fed GIs
// like Bagendang/Bangkanai/Mintin) has the same equipment shape as Bay
// Kopel/Bay Diameter — no LA, no PT, just a breaker + CTs + disconnectors.
// Confirmed live 12 distinct "BAY GT ..." bays in Input PMS/CT, 10 in Input
// PMT (2 bays' breakers apparently not yet entered).
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

const PMS_RAW_MAPPINGS: Record<string, RawSource[]> = {
  "Tahanan Isolasi": [{ kind: "group", label: "Hasil Uji Tahanan Isolasi Terendah (Mega Ohm)" }],
  "Tahanan Kontak": [{ kind: "group", label: "Pengujian Tahanan Kontak (mikro Ohm)" }],
  "Thermovisi Kontak PMS": [{ kind: "group", label: "Thermovisi pada Kontak Finger/Pisau" }],
  "Kondisi penggerak": [
    { kind: "single", label: "Inspeksi Visual #2 - Kondisi penggerak" },
    { kind: "single", label: "Uji Fungsi Penggerak" },
  ],
  "Kondisi insulator": [{ kind: "single", label: "Inpseksi Visual #1 - Kondisi Insulator" }],
};

const EQUIPMENT_TYPES: EquipmentTypeConfig[] = [
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
    // Confirmed live Bay GT's own Input PMS rows use 4 distinct roles:
    // "DS BUS A", "DS BUS B", "DS EARTHING" (grounding disconnector — real
    // equipment, not seen on any other bay kind), and "ARAH BAY TRAFO"
    // ("toward trafo bay" — a directional coupling disconnector specific
    // to how a GT bay ties into the switchyard). All 4 kept, unlike Bay
    // Trafo's own stray "DS LINE" rows — nothing here contradicts what a
    // GT bay should have.
    rawMappings: PMS_RAW_MAPPINGS,
  },
];

const ROLE_ORDER = ["Current Transformer", "Circuit Breaker", "DS BUS A", "DS BUS B", "DS EARTHING", "ARAH BAY TRAFO"];

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
  bayPrefix: "BAY GT",
  roleOrder: ROLE_ORDER,
});

export async function getBayGtOptions(): Promise<BayLineOption[]> {
  return service.getOptions();
}

export async function getBayGtReport(bay: string): Promise<BayLineReport | null> {
  return service.getReport(bay);
}

export async function getAllBayGtReports(): Promise<BayLineReport[]> {
  return service.getAllReports();
}

export async function getAllBayGtReportsWithHistory(): Promise<BayLineReport[]> {
  return service.getAllReportsWithHistory();
}
