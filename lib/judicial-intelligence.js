const {fetchDataJud,analyzeDataJud,digits:digitsDj}=require("./datajud");
const {fetchDjenByCnj,sortRecent,classifyEventFromText,summarizeDjenKeywords,badgeAtoCriticoDjen,extractCpfFromDjenText,extractVeiculoFromDjenText,detectNewCommunication}=require("./djen");

function latestDataJudText(m){
  if(!m)return "";
  return [m.nome,m.complemento].filter(Boolean).join(" — ").trim();
}
function latestDjenText(item){
  if(!item)return "";
  return [item.tipoComunicacao,item.tipoDocumento,item.nomeOrgao,item.texto].filter(Boolean).join(" — ").slice(0,4000);
}
function isoNow(){return new Date().toISOString()}
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
function buildSheetPatch({datajud,djen,ultimoRetorno,lastDjenId,lastDjenDate}){
  const dj=datajud&&!datajud.error?analyzeDataJud(datajud,ultimoRetorno):null;
  const dn=djen?.success?analyzeDjen(djen.items):null;
  const lastDj=dj?.last||null,lastDn=dn?.latest||null;
  const source=[lastDj?"DataJud":null,lastDn?"DJEN":null].filter(Boolean).join(" + ")||"";
  const errors=[];
  if(datajud?.error)errors.push(datajud.message||"DataJud indisponível");
  if(djen&&!djen.success)errors.push(djen.error||"DJEN indisponível");
  const djenNew=dn?detectNewCommunication({id:lastDjenId||"",data:lastDjenDate||""},djen.items||[]):{nova:false,latest:null};
  const novo=!!(dj?.update?.alerta||djenNew.nova);
  const patch={
    "DataJud • Último Movimento":latestDataJudText(lastDj),
    "DataJud • Data":lastDj?.dataHora||"",
    "DJEN • Última Publicação":latestDjenText(lastDn),
    "DJEN • Data":lastDn?.data_disponibilizacao||"",
    "Nova Atualização":novo?"SIM":"",
    "Fonte":source,
    "Última Sincronização":isoNow(),
    "Automação":errors.length?"PARCIAL":"OK",
    "Erro / Observação":errors.join(" | "),
    "_DataJudKey":lastDj?.hash||"",
    "_DJENId":String(lastDn?.id||lastDn?.hash||""),
    "_DJENDate":lastDn?.data_disponibilizacao||"",
    "Tipo de Evento":dn?.event||"",
    "Novo Andamento":dj?.update?.alerta?"SIM":"",
    "Encerrado no Tribunal":dj?.closed?.encerrado?"SIM":"",
    "Cumprimento":dj?.compliance?.em_cumprimento_sentenca?"SIM":"",
    "Procedente":dj?.merit?.tipo==="procedente"||dj?.merit?.tipo==="parcial"?"SIM":"",
    "Improcedente":dj?.merit?.tipo==="improcedente"?"SIM":"",
    "Publicação DJEN":latestDjenText(lastDn)
  };
  const diagnostic=[];
  if(dj?.closed?.encerrado)diagnostic.push(dj.closed.motivo||"ENCERRADO");
  else if(dj?.compliance?.cumprimento_ativo)diagnostic.push("CUMPRIMENTO/EXECUÇÃO");
  else if(dj?.merit?.tipo==="procedente")diagnostic.push("SENTENÇA PROCEDENTE");
  else if(dj?.merit?.tipo==="parcial")diagnostic.push("SENTENÇA PARCIALMENTE PROCEDENTE");
  else if(dj?.merit?.tipo==="improcedente")diagnostic.push("SENTENÇA IMPROCEDENTE");
  if(dn?.event)diagnostic.push("DJEN: "+dn.event);
  patch["Diagnóstico Processual"]=diagnostic.join(" • ");
  if(dn?.critical?.critico)patch["Situação Recursal"]="REVISAR ATO CRÍTICO DJEN • "+dn.critical.tipo;
  return patch;
}
async function scanJudicial({cnj,tribunal,ultimoRetorno,lastDjenId,lastDjenDate,dataInicio,dataFim,mode="both"}={}){
  const d=digitsDj(cnj);
  if(d.length!==20)return {ok:false,error:"CNJ inválido: esperado 20 dígitos"};
  let datajud=null,djen=null;
  if(mode==="both"||mode==="datajud")datajud=await fetchDataJud(d,{fast:false});
  if(mode==="both"||mode==="djen")djen=await fetchDjenByCnj(d,{siglaTribunal:tribunal||undefined,dataInicio,dataFim});
  const patch=buildSheetPatch({datajud,djen,ultimoRetorno,lastDjenId,lastDjenDate});
  return {
    ok:!(datajud?.error)&&(!djen||djen.success),
    partial:!!(datajud?.error)||(!!djen&&!djen.success),
    cnj:d,
    datajud,
    djen,
    intelligence:{
      datajud:datajud&&!datajud.error?analyzeDataJud(datajud,ultimoRetorno):null,
      djen:djen?.success?analyzeDjen(djen.items):null
    },
    patch
  };
}
module.exports={analyzeDjen,buildSheetPatch,scanJudicial};
