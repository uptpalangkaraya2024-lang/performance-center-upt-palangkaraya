var NATIVE_SHEET_MIME = 'application/vnd.google-apps.spreadsheet';

// LIMITATION (documented, not silently swallowed — see AGENTS.md section 12/36):
// Apps Script's SpreadsheetApp only opens native Google Sheets. It cannot
// read .xlsx/.xls binary files directly, and this gateway deliberately does
// NOT auto-convert them (that would create a duplicate temp file on every
// read, burning Drive quota and risking staleness — the exact trade-off
// AGENTS.md section 12 warns against). For a real .xlsx file, either:
//   (a) keep DATA_PROVIDER=google-api for it (that reader parses .xlsx directly), or
//   (b) convert it once in Drive: right-click the file > Open with > Google Sheets,
//       or File > Save as Google Sheets from within Excel Online/Drive preview.
function assertNativeSheet(fileMeta) {
  if (fileMeta.mimeType !== NATIVE_SHEET_MIME) {
    throw {
      code: 'UNSUPPORTED_FORMAT',
      message: 'File "' + fileMeta.name + '" bukan Google Sheets native — gateway Apps Script hanya mendukung Google Sheets, bukan .xlsx/.xls. Gunakan DATA_PROVIDER=google-api untuk file ini, atau convert ke Google Sheets.',
    };
  }
}

// getValues() auto-boxes any date/time-formatted cell (a real date AND a
// pure duration like "17:17:56" alike) into a JS Date. Left as-is, the web
// app's JSON.stringify would serialize that via toISOString() — which
// re-renders in UTC and, for a cell that's really just a TIME-OF-DAY
// duration (no meaningful calendar date attached), shifts the hour/day by
// the spreadsheet-vs-UTC offset and corrupts it. Formatting explicitly with
// the spreadsheet's OWN timezone here keeps the wall-clock value correct
// regardless of what the cell actually represents — see parseDurationMinutes()
// in src/lib/parse.ts, which extracts just the HH:mm:ss part for a duration cell.
function formatCellValue(value, timeZone) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, timeZone, 'yyyy-MM-dd HH:mm:ss');
  }
  return value;
}

// headerRow is 1-indexed (matches how a human reads the sheet) — some
// spreadsheets have a helper row (e.g. numbered column references) above
// the real header row, hence this isn't always row 1.
function readSheetData(fileMeta, sheetName, headerRow) {
  assertNativeSheet(fileMeta);

  var spreadsheet = SpreadsheetApp.openById(fileMeta.id);
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    throw { code: 'SHEET_NOT_FOUND', message: 'Sheet "' + sheetName + '" tidak ditemukan di file "' + fileMeta.name + '".' };
  }

  // Only THIS sheet's used range is read — every other tab in the file
  // (Pivot, Dashboard, Backup, ...) is never touched (AGENTS.md section 10).
  var timeZone = spreadsheet.getSpreadsheetTimeZone();
  var values = sheet.getDataRange().getValues().map(function (row) {
    return row.map(function (cell) { return formatCellValue(cell, timeZone); });
  });
  var headerIndex = Math.max(0, (headerRow || 1) - 1);
  if (values.length <= headerIndex) return { headers: [], rows: [] };

  var headers = values[headerIndex].map(function (header) { return String(header || '').trim(); });
  var rows = values.slice(headerIndex + 1);
  return { headers: headers, rows: rows };
}

function listSheetNames(fileMeta) {
  assertNativeSheet(fileMeta);
  var spreadsheet = SpreadsheetApp.openById(fileMeta.id);
  return spreadsheet.getSheets().map(function (sheet) { return sheet.getName(); });
}
