const assert=require("node:assert/strict");
const {scopeRows,ownerMatches}=require("../lib/sheet-scope");

const rows=[
 {Assistente:"ADRIANA",CreatedBy:"ADRIANA",Protocolo:"1"},
 {Assistente:"ADRIANA",CreatedBy:"",Protocolo:"2"},
 {Assistente:"ADRIANA/drika",CreatedBy:"",Protocolo:"3"},
 {Assistente:"DAVI ALVES FIGUEREDO",CreatedBy:"",Protocolo:"4"},
 {Assistente:"DAVI ALVES FIGUEREDO/DRIKA",CreatedBy:"",Protocolo:"5"},
 {Assistente:"KRIS",CreatedBy:"",Protocolo:"6"},
];
assert.equal(scopeRows(rows,{nome:"ADRIANA",perfil:"assistente"}).length,3);
assert.equal(scopeRows(rows,{nome:"DAVI ALVES FIGUEREDO",perfil:"assistente"}).length,2);
assert.equal(scopeRows(rows,{nome:"DRIKA",perfil:"assistente"}).length,2);
assert.equal(scopeRows(rows,{nome:"KRIS",perfil:"assistente"}).length,1);
assert.equal(scopeRows(rows,{nome:"GESTOR",perfil:"supervisor"}).length,6);
assert.equal(scopeRows(rows,{nome:"ADRIANA",perfil:"assistente"},"company").length,6);
assert.equal(scopeRows(rows,{nome:"KRIS",perfil:"assistente"},"company").length,6);
assert.equal(scopeRows(rows,null,"company").length,0);
assert.equal(ownerMatches({Assistente:"ADRIANA",CreatedBy:"OUTRO"},{nome:"ADRIANA",perfil:"assistente"}),true);
console.log("sheet-scope: ok");
