// AHI Riwayat Pengujian — the AHI Input sheets only ever hold each
// equipment's LATEST test result (a re-test overwrites the previous one in
// place, there is no built-in history). This file adds a separate,
// append-only history spreadsheet so a trend can be built up over time —
// see apps-script/README.md "Riwayat Pengujian AHI" for setup steps.
//
// Deliberately mechanical, not business logic: it only compares each row's
// own TANGGAL PEMELIHARAAN TERAKHIR against what was last logged for that
// (BAY, TECHIDENT) pair, and copies the row as-is when it differs. No
// scoring/classification happens here — that stays in the Next.js app
// (AGENTS.md: this gateway is a pure data pipe), which re-parses each
// logged row with the exact same logic it already uses for live data.

var AHI_SOURCE_FILE = 'AHI UPT Palangkaraya 2026 fixed';
var AHI_HISTORY_FILE = 'AHI UPT Palangkaraya - Riwayat Pengujian';

// Input sheet name -> its matching Riwayat sheet name. Each Riwayat sheet
// is seeded with an exact copy of its Input sheet's row 1 + row 2 header,
// so it has the identical column layout and can be read with the same
// 2-row-header parser already used for the Input sheets.
var AHI_HISTORY_SHEET_MAP = {
  'Input LA': 'Riwayat LA',
  'Input PMS': 'Riwayat PMS',
  'Input PT': 'Riwayat PT',
  'Input PMT': 'Riwayat PMT',
  'Input CT': 'Riwayat CT',
};

function normalizeHeaderCell_(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function findColumnExact_(headerRow, label) {
  var needle = normalizeHeaderCell_(label);
  for (var i = 0; i < headerRow.length; i++) {
    if (normalizeHeaderCell_(headerRow[i]) === needle) return i;
  }
  return -1;
}

// TECHIDENT NUMBER's own header text varies slightly per sheet (Input CT's
// is a multi-line "TECHIDENT NUMBER / TID / NO di PST") — prefix match
// mirrors findColStartsWith() in src/services/ahi-bay-line-report.ts.
function findColumnStartsWith_(headerRow, prefix) {
  var needle = normalizeHeaderCell_(prefix);
  for (var i = 0; i < headerRow.length; i++) {
    if (normalizeHeaderCell_(headerRow[i]).indexOf(needle) === 0) return i;
  }
  return -1;
}

// One-time setup — run manually once from the Apps Script editor (select
// "setupAhiHistoryFile" from the function dropdown, click Run). Creates the
// history file if it doesn't exist yet, inside the same monitoring folder
// as everything else, and seeds each Riwayat tab with its Input sheet's own
// header rows. Safe to re-run later (e.g. after adding a 6th equipment
// type) — it only fills in whatever tab is still missing/unseeded.
function setupAhiHistoryFile() {
  var folder = DriveApp.getFolderById(getMonitoringFolderId());
  var historyFile;
  try {
    historyFile = findFileByName(AHI_HISTORY_FILE);
  } catch (notFound) {
    var created = SpreadsheetApp.create(AHI_HISTORY_FILE);
    var file = DriveApp.getFileById(created.getId());
    folder.addFile(file);
    DriveApp.getRootFolder().removeFile(file);
    historyFile = { id: created.getId(), name: created.getName() };
  }

  var sourceFile = findFileByName(AHI_SOURCE_FILE);
  var sourceSpreadsheet = SpreadsheetApp.openById(sourceFile.id);
  var historySpreadsheet = SpreadsheetApp.openById(historyFile.id);

  Object.keys(AHI_HISTORY_SHEET_MAP).forEach(function (inputSheetName) {
    var historySheetName = AHI_HISTORY_SHEET_MAP[inputSheetName];
    var historySheet = historySpreadsheet.getSheetByName(historySheetName);
    if (historySheet && historySheet.getLastRow() > 0) return; // already seeded

    var inputSheet = sourceSpreadsheet.getSheetByName(inputSheetName);
    if (!inputSheet) {
      throw { code: 'SHEET_NOT_FOUND', message: 'Sheet "' + inputSheetName + '" tidak ditemukan di file "' + AHI_SOURCE_FILE + '".' };
    }

    var headerRows = inputSheet.getRange(1, 1, 2, inputSheet.getLastColumn()).getValues();
    if (!historySheet) historySheet = historySpreadsheet.insertSheet(historySheetName);
    historySheet.getRange(1, 1, 2, headerRows[0].length).setValues(headerRows);
  });

  // Cosmetic only — remove the blank "Sheet1" Apps Script creates a brand
  // new spreadsheet with, once the real tabs exist alongside it.
  var defaultSheet = historySpreadsheet.getSheetByName('Sheet1');
  if (defaultSheet && historySpreadsheet.getSheets().length > 1) {
    historySpreadsheet.deleteSheet(defaultSheet);
  }

  Logger.log('AHI history file ready: ' + historySpreadsheet.getUrl());
}

// Time-driven trigger entry point — install via the Apps Script editor's
// Triggers panel (clock icon in the left sidebar): add trigger, function
// "syncAhiHistorySnapshot", event source "Time-driven", e.g. "Day timer".
// Runs independently of the web app deployment and of anyone opening the
// dashboard.
function syncAhiHistorySnapshot() {
  var sourceFile = findFileByName(AHI_SOURCE_FILE);
  var historyFile = findFileByName(AHI_HISTORY_FILE);
  var sourceSpreadsheet = SpreadsheetApp.openById(sourceFile.id);
  var historySpreadsheet = SpreadsheetApp.openById(historyFile.id);

  Object.keys(AHI_HISTORY_SHEET_MAP).forEach(function (inputSheetName) {
    syncOneAhiHistorySheet_(sourceSpreadsheet, historySpreadsheet, inputSheetName, AHI_HISTORY_SHEET_MAP[inputSheetName]);
  });
}

function syncOneAhiHistorySheet_(sourceSpreadsheet, historySpreadsheet, inputSheetName, historySheetName) {
  var inputSheet = sourceSpreadsheet.getSheetByName(inputSheetName);
  var historySheet = historySpreadsheet.getSheetByName(historySheetName);
  // setupAhiHistoryFile() not run yet, or a sheet got renamed — skip this
  // one silently rather than throw, so one missing tab never blocks the
  // other 4 equipment types from still getting synced this run.
  if (!inputSheet || !historySheet) return;

  var inputValues = inputSheet.getDataRange().getValues();
  if (inputValues.length < 3) return; // just the 2 header rows, no data yet

  var row1 = inputValues[0];
  var bayCol = findColumnExact_(row1, 'BAY');
  var techCol = findColumnStartsWith_(row1, 'TECHIDENT');
  var tanggalCol = findColumnExact_(row1, 'TANGGAL PEMELIHARAAN TERAKHIR');
  if (bayCol === -1 || techCol === -1 || tanggalCol === -1) return; // column layout changed unexpectedly — skip rather than guess

  var historyLastRow = historySheet.getLastRow();
  var historyValues = historyLastRow > 2
    ? historySheet.getRange(3, 1, historyLastRow - 2, historySheet.getLastColumn()).getValues()
    : [];

  // Last known TANGGAL PEMELIHARAAN TERAKHIR per (BAY, TECHIDENT) already
  // logged — a plain string-keyed lookup, no equipment grouping or scoring
  // involved (that logic stays in src/services/ahi-bay-line-report.ts).
  var lastKnown = {};
  historyValues.forEach(function (row) {
    var key = String(row[bayCol]) + '||' + String(row[techCol]);
    lastKnown[key] = String(row[tanggalCol]);
  });

  var toAppend = [];
  for (var r = 2; r < inputValues.length; r++) {
    var row = inputValues[r];
    var bay = String(row[bayCol] || '').trim();
    var tech = String(row[techCol] || '').trim();
    if (!bay || !tech) continue; // incomplete row — nothing to key the history on

    var key = bay + '||' + tech;
    var currentTanggal = String(row[tanggalCol] || '');
    if (lastKnown[key] === currentTanggal) continue; // unchanged since last snapshot

    toAppend.push(row);
    lastKnown[key] = currentTanggal; // guards against a duplicate append within this same run
  }

  if (toAppend.length > 0) {
    historySheet.getRange(historySheet.getLastRow() + 1, 1, toAppend.length, toAppend[0].length).setValues(toAppend);
  }
}
