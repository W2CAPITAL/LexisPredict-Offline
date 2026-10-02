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
const cmp=hub.bacenComparison({bacenMonthlyPercent:2.03,bacenAnnualPercent:27.28,contractAnnualPercent:45});
assert.equal(Number(cmp.thresholdMonthlyPercent.toFixed(3)),3.045);
assert.equal(Number(cmp.thresholdAnnualPercent.toFixed(2)),40.92);
assert.equal(cmp.aboveAnnual15x,true);
assert.equal(Number(cmp.bacenEffectiveAnnualPercent.toFixed(6)),27.272519);
assert.ok(cmp.contractMonthlyDerived&&cmp.contractMonthlyPercent>0);
const score=hub.leadScore({quitacao:true,parcela:1600,paid:true,bacenMonthly:2.1});
assert.equal(score.tier,"quente");
const fs=require("node:fs"),path=require("node:path");
const app=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
assert.match(app,/function renderHub\(/);
assert.match(app,/action:"ai_chat"/);
assert.match(app,/action:"wa_send"/);
assert.match(app,/action:"lead_scan"/);
assert.match(app,/action:"bacen"/);
assert.match(app,/Parâmetro 1,5x anual/);
assert.match(app,/hubBacenContractMonthly/);
assert.match(app,/hubBacenContractAnnual/);
assert.match(app,/action:"suggest_response"/);
const api=fs.readFileSync(path.join(__dirname,"..","api","integration-hub.js"),"utf8");
assert.match(api,/requireSession/);
assert.match(api,/requireSameOrigin/);
assert.match(api,/PREDICTLM_API_KEY/);
assert.match(api,/LEXISPREDICT_API_KEY/);
assert.match(api,/remote_key_mismatch/);
assert.match(api,/reachable_auth_unverified/,"health 200 não deve virar falso offline só por metadata remota");
assert.match(api,/optional_not_configured/,"integrações opcionais devem ser neutras");
assert.match(api,/remoteConfigured===true&&remoteAuthorized===false/,"mismatch só deve ser conclusivo quando o destino declara chave configurada");
assert.match(app,/configurados online/,"contador deve excluir integrações opcionais não configuradas");
assert.match(app,/Não configurado \(opcional\)/,"GREY opcional deve aparecer como estado neutro");
assert.match(api,/predictlm",name:"PredictLM",base:predict,path:"\/api\/integration\/sheetspredict"/);
assert.match(api,/\/api\/integration\/sheetspredict/);
assert.match(api,/lexisService/);
assert.match(api,/lexisChatFallback/);
assert.match(api,/suggestResponse/);
assert.match(api,/looksLegalPrompt/);
assert.match(api,/answerScore/);
assert.match(api,/callPredictLm/);
assert.match(api,/lexisAction:"dispatch"/);
assert.match(api,/SHEETSPREDICT_AI_API_KEY/);
assert.match(api,/SHEETSPREDICT_AI_BASE_URL/);
assert.match(api,/predict-learning-pack/);
assert.match(api,/learning\.context/);
assert.match(api,/resolvedPublicUrl/);
assert.match(api,/dns\.lookup/);
assert.match(api,/BACEN_FALLBACKS/);
assert.match(api,/25471/);
assert.match(api,/20749/);
assert.match(api,/officialLinks:BACEN_LINKS/);

for(const repo of ["W2CAPITAL/PredictLm","W2CAPITAL/Wa.Auto","W2CAPITAL/LexisPredict","W1CAPITAL/SyncCRM","W2CAPITAL/LEADCHECKIN","W1CAPITAL/OFFLINE-LEXISPREDICT","W1CAPITAL/Leadcheck","W1CAPITAL/GREY"]){
  assert.ok(api.includes(repo),"fonte ausente: "+repo);
}
console.log("integration-hub: ok");
