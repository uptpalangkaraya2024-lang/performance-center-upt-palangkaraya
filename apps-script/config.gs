// Script Properties — set these under Project Settings > Script Properties
// in the Apps Script editor, never hard-code them here. See apps-script/README.md.

function getMonitoringFolderId() {
  var folderId = PropertiesService.getScriptProperties().getProperty('MONITORING_FOLDER_ID');
  if (!folderId) {
    throw { code: 'CONFIGURATION_ERROR', message: 'Script Property "MONITORING_FOLDER_ID" belum diset.' };
  }
  return folderId;
}

// Optional — returns null if not configured, in which case the secret check
// in Code.gs is skipped entirely (opt-in, not required).
function getConfiguredApiSecret() {
  return PropertiesService.getScriptProperties().getProperty('API_SECRET') || null;
}
