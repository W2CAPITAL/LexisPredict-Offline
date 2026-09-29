const DATAJUD_BASE="https://api-publica.datajud.cnj.jus.br";

const COURT_ALIASES={
  "8.01":"tjac","8.02":"tjal","8.03":"tjap","8.04":"tjam","8.05":"tjba","8.06":"tjce","8.07":"tjdft",
  "8.08":"tjes","8.09":"tjgo","8.10":"tjma","8.11":"tjmt","8.12":"tjms","8.13":"tjmg","8.14":"tjpa",
  "8.15":"tjpb","8.16":"tjpr","8.17":"tjpe","8.18":"tjpi","8.19":"tjrj","8.20":"tjrn","8.21":"tjrs",
  "8.22":"tjro","8.23":"tjrr","8.24":"tjsc","8.25":"tjse","8.26":"tjsp","8.27":"tjto",
  "4.01":"trf1","4.02":"trf2","4.03":"trf3","4.04":"trf4","4.05":"trf5","4.06":"trf6",
  "5.01":"trt1","5.02":"trt2","5.03":"trt3","5.04":"trt4","5.05":"trt5","5.06":"trt6","5.07":"trt7",
  "5.08":"trt8","5.09":"trt9","5.10":"trt10","5.11":"trt11","5.12":"trt12","5.13":"trt13","5.14":"trt14",
  "5.15":"trt15","5.16":"trt16","5.17":"trt17","5.18":"trt18","5.19":"trt19","5.20":"trt20","5.21":"trt21",
  "5.22":"trt22","5.23":"trt23","5.24":"trt24","2.00":"stj","2.01":"stj","3.00":"tst","3.01":"tst",
  "6.00":"tse","7.00":"stm"
};
const DEFAULT_ALIASES=["tjsp","tjrj","tjmg","tjba","tjrs","tjpr","tjsc","tjgo","tjpe","tjce","tjdft","tjes","tjmt","tjms","tjma","tjpb","tjrn","tjpi","tjal","tjse"];

function digits(v){return String(v||"").replace(/\D/g,"")}
function cnjMasked(v){
  const d=digits(v);
  return d.length===20?d.slice(0,7)+"-"+d.slice(7,9)+"."+d.slice(9,13)+"."+d.slice(13,14)+"."+d.slice(14,16)+"."+d.slice(16):String(v||"");
}
function resolveDataJudAlias(cnj){
  const d=digits(cnj);
  if(d.length!==20)return "tjsp";
  const direct=COURT_ALIASES[d[13]+"."+d.slice(14,16)];
  if(direct)return direct;
  const j=d[13];
  if(j==="5")return "trt"+Number(d.slice(14,16));
  if(j==="2")return "stj";
  if(j==="3")return "tst";
  if(j==="6")return "tse";
  if(j==="7")return "stm";
  return "tjsp";
}
function apiKey(){
  const key=String(process.env.DATAJUD_API_KEY||process.env.DATAJUD_PUBLIC_KEY||"").trim();
  if(!key)throw new Error("DATAJUD_API_KEY não configurada na Vercel.");
  return key;
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function extractPoles(partes){
  const ativo=[],passivo=[],outros=[];
  for(const p of Array.isArray(partes)?partes:[]){
    const nome=String(p?.nome||p?.nomeParte||p?.razaoSocial||p?.nomePessoa||p?.pessoa?.nome||"").trim();
    if(!nome||nome.length<3)continue;
    const tipo=String(p?.tipo||p?.tipoParte||p?.qualificacao||"").toUpperCase();
    if(/ADVOGADO|OAB|PROCURADOR|REPRESENTANTE/.test(tipo)&&!/AUTOR|R[EÉ]U|REQUER/.test(tipo)){if(!outros.includes(nome))outros.push(nome);continue}
    const raw=p?.polo??p?.tipoPolo??p?.codigoPolo??p?.poloProcessual??"";
    const polo=typeof raw==="object"?String(raw?.codigo||raw?.nome||raw?.descricao||"").toUpperCase():String(raw).toUpperCase();
    if(/ATIVO|^A$|^AT$|AUTOR|REQUERENTE|EXEQUENTE|APELANTE|AGRAVANTE|IMPETRANTE|RECLAMANTE|POLO\s*AT/.test(polo)){if(!ativo.includes(nome))ativo.push(nome)}
    else if(/PASSIVO|^P$|^PA$|R[EÉ]U|REQUERIDO|EXECUTADO|APELADO|AGRAVADO|IMPETRADO|RECLAMADO|POLO\s*PA/.test(polo)){if(!passivo.includes(nome))passivo.push(nome)}
    else if(polo.includes("AT")&&!polo.includes("PA")){if(!ativo.includes(nome))ativo.push(nome)}
    else if(polo.includes("PA")||polo==="P"){if(!passivo.includes(nome))passivo.push(nome)}
    else if(!outros.includes(nome))outros.push(nome);
  }
  if(!ativo.length&&!passivo.length&&outros.length){
    for(const nome of outros){
      if(/BANCO|S\.?A\.?|LTDA|FINANCEIRA|CREDITO|SEGURADORA|CAIXA ECON/i.test(nome)){if(!passivo.includes(nome))passivo.push(nome)}
      else if(!ativo.includes(nome))ativo.push(nome);
    }
  }
  return {ativo,passivo,outros};
}
function simpleHash(s){let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return "m"+Math.abs(h)}
function cleanMovement(m){
  const nome=String(m?.nome||m?.descricao||"").replace(/\s+/g," ").trim();
  if(!nome||nome.length<3)return null;
  const complemento=String(m?.complemento||"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
  const codigo=String(m?.codigo??m?.codigoMovimento??"0").trim()||"0";
  const dataHora=m?.dataHora?String(m.dataHora):m?.data?String(m.data):null;
  return {codigo,nome,dataHora,complemento,hash:simpleHash([codigo,nome,dataHora||"",complemento].join("|"))};
}
function sanitizeMovements(list){
  const seen=new Set(),out=[];
  for(const raw of Array.isArray(list)?list:[]){
    const m=cleanMovement(raw);if(!m||seen.has(m.hash))continue;seen.add(m.hash);out.push(m);
  }
  return out.sort((a,b)=>Date.parse(b.dataHora||0)-Date.parse(a.dataHora||0));
}
function mapSource(source,alias,cnj,latency,attempts){
  const partes=Array.isArray(source?.partes)?source.partes:[];
  const polos=extractPoles(partes);
  const movimentos=sanitizeMovements(source?.movimentos);
  return {
    numeroProcesso:source?.numeroProcesso||digits(cnj),
    classe:source?.classe?.nome||source?.classe?.codigo||"N/A",
    classeCodigo:source?.classe?.codigo??null,
    grau:source?.grau||null,
    tribunal:source?.tribunal||String(alias||"").toUpperCase(),
    orgaoJulgador:source?.orgaoJulgador?.nome||source?.orgaoJulgador?.codigo||null,
    movimentos,
    dataAjuizamento:source?.dataAjuizamento||null,
    partes,poloAtivo:polos.ativo,poloPassivo:polos.passivo,
    error:false,latency,attempts
  };
}
async function postSearch(alias,body,{timeoutMs=32000}={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const r=await fetch(DATAJUD_BASE+"/api_publica_"+alias+"/_search",{
      method:"POST",
      headers:{Authorization:"APIKey "+apiKey(),"Content-Type":"application/json",Accept:"application/json"},
      body:JSON.stringify(body),signal:controller.signal,cache:"no-store"
    });
    const txt=await r.text();let data=null;try{data=JSON.parse(txt)}catch{}
    return {r,data,txt};
  }finally{clearTimeout(timer)}
}
async function fetchDataJud(cnj,{fast=false,maxAttempts=3}={}){
  const d=digits(cnj),start=Date.now();
  if(d.length!==20)return {numeroProcesso:d,movimentos:[],error:true,message:"CNJ inválido.",attempts:0};
  const alias=resolveDataJudAlias(d),masked=cnjMasked(d),timeoutMs=fast?30000:40000;
  for(let attempt=1;attempt<=maxAttempts;attempt++){
    try{
      const x=await postSearch(alias,{size:1,query:{bool:{should:[{match:{numeroProcesso:d}},{match:{numeroProcesso:masked}}],minimum_should_match:1}}},{timeoutMs});
      const latency=Date.now()-start;
      if(x.r.status===429){if(attempt<maxAttempts){await sleep(Math.max(1200,1200*attempt));continue}return {numeroProcesso:d,movimentos:[],error:true,message:"DataJud HTTP 429: aguarde antes de retomar.",status:429,latency,attempts:attempt}}
      if(x.r.status>=500&&attempt<maxAttempts){await sleep(800*attempt);continue}
      if(!x.r.ok)return {numeroProcesso:d,movimentos:[],error:true,message:"DataJud HTTP "+x.r.status,status:x.r.status,latency,attempts:attempt};
      const source=x.data?.hits?.hits?.[0]?._source;
      if(!source)return {numeroProcesso:d,movimentos:[],error:false,message:"Não localizado no DataJud.",latency,attempts:attempt};
      if(x.data?._shards?.failed>0&&!x.data?.hits?.hits?.length&&attempt<maxAttempts){await sleep(700);continue}
      return mapSource(source,alias,d,latency,attempt);
    }catch(e){
      if(attempt<maxAttempts){await sleep(700*attempt);continue}
      return {numeroProcesso:d,movimentos:[],error:true,message:e?.name==="AbortError"?"Tempo esgotado no DataJud.":"Falha técnica DataJud: "+(e?.message||String(e)),latency:Date.now()-start,attempts:attempt};
    }
  }
}
async function searchDataJudByName(nome,{aliases=DEFAULT_ALIASES,size=8,classeCodigo}={}){
  const q=String(nome||"").trim();if(q.length<5)return {success:false,items:[],error:"Nome muito curto"};
  const items=[];
  for(const alias of aliases){
    if(items.length>=30)break;
    try{
      const must=[{match:{"partes.nome":{query:q,operator:"and"}}}];if(classeCodigo)must.push({match:{"classe.codigo":classeCodigo}});
      const x=await postSearch(alias,{size,query:{bool:{must}}},{timeoutMs:25000});if(!x.r.ok)continue;
      for(const hit of x.data?.hits?.hits||[]){const s=hit?._source||{},polos=extractPoles(s.partes||[]);items.push({numeroProcesso:s.numeroProcesso,classe:s.classe?.nome||"N/A",classeCodigo:s.classe?.codigo??null,grau:s.grau||null,tribunal:s.tribunal||alias.toUpperCase(),orgaoJulgador:s.orgaoJulgador?.nome||null,poloAtivo:polos.ativo,poloPassivo:polos.passivo,partes:s.partes||[],dataAjuizamento:s.dataAjuizamento||null})}
    }catch(_){}
  }
  return {success:true,items};
}
async function searchDataJudByCpf(documento,{aliases=DEFAULT_ALIASES,size=8,onlyBA=false}={}){
  const doc=digits(documento);if(doc.length<11)return {success:false,items:[],error:"CPF/CNPJ inválido"};
  const fields=["partes.numeroDocumentoPrincipal","partes.numeroDocumento","partes.documento","partes.cpfCnpj","partes.cpf","partes.cnpj"],items=[],seen=new Set();
  for(const alias of aliases){
    if(items.length>=30)break;
    try{
      const should=fields.map(f=>({match:{[f]:doc}}));
      if(doc.length===11){const m=doc.slice(0,3)+"."+doc.slice(3,6)+"."+doc.slice(6,9)+"-"+doc.slice(9);should.push({match:{"partes.numeroDocumentoPrincipal":m}},{match:{"partes.documento":m}})}
      const x=await postSearch(alias,{size,query:{bool:{should,minimum_should_match:1}}},{timeoutMs:28000});if(!x.r.ok)continue;
      for(const hit of x.data?.hits?.hits||[]){
        const s=hit?._source;if(!s)continue;const num=digits(s.numeroProcesso);if(!num||seen.has(num))continue;
        const classeNome=String(s.classe?.nome||s.classe?.codigo||"").toUpperCase();if(onlyBA&&!/BUSCA\s+E\s+APREENS/.test(classeNome))continue;
        seen.add(num);const polos=extractPoles(s.partes||[]);
        items.push({numeroProcesso:s.numeroProcesso,classe:s.classe?.nome||"N/A",classeCodigo:s.classe?.codigo??null,grau:s.grau||null,tribunal:s.tribunal||alias.toUpperCase(),orgaoJulgador:s.orgaoJulgador?.nome||null,poloAtivo:polos.ativo,poloPassivo:polos.passivo,partes:s.partes||[],dataAjuizamento:s.dataAjuizamento||null,isBuscaApreensao:/BUSCA\s+E\s+APREENS/.test(classeNome)});
      }
    }catch(_){}
  }
  return {success:true,items};
}
function movementText(m){return [m?.nome,m?.complemento,m?.descricao].filter(Boolean).join(" ").toUpperCase()}
function detectClosed(movimentos){
  const list=sanitizeMovements(movimentos).slice(0,25);
  const groups=[
    [["BAIXA DEFINITIVA","BAIXA DO PROCESSO","PROCESSO BAIXADO","DETERMINADA A BAIXA"],"BAIXA DEFINITIVA"],
    [["TRÂNSITO EM JULGADO","TRANSITO EM JULGADO","CERTIFICADO O TRÂNSITO"],"TRÂNSITO EM JULGADO"],
    [["EXTINTO O PROCESSO","PROCESSO EXTINTO","SENTENÇA DE EXTINÇÃO","EXTINÇÃO DO PROCESSO"],"EXTINÇÃO DO PROCESSO"],
    [["ARQUIVAMENTO DEFINITIVO","ARQUIVADO DEFINITIVAMENTE","AUTOS ARQUIVADOS"],"ARQUIVAMENTO DEFINITIVO"],
    [["CANCELADA A DISTRIBUIÇÃO","CANCELAMENTO DA DISTRIBUIÇÃO","DISTRIBUIÇÃO CANCELADA"],"CANCELAMENTO DA DISTRIBUIÇÃO"]
  ];
  for(let i=0;i<list.length;i++){
    const t=movementText(list[i]);
    if(/LIMINAR|TUTELA/.test(t)&&/BAIXA/.test(t)&&!/BAIXA\s+DEFINITIVA|BAIXA\s+DO\s+PROCESSO|PROCESSO\s+BAIXADO/.test(t))continue;
    for(const [ps,label] of groups)if(ps.some(p=>t.includes(p)))return {encerrado:true,motivo:label,data:list[i].dataHora||null};
  }
  return {encerrado:false,motivo:null,data:null};
}
function detectCompliance(movimentos,classeCodigo){
  const list=sanitizeMovements(movimentos).slice(0,25),blob=list.map(movementText).join(" || ");
  const start=/CUMPRIMENTO DE SENTEN|CUMPRIMENTO PROVIS|FASE DE CUMPRIMENTO|IN[IÍ]CIO DO CUMPRIMENTO|REQUERIMENTO DE CUMPRIMENTO|PETI[CÇ][AÃ]O DE CUMPRIMENTO|EXECU[CÇ][AÃ]O DE SENTEN|EXECU[CÇ][AÃ]O\/CUMPRIMENTO/.test(blob)||[156,157,12078,12231,12246,15159,1111].includes(Number(classeCodigo));
  const ended=/EXTIN[CÇ][AÃ]O DO CUMPRIMENTO|CUMPRIMENTO EXTINTO|SATISFA[CÇ][AÃ]O DA OBRIGA[CÇ][AÃ]O|OBRIGA[CÇ][AÃ]O SATISFEITA|QUITA[CÇ][AÃ]O DO D[EÉ]BITO|ALVAR[AÁ] DE LEVANTAMENTO|ACORDO (INTEGRALMENTE )?CUMPRIDO|BAIXA DO CUMPRIMENTO|ARQUIVAMENTO DO CUMPRIMENTO/.test(blob);
  return {em_cumprimento_sentenca:start,cumprimento_ativo:start&&!ended,cumprimento_encerrado:start&&ended,status_executivo:start?(ended?"encerrado":"ativo"):"nenhum"};
}
function detectMerit(movimentos){
  for(const m of sanitizeMovements(movimentos).slice(0,25)){const t=movementText(m);if(/PARCIALMENTE PROCEDENTE|PROCEDENTE EM PARTE/.test(t))return {tipo:"parcial",motivo:"PARCIALMENTE PROCEDENTE"}}
  for(const m of sanitizeMovements(movimentos).slice(0,25)){const t=movementText(m);if(/JULGAD[OA] PROCEDENTE/.test(t)||(t.includes("PROCEDENTE")&&!t.includes("IMPROCEDENTE")&&!t.includes("PARCIAL")))return {tipo:"procedente",motivo:"PROCEDENTE"}}
  for(const m of sanitizeMovements(movimentos).slice(0,25)){const t=movementText(m);if(/IMPROCEDENTE|JULGO IMPROCEDENTE/.test(t))return {tipo:"improcedente",motivo:"IMPROCEDENTE"}}
  return {tipo:null,motivo:null};
}
function parseDate(v){const s=String(v||"").trim();if(!s)return null;let m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(m)return new Date(+m[3],+m[2]-1,+m[1],23,59,59,999);const d=new Date(s);return isNaN(d)?null:d}
function detectUpdateAfterReturn(ultimoRetorno,movimentos){
  const list=sanitizeMovements(movimentos);if(!list.length)return {alerta:false,dataUltimo:null,nomeUltimo:null};
  const last=list[0],mov=last.dataHora?new Date(last.dataHora):null;if(!mov||isNaN(mov))return {alerta:false,dataUltimo:null,nomeUltimo:last.nome||null};
  const ret=parseDate(ultimoRetorno);if(!ret){return {alerta:mov.getTime()>Date.now()-45*86400000,dataUltimo:mov.toISOString(),nomeUltimo:last.nome||null}}
  return {alerta:mov>ret,dataUltimo:mov.toISOString(),nomeUltimo:last.nome||null};
}
function analyzeDataJud(result,ultimoRetorno){
  const movimentos=result?.movimentos||[],closed=detectClosed(movimentos),comp=detectCompliance(movimentos,result?.classeCodigo),merit=detectMerit(movimentos),update=detectUpdateAfterReturn(ultimoRetorno,movimentos),last=sanitizeMovements(movimentos)[0]||null;
  return {closed,compliance:comp,merit,update,last};
}

async function probeDataJudHost(cnj){
  const d=digits(cnj),start=Date.now();
  if(d.length!==20)return {ok:false,latencyMs:0,error:"CNJ inválido"};
  const alias=resolveDataJudAlias(d);
  try{
    const x=await postSearch(alias,{size:1,query:{match:{numeroProcesso:d}}},{timeoutMs:20000});
    return {ok:x.r.ok,latencyMs:Date.now()-start,error:x.r.ok?undefined:"HTTP "+x.r.status,rateLimited:x.r.status===429,alias};
  }catch(e){
    return {ok:false,latencyMs:Date.now()-start,error:e?.name==="AbortError"?"Timeout":e?.message||String(e),rateLimited:false,alias};
  }
}
module.exports={DATAJUD_BASE,COURT_ALIASES,DEFAULT_ALIASES,digits,cnjMasked,resolveDataJudAlias,extractPoles,cleanMovement,sanitizeMovements,fetchDataJud,searchDataJudByName,searchDataJudByCpf,detectClosed,detectCompliance,detectMerit,detectUpdateAfterReturn,analyzeDataJud,probeDataJudHost};
