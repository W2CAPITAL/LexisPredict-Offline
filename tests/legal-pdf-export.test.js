const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const root=path.join(__dirname,"..");
const index=fs.readFileSync(path.join(root,"index.html"),"utf8");
const gen=fs.readFileSync(path.join(root,"lib","legal-document-generator.js"),"utf8");
const css=fs.readFileSync(path.join(root,"styles.css"),"utf8");
const sw=fs.readFileSync(path.join(root,"sw.js"),"utf8");

assert.match(index,/jspdf@4\.2\.1\/dist\/jspdf\.umd\.min\.js/,"jsPDF deve estar carregado no shell");
assert.match(gen,/async function downloadPdfDocument\(/,"gerador deve produzir PDF diretamente");
assert.match(gen,/doc\.save\(/,"PDF deve baixar por save(), sem popup");
assert.doesNotMatch(gen,/window\.open\(/,"exportação jurídica não deve depender de window.open");
assert.match(gen,/async function ensureJsPdf\(/,"deve haver fallback de carregamento do jsPDF");
assert.match(gen,/function officeBrand\(/,"timbre deve ser normalizado em uma função própria");
assert.match(gen,/function normalizeLogo\(/,"logo opcional deve ser validado e normalizado");
assert.match(gen,/officeName:""/,"estado deve persistir nome do escritório");
assert.match(gen,/logoDataUrl:""/,"estado deve persistir logo opcional");
assert.match(gen,/id="lgLogoFile"/,"UI deve permitir carregar logo");
assert.match(gen,/id="lgPdf"/,"UI deve ter botão direto de PDF");
assert.match(gen,/PDF timbrado baixado com sucesso/,"UI deve confirmar download");
assert.match(gen,/rtfDocument\(/,"RTF também deve receber timbre textual");
assert.match(css,/\.legalgen-letterhead-preview/,"editor deve exibir prévia do timbre");
assert.match(css,/\.legalgen-paper-foot-preview/,"editor deve exibir rodapé da peça");
assert.match(sw,/sheetspredict-v59/,"cache PWA deve avançar para a versão do PDF timbrado");

console.log("legal-pdf-export: ok");
