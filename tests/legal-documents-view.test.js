const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const root=path.join(__dirname,"..");
const index=fs.readFileSync(path.join(root,"index.html"),"utf8");
const app=fs.readFileSync(path.join(root,"app.js"),"utf8");
const sw=fs.readFileSync(path.join(root,"sw.js"),"utf8");

assert.match(index,/data-view="documentos"/,"menu deve expor Peças jurídicas");
assert.match(index,/src="\/lib\/legal-document-generator\.js"/,"shell deve carregar o gerador jurídico");
assert.doesNotMatch(index,/Report<\/span><\/button>\\n\s*<button[^>]+data-view="documentos"/,"menu não deve conter escape literal \\n");

assert.match(app,/documentos:\["DOCUMENTOS","Peças jurídicas"\]/,"view deve ter título próprio");
assert.match(app,/documentos:"\/documentos"/,"view deve ter rota própria");
assert.match(app,/else if\(state\.view==="documentos"\)renderLegalDocuments\(\)/,"renderer principal deve abrir a view documentos");
assert.match(app,/function renderLegalDocuments\(\)/,"renderer jurídico deve existir");
assert.match(app,/window\.SheetsLegalDocuments\.render/,"renderer deve invocar o módulo carregado");

assert.match(sw,/sheetspredict-v52/,"cache PWA deve avançar quando a view jurídica muda");
assert.match(sw,/\/lib\/legal-document-generator\.js/,"service worker deve cachear o módulo jurídico");

console.log("legal-documents-view: ok");
