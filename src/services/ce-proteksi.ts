import "server-only";

import { dataSources } from "@/config/data-sources";
import { readConfiguredSourceRaw } from "@/lib/data-connector";
import type { CeBudget, CeItem, CeSnapshot, CeUnlinkedBudget } from "@/types";

// Source: "Monitoring Common Enemy UPT Palangkaraya" — one INPUT sheet per
// ULTG plus ALOKASI ANGGARAN (see data-sources.ts). Every column is found
// by header name, never a fixed index.
const SOURCE = dataSources.ceProteksi;
const FILE = SOURCE.sources[0].file;
const ULTG_SHEETS = ["INPUT ULTG PKY", "INPUT ULTG PBN", "INPUT ULTG MTW"];
const BUDGET_SHEET = "ALOKASI ANGGARAN";

const cell = (v: unknown) => String(v ?? "").trim();
const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toUpperCase();

/** Header-name → column-index map for the first row (within the first 5)
 *  containing every one of `required`. */
function locateHeader(rows: unknown[][], required: string[]): { index: number; col: (label: string) => number } | null {
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const labels = (rows[i] ?? []).map((c) => normalize(cell(c)));
    if (required.every((r) => labels.includes(normalize(r)))) {
      return { index: i, col: (label) => labels.indexOf(normalize(label)) };
    }
  }
  return null;
}

function extractWeekLabel(raw: string): string | null {
  const m = /^[TR]\s+(.+)$/.exec(raw.trim());
  return m ? m[1].trim() : null;
}

function extractDateOnly(raw: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(raw.trim());
  return m ? m[1] : null;
}

/** Join key between an INPUT ULTG row and its ALOKASI ANGGARAN row. Both
 *  sheets carry the same descriptive columns (the budget sheet is a copy
 *  of the item list) — confirmed live: 182 of 202 items match. ACTION PLAN
 *  is left out of the key because it is edited after budgeting. */
function joinKey(parts: string[]): string {
  return parts.map(normalize).join("|");
}

function parseBudget(rows: unknown[][]): Map<string, CeUnlinkedBudget[]> {
  const h = locateHeader(rows, ["ULTG", "GARDU INDUK", "ANOMALI", "NILAI"]);
  const map = new Map<string, CeUnlinkedBudget[]>();
  if (!h) return map;
  const c = (label: string) => h.col(label);
  for (const row of rows.slice(h.index + 1)) {
    const at = (label: string) => cell(row[c(label)]);
    if (!at("ULTG") || at("ULTG").startsWith("#")) continue;
    const nilaiRaw = at("NILAI").replace(/[^\d.]/g, "");
    const nilai = nilaiRaw ? Number(nilaiRaw) : NaN;
    const budget: CeUnlinkedBudget = {
      ultg: at("ULTG"),
      gardu: at("GARDU INDUK"),
      bay: at("BAY"),
      jenisAsset: at("JENIS ASET"),
      anomali: at("ANOMALI"),
      rab: at("RAB"),
      nilai: Number.isFinite(nilai) && nilai > 0 ? nilai : null,
      pos: at("POS ANGGARAN"),
      tahun: at("TAHUN ANGGARAN"),
      judulPrk: at("JUDUL PRK"),
      nomorPrk: at("NOMOR PRK"),
      kontrak: at("KONTRAK dan KETERANGAN"),
    };
    const key = joinKey([at("ULTG"), at("GARDU INDUK"), at("BAY"), at("JENIS ASET"), at("PHASA"), at("ANOMALI")]);
    const list = map.get(key) ?? [];
    list.push(budget);
    map.set(key, list);
  }
  return map;
}

function parseUltgSheet(rows: unknown[][], budgets: Map<string, CeUnlinkedBudget[]>, idOffset: number): CeItem[] {
  const h = locateHeader(rows, ["NO", "PERIODE", "ULTG", "GARDU INDUK", "ANOMALI", "CLOSE/OPEN"]);
  if (!h) return [];
  const items: CeItem[] = [];
  for (const row of rows.slice(h.index + 1)) {
    const at = (label: string) => {
      const i = h.col(label);
      return i === -1 ? "" : cell(row[i]);
    };
    const no = at("NO");
    if (!/^\d+$/.test(no)) continue;
    const gardu = at("GARDU INDUK");
    const bay = at("BAY");
    const anomali = at("ANOMALI");
    // Numbered rows with nothing in them are pre-filled placeholders.
    if (!gardu && !bay && !anomali) continue;

    const ultg = at("ULTG");
    const jenisAsset = at("JENIS ASET");
    const phasa = at("PHASA");
    // Two items can share every descriptive column (same anomaly listed
    // twice); their budget rows are consumed in order so each gets its own.
    const budgetQueue = budgets.get(joinKey([ultg, gardu, bay, jenisAsset, phasa, anomali]));
    const linked = budgetQueue && budgetQueue.length > 0 ? budgetQueue.shift()! : null;
    const budget: CeBudget | null = linked
      ? {
          rab: linked.rab,
          nilai: linked.nilai,
          pos: linked.pos,
          tahun: linked.tahun,
          judulPrk: linked.judulPrk,
          nomorPrk: linked.nomorPrk,
          kontrak: linked.kontrak,
        }
      : null;

    items.push({
      id: idOffset + Number(no),
      no: Number(no),
      ultg,
      gardu,
      bay,
      span: "",
      jenisAsset,
      indikator: at("INDIKATOR"),
      phasa,
      // No program column in this source; other modules show namaProgram
      // as an item's label, so give them "<jenis aset>: <anomali>" (or the
      // action plan when the anomaly text is blank).
      namaProgram: [jenisAsset, anomali || at("ACTION PLAN")].filter(Boolean).join(": "),
      tanggalTemuan: extractDateOnly(at("TANGGAL TEMUAN")),
      anomaliPemicu: anomali,
      kriteriaBefore: "",
      actionPlan: at("ACTION PLAN"),
      kriteriaAfter: "",
      catatanUpt: "",
      alert: "",
      catatanInduk: "",
      targetWeekLabel: extractWeekLabel(at("TARGET MINGGU")),
      tanggalTarget: extractDateOnly(at("TARGET TANGGAL")),
      realisasiWeekLabel: extractWeekLabel(at("REALISASI MINGGU")),
      tanggalRealisasi: extractDateOnly(at("REALISASI TANGGAL")),
      satuan: "",
      status: at("STATUS"),
      done: at("CLOSE/OPEN").toUpperCase() === "CLOSE",
      periode: at("PERIODE"),
      stream: at("STREAM"),
      linkBaTemuan: at("LINK BA TEMUAN"),
      anggaranLabel: at("ANGGARAN"),
      budget,
    });
  }
  return items;
}

export async function getCeSnapshot(): Promise<CeSnapshot> {
  const results = await readConfiguredSourceRaw(SOURCE);
  const sheet = (name: string) => results.find((r) => r.file === FILE && r.sheet === name)?.rows ?? [];
  const budgets = parseBudget(sheet(BUDGET_SHEET));
  // id = 1000 × sheet position + NO, so ids stay unique across the three
  // sheets (each restarts NO at 1) and stable as rows are appended.
  const items = ULTG_SHEETS.flatMap((name, i) => parseUltgSheet(sheet(name), budgets, (i + 1) * 1000));
  // Whatever is left in the queues matched no item.
  const budgetUnlinked = [...budgets.values()].flat().filter((b) => b.nilai !== null);
  return { items, error: items.length === 0 ? "Data CE belum tersedia." : null, budgetUnlinked };
}
