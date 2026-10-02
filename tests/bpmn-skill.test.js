const assert=require("node:assert/strict");
const {isBpmnIntent,bpmnContext}=require("../lib/bpmn-skill");
const fs=require("node:fs"),path=require("node:path");

assert.equal(isBpmnIntent("crie um BPMN para atendimento jurídico"),true);
assert.equal(isBpmnIntent("modele um fluxo de prazo com swimlanes"),true);
assert.equal(isBpmnIntent("abra este processo do Camunda"),true);
assert.equal(isBpmnIntent("qual a taxa BACEN do mês?"),false);

const ctx=bpmnContext("faça um BPMN do fluxo DataJud e DJEN");
assert.match(ctx,/SKILL BPMN 2\.0 ATIVA/);
assert.match(ctx,/DataJud\/DJEN/);
assert.match(ctx,/deadlock/);
assert.match(ctx,/skills\/bpmn/);

const studio=fs.readFileSync(path.join(__dirname,"..","api","predict-studio.js"),"utf8");
const hub=fs.readFileSync(path.join(__dirname,"..","api","integration-hub.js"),"utf8");
const catalog=fs.readFileSync(path.join(__dirname,"..","lib","predict-studio-catalog.js"),"utf8");

assert.match(studio,/bpmnContext\(prompt\)/,"Predict Studio deve injetar BPMN por intenção");
assert.match(hub,/bpmnContext\(prompt\)/,"Central Integrada deve injetar BPMN por intenção");
assert.match(catalog,/bpmn-process-modeling/,"catálogo deve expor a skill BPMN");

for(const p of [
  "skills/bpmn/SKILL.md",
  "skills/bpmn/scripts/bpmn-tool.mjs",
  "skills/bpmn/scripts/lib.mjs",
  "skills/bpmn/references/bpmn-reference.md",
  "skills/bpmn/THIRD_PARTY_LICENSE.md"
]) assert.ok(fs.existsSync(path.join(__dirname,"..",p)),"arquivo BPMN ausente: "+p);

console.log("bpmn-skill: ok");
