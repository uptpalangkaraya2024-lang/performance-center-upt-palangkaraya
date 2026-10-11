import "server-only";

import { dataSources } from "@/config/data-sources";
import { createBayReportService, type EquipmentTypeConfig, type RawSource } from "@/lib/ahi-bay-report-shared";
import type { BayLineOption, BayLineReport } from "@/types";

const SOURCE = dataSources.ahiPerformance;
const HISTORY_SOURCE = dataSources.ahiHistory;

// Confirmed with the user: the busbar itself isn't a "bay" the way Bay
// Line/Trafo/Kopel/etc. are — it's just the shared connection point every
// other bay's own disconnector (DS BUS) and the bus-coupler bay (BAY
// COUPLE, see ahi-bay-kopel-report.ts) tie into. What genuinely belongs
// to the bus itself, as its own equipment, is the CVT BUS (the voltage
// transformer measuring that bus section) — kept here under the display
// label "CVT Bus" rather than "Bay Bus" for that reason, even though the
// internal kind id (bay-bus) and RENUS's own "BUS A/B ..." outage
// terminology still call it a bus. Confirmed live this CVT is the
// PRIMARY equipment — 37 distinct "BUS A/B GI ..." entries in Input PT
// (one A + one B per GI, almost every GI in the system), vs Input LA/PMT/
// CT which have ZERO "BUS ..." rows at all. The handful of PMS rows for
// this (GIS Mintin only) are each bus section's own DS BUS isolating the
// CVT, included alongside it since there's nowhere else in this report
// system they'd otherwise show up.
const PT_RAW_MAPPINGS: Record<string, RawSource[]> = {
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
};

const EQUIPMENT_TYPES: EquipmentTypeConfig[] = [
  { sheetName: "Input PT", roleFixed: "Capacitive Voltage Transformer", phasePivot: true, rawMappings: PT_RAW_MAPPINGS },
  {
    sheetName: "Input PMS",
    roleColumnLabel: "Keterangan Alat",
    phasePivot: false,
    // Confirmed live: only GIS Mintin has PMS rows for a Bus bay, and
    // their own "Keterangan Alat" text carries a garbled trailing
    // "(QSQEQEF)" suffix — "DS BUS A (BUAT CVT BUS) (QSQEQEF)" / "...B...".
    // Matched by prefix rather than exact equality so this still resolves
    // correctly regardless of that suffix; the role is DISPLAYED exactly
    // as the sheet has it (including the garbled text), never silently
    // cleaned up here — that belongs in the source sheet or a Kesehatan
    // Data finding, not a guess in this report.
    roleFilter: (role) => role.startsWith("DS BUS A") || role.startsWith("DS BUS B"),
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

const ROLE_ORDER = ["Capacitive Voltage Transformer", "DS BUS A", "DS BUS B"];

const HISTORY_SHEET_MAP: Record<string, string> = {
  "Input PT": "Riwayat PT",
  "Input PMS": "Riwayat PMS",
};

const service = createBayReportService({
  source: SOURCE,
  historySource: HISTORY_SOURCE,
  equipmentTypes: EQUIPMENT_TYPES,
  historySheetMap: HISTORY_SHEET_MAP,
  bayPrefix: "BUS",
  roleOrder: ROLE_ORDER,
});

export async function getBayBusOptions(): Promise<BayLineOption[]> {
  return service.getOptions();
}

export async function getBayBusReport(bay: string): Promise<BayLineReport | null> {
  return service.getReport(bay);
}

export async function getAllBayBusReports(): Promise<BayLineReport[]> {
  return service.getAllReports();
}

export async function getAllBayBusReportsWithHistory(): Promise<BayLineReport[]> {
  return service.getAllReportsWithHistory();
}
