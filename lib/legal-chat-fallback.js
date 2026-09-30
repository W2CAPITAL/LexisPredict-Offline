"use strict";

function digits(v){return String(v||"").replace(/\D/g,"")}
function maskCnj(v){
  const d=digits(v);
  return d.length===20?d.slice(0,7)+"-"+d.slice(7,9)+"."+d.slice(9,13)+"."+d.slice(13,14)+"."+d.slice(14,16)+"."+d.slice(16):String(v||"");
}
function cnjFromText(text){
  const s=String(text||"");
  const m=s.match(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/);
  if(m)return m[0];
  const all=s.match(/\b\d{20}\b/);
  return all?maskCnj(all[0]):"";
}
function dateBr(value){
  if(!value)return "";
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return String(value);
  return d.toLocaleString("pt-BR",{dateStyle:"short",timeStyle:String(value).includes("T")?"short":undefined,timeZone:"America/Sao_Paulo"});
}
function compact(v,max=700){
  const s=String(v||"").replace(/\s+/g," ").trim();
  return s.length<=max?s:s.slice(0,max).trim()+"…";
}
function summarizeJudicialScan(scan,prompt=""){
  const cnj=maskCnj(scan?.cnj||cnjFromText(prompt));
  const dj=scan?.datajud||{},dn=scan?.djen||{},intel=scan?.intelligence||{};
  const lastDj=intel?.datajud?.last||dj?.movimentos?.[0]||null;
  const lastDn=intel?.djen?.latest||dn?.items?.[0]||null;
  const execution=intel?.execution||{};
  const lines=["**"+(cnj||"Processo")+"**"];
  const meta=[
    dj?.tribunal?"Tribunal: **"+dj.tribunal+"**":"",
    dj?.classe?"Classe: **"+dj.classe+"**":"",
    dj?.orgaoJulgador?"Órgão: **"+dj.orgaoJulgador+"**":"",
    dj?.dataAjuizamento?"Ajuizamento: **"+dateBr(dj.dataAjuizamento)+"**":""
  ].filter(Boolean);
  if(meta.length)lines.push(meta.join(" · "));
  if(lastDj){
    lines.push("### Último movimento no DataJud\n**"+dateBr(lastDj.dataHora||lastDj.data)+" — "+compact(lastDj.nome||lastDj.descricao||"Movimentação",240)+"**"+(lastDj.complemento?"\n"+compact(lastDj.complemento,800):""));
  }else if(dj?.message){
    lines.push("### DataJud\n"+compact(dj.message,500));
  }else if(dj?.error){
    lines.push("### DataJud\nA fonte não respondeu nesta tentativa.");
  }
  if(lastDn){
    lines.push("### Publicação DJEN mais recente\n**"+dateBr(lastDn.data_disponibilizacao||lastDn.dataDisponibilizacao||lastDn.data_publicacao)+"** · "+compact(lastDn.tipoComunicacao||lastDn.tipoDocumento||"Publicação",220)+(lastDn.texto?"\n"+compact(lastDn.texto,1000):""));
  }else if(dn&&dn.success===false){
    lines.push("### DJEN\n"+compact(dn.error||"A fonte não respondeu nesta tentativa.",500));
  }
  if(execution?.status&&execution.status!=="INDEFINIDO"){
    const labels={ATIVO:"Há indício de cumprimento/execução ativo.",ENCERRADO:"Há indício de cumprimento/execução encerrado.",CITACAO_APENAS:"Há citação/intimação, sem evidência forte de cumprimento instaurado.",NAO_INSTAURADO:"Não foi detectado sinal forte de cumprimento de sentença nos dados consultados."};
    lines.push("### Leitura operacional\n"+(labels[execution.status]||execution.status));
  }
  const commercial=intel?.commercial;
  if(commercial?.reason)lines.push("### Evidência detectada\n"+compact(commercial.reason,600));
  if(scan?.partial||dj?.error||(dn&&dn.success===false)){
    lines.push("### Limitações\nA consulta ficou parcial. Falha de DataJud/DJEN não significa ausência do processo ou inexistência de ato; confirme o inteiro teor no sistema oficial antes de calcular prazo ou tomar medida.");
  }else{
    lines.push("### Fonte\nConsulta feita pelas integrações DataJud/DJEN do próprio SheetsPredict. Para prazo, recurso ou protocolo, confirme o inteiro teor e a data legal no sistema oficial.");
  }
  return lines.join("\n\n");
}
function dossierHtml(scan){
  const text=summarizeJudicialScan(scan,"");
  const esc=s=>String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
  const html=esc(text).replace(/\n/g,"<br>");
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Dossiê processual SheetsPredict</title><style>body{font-family:Arial,sans-serif;max-width:900px;margin:36px auto;padding:0 24px;color:#17211d;line-height:1.55}h1{color:#0b6f55}main{white-space:normal}footer{margin-top:36px;padding-top:12px;border-top:1px solid #ccc;font-size:12px;color:#667}</style></head><body><h1>Dossiê processual SheetsPredict</h1><main>'+html+'</main><footer>Minuta operacional. Confirme os atos e prazos no sistema oficial.</footer></body></html>';
}
module.exports={cnjFromText,maskCnj,summarizeJudicialScan,dossierHtml};
