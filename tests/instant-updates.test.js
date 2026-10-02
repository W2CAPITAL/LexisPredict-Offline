const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const app=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");

function block(start,end){
  const a=app.indexOf(start),b=app.indexOf(end,a);
  assert(a>=0,"bloco ausente: "+start);
  return app.slice(a,b>=0?b:app.length);
}

assert.match(app,/function returnStatusForDate\(value\)/,"status por data deve existir");
assert.match(app,/const byDate=returnStatusForDate\(pick\(r,"Próximo Retorno"\)\)/,"Próximo Retorno deve ter prioridade");
assert.match(app,/return"NO PRAZO"/,"data futura deve resultar em NO PRAZO");

const attendance=block("async function saveAttendance()","function historyDate");
assert.doesNotMatch(attendance,/saveRows\(state\.companyRows\)/,"atendimento não deve regravar a carteira inteira");
assert.match(attendance,/scheduleBackgroundFlush\(\)/,"atendimento deve sincronizar em segundo plano");
assert.match(attendance,/renderCurrentView\(\)/,"atendimento deve refletir a alteração imediatamente");
assert.match(attendance,/Situação do Retorno/,"atendimento deve atualizar o status derivado");

const process=block("async function saveProcess()","function exportJson");
assert.doesNotMatch(process,/saveRows\(state\.companyRows\)/,"edição de processo não deve regravar a carteira inteira");
assert.match(process,/scheduleBackgroundFlush\(\)/,"processo deve sincronizar em segundo plano");
assert.match(process,/renderCurrentView\(\)/,"processo deve atualizar a tela antes da rede");
assert.match(process,/Situação do Retorno/,"processo deve persistir o status derivado");

const contacted=block("async function markContacted","function dateInputValue");
assert.doesNotMatch(contacted,/saveRows\(state\.companyRows\)/,"marcar atendimento não deve regravar todo o cache");
assert.match(contacted,/scheduleBackgroundFlush\(\)/);

const crm=block("async function crmWrite","async function syncCRM");
assert.match(crm,/queueCrmWrite/,"CRM deve entrar na outbox antes da rede");
assert.doesNotMatch(crm,/await apiSheets\(\{action:"crm_write"/,"CRM não deve bloquear a UI aguardando rede");

assert.match(app,/if\(pending\.length\)state\.companyRows=mergePending\(state\.companyRows,pending\)/,"reload deve reaplicar patches pendentes");
assert.match(app,/function renderCurrentView\(\)/,"render leve da view deve existir");
assert.match(app,/scheduleNotificationRefresh\(\)/,"notificações pesadas devem ser adiadas");

console.log("instant-updates: ok");
