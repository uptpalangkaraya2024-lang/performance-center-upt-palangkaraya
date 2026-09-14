import "server-only";

import { dataSources } from "@/config/data-sources";
import { readConfiguredSourceRaw } from "@/lib/data-connector";
import type { CeItem, CeSnapshot } from "@/types";

const SOURCE = dataSources.ceProteksi;
const FILE = SOURCE.sources[0].file;
const SHEET = "🏭 INPUT CE PKY";

function textAt(row: unknown[] | undefined, col: number): string {
  if (!row || col < 0 || col >= row.length) return "";
  return String(row[col] ?? "").trim();
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toUpperCase();
}

function findCol(row: unknown[], label: string): number {
  const needle = normalize(label);
  return row.findIndex((c) => normalize(String(c ?? "")) === needle);
}

function extractWeekLabel(raw: string): string | null {
  const m = /^[TR]\s+(.+)$/.exec(raw.trim());
  return m ? m[1].trim() : null;
}

function extractDateOnly(raw: unknown): string | null {
  const text = String(raw ?? "").trim();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  return m ? m[1] : null;
}

/** "🏭 INPUT CE PKY" is a flat list — no block/LM structure. The real
 *  header isn't on the sheet's literal row 1 (that's a helper row with
 *  month labels for a pivot area) — found here by content match (a row
 *  containing both "No" and "Periode"), not a fixed index, since this
 *  file's layout has already proven no more stable than ABO's own INPUT
 *  PKY turned out to be. A row is a real finding only if its own "No" is
 *  numeric AND either Nama Program or GARDU INDUK is non-blank — confirmed
 *  live that ~35% of numbered rows are empty placeholders (a numeric ID
 *  with every other field blank). */
function parseCeSheet(rows: unknown[][]): CeItem[] {
  let headerIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (findCol(row, "No") !== -1 && findCol(row, "Periode") !== -1) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex === -1) return [];

  const header = rows[headerIndex];
  const col = {
    id: findCol(header, "No"),
    ultg: findCol(header, "ULTG"),
    gardu: findCol(header, "GARDU INDUK"),
    bay: findCol(header, "NAMA_BAY"),
    span: findCol(header, "NAMA_SPAN/TOWER"),
    jenisAsset: findCol(header, "Jenis_Asset"),
    indikator: findCol(header, "Indikator"),
    phasa: findCol(header, "PHASA"),
    namaProgram: findCol(header, "Nama Program"),
    anomaliPemicu: findCol(header, "ANOMALI_PEMICU"),
    kriteriaBefore: findCol(header, "KRITERIA BEFORE"),
    actionPlan: findCol(header, "ACTION PLAN UNIT"),
    kriteriaAfter: findCol(header, "KRITERIA AFTER"),
    catatanUpt: findCol(header, "CATATAN UPT"),
    alert: findCol(header, "ALERT"),
    catatanInduk: findCol(header, "CATATAN INDUK"),
    targetMinggu: findCol(header, "TARGET MINGGU"),
    tanggalTarget: findCol(header, "TANGGAL TARGET"),
    realisasiMinggu: findCol(header, "REALISASI MINGGU"),
    tanggalRealisasi: findCol(header, "TANGGAL REALISASI"),
    satuan: findCol(header, "Satuan"),
    status: findCol(header, "STATUS"),
    clsOpn: findCol(header, "CLS/OPN"),
  };

  const items: CeItem[] = [];
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const idText = textAt(row, col.id);
    if (!/^\d+$/.test(idText)) continue;
    const namaProgram = textAt(row, col.namaProgram);
    const gardu = textAt(row, col.gardu);
    if (!namaProgram && !gardu) continue; // empty placeholder row

    items.push({
      id: Number(idText),
      ultg: textAt(row, col.ultg),
      gardu,
      bay: textAt(row, col.bay),
      span: textAt(row, col.span),
      jenisAsset: textAt(row, col.jenisAsset),
      indikator: textAt(row, col.indikator),
      phasa: textAt(row, col.phasa),
      namaProgram,
      anomaliPemicu: textAt(row, col.anomaliPemicu),
      kriteriaBefore: textAt(row, col.kriteriaBefore),
      actionPlan: textAt(row, col.actionPlan),
      kriteriaAfter: textAt(row, col.kriteriaAfter),
      catatanUpt: textAt(row, col.catatanUpt),
      alert: textAt(row, col.alert),
      catatanInduk: textAt(row, col.catatanInduk),
      targetWeekLabel: extractWeekLabel(textAt(row, col.targetMinggu)),
      tanggalTarget: extractDateOnly(row[col.tanggalTarget]),
      realisasiWeekLabel: extractWeekLabel(textAt(row, col.realisasiMinggu)),
      tanggalRealisasi: extractDateOnly(row[col.tanggalRealisasi]),
      satuan: textAt(row, col.satuan),
      status: textAt(row, col.status),
      done: textAt(row, col.clsOpn).toUpperCase() === "CLOSE",
    });
  }
  return items;
}

export async function getCeSnapshot(): Promise<CeSnapshot> {
  const results = await readConfiguredSourceRaw(SOURCE);
  const sheet = results.find((r) => r.file === FILE && r.sheet === SHEET);
  const items = sheet ? parseCeSheet(sheet.rows) : [];
  return { items, error: items.length === 0 ? "Data CE Proteksi belum tersedia." : null };
}
