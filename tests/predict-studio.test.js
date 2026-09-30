const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");

const catalogJs=fs.readFileSync(path.join(__dirname,"..","lib","predict-studio-catalog.js"),"utf8");
const sandbox={window:{}};
vm.runInNewContext(catalogJs,sandbox);
const c=sandbox.window.PredictStudioCatalog;
assert.ok(c,"catálogo PredictLM deve existir");
const learning=require("../lib/predict-learning-pack.js");
const learningStats=learning.stats();
assert.equal(learningStats.training,146,"snapshot deve conter todo o aprendizado técnico versionado do PredictLM");
assert.equal(learningStats.runtime,3,"snapshot deve conter as lições operacionais promovidas");
assert.equal(learningStats.total,149,"learning pack portátil deve consolidar 149 lições atuais");
assert.ok(learning.context("falha na geração de imagem",{surface:"media",limit:6}).includes("artefato real validado"),"aprendizado de mídia deve ser recuperável");

assert.deepEqual(Array.from(c.surfaces).map(x=>x.id),["chat","legal","build","work","tutor","research","imagine","report"]);
assert.equal(c.skills.length,81,"snapshot deve conter as 81 skills registradas no PredictLM");
assert.equal(c.agents.length,16,"Agent Fabric deve expor 16 papéis");
assert.equal(c.cores.length,4,"Four-core control deve expor Fly/Mouse/Macaque/Human");
assert.ok(c.localRuntimes.length>=10,"Runtime Federation deve listar motores locais");
assert.ok(c.providers.length>=10,"Provider Mesh deve listar providers conhecidos");
assert.ok(c.providers.includes("ashna"),"AshnaAI deve estar no catálogo de providers");
assert.ok(c.fusionRepositories.length>=70,"Capability Fusion deve preservar registry amplo");
assert.ok(c.fusionRepositories.includes("Graphify-Labs/graphify"),"Graphify deve constar na fusão de conhecimento");
for(const id of ["predictlm-master","provider-mesh","runtime-federation","agent-fabric","report-architect","deep-research","tutor-mode","grok-imagine-parity","neurocore","datajud","graphify-brain"]){
  assert.ok(c.skills.some(x=>x.id===id),"skill ausente: "+id);
}

const api=fs.readFileSync(path.join(__dirname,"..","api","predict-studio.js"),"utf8");
for(const route of ["/api/chat","/api/legal/process","/api/legal/dossier","/api/agent","/api/research","/api/media/generate","/api/report-dossier/generate"]){
  assert.ok(api.includes(route),"proxy Predict Studio sem rota: "+route);
}
assert.match(api,/PREDICTLM_URL/);
assert.match(api,/PREDICTLM_API_KEY/);
assert.match(api,/SHEETSPREDICT_AI_API_KEY/);
assert.match(api,/SHEETSPREDICT_AI_BASE_URL/);
assert.match(api,/requireSession/);
assert.match(api,/requireSameOrigin/);
assert.match(api,/ASHNA_API_KEY/);
assert.match(api,/https:\/\/api\.ashna\.ai\/v1\/api/);
assert.match(api,/callAshna/);
assert.match(api,/predict-learning-pack/);
assert.match(api,/action==="learning_pack"/);
assert.match(api,/\/api\/learning\/export/);
assert.match(api,/privateHost/);
assert.doesNotMatch(api,/body\.path|body\.url/,"cliente não pode escolher caminho upstream arbitrário");

const ui=fs.readFileSync(path.join(__dirname,"..","lib","predict-studio.js"),"utf8");
for(const label of ["Chat","Legal","Build","Work","Tutor","Research","Imagine","Report","Skills","Agentes","Plugins","Motores"]){
  assert.ok(ui.includes(label),"aba ausente: "+label);
}
assert.match(ui,/PredictRuntime\.webllmGenerate/);
assert.match(ui,/PredictRuntime\.localGenerate/);
assert.match(ui,/action:"build"/);
assert.match(ui,/action:"research"/);
assert.match(ui,/action:"imagine"/);
assert.match(ui,/action:"report"/);
assert.match(ui,/PredictLearningPack/);
assert.match(ui,/action:"learning_pack"/);
assert.match(ui,/applyRemoteCatalog/);
assert.match(ui,/capabilities\?\.catalog/);
assert.doesNotMatch(ui,/PREDICTLM_ACCESS_TOKEN/);

const runtime=fs.readFileSync(path.join(__dirname,"..","lib","predict-runtime.js"),"utf8");
assert.match(runtime,/Qwen3-1\.7B-q4f16_1-MLC/);
assert.match(runtime,/Qwen3\.5-4B-q4f16_1-MLC/);
assert.match(runtime,/Qwen3\.5-9B-q4f16_1-MLC/);
assert.match(runtime,/Não há varredura automática|Runtime local não configurado|safeLocalUrl/);
assert.match(runtime,/loopback/);

const app=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
assert.match(app,/studio:\["AI FABRIC","Predict Studio"\]/);
assert.match(app,/studio:"\/studio"/);
assert.match(app,/function renderPredictStudio\(/);

const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
assert.match(html,/data-view="studio"/);
for(const asset of ["predict-learning-pack.js","predict-studio-catalog.js","predict-runtime.js","predict-studio.js"])assert.ok(html.includes(asset),"asset ausente: "+asset);

console.log("predict-studio: ok");
