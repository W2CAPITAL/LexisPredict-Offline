const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const app=fs.readFileSync(require("node:path").join(__dirname,"..","app.js"),"utf8");
assert.equal(app.includes("$$$("),false,"app.js contém selector $$$ inexistente");
assert.match(app,/const \$\$=s=>\[\.\.\.document\.querySelectorAll\(s\)\]/,"helper $$ deve existir");
assert.doesNotMatch(app,/(?<!\$)\$\([^\n]*?\)\.forEach/,"listas não podem usar querySelector singular");
for(const count of [0,3]){
  const buttons=Array.from({length:count},(_,i)=>({dataset:{view:i===0?"report":"dashboard",goto:"report"},classList:{toggle(name,on){this.active=on}}}));
  const elements={};
  const context={document:{querySelector:s=>elements[s]??={},querySelectorAll:()=>buttons,addEventListener(){}},location:{pathname:"/"},history:{pushState(){}}};
  vm.createContext(context);
  vm.runInContext(app.replace('document.addEventListener("DOMContentLoaded",boot);','render=()=>{};globalThis.test={setView,bindGotos,mergeQueuedWrite,judicialWritePatch};'),context);
  context.test.setView("report");
  context.test.bindGotos();
  for(const b of buttons)assert.equal(typeof b.onclick,"function");
  if(count){assert.equal(buttons[0].classList.active,true);assert.equal(buttons[1].classList.active,false);buttons[2].onclick();}
  const event={nome:"Conclusão",codigo:51,dataHora:"2026-09-28T09:00:00"};
  const row={Protocolo:"0000001-00.2026.8.26.0001"};
  const patch=context.test.judicialWritePatch(row,{patch:{Andamento:"Conclusão","Publicação DJEN":"duplicado","Erro / Observação":""},datajud:{movimentos:[event]},djen:{items:[]}});
  assert.equal(Object.hasOwn(patch,"Publicação DJEN"),false);
  assert.equal(Object.hasOwn(patch,"Erro / Observação"),false);
  const merged=context.test.mergeQueuedWrite([patch],{...row,AtendidoPor:"Teste"});
  assert.equal(merged._JudicialHistory.datajud.length,1,"atendimento posterior não apaga histórico pendente");
  assert.equal(merged.Andamento,"Conclusão");
  assert.equal(context.test.mergeQueuedWrite([merged],patch)._JudicialHistory.datajud.length,1);
}

assert.match(app,/PAGE_DEFAULT=200/,"listas grandes devem iniciar em 200 registros");
assert.match(app,/data-load-more/,"deve existir controle Ver +200");
assert.match(app,/data-page-input/,"deve aceitar quantidade explícita para carregar");
assert.doesNotMatch(app,/slice\(0,1800\)/,"Processos da empresa não pode voltar ao corte fixo de 1800");
assert.doesNotMatch(app,/slice\(0,3000\)/,"Clientes não deve renderizar milhares de linhas de uma vez");
assert.match(app,/calendar-grid/,"Agenda deve ser calendário e não apenas tabela");
assert.match(app,/mode:djenWasPaused\?"datajud":"both"/,"DJEN pausado deve deixar DataJud continuar");

assert.doesNotMatch(app,/"atendido_em":nowIso/,"atendimento não deve exigir coluna técnica atendido_em para confirmar a escrita");
assert.match(app,/Sincronizando atendimento com a aba Processos/,"atendimento deve priorizar a escrita principal");
assert.match(app,/bridge 8\.2/,"falha de histórico deve orientar atualização explícita do Apps Script");

console.log("frontend-selectors: ok");
