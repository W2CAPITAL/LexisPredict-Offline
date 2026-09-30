const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const app=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
const css=fs.readFileSync(path.join(__dirname,"..","styles.css"),"utf8");
const proxy=fs.readFileSync(path.join(__dirname,"..","api","wa-auto.js"),"utf8");
const ui=fs.readFileSync(path.join(__dirname,"..","lib","wa-auto.js"),"utf8");

assert.match(html,/data-view="waauto"/);
assert.match(html,/\/lib\/wa-auto\.js/);
assert.match(app,/waauto:\["WHATSAPP","WA\.Auto"\]/);
assert.match(app,/waauto:"\/wa-auto"/);
assert.match(app,/function renderWAAuto\(/);
assert.match(app,/WAAutoModule\.backgroundSync/);
assert.match(app,/WAAutoModule\.syncRows/);

for(const endpoint of [
  "/api/bootstrap",
  "/api/integrations/sheetspredict/status",
  "/api/integrations/sheetspredict/settings",
  "/api/integrations/sheetspredict/sync",
  "/api/legal/scan",
  "/api/whatsapp/connect",
  "/api/whatsapp/pair",
  "/api/test-message",
  "/api/suppressions"
])assert.ok(proxy.includes(endpoint),"proxy WA.Auto sem endpoint: "+endpoint);
assert.match(proxy,/WA_AUTO_URL/);
assert.match(proxy,/privateHost/);
assert.match(proxy,/action==="status"\|\|action==="state"/,"status passivo deve degradar sem 503");
assert.match(proxy,/available:false/,"proxy deve expor indisponibilidade real do upstream");
assert.doesNotMatch(proxy,/body\.url|body\.path/,"browser não deve selecionar upstream arbitrário");

for(const page of ["Campanhas","WhatsApp","Clientes","Histórico","Processos","Configurações"])assert.ok(ui.includes(page),"subtela WA.Auto ausente: "+page);
assert.match(ui,/DJEN \/ DataJud/);
assert.match(ui,/Último Retorno|ultimo_retorno/);
assert.match(ui,/portfolio_sync/);
assert.match(ui,/auto_settings/);
assert.match(ui,/i\+=200/,"carteira deve sincronizar em lotes de 200");
assert.match(ui,/optOut/);
assert.match(ui,/sourceRow/);
assert.match(ui,/Serviço indisponível/);

assert.match(css,/SheetsPredict 4\.1 — WA\.Auto embedded skin/);
for(const cls of [".wa-brandbar",".wa-tabs",".wa-stats",".wa-panel",".wa-preview",".wa-legal-grid",".wa-switch"])assert.ok(css.includes(cls),"skin WA.Auto ausente: "+cls);
assert.match(css,/var\(--surface\)/);
assert.match(css,/var\(--primary\)/);
assert.match(css,/var\(--nav2\)/);

console.log("wa-auto-integration: ok");
