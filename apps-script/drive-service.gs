// A folder can hold a shortcut instead of the file itself (Drive's own "Add
// shortcut to Drive") — a shortcut's own id/mimeType are for the shortcut
// object, which has no readable content, so resolve to whatever it actually
// points at before this file is ever used.
function resolveShortcut(file) {
  var mimeType = file.getMimeType();
  if (mimeType !== MimeType.SHORTCUT) {
    return { id: file.getId(), name: file.getName(), mimeType: mimeType };
  }
  return { id: file.getTargetId(), name: file.getName(), mimeType: file.getTargetMimeType() };
}

// Root-level only, deliberately — no recursive subfolder search (see
// AGENTS.md section 31; add a breadth-first walk here later if ever needed).
function listFilesInFolder() {
  var folder = DriveApp.getFolderById(getMonitoringFolderId());
  var files = [];
  var iterator = folder.getFiles();
  while (iterator.hasNext()) {
    files.push(resolveShortcut(iterator.next()));
  }
  return files;
}

var SPREADSHEET_EXTENSION_PATTERN = /\.(xlsx|xls)$/i;

// A configured name like "Kinerja ULTG" must match both a native Google
// Sheet named exactly that AND a file literally named "Kinerja ULTG.xlsx" —
// mirrors normalizeFileName() in src/services/google-drive.ts so both
// providers resolve the same configured name the same way.
function normalizeFileName(name) {
  return name.replace(SPREADSHEET_EXTENSION_PATTERN, '').trim().toLowerCase();
}

function findFileByName(fileName) {
  var files = listFilesInFolder();
  var target = normalizeFileName(fileName);
  var matches = files.filter(function (file) {
    return normalizeFileName(file.name) === target;
  });

  if (matches.length === 0) {
    throw { code: 'FILE_NOT_FOUND', message: 'File "' + fileName + '" tidak ditemukan di folder Google Drive.' };
  }
  if (matches.length > 1) {
    // Picking one silently would make the dashboard's data source
    // non-deterministic — an admin needs to rename/remove the duplicate.
    throw {
      code: 'AMBIGUOUS_SOURCE',
      message: matches.length + ' file bernama "' + fileName + '" ditemukan — hapus atau ganti nama salah satunya agar tidak ambigu.',
    };
  }
  return matches[0];
}
