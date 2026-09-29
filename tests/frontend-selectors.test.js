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
console.log("frontend-selectors: ok");
