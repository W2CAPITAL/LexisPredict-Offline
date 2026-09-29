/**
 * LexisPredict — router único do projeto Apps Script
 *
 * ESTE deve ser o único arquivo com onOpen(), doGet() e doPost().
 * Arquivos esperados:
 * - Code.gs -> scannerOnOpen_ + scanner DataJud/DJEN V6
 * - LEXIS-SYNC-AppsScript.gs -> syncOnOpen_, syncDoGet_, syncDoPost_
 * - LexisApp.gs -> lpCriarMenu(), legacyHtmlDoGet_()
 */

var LEXIS_ENTRYPOINT_VERSION = "1.3.0";

function onOpen(e) {
  try { if (typeof scannerOnOpen_ === "function") scannerOnOpen_(e); } catch (err) { console.error("scannerOnOpen_", err); }
  try { if (typeof syncOnOpen_ === "function") syncOnOpen_(e); } catch (err) { console.error("syncOnOpen_", err); }
  try { if (typeof lpCriarMenu === "function") lpCriarMenu(); } catch (err) { console.error("lpCriarMenu", err); }
}

function doGet(e) {
  if (typeof syncDoGet_ === "function") return syncDoGet_(e);
  return ContentService
    .createTextOutput(JSON.stringify({
      ok:false,
      error:"LEXIS-SYNC-AppsScript.gs não carregado ou syncDoGet_ ausente.",
      router:LEXIS_ENTRYPOINT_VERSION
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  if (typeof syncDoPost_ === "function") return syncDoPost_(e);
  return ContentService
    .createTextOutput(JSON.stringify({
      ok:false,
      error:"LEXIS-SYNC-AppsScript.gs não carregado ou syncDoPost_ ausente.",
      router:LEXIS_ENTRYPOINT_VERSION
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

function LEXIS_GERAR_TOKEN_ENV() {
  var raw = Utilities.getUuid() + "|" + Utilities.getUuid() + "|" + new Date().getTime();
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    raw,
    Utilities.Charset.UTF_8
  );
  var token = Utilities.base64EncodeWebSafe(bytes).replace(/=+$/,"");
  PropertiesService.getScriptProperties().setProperty("LEXIS_SHEETS_TOKEN", token);
  console.log("LEXIS_SHEETS_TOKEN=" + token);
  return "LEXIS_SHEETS_TOKEN=" + token;
}

function LEXIS_TOKEN_STATUS() {
  var token = String(PropertiesService.getScriptProperties().getProperty("LEXIS_SHEETS_TOKEN") || "").trim();
  var status = {
    configured: !!token,
    length: token.length,
    preview: token ? token.substring(0,6) + "…" + token.substring(token.length-4) : ""
  };
  console.log(JSON.stringify(status));
  return status;
}

function LEXIS_CONFIGURAR_APP_URL() {
  var ui = SpreadsheetApp.getUi();
  var current = String(PropertiesService.getScriptProperties().getProperty("LEXIS_APP_URL") || "").trim();
  var r = ui.prompt(
    "LexisPredict Web",
    "Cole a URL da Vercel do LexisPredict Offline:" + (current ? "\nAtual: " + current : ""),
    ui.ButtonSet.OK_CANCEL
  );
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var url = String(r.getResponseText() || "").trim();
  if (!/^https:\/\//i.test(url)) throw new Error("Use uma URL HTTPS.");
  PropertiesService.getScriptProperties().setProperty("LEXIS_APP_URL", url.replace(/\/$/,""));
  ui.alert("URL salva: " + url.replace(/\/$/,""));
}

function LEXIS_DIAGNOSTICO_ENTRYPOINTS() {
  var token = "";
  try { token = String(PropertiesService.getScriptProperties().getProperty("LEXIS_SHEETS_TOKEN") || "").trim(); } catch (_) {}
  var out = {
    router: LEXIS_ENTRYPOINT_VERSION,
    scannerMenu: typeof scannerOnOpen_ === "function",
    syncMenu: typeof syncOnOpen_ === "function",
    syncGet: typeof syncDoGet_ === "function",
    syncPost: typeof syncDoPost_ === "function",
    internalUiMenu: typeof lpCriarMenu === "function",
    legacyHtml: typeof legacyHtmlDoGet_ === "function",
    tokenConfigured: !!token,
    tokenLength: token.length
  };
  console.log(JSON.stringify(out));
  try {
    SpreadsheetApp.getUi().alert(
      "LexisPredict • Diagnóstico\n\n" +
      Object.keys(out).map(function(k){return k + ": " + out[k];}).join("\n")
    );
  } catch (_) {}
  return out;
}
