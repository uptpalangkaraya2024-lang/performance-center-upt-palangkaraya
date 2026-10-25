// RENUS -> iCalendar (.ics) feed (feature #5) — turns the outage schedule
// into a subscribable calendar feed (RFC 5545) so staff see upcoming padam
// dates directly in whatever calendar app they already use (Google
// Calendar, Apple Calendar, Outlook "subscribe by URL"), no new app to
// install. Pure string building, no external ics library — the format is
// simple enough, and this is the only place in the app that needs it.
import { isRenusCancelled } from "@/lib/renus-helpers";
import type { RenusRow } from "@/types";

function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

// RFC 5545 §3.1: a content line should be folded at 75 octets, continued
// lines prefixed with a single space after the line break.
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  let result = line.slice(0, 75);
  let rest = line.slice(75);
  while (rest.length > 0) {
    result += "\r\n " + rest.slice(0, 74);
    rest = rest.slice(74);
  }
  return result;
}

function dtDate(iso: string): string {
  return iso.replace(/-/g, "");
}

function dtDateTime(iso: string, hms: string): string {
  return `${iso.replace(/-/g, "")}T${hms.replace(/:/g, "")}`;
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Builds one VCALENDAR with one VEVENT per non-cancelled RENUS row that
 *  has a RENCANA date — cancelled rows are excluded since a subscriber's
 *  calendar app has no way to show a "cancelled" overlay, it would just
 *  read as a real event. A row with both padamStart and padamEnd becomes a
 *  timed event in Asia/Jakarta; otherwise an all-day event (DTEND is the
 *  day AFTER rencanaDate per RFC 5545's own exclusive-end convention for
 *  DATE values). */
export function buildRenusIcs(rows: RenusRow[]): string {
  const lines: string[] = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//Performance Center UPT Palangkaraya//RENUS//ID");
  lines.push("CALSCALE:GREGORIAN");
  lines.push("METHOD:PUBLISH");
  lines.push("X-WR-CALNAME:Jadwal Padam RENUS - UPT Palangkaraya");
  lines.push("X-WR-TIMEZONE:Asia/Jakarta");
  lines.push("REFRESH-INTERVAL;VALUE=DURATION:PT6H");

  const dtstamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  for (const row of rows) {
    if (isRenusCancelled(row)) continue;
    if (!row.rencanaDate) continue;

    lines.push("BEGIN:VEVENT");
    // row.id already carries its own "renus-" prefix (e.g. "renus-3") — not
    // re-prefixed again here.
    lines.push(`UID:${row.id}@upt-palangkaraya.performance-center`);
    lines.push(`DTSTAMP:${dtstamp}`);
    if (row.padamStart && row.padamEnd) {
      lines.push(`DTSTART;TZID=Asia/Jakarta:${dtDateTime(row.rencanaDate, row.padamStart)}`);
      lines.push(`DTEND;TZID=Asia/Jakarta:${dtDateTime(row.rencanaDate, row.padamEnd)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${dtDate(row.rencanaDate)}`);
      lines.push(`DTEND;VALUE=DATE:${dtDate(addDaysIso(row.rencanaDate, 1))}`);
    }
    lines.push(foldLine(`SUMMARY:${icsEscape(`Padam - ${row.gi} - ${row.bay}`)}`));
    const descParts = [row.workDetail, row.pic ? `PIC: ${row.pic}` : null, row.risk ? `Risiko: ${row.risk}` : null].filter(
      (p): p is string => Boolean(p),
    );
    // Escape each part BEFORE joining with the ICS line-break escape
    // ("\n", two literal characters, not a real newline) — escaping the
    // already-joined string would double-escape that join's own backslash
    // into "\\n", corrupting the line break in every calendar client.
    if (descParts.length > 0) lines.push(foldLine(`DESCRIPTION:${descParts.map(icsEscape).join("\\n")}`));
    // row.gi already reads e.g. "GI 150 KV PALANGKARAYA" (the sheet's own
    // "GI"/"GIS" prefix is part of the stored value, unlike the already-
    // stripped GI names used elsewhere in this app) — used as-is, not
    // re-prefixed with another "GI ".
    lines.push(foldLine(`LOCATION:${icsEscape(row.gi)}`));
    // docLink is a plain non-blank-cell check (requireText), not a URL
    // validation — confirmed live the sheet also uses this same column for
    // placeholder text like "BELUM ADA" when no document exists yet, which
    // would otherwise land in RFC 5545's URL property as an invalid URI.
    if (row.docLink && /^https?:\/\//i.test(row.docLink)) lines.push(foldLine(`URL:${icsEscape(row.docLink)}`));
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
