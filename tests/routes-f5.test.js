const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const cfg=require("../vercel.json");
const app=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const rewrites=Array.isArray(cfg.rewrites)?cfg.rewrites:[];
assert.equal(rewrites[0]?.source,"/api/(.*)","API passthrough deve vir antes do fallback SPA");
assert.equal(rewrites[0]?.destination,"/api/$1","API passthrough deve preservar Vercel Functions");
assert.equal(rewrites.at(-1)?.source,"/(.*)","deve haver fallback SPA global");
assert.equal(rewrites.at(-1)?.destination,"/index.html","fallback SPA deve servir index.html");
for(const route of ["/","/cases","/processos","/report","/scanner","/tarefas","/clientes","/agenda","/financeiro","/central","/studio","/wa-auto","/documentos","/configuracoes"]){
  const covered=rewrites.some(r=>r.source==="/*"||r.source==="/(.*)"||r.source===route);
  assert.equal(covered,true,"SPA fallback missing for "+route);
}

const sheetsApi=fs.readFileSync(path.join(__dirname,"..","api","sheets.js"),"utf8");
assert.match(sheetsApi,/res\.status\(202\)\.json\(\{ok:false,transient:true,degraded:true/,"timeouts de gravação não devem voltar como 503");
assert.match(sheetsApi,/const timeoutMs=action==="legacy_list"\?25000:action==="list"\?12000:action==="auto"\?7000:10000/,"bridge deve usar timeouts curtos por tipo de leitura");
assert.match(sheetsApi,/setTimeout\(\(\)=>ctrl\.abort\(\),timeoutMs\)/,"bridge deve aplicar o timeout calculado ao AbortController");
assert.match(app,/scheduleSheetRecovery/,"cliente deve reconectar automaticamente após timeout transitório");


const bridgeAuth=fs.readFileSync(path.join(__dirname,"..","lib","bridge-auth.js"),"utf8");
assert.match(bridgeAuth,/transient:true/,"timeout de validação deve ser transitório e não 401");
assert.match(bridgeAuth,/status:401,reason:"expired_session"/,"401 deve ficar reservado para sessão realmente expirada");
assert.match(sheetsApi,/auth\.transient\|\|Number\(auth\.status\)>=500/,"api/sheets deve preservar sessão em falha transitória");


const bridgeAuth2=fs.readFileSync(path.join(__dirname,"..","lib","bridge-auth.js"),"utf8");
const installer=fs.readFileSync(path.join(__dirname,"..","installer-script.txt"),"utf8");
assert.match(bridgeAuth2,/createHmac\("sha256"/,"sessão deve ser validável localmente sem roundtrip ao Apps Script");
assert.match(sheetsApi,/action==="session"/,"api/sheets deve expor validação local de sessão");
assert.match(sheetsApi,/list_compact/,"listagem deve usar transporte compacto");
assert.match(app,/pageSize=600/,"carteira deve carregar em páginas menores");
assert.match(installer,/function listCompactAction_/,"installer deve oferecer listagem compacta");
assert.match(installer,/function readRowsCompact_/,"installer deve ler apenas a página necessária");

assert.match(sheetsApi,/APPS_SCRIPT_ROUTE_MISMATCH/,"bridge deve identificar rota publicada incompatível");
assert.match(sheetsApi,/APPS_SCRIPT_LEGACY_FAILED/,"bridge deve sinalizar falha do modo legado sem apagar a carteira");
assert.match(app,/syncJitter/,"sincronização multiusuário deve ter jitter");
assert.match(installer,/faltam menos de 2 horas/,"sessão do Apps Script não deve ser regravada a cada página");

assert.doesNotMatch(app,/const blocked=await initUpdateGuard\(\);\s*if\(blocked\)return/,"guard de atualização não pode abortar o boot");
assert.match(app,/await initUpdateGuard\(\);/,"guard deve ser inicializado sem encerrar o boot");
assert.match(app,/if\(state\.updateLock\)return;\s*startAutoSync\(\)/,"cache deve renderizar antes do bloqueio de atualização");

assert.doesNotMatch(app,/\$\("\[data-new-record\]"\)\.forEach/,"dashboard não pode chamar forEach em $; use $");
assert.match(app,/\$\$\("\[data-new-record\]"\)\.forEach/,"dashboard deve bindar todos os botões com $");
assert.match(app,/localStorage\.setItem\(RELEASE_SEEN_KEY,String\(state\.updateTarget\)\)/,"adiar update deve impedir o mesmo release de bloquear novamente");
assert.match(app,/if\(pendingWrites\|\|pendingCrm\)[\s\S]*Atualização adiada/,"update com pendências deve ser adiado sem forçar flush");

assert.doesNotMatch(app,/\$\("\[data-new-record\]"\)\.forEach/,"selector unitário não pode usar forEach");
assert.match(app,/\$\$\("\[data-new-record\]"\)\.forEach/,"botões de novo cadastro devem usar seletor múltiplo");

assert.match(sheetsApi,/legacy_list/,"bridge antigo deve ter fallback de compatibilidade");
assert.match(sheetsApi,/legacyBridge:true/,"fallback deve sinalizar modo legado");
assert.match(app,/modo de compatibilidade/,"UI deve informar compatibilidade sem bloquear a carteira");
console.log("routes-f5: ok");
