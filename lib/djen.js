const DJEN_URL=process.env.DJEN_UPSTREAM||"https://comunicaapi.pje.jus.br/api/v1/comunicacao";

function digits(v){return String(v||"").replace(/\D/g,"")}
function cnjMasked(v){const d=digits(v);return d.length===20?d.slice(0,7)+"-"+d.slice(7,9)+"."+d.slice(9,13)+"."+d.slice(13,14)+"."+d.slice(14,16)+"."+d.slice(16):String(v||"")}
function decodeHtmlEntities(input){
  if(!input)return "";
  const named={nbsp:" ",amp:"&",lt:"<",gt:">",quot:'"',apos:"'",ndash:"–",mdash:"—",hellip:"…",sect:"§",deg:"°",ordm:"º",ordf:"ª",aacute:"á",eacute:"é",iacute:"í",oacute:"ó",uacute:"ú",agrave:"à",atilde:"ã",otilde:"õ",ntilde:"ñ",acirc:"â",ecirc:"ê",ocirc:"ô",ccedil:"ç",Aacute:"Á",Eacute:"É",Iacute:"Í",Oacute:"Ó",Uacute:"Ú",Agrave:"À",Atilde:"Ã",Otilde:"Õ",Ntilde:"Ñ",Acirc:"Â",Ecirc:"Ê",Ocirc:"Ô",Ccedil:"Ç",ldquo:"“",rdquo:"”",lsquo:"‘",rsquo:"’",laquo:"«",raquo:"»",bull:"•",middot:"·",times:"×",divide:"÷",euro:"€"};
  let s=String(input);
  for(let pass=0;pass<3;pass++){
    const prev=s;
    s=s.replace(/&([a-zA-Z]+);/g,(m,n)=>Object.prototype.hasOwnProperty.call(named,n)?named[n]:m);
    s=s.replace(/&#(\d+);/g,(m,n)=>{const c=Number(n);try{return Number.isFinite(c)&&c>=0&&c<=0x10ffff?String.fromCodePoint(c):m}catch{return m}});
    s=s.replace(/&#x([0-9a-fA-F]+);/g,(m,h)=>{const c=parseInt(h,16);try{return Number.isFinite(c)&&c>=0&&c<=0x10ffff?String.fromCodePoint(c):m}catch{return m}});
    if(s===prev)break;
  }
  return s;
}
function plainTextFromDjen(html){
  if(!html)return "";
  let s=String(html)
    .replace(/<script[\s\S]*?<\/script>/gi,"")
    .replace(/<style[\s\S]*?<\/style>/gi,"")
    .replace(/<head[\s\S]*?<\/head>/gi,"")
    .replace(/<\/(p|div|tr|br|li|h[1-6]|section|article|table|thead|tbody)>/gi,"\n")
    .replace(/<(br|hr)\s*\/?>/gi,"\n")
    .replace(/<[^>]+>/g," ");
  s=decodeHtmlEntities(s)
    .replace(/&[a-zA-Z]+;/g," ")
    .replace(/&#\d+;/g," ")
    .replace(/&#x[0-9a-fA-F]+;/g," ")
    .replace(/[ \t]+/g," ")
    .replace(/\n\s+/g,"\n")
    .replace(/\n{3,}/g,"\n\n")
    .trim();
  return s;
}
function resolveDjenPublicacaoLink(item,protocolo){
  const direct=String(item?.link||"").trim();if(/^https?:\/\//i.test(direct))return direct;
  const hash=String(item?.hash||"").trim();if(hash)return "https://comunica.pje.jus.br/consulta?hash="+encodeURIComponent(hash);
  if(item?.id!=null)return "https://comunica.pje.jus.br/consulta?id="+encodeURIComponent(String(item.id));
  const d=digits(protocolo||item?.numero_processo||item?.numeroProcesso);
  return d.length===20?"https://comunica.pje.jus.br/#/consulta?numeroProcesso="+encodeURIComponent(cnjMasked(d)):null;
}
function mapDjenItem(item,protocolo){
  const raw=String(item?.texto||item?.conteudo||item?.textoPublicacao||item?.descricao||item?.inteiroTeor||item?.resumo||"");
  const destRaw=item?.destinatarios||item?.destinatario||item?.partes||[],destList=Array.isArray(destRaw)?destRaw:[destRaw];
  const destinatarios=destList.filter(Boolean).map(d=>{
    const doc=digits(d?.numeroDocumentoPrincipal||d?.numerodocumentoprincipal||d?.cpf||d?.cnpj||d?.documento||d?.numeroDocumento);
    return {nome:String(d?.nome||d?.nomeDestinatario||d?.razaoSocial||"").trim()||undefined,polo:String(d?.polo||d?.tipoPolo||d?.tipo||"").trim()||undefined,advogados:Array.isArray(d?.advogados)?d.advogados.map(a=>String(a?.nome||a||"").trim()).filter(Boolean):undefined,numeroDocumentoPrincipal:doc||undefined,cpf:doc.length===11?doc:undefined,cnpj:doc.length===14?doc:undefined};
  }).filter(d=>d.nome||d.numeroDocumentoPrincipal);
  const mapped={
    id:item?.id??item?.comunicacao_id??null,
    hash:item?.hash||null,
    data_disponibilizacao:item?.data_disponibilizacao||item?.datadisponibilizacao||item?.dataDisponibilizacao||null,
    siglaTribunal:item?.siglaTribunal||item?.siglatribunal||null,
    tipoComunicacao:item?.tipoComunicacao||item?.tipocomunicacao||null,
    nomeOrgao:item?.nomeOrgao||item?.nomeorgao||null,
    texto:plainTextFromDjen(raw),
    numero_processo:item?.numeroProcesso||item?.numero_processo||item?.numeroprocessocommascara||null,
    meio:item?.meio||null,
    link:item?.link||null,
    tipoDocumento:item?.tipoDocumento||item?.tipodocumento||null,
    nomeClasse:item?.nomeClasse||item?.nomeclasse||null,
    destinatarios:destinatarios.length?destinatarios:undefined
  };
  mapped.link=resolveDjenPublicacaoLink(mapped,protocolo)||mapped.link;
  return mapped;
}
function sortRecent(items){return [...(Array.isArray(items)?items:[])].sort((a,b)=>Date.parse(b?.data_disponibilizacao||0)-Date.parse(a?.data_disponibilizacao||0))}
function summarizeDjenKeywords(text){
  const t=plainTextFromDjen(text).toUpperCase(),tags=[];
  const rules=[
    [/BUSCA\s+E\s+APREENS[AÃ]O/,"BUSCA E APREENSÃO"],[/LIMINAR/,"LIMINAR"],[/AUDI[EÊ]NCIA/,"AUDIÊNCIA"],
    [/CITA[CÇ][AÃ]O/,"CITAÇÃO"],[/INTIMA[CÇ][AÃ]O/,"INTIMAÇÃO"],[/SENTEN[CÇ]A/,"SENTENÇA"],[/AC[ÓO]RD[AÃ]O/,"ACÓRDÃO"],
    [/TR[AÂ]NSITO EM JULGADO|TRANSITO EM JULGADO/,"TRÂNSITO"],[/CUMPRIMENTO DE SENTEN[CÇ]A/,"CUMPRIMENTO"],[/CUSTAS|GUIA|PREPARO/,"CUSTAS"],
    [/PRAZO/,"PRAZO"],[/EXTIN[CÇ][AÃ]O|EXTINTO/,"EXTINÇÃO"],[/ARQUIVAMENTO|ARQUIVADO/,"ARQUIVAMENTO"]
  ];
  for(const [re,label] of rules)if(re.test(t))tags.push(label);
  return [...new Set(tags)];
}
function classifyEventFromText(text){
  const t=plainTextFromDjen(text).toUpperCase();
  if(/BUSCA\s+E\s+APREENS[AÃ]O/.test(t))return "BUSCA E APREENSÃO";
  if(/AUDI[EÊ]NCIA/.test(t))return "AUDIÊNCIA";
  if(/SENTEN[CÇ]A|JULGAD[OA]/.test(t))return "SENTENÇA";
  if(/AC[ÓO]RD[AÃ]O/.test(t))return "ACÓRDÃO";
  if(/TR[AÂ]NSITO EM JULGADO|TRANSITO EM JULGADO/.test(t))return "TRÂNSITO EM JULGADO";
  if(/CUMPRIMENTO DE SENTEN[CÇ]A|EXECU[CÇ][AÃ]O/.test(t))return "CUMPRIMENTO";
  if(/CITA[CÇ][AÃ]O/.test(t))return "CITAÇÃO";
  if(/INTIMA[CÇ][AÃ]O/.test(t))return "INTIMAÇÃO";
  if(/CUSTAS|GUIA|PREPARO/.test(t))return "CUSTAS";
  return "PUBLICAÇÃO";
}
function badgeAtoCriticoDjen(text){
  const tags=summarizeDjenKeywords(text),critical=["AUDIÊNCIA","SENTENÇA","ACÓRDÃO","TRÂNSITO","CUMPRIMENTO","CUSTAS","BUSCA E APREENSÃO"];
  const hit=tags.find(x=>critical.includes(x));
  return hit?{critico:true,tipo:hit}:{critico:false,tipo:null};
}
function extractCpfFromDjenText(text){
  const raw=plainTextFromDjen(text),m=raw.match(/\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/);return m?digits(m[0]):null;
}
function extractVeiculoFromDjenText(text){
  const raw=plainTextFromDjen(text).toUpperCase();
  const placa=(raw.match(/\b[A-Z]{3}[-\s]?[0-9][A-Z0-9][0-9]{2}\b/)||[])[0]||null;
  const renavam=(raw.match(/\bRENAVAM\D{0,10}(\d{9,11})\b/)||[])[1]||null;
  const veiculo=(raw.match(/\b(?:VE[IÍ]CULO|AUTOM[ÓO]VEL)[:\s-]+([^\n.;]{3,80})/)||[])[1]||null;
  return {placa:placa?placa.replace(/\s/g,"").replace(/^([A-Z]{3})([0-9A-Z])/,"$1-$2"):null,renavam,veiculo:veiculo?.trim()||null};
}
function retryDelay(attempt,retryAfter){
  const now=Date.now(),seconds=retryAfter?(/^\d+$/.test(String(retryAfter))?Number(retryAfter):(Date.parse(String(retryAfter))-now)/1000):0;
  return Math.max(5000*2**Math.min(Math.max(attempt,0),4),Number.isFinite(seconds)?Math.max(0,seconds)*1000:0);
}
async function djenGet(params,{timeoutMs=28000}={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const r=await fetch(DJEN_URL+"?"+params.toString(),{method:"GET",headers:{Accept:"application/json","Accept-Language":"pt-BR,pt;q=0.9"},signal:controller.signal,cache:"no-store",redirect:"follow"});
    const txt=await r.text(),trimmed=txt.trim(),retryAfter=r.headers.get("retry-after");
    const rate={remaining:r.headers.get("x-ratelimit-remaining"),limit:r.headers.get("x-ratelimit-limit"),retryAfter};
    if(r.status===429)return {success:false,status:429,isRateLimited:true,error:"DJEN 429: limite oficial atingido.",retryAfterMs:retryDelay(0,retryAfter),items:[],count:0,rate};
    if(r.status===403)return {success:false,status:403,isGeoBlocked:true,error:"DJEN 403: origem recusada pelo serviço oficial.",items:[],count:0,rate};
    if(!r.ok)return {success:false,status:r.status,error:"DJEN HTTP "+r.status,items:[],count:0,rate,detail:trimmed.slice(0,300)};
    if(!trimmed)return {success:true,status:r.status,items:[],count:0,rate};
    if(trimmed.startsWith("<")||/<!doctype html/i.test(trimmed))return {success:false,status:r.status,isHtmlBlock:true,error:"DJEN retornou HTML em vez de JSON.",items:[],count:0,rate};
    let data;try{data=JSON.parse(trimmed)}catch{return {success:false,status:r.status,error:"DJEN retornou JSON inválido.",items:[],count:0,rate}};
    const raw=Array.isArray(data)?data:Array.isArray(data.items)?data.items:Array.isArray(data.content)?data.content:[];
    return {success:true,status:r.status,count:Number(data?.count??raw.length),items:raw,rate};
  }catch(e){
    return {success:false,error:e?.name==="AbortError"?"Timeout DJEN.":"Falha de rede DJEN: "+(e?.message||String(e)),items:[],count:0};
  }finally{clearTimeout(timer)}
}
async function fetchDjenByCnj(protocolo,{siglaTribunal,meio,dataInicio,dataFim,itensPorPagina=50}={}){
  const d=digits(protocolo);if(d.length!==20)return {success:false,error:"CNJ inválido",items:[],count:0};
  const fim=dataFim||new Date().toISOString().slice(0,10),inicio=dataInicio||new Date(Date.now()-365*86400000).toISOString().slice(0,10);
  for(const cnj of [d,cnjMasked(d)]){
    const p=new URLSearchParams({numeroProcesso:cnj,dataDisponibilizacaoInicio:inicio,dataDisponibilizacaoFim:fim,pagina:"1",itensPorPagina:String(Math.min(100,itensPorPagina))});
    if(siglaTribunal&&!/^outros$/i.test(siglaTribunal))p.set("siglaTribunal",String(siglaTribunal).toUpperCase());
    if(meio)p.set("meio",meio);
    const r=await djenGet(p);if(!r.success){if(r.isRateLimited||r.isGeoBlocked)return r;continue}
    const items=sortRecent(r.items.map(x=>mapDjenItem(x,d)));
    return {...r,items,count:r.count??items.length};
  }
  return {success:false,error:"Nenhuma comunicação localizada.",items:[],count:0};
}
async function fetchDjenByName(nome,{dataInicio,dataFim,pagina=1,itensPorPagina=50,siglaTribunal,texto}={}){
  const q=String(nome||"").trim();if(q.length<3)return {success:false,error:"Nome curto",items:[],count:0};
  const fim=dataFim||new Date().toISOString().slice(0,10),inicio=dataInicio||new Date(Date.now()-365*86400000).toISOString().slice(0,10);
  const p=new URLSearchParams({nomeParte:q,dataDisponibilizacaoInicio:inicio,dataDisponibilizacaoFim:fim,pagina:String(Math.max(1,pagina)),itensPorPagina:String(Math.min(100,itensPorPagina))});
  if(texto)p.set("texto",texto);if(siglaTribunal&&!/^outros$/i.test(siglaTribunal))p.set("siglaTribunal",String(siglaTribunal).toUpperCase());
  const r=await djenGet(p);return r.success?{...r,items:sortRecent(r.items.map(x=>mapDjenItem(x)))}:r;
}
async function fetchDjenByText(texto,{dataInicio,dataFim,pagina=1,itensPorPagina=50,siglaTribunal,nomeParte}={}){
  const q=String(texto||"").trim();if(q.length<3)return {success:false,error:"Texto curto",items:[],count:0};
  const fim=dataFim||new Date().toISOString().slice(0,10),inicio=dataInicio||new Date(Date.now()-30*86400000).toISOString().slice(0,10);
  const variants=[q,q.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim()].filter((v,i,a)=>v&&a.indexOf(v)===i);
  let last={success:false,error:"Sem tentativa",items:[],count:0};
  for(const variant of variants){
    const p=new URLSearchParams({texto:variant,dataDisponibilizacaoInicio:inicio,dataDisponibilizacaoFim:fim,pagina:String(Math.max(1,pagina)),itensPorPagina:String(Math.min(100,itensPorPagina))});
    if(nomeParte)p.set("nomeParte",nomeParte);if(siglaTribunal&&!/^outros$/i.test(siglaTribunal))p.set("siglaTribunal",String(siglaTribunal).toUpperCase());
    last=await djenGet(p);if(last.success||last.isRateLimited||last.isGeoBlocked)break;
  }
  return last.success?{...last,items:sortRecent(last.items.map(x=>mapDjenItem(x)))}:last;
}
async function fetchDjenByDate({dataInicio,dataFim,pagina=1,itensPorPagina=100,siglaTribunal}={}){
  const fim=dataFim||new Date().toISOString().slice(0,10),inicio=dataInicio||new Date(Date.now()-14*86400000).toISOString().slice(0,10);
  const p=new URLSearchParams({dataDisponibilizacaoInicio:inicio,dataDisponibilizacaoFim:fim,pagina:String(Math.max(1,pagina)),itensPorPagina:String(Math.min(100,itensPorPagina))});
  if(siglaTribunal&&!/^outros$/i.test(siglaTribunal))p.set("siglaTribunal",String(siglaTribunal).toUpperCase());
  const r=await djenGet(p);return r.success?{...r,items:sortRecent(r.items.map(x=>mapDjenItem(x)))}:r;
}
function detectNewCommunication(lastStored,items){
  const recent=sortRecent(items),latest=recent[0]||null;if(!latest)return {nova:false,latest:null};
  const storedId=String(lastStored?.id||lastStored?._DJENId||""),storedDate=Date.parse(lastStored?.data||lastStored?._DJENDate||0)||0,newDate=Date.parse(latest.data_disponibilizacao||0)||0;
  const id=String(latest.id||latest.hash||"");return {nova:!!latest&&((id&&id!==storedId)||newDate>storedDate),latest};
}
module.exports={DJEN_URL,digits,cnjMasked,decodeHtmlEntities,plainTextFromDjen,resolveDjenPublicacaoLink,mapDjenItem,sortRecent,summarizeDjenKeywords,classifyEventFromText,badgeAtoCriticoDjen,extractCpfFromDjenText,extractVeiculoFromDjenText,retryDelay,djenGet,fetchDjenByCnj,fetchDjenByName,fetchDjenByText,fetchDjenByDate,detectNewCommunication};
