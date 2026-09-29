/**
 * LexisPredict — menu interno da planilha
 * A aplicação principal roda na Vercel. Este arquivo só adiciona atalhos no Sheets.
 * Não possui doGet/doPost públicos para não colidir com LexisSheet.gs.
 */

var LP_DEFAULT_APP_URL = "https://lexispredict-offline.vercel.app";

function lpAppUrl_() {
  var props = PropertiesService.getScriptProperties();
  return String(props.getProperty("LEXIS_APP_URL") || LP_DEFAULT_APP_URL).trim();
}

function lpCriarMenu() {
  SpreadsheetApp.getUi()
    .createMenu("LexisPredict")
    .addItem("Abrir LexisPredict Web", "lpAbrirSistema")
    .addItem("Mostrar URL do sistema", "lpMostrarLink")
    .addItem("Diagnóstico da integração", "LEXIS_DIAGNOSTICO_ENTRYPOINTS")
    .addToUi();
}

function lpAbrirSistema() {
  var url = lpAppUrl_();
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;padding:18px">' +
      '<h2 style="margin:0 0 10px;color:#102a22">LexisPredict</h2>' +
      '<p>Abra o CRM jurídico web conectado a esta planilha.</p>' +
      '<p><a href="' + url.replace(/"/g, "&quot;") + '" target="_blank" ' +
      'style="display:inline-block;background:#102a22;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:700">Abrir LexisPredict</a></p>' +
      '<p style="font-size:12px;color:#66756d">URL: ' + url.replace(/</g,"&lt;") + '</p>' +
    '</div>'
  ).setWidth(420).setHeight(230);
  SpreadsheetApp.getUi().showModalDialog(html, "LexisPredict");
}

function lpMostrarLink() {
  SpreadsheetApp.getUi().alert("LexisPredict Web\n\n" + lpAppUrl_());
}

/**
 * Mantido apenas para compatibilidade com projetos antigos.
 * O webapp público real é roteado por LexisSheet.gs.
 */
function legacyHtmlDoGet_() {
  var url = lpAppUrl_();
  return HtmlService.createHtmlOutput(
    '<!doctype html><meta charset="utf-8"><title>LexisPredict</title>' +
    '<meta http-equiv="refresh" content="0;url=' + url.replace(/"/g,"&quot;") + '">' +
    '<p><a href="' + url.replace(/"/g,"&quot;") + '">Abrir LexisPredict</a></p>'
  );
}
