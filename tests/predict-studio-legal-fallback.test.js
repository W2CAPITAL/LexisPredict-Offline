const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const fallback=require("../lib/legal-chat-fallback");

assert.equal(fallback.cnjFromText("fale sobre 1003516-37.2024.8.26.0659"),"1003516-37.2024.8.26.0659");
assert.equal(fallback.cnjFromText("processo 10035163720248260659"),"1003516-37.2024.8.26.0659");

const scan={
  cnj:"10035163720248260659",
  partial:true,
  datajud:{
    tribunal:"TJSP",
    classe:"Procedimento Comum Cível",
    orgaoJulgador:"Vara Cível",
    dataAjuizamento:"2024-01-10T00:00:00Z",
    movimentos:[{dataHora:"2026-09-29T12:00:00Z",nome:"Conclusão",complemento:"Autos conclusos para decisão."}]
  },
  djen:{success:false,error:"DJEN temporariamente indisponível"},
  intelligence:{datajud:{last:{dataHora:"2026-09-29T12:00:00Z",nome:"Conclusão",complemento:"Autos conclusos para decisão."}},execution:{status:"NAO_INSTAURADO"},commercial:{reason:"sem polaridade suficiente"}}
};
const summary=fallback.summarizeJudicialScan(scan);
assert.match(summary,/1003516-37\.2024\.8\.26\.0659/);
assert.match(summary,/Conclusão/);
assert.match(summary,/consulta ficou parcial/i);
assert.match(fallback.dossierHtml(scan),/Dossiê processual SheetsPredict/);

const ui=fs.readFileSync(path.join(__dirname,"..","lib","predict-studio.js"),"utf8");
assert.match(ui,/legalCnj:""/,"CNJ legal deve ter estado persistente");
assert.match(ui,/value="'\+e\(S\.legalCnj\|\|""\)\+'"/,"input CNJ deve sobreviver a re-render");
assert.match(ui,/pending=Promise\.resolve\(fn\(\)\);\s*render\(container,host\);\s*await pending/,"run deve capturar inputs antes do re-render");

const api=fs.readFileSync(path.join(__dirname,"..","api","predict-studio.js"),"utf8");
assert.match(api,/localLegalFallback/);
assert.match(api,/SheetsPredict DataJud\/DJEN/);
assert.match(api,/cnjFromText\(payload\.prompt\)/);
console.log("predict-studio-legal-fallback: ok");
