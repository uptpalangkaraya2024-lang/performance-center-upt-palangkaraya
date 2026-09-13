// Entry point. This gateway is a pure data pipe — no KPI/business logic
// lives here (see AGENTS.md section 4). It only knows: find a configured
// file by name, read a configured sheet by name, return JSON.

function doPost(e) {
  var request;
  try {
    request = JSON.parse(e.postData.contents);
  } catch (parseError) {
    return jsonResponse({ success: false, error: { code: 'INVALID_REQUEST', message: 'Body request bukan JSON yang valid.' } });
  }
  return handleAction(request);
}

// Convenience for a quick manual health check straight from a browser
// address bar — e.g. .../exec?action=health.
function doGet(e) {
  var params = (e && e.parameter) || {};
  return handleAction({
    action: params.action || 'health',
    fileName: params.fileName,
    sheetName: params.sheetName,
    secret: params.secret,
  });
}

function handleAction(request) {
  try {
    assertAuthorized(request);

    switch (request.action) {
      case 'health':
        return jsonResponse({ success: true, data: { status: 'healthy' } });

      case 'listFiles':
        return jsonResponse({ success: true, data: listFilesInFolder() });

      case 'findFile':
        requireField(request, 'fileName');
        return jsonResponse({ success: true, data: findFileByName(request.fileName) });

      case 'listSheets':
        requireField(request, 'fileName');
        return jsonResponse({ success: true, data: listSheetNames(findFileByName(request.fileName)) });

      case 'readSheet':
        return jsonResponse(handleReadSheet(request));

      case 'readSheets':
        return jsonResponse(handleReadSheets(request));

      default:
        return jsonResponse({ success: false, error: { code: 'UNKNOWN_ACTION', message: 'Action "' + request.action + '" tidak dikenal.' } });
    }
  } catch (error) {
    return jsonResponse({ success: false, error: normalizeError(error) });
  }
}

function handleReadSheet(request) {
  requireField(request, 'fileName');
  requireField(request, 'sheetName');
  var file = findFileByName(request.fileName);
  var sheetData = readSheetData(file, request.sheetName, request.headerRow);
  return {
    success: true,
    data: sheetData,
    meta: {
      fileName: file.name,
      sheetName: request.sheetName,
      rowCount: sheetData.rows.length,
      retrievedAt: new Date().toISOString(),
    },
  };
}

// `sheets` accepts either a plain sheet-name string (headerRow defaults to
// 1) or { name, headerRow } — added so a caller with several sheets that
// each have their own header-row convention (Gangguan/RENUS's helper row
// above the real header, vs a plain row-1 header) can still batch them
// into one execution instead of one HTTP round trip per sheet. This is
// the ONE Apps Script execution opening the spreadsheet once and reading
// every sheet from it, cutting N round-trip overheads (~1.6-1.8s each,
// confirmed by direct measurement — see the dashboard's own perf
// investigation) down to one.
function handleReadSheets(request) {
  requireField(request, 'fileName');
  requireField(request, 'sheets');
  var file = findFileByName(request.fileName);
  var result = {};
  request.sheets.forEach(function (sheetSpec) {
    var sheetName = typeof sheetSpec === 'string' ? sheetSpec : sheetSpec.name;
    var headerRow = (sheetSpec && sheetSpec.headerRow) || 1;
    try {
      result[sheetName] = readSheetData(file, sheetName, headerRow);
    } catch (sheetError) {
      // Partial result — one bad sheet must not fail the others (AGENTS.md section 11).
      result[sheetName] = { error: normalizeError(sheetError) };
    }
  });
  return { success: true, data: { file: file.name, sheets: result } };
}

function assertAuthorized(request) {
  var configuredSecret = getConfiguredApiSecret();
  if (configuredSecret && request.secret !== configuredSecret) {
    throw { code: 'UNAUTHORIZED', message: 'Secret tidak valid atau tidak disertakan.' };
  }
}

function requireField(request, field) {
  if (!request[field]) {
    throw { code: 'INVALID_REQUEST', message: 'Field "' + field + '" wajib diisi.' };
  }
}

// Never forwards a raw exception's stack/message straight through — Drive/
// Apps Script runtime errors get folded into a generic UPSTREAM_ERROR so
// nothing about the script's internals leaks into the response.
function normalizeError(error) {
  if (error && error.code && error.message) return error;
  return { code: 'UPSTREAM_ERROR', message: 'Terjadi kesalahan tak terduga di gateway.' };
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
