const assert=require("node:assert/strict");
const p=require("../lib/task-priority");
const s=require("../lib/suggest-response");
const rows=[
 {Cliente:"Calmo",Protocolo:"1",Status:"No Prazo","Último Retorno":"28/09/2026","Próximo Retorno":"10/10/2026"},
 {Cliente:"Vencido",Protocolo:"2",Status:"Vencido","Próximo Retorno":"20/09/2026"},
 {Cliente:"Novidade",Protocolo:"3",Status:"No Prazo","Nova Atualização":"SIM","Último Andamento":"Juntada de petição"},
 {Cliente:"Mérito",Protocolo:"4",Status:"No Prazo","Tipo de Evento":"sentenca_improcedente","Último Andamento":"Sentença improcedente"}
];
const sorted=[...rows].sort((a,b)=>p.compare(a,b,new Date("2026-09-29T12:00:00-03:00")));
assert.equal(sorted[0].Cliente,"Mérito");
assert.equal(sorted[1].Cliente,"Novidade");
assert.equal(sorted[2].Cliente,"Vencido");
assert.ok(p.scoreCase(sorted[0]).score>p.scoreCase(sorted[3]).score);
const suggestions=s.suggestResponses({row:{Cliente:"Maria Silva",Protocolo:"0000000-00.0000.0.00.0000","Último Andamento":"Sentença improcedente"}});
assert.match(suggestions[0].texto,/desfavorável/i);
assert.match(suggestions[0].texto,/Maria/);
console.log("task-priority/suggest-response: ok");