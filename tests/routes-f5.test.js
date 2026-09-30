const assert=require("node:assert/strict");
const cfg=require("../vercel.json");
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

console.log("routes-f5: ok");
