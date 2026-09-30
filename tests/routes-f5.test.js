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
for(const route of ["/","/cases","/processos","/report","/scanner","/tarefas","/clientes","/agenda","/financeiro","/central","/studio","/wa-auto","/configuracoes"]){
  const covered=rewrites.some(r=>r.source==="/*"||r.source==="/(.*)"||r.source===route);
  assert.equal(covered,true,"SPA fallback missing for "+route);
}

const sheetsApi=fs.readFileSync(path.join(__dirname,"..","api","sheets.js"),"utf8");
assert.match(sheetsApi,/res\.status\(202\)\.json\(\{ok:false,transient:true,degraded:true/,"timeouts de gravação não devem voltar como 503");
assert.match(sheetsApi,/setTimeout\(\(\)=>ctrl\.abort\(\),10000\)/,"bridge não deve bloquear a UI por dezenas de segundos");
assert.match(app,/scheduleSheetRecovery/,"cliente deve reconectar automaticamente após timeout transitório");


const bridgeAuth=fs.readFileSync(path.join(__dirname,"..","lib","bridge-auth.js"),"utf8");
assert.match(bridgeAuth,/transient:true/,"timeout de validação deve ser transitório e não 401");
assert.match(bridgeAuth,/status:401,reason:"expired_session"/,"401 deve ficar reservado para sessão realmente expirada");
assert.match(sheetsApi,/check\.transient\|\|Number\(check\.status\)>=500/,"api/sheets deve preservar sessão em falha transitória");


const bridgeAuth2=fs.readFileSync(path.join(__dirname,"..","lib","bridge-auth.js"),"utf8");
const installer=fs.readFileSync(path.join(__dirname,"..","installer-script.txt"),"utf8");
assert.match(bridgeAuth2,/createHmac\("sha256"/,"sessão deve ser validável localmente sem roundtrip ao Apps Script");
assert.match(sheetsApi,/action==="session"/,"api/sheets deve expor validação local de sessão");
assert.match(sheetsApi,/list_compact/,"listagem deve usar transporte compacto");
assert.match(app,/pageSize=600/,"carteira deve carregar em páginas menores");
assert.match(installer,/function listCompactAction_/,"installer deve oferecer listagem compacta");
assert.match(installer,/function readRowsCompact_/,"installer deve ler apenas a página necessária");
console.log("routes-f5: ok");
