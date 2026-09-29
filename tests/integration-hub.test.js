const assert=require("node:assert/strict");
require("../lib/sheets-hub.js");
const hub=globalThis.SheetsHub;
assert.ok(hub,"SheetsHub deve ser exposto");
assert.equal(hub.sources.length,8,"Central Integrada deve registrar os 8 repositórios-fonte");
const rows=[
  {Protocolo:"1000000-00.2026.8.26.0001",Cliente:"A",Assistente:"DAVI",Tribunal:"TJSP",Telefone:"11999999999","Próximo Retorno":"30/09/2026","DataJud • Último Movimento":"Conclusão"},
  {Protocolo:"1000000-00.2026.8.26.0001",Cliente:"A",Assistente:"DAVI",Tribunal:"TJSP",Telefone:"11999999999","Próximo Retorno":"30/09/2026"},
  {Protocolo:"invalido",Cliente:"",Assistente:"",Tribunal:"TJSP",Telefone:"","Próximo Retorno":""}
];
const audit=hub.audit(rows);
assert.equal(audit.duplicates,1);
assert.equal(audit.invalidCnj,1);
assert.equal(audit.missingClient,1);
assert.ok(audit.mapping.find(x=>x.field==="Protocolo"&&x.confidence>=80));
const est=hub.revisionalEstimate({currentInstallment:1500,bacenMonthlyPercent:1.97,months:48,assumedSpreadPp:.4});
assert.ok(est&&est.bacenInstallment>0&&est.monthlySavings>=0);
const score=hub.leadScore({quitacao:true,parcela:1600,paid:true,bacenMonthly:2.1});
assert.equal(score.tier,"quente");
const fs=require("node:fs"),path=require("node:path");
const app=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
assert.match(app,/function renderHub\(/);
assert.match(app,/action:"ai_chat"/);
assert.match(app,/action:"wa_send"/);
assert.match(app,/action:"lead_scan"/);
assert.match(app,/action:"bacen"/);
const api=fs.readFileSync(path.join(__dirname,"..","api","integration-hub.js"),"utf8");
for(const repo of ["W2CAPITAL/PredictLm","W2CAPITAL/Wa.Auto","W2CAPITAL/LexisPredict","W1CAPITAL/SyncCRM","W2CAPITAL/LEADCHECKIN","W1CAPITAL/OFFLINE-LEXISPREDICT","W1CAPITAL/Leadcheck","W1CAPITAL/GREY"]){
  assert.ok(api.includes(repo),"fonte ausente: "+repo);
}
console.log("integration-hub: ok");
