const {fetchDataJud,analyzeDataJud,digits:digitsDj}=require("./datajud");
const {
  fetchDjenByCnj,sortRecent,classifyEventFromText,summarizeDjenKeywords,
  badgeAtoCriticoDjen,extractCpfFromDjenText,extractVeiculoFromDjenText,
  detectNewCommunication
}=require("./djen");

const EXEC_CLASSES=new Set([156,157,12078,12231,12246,15159,1111]);
const BANK_RE=/\b(BANCO|FINANCEIRA|CR[EÉ]DITO|CREDITO|CAIXA ECON[ÔO]MICA|COOPERATIVA DE CR[EÉ]DITO|SANTANDER|BRADESCO|ITA[ÚU]|SAFRA|C6|PAN|BV|BMG|DAYCOVAL|MERCANTIL|SICOOB|SICREDI)\b/i;
const EXEC_STRONG_RE=/CUMPRIMENTO\s+(?:PROVIS[ÓO]RIO\s+)?DE\s+SENTEN[CÇ]A|FASE\s+DE\s+CUMPRIMENTO|IN[IÍ]CIO\s+DO\s+CUMPRIMENTO|REQUERIMENTO\s+DE\s+CUMPRIMENTO|PETI[CÇ][AÃ]O\s+DE\s+CUMPRIMENTO|EXECU[CÇ][AÃ]O\s+DE\s+SENTEN[CÇ]A|ART\.?\s*523|PAGAMENTO\s+VOLUNT[AÁ]RIO|IMPUGNA[CÇ][AÃ]O\s+AO\s+CUMPRIMENTO|PENHORA|SISBAJUD|BACENJUD|RENAJUD|BLOQUEIO\s+JUDICIAL|HOMOLOGA[CÇ][AÃ]O\s+DE\s+C[AÁ]LCULOS|LIQUIDA[CÇ][AÃ]O\s+DE\s+SENTEN[CÇ]A|ALVAR[AÁ]\s+DE\s+LEVANTAMENTO/i;
const EXEC_END_RE=/EXTIN[CÇ][AÃ]O\s+DO\s+CUMPRIMENTO|CUMPRIMENTO\s+(?:DE\s+SENTEN[CÇ]A\s+)?EXTINTO|EXTINTO\s+O\s+CUMPRIMENTO|SATISFA[CÇ][AÃ]O\s+DA\s+OBRIGA[CÇ][AÃ]O|OBRIGA[CÇ][AÃ]O\s+SATISFEITA|QUITA[CÇ][AÃ]O\s+DO\s+D[EÉ]BITO|QUITADO\s+O\s+D[EÉ]BITO|ACORDO\s+(?:INTEGRALMENTE\s+)?CUMPRIDO|BAIXA\s+DO\s+CUMPRIMENTO|ARQUIVAMENTO\s+DO\s+CUMPRIMENTO/i;
const CITATION_RE=/\bCITA[CÇ][AÃ]O\b|\bCITE-SE\b|\bCITADO\b|\bINTIMA[CÇ][AÃ]O\b/i;
const TRANSIT_RE=/TR[AÂ]NSITO\s+EM\s+JULGADO|CERTID[AÃ]O\s+DE\s+TR[AÂ]NSITO|TRANSITO\s+EM\s+JULGADO/i;
const CREDIT_CLIENT_RE=/CONDENO\s+(?:O\s+)?(?:R[EÉ]U|BANCO|FINANCEIRA).*PAGAR|OBRIGA[CÇ][AÃ]O\s+DE\s+PAGAR|RESTITUI[CÇ][AÃ]O|DEVOLU[CÇ][AÃ]O|INDENIZA[CÇ][AÃ]O|REPETI[CÇ][AÃ]O\s+DE\s+IND[EÉ]BITO|HONOR[AÁ]RIOS.*(?:A\s+CARGO\s+D[OA]\s+R[EÉ]U|PELO\s+R[EÉ]U)|PAGAR\s+AO\s+AUTOR|R\$\s*\d/i;
const ADVERSE_CLIENT_RE=/JULGO\s+IMPROCEDENTE|SENTEN[CÇ]A\s+IMPROCEDENTE|PEDIDOS?\s+IMPROCEDENTES?|HONOR[AÁ]RIOS.*A\s+CARGO\s+D[OA]\s+AUTOR|AUTOR\s+ARCAR[AÁ]?.*HONOR|SUCUMBENTE\s+O\s+AUTOR|CONDENO\s+(?:O\s+)?AUTOR.*PAGAR/i;
const BA_BANK_WIN_RE=/BUSCA\s+E\s+APREENS[AÃ]O[\s\S]{0,180}(?:PROCEDENTE|DEFERID|CONCEDID|LIMINAR)|CONSOLIDA[CÇ][AÃ]O\s+DA\s+PROPRIEDADE|PROPRIEDADE.*CONSOLIDAD[AA]\s+EM\s+FAVOR\s+D[OA]\s+CREDOR/i;
const CLIENT_WIN_RE=/JULGO\s+PROCEDENTE|JULGADOS?\s+PROCEDENTES?|PARCIALMENTE\s+PROCEDENTE|PROCEDENTE\s+EM\s+PARTE|ACOLHO\s+OS\s+PEDIDOS/i;
const BANK_WIN_RE=/JULGO\s+IMPROCEDENTE|SENTEN[CÇ]A\s+IMPROCEDENTE|PEDIDOS?\s+IMPROCEDENTES?|BA_BANK_WIN_SENTINEL/i;

function latestDataJudText(m){
  if(!m)return "";
  return [m.nome,m.complemento].filter(Boolean).join(" — ").trim();
}
function latestDjenText(item){
  if(!item)return "";
  return [item.tipoComunicacao,item.tipoDocumento,item.nomeOrgao,item.texto].filter(Boolean).join(" — ").slice(0,4000);
}
function isoNow(){return new Date().toISOString()}
function norm(v){
  return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z0-9 ]+/g," ").replace(/\s+/g," ").trim();
}
function textBlob(datajud,djen){
  const mov=(datajud?.movimentos||[]).slice(0,80).map(m=>[m?.nome,m?.complemento,m?.descricao].filter(Boolean).join(" "));
  const pubs=(djen?.items||[]).slice(0,30).map(x=>[x?.tipoComunicacao,x?.tipoDocumento,x?.nomeOrgao,x?.texto].filter(Boolean).join(" "));
  return [...mov,...pubs,datajud?.classe,datajud?.orgaoJulgador].filter(Boolean).join(" || ");
}
function nameMatch(client,candidate){
  const a=norm(client),b=norm(candidate);
  if(!a||!b)return false;
  if(a===b||a.includes(b)||b.includes(a))return true;
  const at=a.split(" ").filter(x=>x.length>2),bt=new Set(b.split(" ").filter(x=>x.length>2));
  if(!at.length)return false;
  const hits=at.filter(x=>bt.has(x)).length;
  return hits>=Math.min(2,at.length)&&hits/at.length>=0.55;
}
function partySide(datajud,cliente){
  const ativo=Array.isArray(datajud?.poloAtivo)?datajud.poloAtivo:[],passivo=Array.isArray(datajud?.poloPassivo)?datajud.poloPassivo:[];
  let clienteLado="INDEFINIDO";
  if(cliente&&ativo.some(n=>nameMatch(cliente,n)))clienteLado="ATIVO";
  else if(cliente&&passivo.some(n=>nameMatch(cliente,n)))clienteLado="PASSIVO";
  let bancoLado="INDEFINIDO";
  const ativoBanco=ativo.some(n=>BANK_RE.test(String(n||""))),passivoBanco=passivo.some(n=>BANK_RE.test(String(n||"")));
  if(ativoBanco&&!passivoBanco)bancoLado="ATIVO";
  else if(passivoBanco&&!ativoBanco)bancoLado="PASSIVO";
  return {clienteLado,bancoLado,ativo,passivo};
}
function combinedMerit(datajud,djen){
  const dj=datajud&&!datajud.error?analyzeDataJud(datajud,null):null;
  const blob=textBlob(datajud,djen);
  if(/PARCIALMENTE\s+PROCEDENTE|PROCEDENTE\s+EM\s+PARTE/i.test(blob))return "parcial";
  if(ADVERSE_CLIENT_RE.test(blob))return "improcedente";
  if(CLIENT_WIN_RE.test(blob))return "procedente";
  return dj?.merit?.tipo||null;
}
function detectExecution(datajud,djen){
  const blob=textBlob(datajud,djen);
  const classHit=EXEC_CLASSES.has(Number(datajud?.classeCodigo||0));
  const strong=classHit||EXEC_STRONG_RE.test(blob);
  const ended=strong&&EXEC_END_RE.test(blob);
  const citation=CITATION_RE.test(blob);
  const transit=(datajud?.movimentos||[]).some(m=>Number(m?.codigo||0)===848)||TRANSIT_RE.test(blob);
  let status="INDEFINIDO";
  if(ended)status="ENCERRADO";
  else if(strong)status="ATIVO";
  else if(citation)status="CITACAO_APENAS";
  else status="NAO_INSTAURADO";
  return {status,strong,ended,citationOnly:citation&&!strong,transit,blob};
}
function determineFavoredSide({datajud,djen,cliente}){
  const ctx=partySide(datajud,cliente),merit=combinedMerit(datajud,djen),blob=textBlob(datajud,djen);
  const isBA=/BUSCA\s+E\s+APREENS[AÃ]O|ALIENA[CÇ][AÃ]O\s+FIDUCI[AÁ]RIA/i.test(blob);
  let winnerSide="INDEFINIDO",favorecido="INDEFINIDO",confidence=35,reason="sem polaridade suficiente";
  if(merit==="procedente"||merit==="parcial"){winnerSide="ATIVO";confidence=merit==="procedente"?82:68;reason=merit==="procedente"?"mérito procedente":"mérito parcialmente procedente"}
  else if(merit==="improcedente"){winnerSide="PASSIVO";confidence=84;reason="mérito improcedente"}
  if(isBA&&BA_BANK_WIN_RE.test(blob)){
    favorecido="BANCO";confidence=Math.max(confidence,90);reason="busca e apreensão/garantia com sinal favorável ao credor";
  }else if(winnerSide!=="INDEFINIDO"){
    if(ctx.clienteLado===winnerSide){favorecido="CLIENTE";confidence=Math.max(confidence,88);reason+=" • lado do cliente identificado"}
    else if(ctx.bancoLado===winnerSide){favorecido="BANCO";confidence=Math.max(confidence,88);reason+=" • lado bancário identificado"}
    else if(ctx.clienteLado!=="INDEFINIDO"&&ctx.clienteLado!==winnerSide){favorecido="BANCO";confidence=Math.max(confidence,76);reason+=" • resultado contrário ao lado do cliente"}
  }
  if(favorecido==="INDEFINIDO"){
    if(CREDIT_CLIENT_RE.test(blob)&&!ADVERSE_CLIENT_RE.test(blob)){favorecido="CLIENTE";confidence=72;reason="texto indica crédito/obrigação a favor do autor/consumidor"}
    else if(ADVERSE_CLIENT_RE.test(blob)){favorecido="BANCO";confidence=72;reason="texto indica improcedência/sucumbência do autor"}
  }
  return {...ctx,merit,winnerSide,favorecido,confidence,reason,isBA};
}
function commercialDecision({datajud,djen,cliente}){
  const execution=detectExecution(datajud,djen);
  const side=determineFavoredSide({datajud,djen,cliente});
  const blob=execution.blob;
  const credit=CREDIT_CLIENT_RE.test(blob);
  let decision="REVISAR",product="SEM OFERTA AUTOMÁTICA",reason=side.reason;
  if(side.favorecido==="BANCO"){
    decision="NÃO VENDER";product="NÃO VENDER • BANCO FAVORECIDO";
  }else if(execution.status==="ENCERRADO"){
    decision="NÃO VENDER";product="NÃO VENDER • CUMPRIMENTO ENCERRADO/SATISFEITO";reason="fase executiva encerrada ou obrigação satisfeita";
  }else if(execution.status==="CITACAO_APENAS"){
    decision="REVISAR";product="SEM OFERTA • APENAS CITAÇÃO/INTIMAÇÃO";reason="há citação/intimação, sem evidência forte de cumprimento instaurado";
  }else if(side.favorecido==="CLIENTE"&&credit&&execution.status==="ATIVO"){
    decision="POTENCIAL";product="DIREITO/CRÉDITO EM CUMPRIMENTO • REVISAR CESSÃO";reason="cliente favorecido + crédito econômico + cumprimento instaurado";
  }else if(side.favorecido==="CLIENTE"&&credit&&execution.status==="NAO_INSTAURADO"){
    decision="POTENCIAL";product="CUMPRIMENTO / HONORÁRIOS • AVALIAR INSTAURAÇÃO";reason="cliente favorecido + crédito econômico sem cumprimento instaurado";
  }else if(side.favorecido==="CLIENTE"){
    decision="REVISAR ANTES DE VENDER";product="CLIENTE FAVORECIDO • VALIDAR CRÉDITO ECONÔMICO";reason="resultado favorável ao cliente, mas crédito negociável não está claro";
  }else if(execution.status==="ATIVO"){
    decision="REVISAR";product="CUMPRIMENTO ATIVO • IDENTIFICAR EXEQUENTE";reason="cumprimento instaurado, mas lado favorecido ainda não foi confirmado";
  }
  const evidence=[
    "cumprimento="+execution.status,
    "favorecido="+side.favorecido,
    "mérito="+(side.merit||"indefinido"),
    "cliente="+side.clienteLado,
    "banco="+side.bancoLado,
    credit?"crédito econômico detectado":"crédito econômico não confirmado"
  ];
  return {execution,side,decision,product,reason,evidence,confidence:Math.min(100,Math.round((side.confidence+(execution.strong?85:50))/2))};
}
function analyzeDjen(items){
  const sorted=sortRecent(items),latest=sorted[0]||null,text=latest?.texto||"";
  return {
    latest,
    event:latest?classifyEventFromText(text):null,
    keywords:latest?summarizeDjenKeywords(text):[],
    critical:latest?badgeAtoCriticoDjen(text):{critico:false,tipo:null},
    cpf:latest?extractCpfFromDjenText(text):null,
    veiculo:latest?extractVeiculoFromDjenText(text):{placa:null,renavam:null,veiculo:null}
  };
}
function buildSheetPatch({datajud,djen,ultimoRetorno,lastDjenId,lastDjenDate,cliente}){
  const dj=datajud&&!datajud.error?analyzeDataJud(datajud,ultimoRetorno):null;
  const dn=djen?.success?analyzeDjen(djen.items):null;
  const commercial=commercialDecision({datajud,djen,cliente});
  const lastDj=dj?.last||null,lastDn=dn?.latest||null;
  const source=[lastDj?"DataJud":null,lastDn?"DJEN":null].filter(Boolean).join(" + ")||"";
  const errors=[];
  if(datajud?.error)errors.push(datajud.message||"DataJud indisponível");
  if(djen&&!djen.success)errors.push(djen.error||"DJEN indisponível");
  const djenNew=dn?detectNewCommunication({id:lastDjenId||"",data:lastDjenDate||""},djen.items||[]):{nova:false,latest:null};
  const novo=!!(dj?.update?.alerta||djenNew.nova);
  const execEvent=commercial.execution.status==="ATIVO"?"cumprimento_ativo":
    commercial.execution.status==="ENCERRADO"?"cumprimento_encerrado":
    commercial.execution.status==="CITACAO_APENAS"?"citacao":(dn?.event||"");
  return {
    "DataJud • Último Movimento":latestDataJudText(lastDj),
    "DataJud • Data":lastDj?.dataHora||"",
    "DJEN • Última Publicação":latestDjenText(lastDn),
    "DJEN • Data":lastDn?.data_disponibilizacao||"",
    "Resumo DJEN":lastDn?.texto?String(lastDn.texto).slice(0,900):"",
    "Nova Atualização":novo?"SIM":"NÃO",
    "Fonte":source,
    "Última Sincronização":isoNow(),
    "Automação":errors.length?"PARCIAL":"OK",
    "Erro / Observação":errors.join(" | "),
    "_DataJudKey":lastDj?.hash||"",
    "_DJENId":String(lastDn?.id||lastDn?.hash||""),
    "_DJENDate":lastDn?.data_disponibilizacao||"",
    "Tipo de Evento":execEvent,
    "Novo Andamento":dj?.update?.alerta?"SIM":"NAO",
    "Encerrado no Tribunal":dj?.closed?.encerrado?"SIM":"NAO",
    "Procedente":commercial.side.merit==="procedente"||commercial.side.merit==="parcial"?"SIM":"NAO",
    "Improcedente":commercial.side.merit==="improcedente"?"SIM":"NAO",
    "Publicação DJEN":latestDjenText(lastDn),
    "_ExecStatus":commercial.execution.status,
    "_Favorecido":commercial.side.favorecido,
    "_CommercialReason":commercial.reason,
    "_CommercialConfidence":commercial.confidence,
    "_CommercialEvidence":commercial.evidence.join(" • ")
  };
}
async function scanJudicial({cnj,tribunal,ultimoRetorno,lastDjenId,lastDjenDate,dataInicio,dataFim,mode="both",cliente}={}){
  const d=digitsDj(cnj);
  if(d.length!==20)return {ok:false,error:"CNJ inválido: esperado 20 dígitos"};
  let datajud=null,djen=null;
  if(mode==="both"||mode==="datajud")datajud=await fetchDataJud(d,{fast:false});
  if(mode==="both"||mode==="djen")djen=await fetchDjenByCnj(d,{siglaTribunal:tribunal||undefined,dataInicio,dataFim});
  const patch=buildSheetPatch({datajud,djen,ultimoRetorno,lastDjenId,lastDjenDate,cliente});
  const commercial=commercialDecision({datajud,djen,cliente});
  return {
    ok:!(datajud?.error)&&(!djen||djen.success),
    partial:!!(datajud?.error)||(!!djen&&!djen.success),
    cnj:d,
    datajud,
    djen,
    intelligence:{
      datajud:datajud&&!datajud.error?analyzeDataJud(datajud,ultimoRetorno):null,
      djen:djen?.success?analyzeDjen(djen.items):null,
      execution:commercial.execution,
      favoredSide:commercial.side,
      commercial
    },
    patch
  };
}
module.exports={analyzeDjen,detectExecution,determineFavoredSide,commercialDecision,buildSheetPatch,scanJudicial};
