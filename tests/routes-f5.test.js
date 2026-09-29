const assert=require("node:assert/strict");
const cfg=require("../vercel.json");
const rewrites=Array.isArray(cfg.rewrites)?cfg.rewrites:[];
const map=new Map(rewrites.map(r=>[r.source,r.destination]));
for(const route of ["/","/cases","/processos","/report","/scanner","/tarefas","/clientes"]){
  assert.equal(map.get(route),"/index.html","missing SPA rewrite for "+route);
}
assert.equal(rewrites.some(r=>String(r.source).startsWith("/api")),false,"SPA rewrites must not capture /api");
console.log("routes-f5: ok");