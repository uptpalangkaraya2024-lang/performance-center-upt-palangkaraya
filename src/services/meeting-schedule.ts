import "server-only";

import { dataSources } from "@/config/data-sources";
import { readConfiguredSourceRaw } from "@/lib/data-connector";
import type { MeetingAgendaBlock, MeetingAgendaItem, MeetingScheduleData } from "@/types";

const SOURCE = dataSources.meetingSchedule;
const EXPECTED_FILE = SOURCE.sources[0].file;
const EXPECTED_SHEET = SOURCE.sources[0].sheets[0].name;

function text(cell: unknown): string {
  return String(cell ?? "").trim();
}

/**
 * "AGENDA CEKPOIN RUTIN UPT" stacks 7 named blocks (e.g. "CHECK POINT
 * MINGGUAN UPT DENGAN ULTG") in one sheet, each with its own repeated
 * header row (NO/AGENDA/JADWAL/METODE/KETERANGAN/PIC) — confirmed live no
 * single header row works for the whole sheet, and blocks are NOT always
 * separated by a blank row (one block's data rows run straight into the
 * next block's own title row). Column A is a blank margin column in every
 * row, confirmed live — real data starts at column B (index 1).
 *
 * Detection is purely shape-based, no fixed row numbers (this sheet's own
 * layout is no more guaranteed stable than any other in this app):
 *  - A row with ONLY column B filled (every other column blank) is a
 *    TITLE-shaped row — either a block title, or (for the sheet's own
 *    2-row heading at the very top) just noise that gets harmlessly
 *    overwritten before the first real block starts.
 *  - A row whose column B reads "NO" is a HEADER row — opens a new block
 *    using whatever title-shaped row was seen most recently.
 *  - Any other non-blank row is a DATA row: column B holds a number for a
 *    numbered agenda item, or is blank for a sub-item continuation line
 *    (e.g. "- Cleansing data aset EAM" nested under a numbered item).
 */
function parseAgendaBlocks(rows: unknown[][]): MeetingAgendaBlock[] {
  const blocks: MeetingAgendaBlock[] = [];
  let current: MeetingAgendaBlock | null = null;
  let pendingTitle: string | null = null;

  for (const row of rows) {
    const col1 = text(row[1]);
    const rest = [2, 3, 4, 5, 6].map((i) => text(row[i]));
    const allRestBlank = rest.every((c) => c === "");

    if (col1 === "" && allRestBlank) continue; // fully blank separator row

    if (col1.toUpperCase() === "NO") {
      current = { title: pendingTitle ?? "Lainnya", items: [] };
      blocks.push(current);
      pendingTitle = null;
      continue;
    }

    if (col1 !== "" && allRestBlank) {
      pendingTitle = col1;
      continue;
    }

    if (!current) continue; // data-shaped row before any header seen yet — ignore, not a real agenda item

    const item: MeetingAgendaItem = {
      no: /^\d+$/.test(col1) ? Number(col1) : null,
      agenda: rest[0],
      jadwal: rest[1] || null,
      metode: rest[2] || null,
      keterangan: rest[3] || null,
      pic: rest[4] || null,
    };
    current.items.push(item);
  }

  return blocks;
}

export async function getMeetingSchedule(): Promise<MeetingScheduleData> {
  const results = await readConfiguredSourceRaw(SOURCE);
  const sheet = results.find((r) => r.file === EXPECTED_FILE && r.sheet === EXPECTED_SHEET);
  if (!sheet) {
    return { blocks: [], error: `Gagal membaca sheet "${EXPECTED_SHEET}" dari file "${EXPECTED_FILE}" — lihat halaman Data & Sync.` };
  }

  const blocks = parseAgendaBlocks(sheet.rows);
  return { blocks, error: blocks.length === 0 ? "Belum ada agenda yang terbaca dari sheet ini." : null };
}
