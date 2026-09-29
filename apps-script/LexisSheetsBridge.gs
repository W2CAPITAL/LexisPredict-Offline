/**
 * LexisPredict — ENTRYPOINT ÚNICO do projeto Apps Script
 *
 * Este arquivo deve ser o ÚNICO lugar com:
 *   - function doGet(e)
 *   - function doPost(e)
 *   - function onOpen(e)
 *
 * Arquivos esperados no mesmo projeto:
 *   Code.gs                    -> scanner V6, com onOpen renomeado para scannerOnOpen_
 *   LEXIS-SYNC-AppsScript.gs   -> sync/CRM, com doGet/doPost/onOpen renomeados para
 *                                 syncDoGet_, syncDoPost_, syncOnOpen_
 *   LexisApp.gs                -> UI interna, com doGet renomeado para legacyHtmlDoGet_
 *   LexisSheet.gs              -> ESTE router
 *
 * O Vercel injeta LEXIS_SHEETS_TOKEN server-side em /api/sheets.
 * O Apps Script valida o mesmo valor em Script Properties.
 */

var LEXIS_ENTRYPOINT_VERSION = "1.2.0";

function onOpen(e) {
  // Cada módulo adiciona seu menu, sem competir pelo mesmo onOpen.
  try { if (typeof scannerOnOpen_ === "function") scannerOnOpen_(e); } catch (err) { console.error("scannerOnOpen_", err); }
  try { if (typeof syncOnOpen_ === "function") syncOnOpen_(e); } catch (err) { console.error("syncOnOpen_", err); }
  try { if (typeof lpCriarMenu === "function") lpCriarMenu(); } catch (err) { console.error("lpCriarMenu", err); }
}

function doGet(e) {
  // O app principal é o Vercel. O /exec funciona como API/health-check.
  // Rotas de sync/list/get ficam no adaptador LEXIS-SYNC.
  if (typeof syncDoGet_ === "function") return syncDoGet_(e);
  return ContentService
    .createTextOutput(JSON.stringify({
      ok: false,
      error: "LEXIS-SYNC-AppsScript.gs não carregado ou não foi renomeado para syncDoGet_.",
      router: LEXIS_ENTRYPOINT_VERSION
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  if (typeof syncDoPost_ === "function") return syncDoPost_(e);
  return ContentService
    .createTextOutput(JSON.stringify({
      ok: false,
      error: "LEXIS-SYNC-AppsScript.gs não carregado ou não foi renomeado para syncDoPost_.",
      router: LEXIS_ENTRYPOINT_VERSION
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Diagnóstico manual: execute no editor do Apps Script.
 * Retorna quais módulos/entrypoints estão disponíveis.
 */
function LEXIS_DIAGNOSTICO_ENTRYPOINTS() {
  var out = {
    router: LEXIS_ENTRYPOINT_VERSION,
    scannerMenu: typeof scannerOnOpen_ === "function",
    syncMenu: typeof syncOnOpen_ === "function",
    syncGet: typeof syncDoGet_ === "function",
    syncPost: typeof syncDoPost_ === "function",
    internalUiMenu: typeof lpCriarMenu === "function",
    legacyHtml: typeof legacyHtmlDoGet_ === "function",
    tokenConfigured: false
  };
  try {
    out.tokenConfigured = !!String(PropertiesService.getScriptProperties().getProperty("LEXIS_SHEETS_TOKEN") || "").trim();
  } catch (_) {}
  console.log(JSON.stringify(out));
  return out;
}
