import "server-only";

import { dataSources } from "@/config/data-sources";
import { createBayReportService, type EquipmentTypeConfig } from "@/lib/ahi-bay-report-shared";
import type { BayLineOption, BayLineReport } from "@/types";

const SOURCE = dataSources.ahiPerformance;
const HISTORY_SOURCE = dataSources.ahiHistory;

// Every Input sheet has a 2-row header (row 1 = group label spanning several
// sub-columns, row 2 = the actual per-parameter/per-phase sub-label) — see
// src/lib/ahi-bay-report-shared.ts for the generic grid-reading engine this
// config feeds.
const EQUIPMENT_TYPES: EquipmentTypeConfig[] = [
  // PMS's own PHASA column reads "RST" (already combined) — confirmed
  // against live data — one row is one complete role (DS LINE / DS BUS A /
  // DS BUS B), not one phase, unlike LA/PT/CT below.
  {
    sheetName: "Input PMS",
    roleColumnLabel: "Keterangan Alat",
    phasePivot: false,
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
  // LA/PT/CT: confirmed each phase (R/S/T) is its own row with its OWN
  // distinct TECHIDENT NUMBER (one physical device per phase, not one
  // 3-phase device sharing an ID) — grouping must merge every row for the
  // bay into one logical unit, not split further by techident.
  {
    sheetName: "Input LA",
    roleFixed: "Lightning Arrester",
    phasePivot: true,
    rawMappings: {
      "Tahanan Isolasi": [{ kind: "group", label: "Hasil Ukur Tahanan Isolasi (Mega Ohm)" }],
      LCM: [{ kind: "group", label: "Hasil LCM (micro Ampere)" }],
      "Thermovisi Bodi LA": [{ kind: "group", label: "Thermovisi pada Bodi LA" }],
      "Kondisi visual": [{ kind: "group", label: "Inpseksi Visual #1 - Kondisi Insulator" }],
    },
  },
  {
    sheetName: "Input PT",
    roleFixed: "Capacitive Voltage Transformer",
    phasePivot: true,
    rawMappings: {
      "Tahanan Isolasi Primer": [{ kind: "group", label: "Uji Tahanan Isolasi" }],
      "Tan Delta": [{ kind: "group", label: "Hasil Uji Tan Delta (%)" }],
      Ratio: [{ kind: "group", label: "Deviasi/ Error Hasil Uji Rasio (%)" }],
      Kapasitansi: [{ kind: "group", label: "Deviasi Hasil Uji Kapasitansi (%) khusus CVT" }],
      Thermovisi: [{ kind: "group", label: "Thermovisi Body Insulator" }],
      "Kondisi Visual": [
        { kind: "single", label: "Inspeksi Visual #4 - Spark Gap PT (shutdown inspection) jika ada" },
        { kind: "single", label: "Inspeksi Visual #3 - Terminal Sekunder PT (shutdown inspection)" },
        { kind: "single", label: "Inspeksi Visual #2 - Kebocoran PT" },
        { kind: "single", label: "Inpseksi Visual #1 - Kondisi Insulator" },
      ],
    },
  },
  {
    sheetName: "Input PMT",
    roleFixed: "Circuit Breaker",
    phasePivot: false,
    excludeParameterLabels: ["Kevakuman", "BDV Minyak"],
    mergeParameterLabels: [{ into: "Pengujian SF6", from: ["Purity", "Dew Point", "SO2"] }],
    rawMappings: {
      "Tahanan Isolasi": [{ kind: "group", label: "Hasil Uji Tahanan Isolasi Minimum (Mega Ohm)" }],
      "Tahanan Kontak": [{ kind: "group", label: "Pengujian Tahanan Kontak (mikro Ohm)" }],
      "Closing Time": [{ kind: "group", label: "Pengujian Closing Time (ms)" }],
      "Opening Time": [{ kind: "group", label: "Pengujian Opening Time (ms)" }],
      // No distinct raw column exists for Keserempakan (SKDIR/Evaluasi AHI
      // computes it) — left empty rather than guessed.
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
    },
  },
  {
    sheetName: "Input CT",
    roleFixed: "Current Transformer",
    phasePivot: true,
    rawMappings: {
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
    },
  },
];

// Report sections read top-to-bottom in this fixed, human-meaningful order —
// same order the sheet's own REPORT BAY LINE uses.
const ROLE_ORDER = [
  "Lightning Arrester",
  "DS LINE",
  "Capacitive Voltage Transformer",
  "Circuit Breaker",
  "Current Transformer",
  "DS BUS A",
  "DS BUS B",
];

// Input sheet name -> its matching Riwayat sheet name — mirrors
// AHI_HISTORY_SHEET_MAP in apps-script/ahi-history.gs exactly.
const HISTORY_SHEET_MAP: Record<string, string> = {
  "Input LA": "Riwayat LA",
  "Input PMS": "Riwayat PMS",
  "Input PT": "Riwayat PT",
  "Input PMT": "Riwayat PMT",
  "Input CT": "Riwayat CT",
};

const service = createBayReportService({
  source: SOURCE,
  historySource: HISTORY_SOURCE,
  equipmentTypes: EQUIPMENT_TYPES,
  historySheetMap: HISTORY_SHEET_MAP,
  bayPrefix: "BAY LINE",
  roleOrder: ROLE_ORDER,
});

/** Every "BAY LINE ..." entry available across the 5 Input sheets, for the
 *  page's GI/Bay selector — deduplicated, sorted. */
export async function getBayLineOptions(): Promise<BayLineOption[]> {
  return service.getOptions();
}

export async function getBayLineReport(bay: string): Promise<BayLineReport | null> {
  return service.getReport(bay);
}

/** Every bay line's report in one pass. Loads each of the 5 Input sheets
 *  exactly once (a single readConfiguredSourceRaw() call) and reuses those
 *  in-memory grids for all ~67 bays — critical, since looping a per-bay
 *  fetch here would re-trigger the provider's own file lookup on every
 *  iteration even with the sheet-row cache warm (confirmed: that loop took
 *  130+ seconds against the live Apps Script gateway before this fix).
 *  Hands the whole dataset to the client component once, so switching the
 *  GI/Bay selector needs no server round-trip (same pattern as RENUS). */
export async function getAllBayLineReports(): Promise<BayLineReport[]> {
  return service.getAllReports();
}

/** Same as getAllBayLineReports(), but each unit's `history` is also filled
 *  in from the separate "AHI UPT Palangkaraya - Riwayat Pengujian" file
 *  (ahiHistory source, apps-script/ahi-history.gs keeps it updated). Kept
 *  as its own function rather than folded into getAllBayLineReports() so
 *  callers that don't need trend data (the dashboard's Management
 *  Attention aggregation) never pay for reading these 5 extra sheets. */
export async function getAllBayLineReportsWithHistory(): Promise<BayLineReport[]> {
  return service.getAllReportsWithHistory();
}
