(() => {
"use strict";

const SHEET_DEFAULT="https://docs.google.com/spreadsheets/d/1qbuJee6DCv0bh9XGvnBDPltc0Ziphdn2yx11QKOnchc/edit";
const DB_NAME="lexispredict-secure-cache-v3";
const SESSION_SNAPSHOT_KEY="lexis_user_snapshot_v2";
const CACHE_TTL_MS=5*60*1000;
const PAGE_DEFAULT=200;
const DJEN_GEO_BLOCK_MS=10*60*1000;
const DJEN_BLOCK_KEY="lexis_djen_blocked_until_v2";
const THEME_KEY="sheetspredict_theme_v1";
const THEMES=[
  {id:"default",name:"SheetsPredict",desc:"Azul jurídico claro",mode:"Claro",accent:"#1677d2",bg:"#f4f6f9",surface:"#ffffff",nav:"#0b1220",meta:"#0b1220"},
  {id:"clean",name:"Clean",desc:"Branco, cinza e azul discreto",mode:"Claro",accent:"#2563eb",bg:"#f8fafc",surface:"#ffffff",nav:"#111827",meta:"#111827"},
  {id:"dark",name:"Dark",desc:"Escuro neutro para uso prolongado",mode:"Escuro",accent:"#3b82f6",bg:"#0d1117",surface:"#161b22",nav:"#090d13",meta:"#090d13"},
  {id:"midnight",name:"Midnight",desc:"Azul-marinho profundo",mode:"Escuro",accent:"#38bdf8",bg:"#07111f",surface:"#0d1b2a",nav:"#050b14",meta:"#050b14"},
  {id:"graphite",name:"Graphite",desc:"Grafite corporativo",mode:"Escuro",accent:"#a3a3a3",bg:"#151515",surface:"#202020",nav:"#0d0d0d",meta:"#0d0d0d"},
  {id:"emerald",name:"Emerald",desc:"Verde sóbrio e operacional",mode:"Claro",accent:"#047857",bg:"#f1f8f5",surface:"#ffffff",nav:"#06281f",meta:"#06281f"},
  {id:"wine",name:"Vinho Jurídico",desc:"Bordô, marfim e acabamento clássico",mode:"Claro",accent:"#8b1e3f",bg:"#f7f2ef",surface:"#fffdf9",nav:"#35111d",meta:"#35111d"},
  {id:"violet",name:"Executive Violet",desc:"Roxo executivo moderno",mode:"Escuro",accent:"#a78bfa",bg:"#100d1c",surface:"#1a162b",nav:"#0c0915",meta:"#0c0915"},
  {id:"gold",name:"Imperial Gold",desc:"Preto, dourado e marfim",mode:"Escuro",accent:"#d4a72c",bg:"#11100d",surface:"#1b1913",nav:"#080806",meta:"#080806"},
  {id:"contrast",name:"Alto Contraste",desc:"Máxima separação entre texto e fundo",mode:"Acessível",accent:"#00a8ff",bg:"#000000",surface:"#0a0a0a",nav:"#000000",meta:"#000000"}
];
function savedTheme(){try{return THEMES.some(t=>t.id===localStorage.getItem(THEME_KEY))?localStorage.getItem(THEME_KEY):"default"}catch(_){return"default"}}
function applyTheme(id,{persist=true}={}){
  const theme=THEMES.find(t=>t.id===id)||THEMES[0];
  document.documentElement.dataset.theme=theme.id;
  document.documentElement.style.colorScheme=["dark","midnight","graphite","violet","gold","contrast"].includes(theme.id)?"dark":"light";
  const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute("content",theme.meta);
  if(persist)try{localStorage.setItem(THEME_KEY,theme.id)}catch(_){}
  return theme;
}
const state={rows:[],companyRows:[],view:"dashboard",query:"",status:"",quality:"",session:null,scanning:false,scanStop:false,lastScan:null,auditKey:null,auditScan:null,historyKey:null,historyScan:null,historyLoading:false,serverCfg:{},djenBlockedUntil:0,syncing:false,autoSyncTimer:null,lastSync:null,lastSyncAt:0,crm:{Clientes:[],Interacoes:[],PipelineCRM:[],AgendaCRM:[],TarefasCRM:[],DocumentosCRM:[],Honorarios:[]},crmLoaded:false,crmLoading:false,crmBridgeReady:true,clientId:null,pageSize:{processos:PAGE_DEFAULT,empresa:PAGE_DEFAULT,clientes:PAGE_DEFAULT,tarefas:PAGE_DEFAULT},agendaMonth:"",agendaDay:"",hub:{tab:"overview",status:null,loading:false,ai:[],aiBusy:false,wa:null,waBusy:false,lead:null,leadDiscover:null,leadBusy:false,bacen:null,bacenEstimate:null,bacenBusy:false,selectedCnj:""}};

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
const norm=s=>String(s??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const digits=s=>String(s??"").replace(/\D/g,"");
const now=()=>new Date().toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"});
function restoreDjenBlock(){
  try{state.djenBlockedUntil=Math.max(0,Number(localStorage.getItem(DJEN_BLOCK_KEY)||0));}catch(_){state.djenBlockedUntil=0}
  if(state.djenBlockedUntil<=Date.now()){state.djenBlockedUntil=0;try{localStorage.removeItem(DJEN_BLOCK_KEY)}catch(_){}}
}
function setDjenBlock(ms){
  state.djenBlockedUntil=Math.max(state.djenBlockedUntil,Date.now()+Math.max(60000,Number(ms)||60000));
  try{localStorage.setItem(DJEN_BLOCK_KEY,String(state.djenBlockedUntil))}catch(_){}
}
function djenPaused(){return state.djenBlockedUntil>Date.now()}
function djenPauseText(){
  if(!djenPaused())return "";
  const mins=Math.max(1,Math.ceil((state.djenBlockedUntil-Date.now())/60000));
  return "DJEN pausado por "+(mins>=60?Math.ceil(mins/60)+"h":mins+" min")+"; DataJud continua.";
}

const keyOf=r=>digits(pick(r,"Protocolo","protocolo","CNJ"))||"row:"+hash(JSON.stringify(r));
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(36)}
function pick(r,...keys){for(const k of keys){if(r&&r[k]!==undefined&&r[k]!==null&&String(r[k]).trim()!=="")return r[k]}const map={};Object.keys(r||{}).forEach(k=>map[norm(k)]=k);for(const k of keys){const real=map[norm(k)];if(real&&String(r[real]??"").trim()!=="")return r[real]}return ""}
function boolish(v){return /^(sim|true|1|yes)$/i.test(String(v??"").trim())}
function parseDate(v){
  if(v instanceof Date&&!isNaN(v))return v;
  const s=String(v??"").trim();if(!s)return null;
  let m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);if(m)return new Date(+m[3],+m[2]-1,+m[1],12);
  m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return new Date(+m[1],+m[2]-1,+m[3],12);
  const d=new Date(s);return isNaN(d)?null:d;
}
function daysTo(v){const d=parseDate(v);if(!d)return null;const t=new Date();t.setHours(12,0,0,0);return Math.round((d-t)/86400000)}
function isClosed(r){return /encerrad|arquivad|baixa definitiva|cancelamento de distribui|transito em julgado/i.test([pick(r,"Status"),pick(r,"Diagnóstico Processual"),pick(r,"DataJud • Último Movimento")].join(" "))}
function quality(r){return String(pick(r,"Qualidade")||"").toUpperCase()}
function score(r){const n=Number(String(pick(r,"Score 0–100","Score")).replace(",","."));return Number.isFinite(n)?n:50}
function statusRet(r){
  const st=String(pick(r,"Situação do Retorno","Status")).toUpperCase();
  if(st.includes("VENC"))return"VENCIDO";if(st.includes("ATEN"))return"ATENÇÃO";if(st.includes("EM DIA")||st.includes("NO PRAZO"))return"EM DIA";
  const d=daysTo(pick(r,"Próximo Retorno"));if(d===null)return"SEM DATA";if(d<0)return"VENCIDO";if(d<=0)return"ATENÇÃO";return"EM DIA";
}
function latestMove(r){return pick(r,"DataJud • Último Movimento","Último Andamento","Andamento","ultimo_movimento","Diagnóstico Processual")}
function cnjFormatted(v){const d=digits(v);return d.length===20?d.slice(0,7)+"-"+d.slice(7,9)+"."+d.slice(9,13)+"."+d.slice(13,14)+"."+d.slice(14,16)+"."+d.slice(16):v}
function badge(text,type){return '<span class="badge b-'+type+'">'+esc(text)+'</span>'}
function qBadge(q){return q==="BOM"?badge("BOM","good"):q==="RUIM"?badge("RUIM","bad"):badge(q||"NEUTRO","warn")}
function scoreHtml(n){const c=n>=70?"good":n<45?"bad":"warn";return '<span class="score '+c+'">'+Math.round(n)+'</span>'}

function commercialStatus(r){return String(pick(r,"Comercial")||"REVISAR").toUpperCase()}
function commercialHtml(r){
  const s=commercialStatus(r);
  return s.includes("NÃO VENDER")?badge("NÃO VENDER","bad"):s.includes("POTENCIAL")?badge("POTENCIAL","good"):s.includes("REVISAR ANTES")?badge("REVISAR ANTES","warn"):badge("REVISAR","gray");
}
function favoredHtml(r){
  const f=String(pick(r,"_Favorecido")||"").toUpperCase();
  if(f==="CLIENTE")return badge("CLIENTE","good");
  if(f==="BANCO")return badge("BANCO","bad");
  return badge("INDEFINIDO","gray");
}
function execHtml(r){
  const e=String(pick(r,"_ExecStatus")||"").toUpperCase();
  if(e==="ATIVO")return badge("ATIVO","blue");
  if(e==="ENCERRADO")return badge("ENCERRADO","bad");
  if(e==="CITACAO_APENAS")return badge("SÓ CITAÇÃO","warn");
  if(e==="NAO_INSTAURADO")return badge("NÃO INSTAURADO","gray");
  return badge(pick(r,"Cumprimento")==="SIM"?"CUMPRIMENTO":"—",pick(r,"Cumprimento")==="SIM"?"blue":"gray");
}

function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,2);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains("rows"))db.createObjectStore("rows",{keyPath:"_key"});if(!db.objectStoreNames.contains("meta"))db.createObjectStore("meta",{keyPath:"key"});if(!db.objectStoreNames.contains("outbox"))db.createObjectStore("outbox",{keyPath:"id",autoIncrement:true});if(!db.objectStoreNames.contains("crm"))db.createObjectStore("crm",{keyPath:"key"});if(!db.objectStoreNames.contains("crmOutbox"))db.createObjectStore("crmOutbox",{keyPath:"id",autoIncrement:true})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function idbAll(store){const db=await openDb();return new Promise((res,rej)=>{const tx=db.transaction(store,"readonly"),rq=tx.objectStore(store).getAll();rq.onsuccess=()=>res(rq.result);rq.onerror=()=>rej(rq.error)})}
async function idbPut(store,value){const db=await openDb();return new Promise((res,rej)=>{const tx=db.transaction(store,"readwrite");tx.objectStore(store).put(value);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
async function idbClear(store){const db=await openDb();return new Promise((res,rej)=>{const tx=db.transaction(store,"readwrite");tx.objectStore(store).clear();tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
async function saveRows(rows){await idbClear("rows");const db=await openDb();return new Promise((res,rej)=>{const tx=db.transaction("rows","readwrite"),st=tx.objectStore("rows");rows.forEach(r=>st.put({...r,_key:keyOf(r)}));tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
function currentUser(){return state.session?.user||{}}
function elevatedUser(){return /superadmin|supervisor|administrador|admin/i.test(String(currentUser().perfil||""))}
function assistantSegments(v){return String(v??"").split(/[\\/|;,]+/).map(x=>String(x||"").trim()).filter(Boolean)}
function personKeys(v){
  const raw=String(v??"").trim();if(!raw)return[];
  const parts=raw.split(/\s+/).filter(Boolean);
  return [...new Set([norm(raw),norm(parts[0]||"")].filter(x=>x.length>=3))];
}
function isMine(r){
  if(elevatedUser())return true;
  const u=currentUser();
  const userKeys=[...new Set([...personKeys(u.nome),...personKeys(u.usuario)])];
  if(!userKeys.length)return false;
  return assistantSegments(pick(r,"Assistente")).some(seg=>personKeys(seg).some(k=>userKeys.includes(k)));
}
function refreshScopes(){state.rows=(state.companyRows||[]).filter(isMine)}
async function loadLocal(){
  state.companyRows=(await idbAll("rows")).map(({_key,...r})=>r);
  const metas=await idbAll("meta");
  const sync=metas.find(x=>x.key==="lastSync"),at=metas.find(x=>x.key==="lastSyncAt");
  if(sync)state.lastSync=sync.value;
  if(at)state.lastSyncAt=Number(at.value||0);
  refreshScopes();
  return state.companyRows;
}
function cacheFresh(){return !!state.companyRows.length&&!!state.lastSyncAt&&(Date.now()-state.lastSyncAt)<CACHE_TTL_MS}
const CRM_KEYS={Clientes:"ClienteId",Interacoes:"InteracaoId",PipelineCRM:"OportunidadeId",AgendaCRM:"EventoId",TarefasCRM:"TarefaId",DocumentosCRM:"DocumentoId",Honorarios:"id"};
let crmClientCache={company:null,source:null,rows:[],map:new Map()};
let clientProcessCache={company:null,byId:new Map(),byName:new Map()};
function invalidateCrmIndexes(){
  crmClientCache={company:null,source:null,rows:[],map:new Map()};
  clientProcessCache={company:null,byId:new Map(),byName:new Map()};
}
async function loadCrmCache(){
  const items=await idbAll("crm").catch(()=>[]);
  for(const item of items||[])if(item?.key&&Array.isArray(item.rows))state.crm[item.key]=item.rows;
  state.crmLoaded=items.length>0;
  return state.crm;
}
async function saveCrmCache(table){
  await idbPut("crm",{key:table,rows:state.crm[table]||[],ts:Date.now()});
}
function crmKey(table,row){
  const k=CRM_KEYS[table]||"id";return String(row?.[k]||row?.id||"").trim();
}
function crmUpsertLocal(table,row){
  if(!state.crm[table])state.crm[table]=[];
  const key=crmKey(table,row),list=state.crm[table];
  const i=key?list.findIndex(x=>crmKey(table,x)===key):-1;
  if(i>=0)list[i]={...list[i],...row};else list.unshift(row);
  invalidateCrmIndexes();
}
async function queueCrmWrite(table,row){
  const db=await openDb();
  await new Promise((res,rej)=>{const tx=db.transaction("crmOutbox","readwrite");tx.objectStore("crmOutbox").add({table,row,ts:Date.now()});tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});
}
async function flushCrmOutbox(){
  const items=await idbAll("crmOutbox").catch(()=>[]);if(!items.length)return {ok:true,written:0};
  const byTable=new Map();for(const x of items){const a=byTable.get(x.table)||[];a.push(x.row);byTable.set(x.table,a)}
  let written=0;
  for(const [table,rows] of byTable){
    const j=await apiSheets({action:"crm_write",table,rows});
    written+=Number(j.written||rows.length);
  }
  await idbClear("crmOutbox");return {ok:true,written};
}
async function crmWrite(table,row,{quiet=false}={}){
  crmUpsertLocal(table,row);await saveCrmCache(table);
  if(!navigator.onLine){await queueCrmWrite(table,row);if(!quiet)showBanner("CRM salvo offline; será enviado quando a conexão voltar.","good");return {ok:true,queued:true}}
  try{
    const j=await apiSheets({action:"crm_write",table,rows:[row]});
    state.crmBridgeReady=true;return j;
  }catch(e){
    state.crmBridgeReady=false;await queueCrmWrite(table,row);
    if(!quiet)showBanner("CRM preservado no cache. Bridge da planilha ainda precisa da versão CRM: "+(e.message||String(e)),"bad");
    return {ok:false,queued:true,error:e.message||String(e)};
  }
}
async function syncCRM({quiet=true}={}){
  if(state.crmLoading||!state.session||!navigator.onLine)return;
  state.crmLoading=true;
  try{
    await flushCrmOutbox().catch(()=>{});
    const tables=["Clientes","Interacoes","PipelineCRM","AgendaCRM","TarefasCRM","DocumentosCRM"];
    if(elevatedUser())tables.push("Honorarios");
    for(const table of tables){
      try{
        const j=await apiSheets({action:"crm_list",table,limit:table==="Interacoes"?12000:6000});
        state.crm[table]=Array.isArray(j.rows)?j.rows:[];
        await saveCrmCache(table);state.crmBridgeReady=true;
      }catch(e){
        state.crmBridgeReady=false;
        if(!quiet&&table==="Clientes")showBanner("Usando CRM derivado da aba Processos até publicar o bridge CRM.","bad");
        break;
      }
    }
    state.crmLoaded=true;
  }finally{state.crmLoading=false;render()}
}
function crmClients(){
  const source=state.crm.Clientes||[];
  if(crmClientCache.company===state.companyRows&&crmClientCache.source===source)return crmClientCache.rows;
  const derived=window.LexisCRM?.groupProcessesByClient?window.LexisCRM.groupProcessesByClient(state.companyRows):[];
  const pById=new Map(derived.map(x=>[String(x.ClienteId),x]));
  let out;
  if(!source.length)out=[...derived];
  else{
    out=source.map(c=>{
      const id=String(c.ClienteId||""),p=pById.get(id)||{};
      return {...p,...c,ClienteId:id,Nome:c.Nome||p.Nome||"",processos:p.processos||[],protocolos:p.protocolos||[],Telefone_Principal:c.Telefone_Principal||p.Telefone_Principal||"",Responsavel:c.Responsavel||p.Responsavel||""};
    });
    const seen=new Set(out.map(x=>String(x.ClienteId||"")));
    for(const d of derived){const id=String(d.ClienteId||"");if(!seen.has(id)){out.push(d);seen.add(id)}}
  }
  out.sort((a,b)=>String(a.Nome||"").localeCompare(String(b.Nome||""),"pt-BR"));
  crmClientCache={company:state.companyRows,source,rows:out,map:new Map(out.map(c=>[String(c.ClienteId||""),c]))};
  return out;
}
function clientById(id){crmClients();return crmClientCache.map.get(String(id))||null}
function crmRowsForClient(table,id){return (state.crm[table]||[]).filter(x=>String(x.ClienteId||x.cliente_id||"")===String(id))}
function clientProcessIndex(){
  if(clientProcessCache.company===state.companyRows)return clientProcessCache;
  const byId=new Map(),byName=new Map();
  for(const r of state.companyRows||[]){
    const id=String(pick(r,"ClienteId")||"").trim(),name=norm(pick(r,"Cliente"));
    if(id){const a=byId.get(id)||[];a.push(r);byId.set(id,a)}
    if(name){const a=byName.get(name)||[];a.push(r);byName.set(name,a)}
  }
  clientProcessCache={company:state.companyRows,byId,byName};return clientProcessCache;
}

function officialDjen(row){return pick(row,"DJEN • Última Publicação")||""}
function legacyDjenSummary(row){return pick(row,"Resumo DJEN","DJEN_Resumo")||""}
function mergeJudicialScan(a,b){
  a=a||{};b=b||{};const out={...a,...b,patch:{...(a.patch||{}),...(b.patch||{})}};
  const dj=[...(a.datajud?.movimentos||[]),...(b.datajud?.movimentos||[])],dm=new Map();
  for(const x of dj){const k=String(x?.hash||[x?.dataHora||x?.data||"",x?.codigo||"",x?.nome||x?.descricao||"",x?.complemento||""].join("|"));if(k&&!dm.has(k))dm.set(k,x)}
  if(dm.size)out.datajud={...(a.datajud||{}),...(b.datajud||{}),error:false,movimentos:[...dm.values()].sort((x,y)=>historyDate(y?.dataHora||y?.data).getTime()-historyDate(x?.dataHora||x?.data).getTime())};
  const dn=[...(a.djen?.items||[]),...(b.djen?.items||[])],pm=new Map();
  for(const x of dn){const k=String(x?.id||x?.hash||[x?.data_disponibilizacao||x?.data||"",x?.tipoComunicacao||x?.tipoDocumento||"",x?.texto||""].join("|"));if(k&&!pm.has(k))pm.set(k,x)}
  if(pm.size)out.djen={...(a.djen||{}),...(b.djen||{}),success:true,items:[...pm.values()].sort((x,y)=>historyDate(y?.data_disponibilizacao||y?.data).getTime()-historyDate(x?.data_disponibilizacao||x?.data).getTime())};
  return out;
}
function storedHistoryScan(j){
  return {datajud:{error:false,movimentos:Array.isArray(j?.datajud)?j.datajud:[]},djen:{success:true,items:Array.isArray(j?.djen)?j.djen:[]},stored:true};
}
async function djenViaSheetsBridge(cnj,row){
  try{
    const j=await apiSheets({action:"djen_fetch",protocolo:cnjFormatted(cnj),tribunal:row?pick(row,"Tribunal"):"",maxPages:20,itensPorPagina:100});
    if(!j?.success)return {success:false,error:j?.error||"DJEN não retornou publicação pelo bridge da planilha."};
    return {success:true,items:j.items||[],latest:j.latest||j.items?.[0]||null,patch:j.patch||{},saved:j.saved||null,source:j.source||"Google Apps Script"};
  }catch(e){return {success:false,error:e.message||String(e)}}
}
function judicialWritePatch(row,scan){
  const events={datajud:[],djen:[]};
  if(!scan.datajud?.error&&Array.isArray(scan.datajud?.movimentos))events.datajud=scan.datajud.movimentos.map(m=>({...m,orgaoJulgador:scan.datajud.orgaoJulgador||""}));
  if(Array.isArray(scan.djen?.items))events.djen=scan.djen.items;
  const patch={Protocolo:pick(row,"Protocolo"),...scan.patch};
  // O bridge preserva campos vazios; não os trate como alterações confirmáveis.
  for(const key of Object.keys(patch))if(patch[key]==null||String(patch[key]).trim()==="")delete patch[key];
  // Alias redundante sem coluna própria na planilha; a publicação já vai no campo DJEN.
  delete patch["Publicação DJEN"];
  if(events.datajud.length||events.djen.length)patch._JudicialHistory=events;
  return patch;
}
function mergeQueuedWrite(previous,row){
  const merged=Object.assign({},...previous,row);
  const histories=[...previous,row].map(x=>x._JudicialHistory).filter(Boolean);
  if(histories.length){
    merged._JudicialHistory={};
    for(const source of ["datajud","djen"]){
      const unique=new Map();
      for(const h of histories)for(const event of h[source]||[])unique.set(JSON.stringify(event),event);
      merged._JudicialHistory[source]=[...unique.values()];
    }
  }
  return merged;
}
async function queueWrite(row){
  const list=await idbAll("outbox"),k=keyOf(row);
  row=mergeQueuedWrite(list.filter(x=>keyOf(x.row)===k).map(x=>x.row),row);
  const db=await openDb();
  await new Promise((res,rej)=>{
    const tx=db.transaction("outbox","readwrite"),st=tx.objectStore("outbox");
    list.filter(x=>keyOf(x.row)===k).forEach(x=>st.delete(x.id));
    st.add({row,ts:Date.now()});
    tx.oncomplete=res;tx.onerror=()=>rej(tx.error);
  });
  updateSyncUi();
}
async function outboxCount(){return (await idbAll("outbox")).length}
function mergePending(rows,pending){
  const map=new Map(rows.map(r=>[keyOf(r),r]));
  pending.forEach(x=>map.set(keyOf(x.row),{...(map.get(keyOf(x.row))||{}),...x.row}));
  return [...map.values()];
}

async function apiSheets(payload){
  const r=await fetch("/api/sheets",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({payload}),cache:"no-store"});
  const j=await r.json().catch(()=>({ok:false,error:"Resposta inválida"}));
  if(!r.ok){
    const e=new Error(j.error||"Falha ao acessar a planilha");
    e.status=r.status;e.data=j;throw e;
  }
  if(j.ok===false&&!j.conflict){
    const e=new Error(j.error||"Falha ao acessar a planilha");
    e.status=r.status;e.data=j;throw e;
  }
  return j;
}
async function loginCloud(user,pass){return apiSheets({action:"login",usuario:user,login:user,senha:pass})}
async function syncFromCloud(opts={}){
  if(state.syncing)return;
  state.syncing=true;
  if(!opts.quiet)showBanner("Sincronizando carteira com o Google Sheets…","good");
  try{
    try{await flushOutbox({force:!opts.quiet})}catch(e){if(!opts.quiet)showBanner("Há edição pendente: "+(e.message||String(e)),"bad")}
    try{await flushCrmOutbox()}catch(_){}
    const payload={action:"list",limit:8000,scope:"company"};
    const j=await apiSheets(payload);
    let rows=j.rows||j.data||j.todas||[];if(!Array.isArray(rows))throw new Error("Bridge não retornou uma lista de processos.");
    const pending=await idbAll("outbox");
    rows=mergePending(rows,pending);
    state.companyRows=rows;refreshScopes();await saveRows(rows);
    state.lastSync=now();state.lastSyncAt=Date.now();
    await idbPut("meta",{key:"lastSync",value:state.lastSync});
    await idbPut("meta",{key:"lastSyncAt",value:state.lastSyncAt});
    if(!opts.quiet){
      showBanner("Sincronização concluída: "+rows.length+" processos da empresa em cache"+(pending.length?" • "+pending.length+" edição(ões) pendente(s)":"")+".","good");
    }
    render();
    void syncCRM({quiet:true}).then(()=>{if(window.WAAutoModule?.backgroundSync)void window.WAAutoModule.backgroundSync(state.companyRows,crmClients());}).catch(()=>{});
  } finally { state.syncing=false; }
}
function startAutoSync(){
  if(state.autoSyncTimer)clearInterval(state.autoSyncTimer);
  state.autoSyncTimer=setInterval(async()=>{
    if(!state.session||!navigator.onLine||document.hidden||state.syncing)return;
    const pending=await outboxCount().catch(()=>0),crmPending=(await idbAll("crmOutbox").catch(()=>[])).length;
    if(cacheFresh()&&!pending&&!crmPending)return;
    try{await syncFromCloud({quiet:true})}catch(_){}
  },300000);
}
function stopAutoSync(){
  if(state.autoSyncTimer)clearInterval(state.autoSyncTimer);
  state.autoSyncTimer=null;
}
function comparable(v,key){
  const s=String(v??"").trim();
  if(/Protocolo|CNJ/i.test(key))return digits(s);
  if(/Telefone/i.test(key))return digits(s);
  if(/Retorno|Sincroniza/i.test(key)){
    const d=parseDate(s);if(d)return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
  }
  return norm(s);
}
async function verifySheetWrite(row){
  const protocolo=pick(row,"Protocolo","CNJ");
  if(!digits(protocolo))return {ok:false,error:"Sem Protocolo/CNJ para confirmar gravação."};
  const j=await apiSheets({action:"get",protocolo});
  const saved=j.row||(Array.isArray(j.data)?j.data[0]:null);
  if(!saved)return {ok:false,error:"A gravação não apareceu na planilha após o envio."};
  const keys=Object.keys(row).filter(k=>!["Automação","Próxima Sincronização","_JudicialHistory"].includes(k));
  const bad=[];
  for(const k of keys){
    const expected=comparable(row[k],k),actual=comparable(pick(saved,k),k);
    if(expected!==actual)bad.push(k);
  }
  return bad.length?{ok:false,error:"A planilha não confirmou: "+bad.slice(0,5).join(", ")}:{ok:true,row:saved};
}
async function flushOutbox(opts={}){
  const list=await idbAll("outbox");if(!list.length)return {ok:true,written:0};
  const force=!!opts.force,nowTs=Date.now(),valid=[],invalid=[],deferred=[];
  for(const item of list){
    const cnj=digits(pick(item.row||{},"Protocolo","protocolo","CNJ","cnj"));
    if(cnj.length!==20){invalid.push(item);continue}
    if(!force&&Number(item.retryAfter||0)>nowTs){deferred.push(item);continue}
    valid.push(item);
  }
  // Sem CNJ válido não existe forma segura de reconciliar o registro com Processos.
  if(invalid.length){
    const db=await openDb();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction("outbox","readwrite"),st=tx.objectStore("outbox");
      invalid.forEach(item=>st.delete(item.id));
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    });
  }
  if(!valid.length)return {ok:true,written:0,droppedInvalid:invalid.length,deferred:deferred.length};

  const latestItems=new Map();
  valid.forEach(item=>latestItems.set(keyOf(item.row),item));
  const unique=[...latestItems.values()],rows=unique.map(x=>x.row);
  const j=await apiSheets({action:"write",rows});

  if(rows.some(row=>row._JudicialHistory)&&j.history_saved!==true&&!j.conflict){
    throw new Error("Resumo salvo, mas o Apps Script publicado ainda não grava os históricos. Atualize o bridge e publique uma Nova versão. Os eventos continuam pendentes neste navegador.");
  }

  const confirmed=[],failed=[];
  for(const item of unique){
    const verify=await verifySheetWrite(item.row).catch(e=>({ok:false,error:e.message||String(e)}));
    if(verify.ok)confirmed.push(item);
    else failed.push({item,error:verify.error||j.error||j.warning||"Gravação não confirmada"});
  }

  const db=await openDb();
  await new Promise((resolve,reject)=>{
    const tx=db.transaction("outbox","readwrite"),st=tx.objectStore("outbox");
    const confirmedKeys=new Set(confirmed.map(x=>keyOf(x.row)));
    // Apaga todas as versões locais do mesmo processo que já foram confirmadas.
    list.forEach(item=>{if(confirmedKeys.has(keyOf(item.row)))st.delete(item.id)});
    // Conflitos ficam preservados, mas o auto-sync aguarda 30 min antes de tentar de novo.
    failed.forEach(({item,error})=>st.put({...item,conflict:String(error).slice(0,500),conflictAt:nowTs,retryAfter:nowTs+30*60*1000}));
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  });

  if(failed.length){
    const sample=failed.slice(0,3).map(x=>cnjFormatted(pick(x.item.row,"Protocolo","CNJ"))+": "+x.error).join(" • ");
    throw new Error(failed.length+" edição(ões) não confirmada(s) e preservada(s) localmente. "+sample);
  }
  return {...j,ok:true,written:confirmed.length,verified:true,droppedInvalid:invalid.length,deferred:deferred.length};
}
function showBanner(msg,type=""){const b=$("#banner");b.textContent=msg;b.className="banner "+type;b.classList.remove("hidden");clearTimeout(showBanner.t);showBanner.t=setTimeout(()=>b.classList.add("hidden"),7000)}
function setLogged(on){$("#login").classList.toggle("hidden",on);$("#app").classList.toggle("hidden",!on)}
function saveSession(s){
  state.session=s||null;
  try{
    if(state.session?.user)localStorage.setItem(SESSION_SNAPSHOT_KEY,JSON.stringify({user:state.session.user,ts:Date.now()}));
    else localStorage.removeItem(SESSION_SNAPSHOT_KEY);
  }catch(_){}
  refreshScopes();
}
function restoreSession(){
  try{
    const snap=JSON.parse(localStorage.getItem(SESSION_SNAPSHOT_KEY)||"null");
    state.session=snap?.user?{user:snap.user,cached:true}:null;
  }catch(_){state.session=null}
  refreshScopes();
  return state.session;
}

function metrics(rows=state.rows){
  const m={total:rows.length,active:0,closed:0,venc:0,attention:0,good:0,neutral:0,bad:0,newer:0,djen:0,dj:0,scoreSum:0,scoreN:0,proc:0,improc:0};
  rows.forEach(r=>{if(isClosed(r))m.closed++;else m.active++;const sr=statusRet(r);if(sr==="VENCIDO")m.venc++;if(sr==="ATENÇÃO")m.attention++;
    const q=quality(r);if(q==="BOM")m.good++;else if(q==="RUIM")m.bad++;else m.neutral++;
    if(boolish(pick(r,"Nova Atualização")))m.newer++;if(pick(r,"DJEN • Última Publicação"))m.djen++;if(pick(r,"DataJud • Último Movimento"))m.dj++;
    const sc=score(r);m.scoreSum+=sc;m.scoreN++;if(boolish(pick(r,"Procedente")))m.proc++;if(boolish(pick(r,"Improcedente")))m.improc++;
  });m.avg=m.scoreN?Math.round(m.scoreSum/m.scoreN):0;return m;
}
function taskWeight(r){
  const tp=window.LexisTaskPriority;
  return tp?.scoreCase?tp.scoreCase(r).score:0;
}
function tasks(){
  const tp=window.LexisTaskPriority;
  if(tp?.groupByClient){
    return tp.groupByClient(state.rows).map(g=>({r:g.reference||g.cases?.[0]||{},w:g.score||0,group:g,priority:g.priority||tp.scoreCase(g.reference||g.cases?.[0]||{})}));
  }
  return state.rows.map(r=>({r,w:taskWeight(r),group:{cliente:pick(r,"Cliente"),cases:[r]}})).filter(x=>x.w>0).sort((a,b)=>b.w-a.w);
}
function priority(w){return w>=950?"CRÍTICA":w>=800?"ALTA":w>=600?"MÉDIA":"NORMAL"}
function taskLabel(r){
  const tp=window.LexisTaskPriority;
  const p=tp?.scoreCase?tp.scoreCase(r):null;
  if(p?.label&&p.label!=="Rotina")return p.label;
  const sr=statusRet(r),move=latestMove(r).toLowerCase();
  if(sr==="VENCIDO")return"Retorno vencido";
  if(sr==="É HOJE"||sr==="ATENÇÃO")return"Retorno prioritário";
  if(/transito|baixa/.test(move))return"Revisar encerramento";
  if(/audienc/.test(move))return"Audiência";
  if(/cumprimento|execu/.test(move))return"Cumprimento / execução";
  if(boolish(pick(r,"Nova Atualização","Novo Andamento")))return"Nova atualização";
  return"Revisão operacional";
}

function titleFor(v){return {
  dashboard:["COMMAND CENTER","Dashboard"],
  hub:["CENTRAL","Central Integrada"],
  studio:["AI FABRIC","Predict Studio"],
  waauto:["WHATSAPP","WA.Auto"],
  processos:["CARTEIRA","Processos"],
  empresa:["EMPRESA","Processos da empresa"],
  clientes:["CRM","Clientes"],
  pipeline:["CRM","Pipeline"],
  agenda:["CRM","Agenda"],
  financeiro:["CRM","Financeiro"],
  tarefas:["OPERAÇÃO","Tarefas"],
  analise:["INTELIGÊNCIA","Análise"],
  report:["EXECUTIVO","Report"],
  scanner:["REDE JUDICIAL","DataJud + DJEN"],
  settings:["PREFERÊNCIAS","Configurações"]
}[v]||["SHEETSPREDICT","Dashboard"]}
const viewPaths={dashboard:"/",hub:"/central",studio:"/studio",waauto:"/wa-auto",processos:"/cases",empresa:"/processos",clientes:"/clientes",pipeline:"/pipeline",agenda:"/agenda",financeiro:"/financeiro",tarefas:"/tarefas",analise:"/analise",report:"/report",scanner:"/scanner",settings:"/configuracoes"};
function pathView(){
  const rawHash=String(location.hash||"").replace(/^#/,"").replace(/\/+$/,"");
  if(rawHash){
    const hp=rawHash.startsWith("/")?rawHash:"/"+rawHash;
    const hv=Object.entries(viewPaths).find(([,x])=>x===hp)?.[0];
    if(hv)return hv;
  }
  // Compatibilidade com links antigos; a próxima navegação migra para /#/rota.
  const p=location.pathname.replace(/\/+$/,"")||"/";
  if(p==="/processos-empresa")return"empresa";
  return Object.entries(viewPaths).find(([,x])=>x===p)?.[0]||"dashboard";
}
function viewUrl(v){const p=viewPaths[v]||"/";return p==="/"?"/#/":"/#"+p}
function setView(v,push=true){
  state.view=v;
  document.querySelectorAll(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===v));
  const [e,t]=titleFor(v);$("#viewEyebrow").textContent=e;$("#viewTitle").textContent=t;
  const target=viewUrl(v);
  if(push&&(location.pathname+location.hash)!==target)history.pushState({view:v},"",target);
  render();
}
function render(){
  const m=metrics();$("#navProcessos").textContent=m.total;$("#navEmpresa").textContent=state.companyRows.length;$("#navClientes").textContent=crmClients().length;$("#navTarefas").textContent=tasks().length;updateSyncUi();
  if(state.view==="dashboard")renderDashboard();
  else if(state.view==="hub")renderHub();
  else if(state.view==="studio")renderPredictStudio();
  else if(state.view==="waauto")renderWAAuto();
  else if(state.view==="processos")renderProcessos();
  else if(state.view==="empresa")renderEmpresa();
  else if(state.view==="clientes")renderClientes();
  else if(state.view==="pipeline")renderPipeline();
  else if(state.view==="agenda")renderAgenda();
  else if(state.view==="financeiro")renderFinanceiro();
  else if(state.view==="tarefas")renderTarefas();
  else if(state.view==="analise")renderAnalise();
  else if(state.view==="report")renderReport();
  else if(state.view==="scanner")renderScanner();
  else if(state.view==="settings")renderSettings();
  else setView("dashboard",false);
  scheduleGlobalXScroll();
}
function renderPredictStudio(){
  const root=$("#content");
  if(!root)return;
  if(!window.PredictStudio){
    root.innerHTML='<div class="banner bad">Predict Studio não carregou. Atualize o PWA e tente novamente.</div>';
    return;
  }
  window.PredictStudio.render(root,{
    showBanner,
    user:currentUser,
    context:()=>hubContext(state.hub?.selectedCnj||"")
  });
}
function renderWAAuto(){
  const root=$("#content");
  if(!root)return;
  if(!window.WAAutoModule){
    root.innerHTML='<div class="banner bad">WA.Auto não carregou. Atualize o PWA e tente novamente.</div>';
    return;
  }
  window.WAAutoModule.render(root,{
    rows:()=>state.companyRows,
    clients:()=>crmClients(),
    showBanner
  });
}
async function updateSyncUi(){const count=await outboxCount(),crmCount=(await idbAll("crmOutbox").catch(()=>[])).length,online=navigator.onLine,authenticated=!!state.session;$("#modeChip").textContent=authenticated?(online?"AUTENTICADO":"SEM CONEXÃO"):"BLOQUEADO";$("#syncDot").className="dot "+(authenticated&&online?"ok":"bad");$("#syncText").textContent=(state.lastSync?"Sync "+state.lastSync:"Aguardando autenticação")+((count+crmCount)?" • "+(count+crmCount)+" pendente(s)":"")}
function kpi(label,value,sub,cls=""){return '<div class="kpi '+cls+'"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(sub||"")+'</small></div>'}
function isRecentDate(v,days=7){
  const d=parseDate(v);if(!d)return false;
  return Date.now()-d.getTime()<=days*86400000&&Date.now()>=d.getTime()-86400000;
}

function themePreview(theme){
  return '<div class="theme-preview" style="--preview-bg:'+esc(theme.bg)+';--preview-surface:'+esc(theme.surface)+';--preview-nav:'+esc(theme.nav)+';--preview-accent:'+esc(theme.accent)+'">'+
    '<div class="theme-preview-nav"><i></i><i></i><i></i><i></i></div>'+
    '<div class="theme-preview-main"><span></span><div class="theme-preview-kpis"><b></b><b></b><b></b></div><div class="theme-preview-table"><i></i><i></i><i></i><i></i></div></div>'+
  '</div>';
}
function renderSettings(){
  const current=savedTheme();
  $("#content").innerHTML=
    '<div class="settings-shell"><div class="lexis-page-header"><div><span class="eyebrow">PREFERÊNCIAS</span><h2>Configurações</h2><p>Personalize a aparência do SheetsPredict neste navegador.</p></div><div class="command-actions"><button class="btn" id="resetThemeBtn">Restaurar padrão</button></div></div>'+
    '<section class="card settings-section"><div class="card-head"><div><span class="eyebrow">APARÊNCIA</span><h3>Tema do aplicativo</h3></div><span class="settings-current">Atual: <strong>'+esc((THEMES.find(t=>t.id===current)||THEMES[0]).name)+'</strong></span></div>'+
    '<div class="theme-grid">'+THEMES.map(t=>'<button class="theme-card '+(t.id===current?'selected':'')+'" type="button" data-theme-choice="'+esc(t.id)+'" aria-pressed="'+(t.id===current?'true':'false')+'">'+
      themePreview(t)+
      '<div class="theme-card-copy"><div><strong>'+esc(t.name)+'</strong><span class="theme-mode">'+esc(t.mode)+'</span></div><p>'+esc(t.desc)+'</p></div>'+
      '<span class="theme-check">'+(t.id===current?'✓':'')+'</span>'+
    '</button>').join("")+'</div></section>'+
    '<section class="card settings-section"><div class="card-head"><div><span class="eyebrow">COMPORTAMENTO</span><h3>Como funciona</h3></div></div><div class="settings-info">'+
      '<div><strong>Aplicação imediata</strong><span>O tema muda sem recarregar a página.</span></div>'+
      '<div><strong>Preferência local</strong><span>Fica salvo somente neste navegador e não altera a planilha.</span></div>'+
      '<div><strong>Todas as telas</strong><span>Dashboard, processos, CRM, DataJud/DJEN, Central Integrada e diálogos usam o mesmo tema.</span></div>'+
    '</div></section></div>';
  $$("[data-theme-choice]").forEach(b=>b.onclick=()=>{
    const theme=applyTheme(b.dataset.themeChoice);
    showBanner("Tema "+theme.name+" aplicado.","good");
    renderSettings();
  });
  $("#resetThemeBtn").onclick=()=>{applyTheme("default");showBanner("Tema padrão restaurado.","good");renderSettings()};
}
function renderDashboard(){
  const m=metrics(),classified=m.proc+m.improc,procPct=classified?Math.round(m.proc/classified*1000)/10:0,djenPct=m.total?Math.round(m.djen/m.total*1000)/10:0,djPct=m.total?Math.round(m.dj/m.total*1000)/10:0;
  const critical=tasks().slice(0,10);
  const potential=state.rows.filter(r=>commercialStatus(r).includes("POTENCIAL")).length;
  const noSell=state.rows.filter(r=>commercialStatus(r).includes("NÃO VENDER")).length;
  const clientFav=state.rows.filter(r=>String(pick(r,"_Favorecido")).toUpperCase()==="CLIENTE").length;
  const bankFav=state.rows.filter(r=>String(pick(r,"_Favorecido")).toUpperCase()==="BANCO").length;
  const atendidosSemana=state.rows.filter(r=>pick(r,"AtendidoPor")&&isRecentDate(pick(r,"Último Retorno"),7)).length;
  const tribunalSemana=state.rows.filter(r=>isRecentDate(pick(r,"Última Sincronização"),7)&&(pick(r,"DataJud • Último Movimento")||pick(r,"DJEN • Última Publicação"))).length;
  const vencidos=state.rows.filter(r=>statusRet(r)==="VENCIDO").length;
  $("#content").innerHTML=
  '<div class="lexis-page-shell"><div class="lexis-page-header"><div><span class="eyebrow">COMMAND CENTER</span><h2>Dashboard</h2><p>Visão da carteira · Google Sheets + DataJud + DJEN</p></div><div class="command-actions"><button class="btn" data-goto="hub">Central Integrada</button><button class="btn" data-goto="report">Dossiê operacional</button><button class="btn" data-goto="processos">Meus processos</button><button class="btn primary" data-goto="scanner">DataJud + DJEN</button></div></div>'+
  '<div class="lexis-tabbar"><button class="active">Visão da carteira</button><button data-goto="empresa">Processos da empresa</button><button data-goto="tarefas">Fila</button><button data-goto="report">Report</button></div>'+
  '<div class="kpi-grid dashboard-kpis">'+
    kpi("Processos",m.total,m.active+" ativos")+
    kpi("Vencidos",vencidos,m.attention+" em atenção","bad")+
    kpi("Atendidos sem.",atendidosSemana,"últimos 7 dias","good")+
    kpi("Tribunal sem.",tribunalSemana,"DataJud/DJEN")+
    kpi("Novidades",m.newer,"após último retorno",m.newer?"warn":"good")+
    kpi("Potencial",potential,"triagem comercial",potential?"good":"")+
  '</div>'+
  '<div class="dashboard-layout"><div class="card"><div class="card-head"><div><span class="eyebrow">PRIORIDADE</span><h3>Fila crítica da carteira</h3></div><button class="btn sm" data-goto="tarefas">Ver fila completa</button></div><div class="table-wrap flat dashboard-table"><table class="table compact"><thead><tr><th>Prioridade</th><th>Cliente</th><th>CNJ</th><th>Motivo</th><th>Retorno</th><th>Ações</th></tr></thead><tbody>'+
  critical.map(x=>{const key=keyOf(x.r);return '<tr><td>'+badge(priority(x.w),x.w>=950?"bad":x.w>=800?"warn":"blue")+'</td><td><div class="cell-main">'+esc(pick(x.r,"Cliente"))+'</div><div class="cell-sub">'+esc(pick(x.r,"Assistente"))+'</div></td><td class="mono">'+esc(cnjFormatted(pick(x.r,"Protocolo")))+'</td><td>'+esc(taskLabel(x.r))+'</td><td>'+badge(statusRet(x.r),statusRet(x.r)==="VENCIDO"?"bad":statusRet(x.r)==="ATENÇÃO"?"warn":"gray")+'</td><td class="actions"><button class="icon-action" data-history="'+esc(key)+'">Histórico</button><button class="icon-action" data-attendance="'+esc(key)+'">Atendimento</button></td></tr>'}).join("")+
  '</tbody></table></div></div>'+
  '<div class="stack"><div class="card"><div class="card-head"><div><span class="eyebrow">REDE JUDICIAL</span><h3>Cobertura</h3></div></div><div class="card-body metric-list">'+
    metricRow("DataJud",djPct+"%",m.dj+" processos com movimento")+
    metricRow("DJEN",djenPct+"%",m.djen+" processos com publicação")+
    metricRow("Procedência",procPct+"%",classified+" resultados classificados")+
    metricRow("Cliente favorecido",clientFav,bankFav+" banco favorecido")+
  '</div></div>'+
  '<div class="card"><div class="card-head"><div><span class="eyebrow">COMERCIAL</span><h3>Esteira</h3></div></div><div class="card-body metric-list">'+
    metricRow("Potencial",potential,"crédito/direito a revisar")+
    metricRow("Não vender",noSell,"resultado adverso ou fase encerrada")+
    metricRow("Revisar",state.rows.length-potential-noSell,"sem gatilho conclusivo")+
  '</div></div></div></div></div>';
  bindGotos();
  $$("[data-history]").forEach(b=>b.onclick=()=>openHistory(b.dataset.history));
  $$("[data-attendance]").forEach(b=>b.onclick=()=>openAttendance(b.dataset.attendance));
}

async function hubApi(payload){
  const r=await fetch("/api/integration-hub",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload||{}),cache:"no-store"});
  const j=await r.json().catch(()=>({ok:false,error:"Resposta inválida da Central Integrada"}));
  if(!r.ok||j.ok===false)throw new Error(j.error||"Falha na Central Integrada");
  return j;
}
function hubSourceStatus(id){
  const h=state.hub.status||{},all=[...(h.services||[]),...(h.builtins||[])];
  return all.find(x=>x.id===id)||null;
}
function hubSourceCard(src){
  const st=hubSourceStatus(src.id),ok=!!st?.ok,configured=st?st.configured!==false:false;
  const label=!st?"carregando":ok?"ativo":configured?"indisponível":"não configurado";
  const cls=ok?"good":configured?"warn":"gray";
  return '<article class="hub-source-card"><div class="hub-source-head"><strong>'+esc(src.name)+'</strong>'+badge(label,cls)+'</div><p>'+esc(src.feature||src.role||"")+'</p><small>'+esc(src.repo||"")+'</small></article>';
}
function hubTabs(){
  const tabs=[["overview","Visão geral"],["ai","IA"],["whatsapp","WhatsApp"],["leads","Leads"],["revisional","Revisional"],["sheets","Planilha"],["integrations","Integrações"]];
  return '<div class="hub-tabs">'+tabs.map(([id,label])=>'<button class="'+(state.hub.tab===id?"active":"")+'" data-hub-tab="'+id+'">'+label+'</button>').join("")+'</div>';
}
function hubPortfolio(){
  return window.SheetsHub?.portfolio?window.SheetsHub.portfolio(state.companyRows,statusRet):{total:state.companyRows.length};
}
function hubAudit(){
  return window.SheetsHub?.audit?window.SheetsHub.audit(state.companyRows):null;
}
function hubOverviewHtml(){
  const p=hubPortfolio(),a=hubAudit(),sources=window.SheetsHub?.sources||[];
  return '<div class="hub-kpis">'+
    kpi("Processos",p.total||0,(p.ativos||0)+" ativos")+
    kpi("Vencidos",p.vencidos||0,(p.atencao||0)+" em atenção",(p.vencidos||0)?"bad":"good")+
    kpi("DataJud",p.datajud||0,"com movimento")+
    kpi("DJEN",p.djen||0,"com publicação oficial")+
    kpi("Saúde planilha",a?a.health+"%":"—",a?(a.duplicates+" duplicidade(s)"):"auditoria local")+
    kpi("Offline",navigator.onLine?"Pronto":"Ativo","IndexedDB + outbox",navigator.onLine?"good":"warn")+
  '</div>'+
  '<div class="hub-grid two"><section class="card"><div class="card-head"><div><span class="eyebrow">FUSÃO</span><h3>8 motores, um SheetsPredict</h3></div></div><div class="hub-source-grid">'+sources.map(hubSourceCard).join("")+'</div></section>'+
  '<section class="card"><div class="card-head"><div><span class="eyebrow">ATALHOS</span><h3>Operação integrada</h3></div></div><div class="hub-actions">'+
    '<button class="hub-action" data-hub-open="ai"><strong>IA operacional</strong><span>PredictLM → GREY → fallback local</span></button>'+
    '<button class="hub-action" data-hub-open="whatsapp"><strong>WhatsApp</strong><span>Estado e envio via WA.Auto</span></button>'+
    '<button class="hub-action" data-hub-open="leads"><strong>Leads públicos</strong><span>Scanner LEADCHECKIN + CRM</span></button>'+
    '<button class="hub-action" data-hub-open="revisional"><strong>Revisional</strong><span>Bacen SGS + simulação Leadcheck</span></button>'+
    '<button class="hub-action" data-hub-open="sheets"><strong>Planilha inteligente</strong><span>Mapeamento e auditoria SyncCRM</span></button>'+
  '</div></section></div>';
}
function hubAiHtml(){
  const msgs=state.hub.ai||[];
  return '<div class="hub-grid ai-layout"><section class="card hub-ai-card"><div class="card-head"><div><span class="eyebrow">PREDICTLM + GREY</span><h3>Assistente operacional</h3></div><span class="cell-sub">A carteira entra como contexto; a IA não altera dados sozinha.</span></div>'+
    '<div class="hub-chat">'+(msgs.length?msgs.map(m=>'<article class="hub-msg '+esc(m.role)+'"><div class="hub-msg-meta">'+esc(m.role==="user"?"Você":(m.engine||"SheetsPredict"))+(m.provider?' · '+esc(m.provider):'')+'</div><div>'+esc(m.content).replace(/\n/g,"<br>")+'</div></article>').join(""):'<div class="empty">Pergunte sobre a carteira, um processo, prioridades, dossiê ou atendimento.</div>')+'</div>'+
    '<div class="hub-compose"><input id="hubAiCnj" placeholder="CNJ para contexto (opcional)" value="'+esc(state.hub.selectedCnj||"")+'"/><textarea id="hubAiPrompt" placeholder="Ex.: analise este processo e diga o próximo passo operacional"></textarea><div class="row end"><label class="hub-check"><input id="hubAiDeep" type="checkbox"/> análise profunda</label><button class="btn" id="hubAiPortfolio">Analisar carteira</button><button class="btn primary" id="hubAiSend">'+(state.hub.aiBusy?"Analisando…":"Enviar")+'</button></div></div></section>'+
    '<aside class="card"><div class="card-head"><div><span class="eyebrow">CONTEXTO</span><h3>O que a IA recebe</h3></div></div><div class="card-body"><p class="hub-note">KPIs da carteira, auditoria da planilha e, quando informado, o processo selecionado. Histórico judicial continua vindo de DataJud/DJEN e não é inventado pela IA.</p></div></aside></div>';
}
function hubWaHtml(){
  const wa=state.hub.wa,st=wa?.state||{},health=wa?.health||{},conn=st.connection||{},legal=st.legal||{};
  return '<div class="hub-grid two"><section class="card"><div class="card-head"><div><span class="eyebrow">WA.AUTO</span><h3>WhatsApp operacional</h3></div><button class="btn sm" id="hubWaRefresh">Atualizar estado</button></div>'+
    '<div class="hub-kpis compact">'+kpi("Conexão",conn.status||health.whatsapp||"—","WA.Auto")+kpi("Fila",st.busy?"ocupada":"livre","campanhas")+kpi("Monitor",legal.running===false?"parado":"ativo","DataJud/DJEN")+'</div>'+
    '<div class="hub-form"><div class="grid-2"><label>CNJ<input id="hubWaCnj" placeholder="processo opcional"/></label><label>Telefone<input id="hubWaPhone" placeholder="DDD + número"/></label></div><label>Mensagem<textarea id="hubWaMessage" placeholder="Mensagem ao cliente"></textarea></label><div class="row end"><button class="btn" id="hubWaLoad">Carregar do processo</button><button class="btn primary" id="hubWaSend">'+(state.hub.waBusy?"Enviando…":"Enviar via WA.Auto")+'</button></div><p class="field-hint">O envio só acontece ao clicar. Lista de não contatar e validações continuam no WA.Auto.</p></div></section>'+
    '<section class="card"><div class="card-head"><div><span class="eyebrow">MONITOR</span><h3>Integração processual</h3></div></div><div class="card-body"><p class="hub-note">O WA.Auto reaproveita a sessão cloud, fila idempotente, opt-out e monitor DataJud/DJEN. O SheetsPredict não cria um segundo cliente WhatsApp.</p></div></section></div>';
}
function hubLeadResultHtml(){
  const r=state.hub.lead;if(!r)return '<div class="empty">Nenhuma página analisada.</div>';
  if(!r.ok)return '<div class="banner bad">'+esc(r.error||"Não foi possível analisar a página.")+'</div>';
  return '<div class="lead-result"><div><strong>'+esc(r.personName||r.title||"Página pública")+'</strong><small>'+esc(r.url||"")+'</small></div>'+
    '<div class="lead-contact-row">'+badge((r.phones||[]).length+" telefone(s)","blue")+badge((r.emails||[]).length+" e-mail(s)","gray")+badge((r.scannedPages||0)+" página(s)","gray")+'</div>'+
    '<p>'+esc(r.snippet||"").slice(0,800)+'</p>'+
    '<div class="lead-contact-list">'+(r.phones||[]).map(x=>'<span>☎ '+esc(x)+'</span>').join("")+(r.emails||[]).map(x=>'<span>✉ '+esc(x)+'</span>').join("")+'</div>'+
    '<button class="btn primary sm" id="hubLeadSave">Salvar no CRM</button><small>'+esc(r.privacy||"")+'</small></div>';
}
function hubLeadsHtml(){
  const disc=state.hub.leadDiscover;
  return '<div class="hub-grid two"><section class="card"><div class="card-head"><div><span class="eyebrow">LEADCHECKIN</span><h3>Scanner de fonte pública</h3></div></div><div class="hub-form"><label>URL pública<input id="hubLeadUrl" placeholder="https://site-publico/..."/></label><button class="btn primary" id="hubLeadScan">'+(state.hub.leadBusy?"Analisando…":"Analisar página")+'</button></div><div class="card-body">'+hubLeadResultHtml()+'</div></section>'+
  '<section class="card"><div class="card-head"><div><span class="eyebrow">DESCOBERTA CONTÍNUA</span><h3>Buscar sinais públicos</h3></div></div><div class="hub-form"><div class="grid-2"><label>Interesse / produto<input id="hubLeadQuery" placeholder="financiamento, revisional..."/></label><label>Cidade<input id="hubLeadCity" placeholder="São Paulo"/></label></div><button class="btn" id="hubLeadDiscover">Buscar via LEADCHECKIN</button></div><div class="card-body">'+
    (disc?.leads?.length?disc.leads.slice(0,10).map(x=>'<div class="report-list-item"><div><strong>'+esc(x.personName||x.title||"Resultado público")+'</strong><small>'+esc(x.url||"")+'</small></div>'+badge(x.contactType||"público","gray")+'</div>').join(""):'<div class="empty">Se o serviço LEADCHECKIN estiver configurado, os resultados aparecem aqui.</div>')+
  '</div></section></div>';
}
function money(n){return Number(n||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}
function hubRevisionalHtml(){
  const b=state.hub.bacen,e=state.hub.bacenEstimate;
  return '<div class="hub-grid two"><section class="card"><div class="card-head"><div><span class="eyebrow">LEADCHECK + BACEN</span><h3>Simulação revisional</h3></div></div><div class="hub-form"><div class="grid-2"><label>Mês do contrato<input id="hubBacenDate" type="month" value="'+esc(new Date().toISOString().slice(0,7))+'"/></label><label>Parcela atual<input id="hubBacenInstallment" type="number" min="0" step="0.01" placeholder="1500"/></label><label>Prazo (meses)<input id="hubBacenMonths" type="number" min="1" value="48"/></label><label>Spread estimado (pp a.m.)<input id="hubBacenSpread" type="number" step="0.1" value="0.4"/></label></div><button class="btn primary" id="hubBacenRun">'+(state.hub.bacenBusy?"Consultando…":"Consultar Bacen e simular")+'</button></div></section>'+
  '<section class="card"><div class="card-head"><div><span class="eyebrow">PRÉ-ANÁLISE</span><h3>Resultado orientativo</h3></div></div><div class="card-body">'+
  (b?'<div class="metric-list">'+metricRow("Bacen mensal",Number(b.monthlyRate).toFixed(2)+"% a.m.",b.period||"")+metricRow("Bacen anual",b.annualRate!=null?Number(b.annualRate).toFixed(2)+"% a.a.":"—",b.seriesName||"")+(e?metricRow("Parcela simulada",money(e.bacenInstallment),"Price · "+e.months+" meses")+metricRow("Economia estimada",money(e.monthlySavings)+"/mês",money(e.totalSavings)+" no prazo"):"")+'</div><p class="hub-note">Estimativa de triagem; não substitui CET oficial nem cálculo pericial do contrato.</p>':'<div class="empty">Informe mês e parcela para consultar a série SGS e simular.</div>')+
  '</div></section></div>';
}
function hubSheetsHtml(){
  const a=hubAudit();if(!a)return '<div class="empty">Módulo SheetsHub ainda não carregou.</div>';
  return '<div class="hub-grid two"><section class="card"><div class="card-head"><div><span class="eyebrow">SYNCCRM</span><h3>Auditoria estrutural</h3></div><button class="btn sm" id="hubSheetSync">Sincronizar agora</button></div>'+
    '<div class="hub-kpis compact">'+kpi("Saúde",a.health+"%",a.rows+" linhas",a.health<80?"warn":"good")+kpi("Cabeçalhos",a.headers,a.mapped+"/"+a.required+" campos mapeados")+kpi("CNJ inválido",a.invalidCnj,"linhas",a.invalidCnj?"bad":"good")+kpi("Duplicados",a.duplicates,"CNJs",a.duplicates?"warn":"good")+kpi("Sem cliente",a.missingClient,"linhas")+kpi("Sem retorno",a.missingReturn,"linhas")+'</div></section>'+
    '<section class="card"><div class="card-head"><div><span class="eyebrow">MAPEAMENTO</span><h3>Cabeçalho → campo operacional</h3></div></div><div class="table-wrap flat"><table class="table compact"><thead><tr><th>Campo</th><th>Cabeçalho detectado</th><th>Confiança</th></tr></thead><tbody>'+a.mapping.map(x=>'<tr><td>'+esc(x.field)+'</td><td>'+esc(x.sheetHeader||"não localizado")+'</td><td>'+badge(x.confidence+"%",x.confidence>=80?"good":x.confidence>=50?"warn":"bad")+'</td></tr>').join("")+'</tbody></table></div></section></div>';
}
function hubIntegrationsHtml(){
  const h=state.hub.status,sources=window.SheetsHub?.sources||[];
  return '<section class="card"><div class="card-head"><div><span class="eyebrow">RUNTIME FEDERADO</span><h3>Fontes e motores</h3></div><button class="btn sm" id="hubStatusRefresh">Revalidar</button></div><div class="hub-source-grid">'+sources.map(hubSourceCard).join("")+'</div><div class="card-body"><p class="hub-note">Motores externos são ativados por variáveis de ambiente no deploy. Funcionalidades embutidas (planilha inteligente, Bacen, scanner público e offline) continuam disponíveis sem outro serviço.</p><div class="integration-env"><code>PREDICTLM_URL</code><code>WA_AUTO_URL</code><code>GREY_URL</code><code>LEADCHECKIN_URL</code><code>LEXISPREDICT_URL</code></div></div></section>'+
  (!h?'<div class="empty">Carregando estado das integrações…</div>':'');
}
function renderHub(){
  const content=$("#content");if(!content)return;
  content.innerHTML='<div class="hub-shell"><div class="lexis-page-header"><div><span class="eyebrow">SHEETSPREDICT CENTRAL</span><h2>Central Integrada</h2><p>IA, WhatsApp, leads, revisional, planilha e operação jurídica no mesmo aplicativo.</p></div><div class="command-actions"><button class="btn" data-goto="processos">Carteira</button><button class="btn" data-goto="tarefas">Fila</button><button class="btn primary" data-goto="scanner">Tribunal</button></div></div>'+hubTabs()+'<div class="hub-body">'+
    (state.hub.tab==="ai"?hubAiHtml():state.hub.tab==="whatsapp"?hubWaHtml():state.hub.tab==="leads"?hubLeadsHtml():state.hub.tab==="revisional"?hubRevisionalHtml():state.hub.tab==="sheets"?hubSheetsHtml():state.hub.tab==="integrations"?hubIntegrationsHtml():hubOverviewHtml())+
  '</div></div>';
  bindGotos();
  document.querySelectorAll("[data-hub-tab],[data-hub-open]").forEach(b=>b.onclick=()=>{state.hub.tab=b.dataset.hubTab||b.dataset.hubOpen;renderHub()});
  if(!state.hub.status&&!state.hub.loading)void loadHubStatus();
  if($("#hubStatusRefresh"))$("#hubStatusRefresh").onclick=()=>loadHubStatus(true);
  if($("#hubAiSend"))$("#hubAiSend").onclick=hubRunAi;
  if($("#hubAiPortfolio"))$("#hubAiPortfolio").onclick=()=>{const el=$("#hubAiPrompt");if(el)el.value="Analise a carteira atual, priorize os principais riscos operacionais e indique as próximas ações sem inventar fatos judiciais.";};
  if($("#hubAiCnj"))$("#hubAiCnj").oninput=e=>state.hub.selectedCnj=e.target.value;
  if($("#hubWaRefresh"))$("#hubWaRefresh").onclick=hubLoadWa;
  if($("#hubWaLoad"))$("#hubWaLoad").onclick=hubLoadProcessMessage;
  if($("#hubWaSend"))$("#hubWaSend").onclick=hubSendWa;
  if($("#hubLeadScan"))$("#hubLeadScan").onclick=hubScanLead;
  if($("#hubLeadDiscover"))$("#hubLeadDiscover").onclick=hubDiscoverLeads;
  if($("#hubLeadSave"))$("#hubLeadSave").onclick=hubSaveLead;
  if($("#hubBacenRun"))$("#hubBacenRun").onclick=hubRunBacen;
  if($("#hubSheetSync"))$("#hubSheetSync").onclick=async()=>{try{await syncFromCloud();renderHub()}catch(e){showBanner(e.message||String(e),"bad")}};
  if(state.hub.tab==="whatsapp"&&!state.hub.wa&&!state.hub.waBusy)void hubLoadWa();
}
async function loadHubStatus(force=false){
  if(state.hub.loading&&!force)return;state.hub.loading=true;
  try{state.hub.status=await hubApi({action:"status"})}
  catch(e){state.hub.status={ok:false,error:e.message||String(e),services:[],builtins:[]}}
  finally{state.hub.loading=false;if(state.view==="hub")renderHub()}
}
function hubContext(cnj){
  const p=hubPortfolio(),a=hubAudit(),d=digits(cnj||state.hub.selectedCnj),row=d?state.companyRows.find(r=>digits(pick(r,"Protocolo"))===d):null;
  return JSON.stringify({metrics:{...p,vencidos:p.vencidos,atencao:p.atencao},sheetAudit:a?{health:a.health,duplicates:a.duplicates,invalidCnj:a.invalidCnj,missingReturn:a.missingReturn}:null,process:row?{cnj:cnjFormatted(pick(row,"Protocolo")),cliente:pick(row,"Cliente"),tribunal:pick(row,"Tribunal"),assistente:pick(row,"Assistente"),status:pick(row,"Status"),ultimoMovimento:latestMove(row),dataMovimento:pick(row,"DataJud • Data"),djen:officialDjen(row),proximoRetorno:pick(row,"Próximo Retorno")}:null});
}
async function hubRunAi(){
  if(state.hub.aiBusy)return;const prompt=String($("#hubAiPrompt")?.value||"").trim();if(!prompt)return;
  const cnj=String($("#hubAiCnj")?.value||state.hub.selectedCnj||""),deep=!!$("#hubAiDeep")?.checked;state.hub.selectedCnj=cnj;
  state.hub.ai.push({role:"user",content:prompt});state.hub.aiBusy=true;renderHub();
  try{
    const j=await hubApi({action:"ai_chat",prompt,context:hubContext(cnj),deep,messages:state.hub.ai.slice(-8).map(x=>({role:x.role,content:x.content})),sessionId:String(currentUser().usuario||currentUser().nome||"sheetspredict")});
    state.hub.ai.push({role:"assistant",content:j.content||"Sem resposta.",engine:j.engine,provider:j.provider});
  }catch(e){state.hub.ai.push({role:"assistant",content:"Falha: "+(e.message||String(e)),engine:"Central Integrada"})}
  finally{state.hub.aiBusy=false;if(state.view==="hub")renderHub()}
}
async function hubLoadWa(){
  if(state.hub.waBusy)return;state.hub.waBusy=true;
  try{state.hub.wa=await hubApi({action:"wa_state"})}catch(e){state.hub.wa={ok:false,error:e.message||String(e)}}
  finally{state.hub.waBusy=false;if(state.view==="hub")renderHub()}
}
function hubFindProcess(raw){
  const d=digits(raw);if(d.length===20)return state.companyRows.find(r=>digits(pick(r,"Protocolo"))===d)||null;
  const q=norm(raw);return q?state.companyRows.find(r=>norm(pick(r,"Cliente")).includes(q)):null;
}
function hubLoadProcessMessage(){
  const row=hubFindProcess($("#hubWaCnj")?.value||"");if(!row){showBanner("Processo não encontrado.","bad");return}
  const phone=$("#hubWaPhone"),msg=$("#hubWaMessage");
  if(phone)phone.value=pick(row,"Telefone")||"";
  if(msg)msg.value=window.LexisSuggest?.quickMessage?window.LexisSuggest.quickMessage(row):("Olá, "+(pick(row,"Cliente")||"")+". Temos uma atualização sobre seu processo "+cnjFormatted(pick(row,"Protocolo"))+".");
}
async function hubSendWa(){
  if(state.hub.waBusy)return;const phone=String($("#hubWaPhone")?.value||""),message=String($("#hubWaMessage")?.value||"").trim();
  if(!phone||!message){showBanner("Informe telefone e mensagem.","bad");return}
  state.hub.waBusy=true;renderHub();
  try{const j=await hubApi({action:"wa_send",phone,message});showBanner("Mensagem adicionada à fila do WA.Auto.","good");state.hub.wa=await hubApi({action:"wa_state"}).catch(()=>state.hub.wa)}
  catch(e){showBanner(e.message||String(e),"bad")}
  finally{state.hub.waBusy=false;if(state.view==="hub")renderHub()}
}
async function hubScanLead(){
  if(state.hub.leadBusy)return;const url=String($("#hubLeadUrl")?.value||"").trim();if(!url)return;
  state.hub.leadBusy=true;renderHub();
  try{state.hub.lead=await hubApi({action:"lead_scan",url})}catch(e){state.hub.lead={ok:false,error:e.message||String(e)}}
  finally{state.hub.leadBusy=false;if(state.view==="hub")renderHub()}
}
async function hubDiscoverLeads(){
  if(state.hub.leadBusy)return;const query=String($("#hubLeadQuery")?.value||"").trim(),city=String($("#hubLeadCity")?.value||"").trim();if(!query||!city){showBanner("Informe interesse e cidade.","bad");return}
  state.hub.leadBusy=true;renderHub();
  try{state.hub.leadDiscover=await hubApi({action:"lead_discover",query,city})}catch(e){state.hub.leadDiscover={ok:false,error:e.message||String(e),leads:[]};showBanner(e.message||String(e),"bad")}
  finally{state.hub.leadBusy=false;if(state.view==="hub")renderHub()}
}
async function hubSaveLead(){
  const r=state.hub.lead;if(!r?.ok)return;const name=String(r.personName||r.title||"Lead público").trim(),phone=(r.phones||[])[0]||"",email=(r.emails||[])[0]||"",id="lead_"+hash(r.url||name);
  const ts=new Date().toISOString();
  await crmWrite("Clientes",{ClienteId:id,Tipo:"Lead",Nome:name,Telefone_Principal:phone,Email:email,Origem:"SheetsPredict · LEADCHECKIN",Status:"ATIVO",Responsavel:currentUser().nome||currentUser().usuario||"",AtualizadoEm:ts});
  await crmWrite("PipelineCRM",{OportunidadeId:"opp_"+id,ClienteId:id,Etapa:"Triagem",Servico:"Oportunidade pública",Responsavel:currentUser().nome||currentUser().usuario||"",Origem:r.url||"",AtualizadoEm:ts},{quiet:true});
  showBanner("Lead salvo em Clientes + Pipeline CRM.","good");
}
async function hubRunBacen(){
  if(state.hub.bacenBusy)return;const contractDate=String($("#hubBacenDate")?.value||""),installment=Number($("#hubBacenInstallment")?.value||0),months=Number($("#hubBacenMonths")?.value||48),spread=Number($("#hubBacenSpread")?.value||.4);
  if(!contractDate||installment<50){showBanner("Informe mês do contrato e parcela atual.","bad");return}
  state.hub.bacenBusy=true;renderHub();
  try{
    state.hub.bacen=await hubApi({action:"bacen",contractDate});
    state.hub.bacenEstimate=window.SheetsHub?.revisionalEstimate?window.SheetsHub.revisionalEstimate({currentInstallment:installment,bacenMonthlyPercent:state.hub.bacen.monthlyRate,months,assumedSpreadPp:spread}):null;
  }catch(e){showBanner(e.message||String(e),"bad")}
  finally{state.hub.bacenBusy=false;if(state.view==="hub")renderHub()}
}
function metricRow(label,value,sub){return '<div class="metric-row"><div><div class="cell-main">'+esc(label)+'</div><div class="cell-sub">'+esc(sub)+'</div></div><strong>'+esc(value)+'</strong></div>'}
function filteredRows(source=state.rows){
  const q=norm(state.query),st=state.status,qual=state.quality;
  return (source||[]).filter(r=>(!q||norm(Object.values(r).join(" ")).includes(q))&&(!st||statusRet(r)===st)&&(!qual||quality(r)===qual));
}
function resetPage(view){if(state.pageSize[view]!=null)state.pageSize[view]=PAGE_DEFAULT}
function pageLimit(view){return Math.max(1,Number(state.pageSize[view]||PAGE_DEFAULT))}
function searchFieldHtml(id,placeholder,value){
  return '<label class="search-field" for="'+esc(id)+'"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"/></svg><input id="'+esc(id)+'" type="search" autocomplete="off" spellcheck="false" placeholder="'+esc(placeholder)+'" value="'+esc(value||"")+'"/></label>';
}
function bindSearchInput(selector,view,renderFn){
  const input=$(selector);if(!input)return;
  input.oninput=e=>{
    const pos=e.target.selectionStart??String(e.target.value||"").length;
    state.query=e.target.value;resetPage(view);renderFn();
    const next=$(selector);
    if(next){next.focus({preventScroll:true});try{next.setSelectionRange(pos,pos)}catch(_){}}
  };
}
let globalXTarget=null,globalXBusy=false,globalXTick=0;
function ensureGlobalXScroll(){
  let dock=document.getElementById("globalXScroll");
  if(dock)return dock;
  dock=document.createElement("div");
  dock.id="globalXScroll";dock.className="global-x-scroll";
  dock.setAttribute("aria-label","Rolagem horizontal da tabela visível");
  dock.innerHTML='<div class="global-x-scroll-inner"></div>';
  document.body.appendChild(dock);
  dock.addEventListener("scroll",()=>{
    if(globalXBusy||!globalXTarget)return;
    const dockRange=Math.max(0,dock.scrollWidth-dock.clientWidth);
    const targetRange=Math.max(0,globalXTarget.scrollWidth-globalXTarget.clientWidth);
    const ratio=dockRange?dock.scrollLeft/dockRange:0;
    globalXBusy=true;
    globalXTarget.scrollLeft=ratio*targetRange;
    globalXBusy=false;
  });
  return dock;
}
function horizontalScrollCandidates(){
  const root=$("#content");if(!root)return[];
  return [...root.querySelectorAll(".table-wrap,.pipeline-board")].filter(el=>el.scrollWidth>el.clientWidth+4);
}
function clearGlobalXTarget(){
  if(globalXTarget)globalXTarget.classList.remove("global-scroll-target");
  globalXTarget=null;
}
function updateGlobalXScroll(){
  const dock=ensureGlobalXScroll(),root=$("#content");
  if(!root){dock.classList.remove("active");clearGlobalXTarget();return}
  const rr=root.getBoundingClientRect();
  const visible=horizontalScrollCandidates().map(el=>({el,r:el.getBoundingClientRect()}))
    .filter(x=>x.r.bottom>rr.top+24&&x.r.top<rr.bottom-24)
    .sort((a,b)=>{
      const av=Math.max(0,Math.min(a.r.bottom,rr.bottom)-Math.max(a.r.top,rr.top));
      const bv=Math.max(0,Math.min(b.r.bottom,rr.bottom)-Math.max(b.r.top,rr.top));
      return bv-av;
    });
  const target=visible[0]?.el||null;
  if(!target){dock.classList.remove("active");clearGlobalXTarget();return}
  if(globalXTarget!==target){
    clearGlobalXTarget();
    globalXTarget=target;
    globalXTarget.classList.add("global-scroll-target");
  }
  dock.classList.add("active");
  const targetRange=Math.max(0,target.scrollWidth-target.clientWidth);
  // Faz o range útil do dock ser exatamente equivalente ao range real da tabela.
  const inner=dock.firstElementChild;
  inner.style.width=(dock.clientWidth+targetRange)+"px";
  const dockRange=Math.max(0,dock.scrollWidth-dock.clientWidth);
  const ratio=targetRange?target.scrollLeft/targetRange:0;
  globalXBusy=true;
  dock.scrollLeft=ratio*dockRange;
  globalXBusy=false;
}
function scheduleGlobalXScroll(){
  if(globalXTick)return;
  globalXTick=requestAnimationFrame(()=>{globalXTick=0;updateGlobalXScroll()});
}
function paginationHtml(view,shown,total,noun){
  const limit=pageLimit(view),safeTotal=Math.max(0,Number(total)||0),more=shown<safeTotal;
  return '<div class="list-pagination"><span>Mostrando <strong>'+shown+'</strong> de <strong>'+safeTotal+'</strong> '+esc(noun||"registros")+'</span><div class="pagination-actions">'+
    (more?'<button class="btn sm" data-load-more="'+view+'">Ver +'+PAGE_DEFAULT+'</button>':'')+
    '<label>Carregar <input type="number" min="1" max="'+Math.max(1,safeTotal)+'" step="1" value="'+Math.min(limit,Math.max(1,safeTotal||limit))+'" data-page-input="'+view+'"/></label>'+
    '<button class="btn sm" data-page-apply="'+view+'">Aplicar</button></div></div>';
}
function bindPagination(view,renderFn,total){
  const more=document.querySelector('[data-load-more="'+view+'"]');
  if(more)more.onclick=()=>{state.pageSize[view]=Math.min(Math.max(1,total||1),pageLimit(view)+PAGE_DEFAULT);renderFn()};
  const apply=document.querySelector('[data-page-apply="'+view+'"]'),input=document.querySelector('[data-page-input="'+view+'"]');
  if(apply&&input)apply.onclick=()=>{const n=Math.max(1,Math.min(Math.max(1,total||1),Number(input.value)||PAGE_DEFAULT));state.pageSize[view]=n;renderFn()};
}
function processTable(rows,{company=false,total=rows.length,view=company?"empresa":"processos"}={}){
  const title=company?"Processos da empresa":"Carteira atribuída";
  const subtitle=company
    ?"Todos os usuários autenticados podem consultar e editar. Editar ou atender não transfere a carteira."
    :"Processos vinculados ao seu Assistente/perfil.";
  return '<div class="record-toolbar"><div class="record-title"><span class="eyebrow">'+(company?"EMPRESA • LIST VIEW":"CARTEIRA • LIST VIEW")+'</span><strong>'+title+'</strong><span>'+rows.length+' de '+total+' registro(s)</span></div><div class="toolbar">'+searchFieldHtml("search","Pesquisar cliente, CNJ, advogado, assistente ou andamento…",state.query)+'<select id="statusFilter"><option value="">Retorno: todos</option>'+["VENCIDO","ATENÇÃO","EM DIA","SEM DATA"].map(x=>'<option '+(state.status===x?"selected":"")+'>'+x+'</option>').join("")+'</select><select id="qualityFilter"><option value="">Qualidade: todas</option>'+["BOM","NEUTRO","RUIM"].map(x=>'<option '+(state.quality===x?"selected":"")+'>'+x+'</option>').join("")+'</select><button class="btn primary sm" data-new-record>+ Novo cadastro</button></div></div>'+
  '<div class="company-note">'+esc(subtitle)+'</div>'+
  '<div class="table-wrap crm-table"><table class="table"><thead><tr><th>Cliente / Conta</th><th>Processo</th><th>Última movimentação</th><th>Cumprimento</th><th>Favorecido</th><th>Comercial</th><th>Retorno</th><th>Assistente</th><th>Atendido por</th><th></th></tr></thead><tbody>'+
  rows.map(r=>{
    const key=keyOf(r),move=String(latestMove(r)||"Sem movimentação em cache").slice(0,180);
    const moveDate=pick(r,"DataJud • Data","Data da Movimentação","Data_Movimentacao","DJEN • Data");
    return '<tr><td><div class="cell-main">'+esc(pick(r,"Cliente"))+'</div><div class="cell-sub">'+esc(pick(r,"Escritório","Escritorio"))+'</div></td><td><div class="mono">'+esc(cnjFormatted(pick(r,"Protocolo")))+'</div><div class="cell-sub">'+esc(pick(r,"Tribunal"))+' • '+esc(pick(r,"Advogado Atual","Advogado"))+'</div></td><td><div class="cell-main clamp2">'+esc(move)+'</div><div class="cell-sub">'+esc(moveDate||"movimentação já registrada na planilha")+'</div></td><td>'+execHtml(r)+'</td><td>'+favoredHtml(r)+'</td><td>'+commercialHtml(r)+'</td><td>'+badge(statusRet(r),statusRet(r)==="VENCIDO"?"bad":statusRet(r)==="ATENÇÃO"||statusRet(r)==="É HOJE"?"warn":statusRet(r)==="EM DIA"?"good":"gray")+'<div class="cell-sub">'+esc(pick(r,"Próximo Retorno"))+'</div></td><td><div class="cell-main">'+esc(pick(r,"Assistente")||"—")+'</div></td><td><div class="cell-main">'+esc(pick(r,"AtendidoPor","Atendido por")||"—")+'</div><div class="cell-sub">'+esc(pick(r,"Último Retorno")||"")+'</div></td><td class="actions process-actions"><button class="icon-action" data-history="'+esc(key)+'">Histórico tribunal</button><button class="icon-action" data-attendance="'+esc(key)+'">Registrar atendimento</button><button class="icon-action" data-audit="'+esc(key)+'">Audit 3D</button><button class="icon-action" data-suggest="'+esc(key)+'">Sugerir resposta</button><button class="icon-action" data-edit="'+esc(key)+'">Editar</button></td></tr>';
  }).join("")+
  '</tbody></table></div>'+paginationHtml(view,rows.length,total,company?"processos da empresa":"processos");
}
function bindProcessList(renderFn,view){
  const status=$("#statusFilter"),qual=$("#qualityFilter");
  bindSearchInput("#search",view,renderFn);
  if(status)status.onchange=e=>{state.status=e.target.value;resetPage(view);renderFn()};
  if(qual)qual.onchange=e=>{state.quality=e.target.value;resetPage(view);renderFn()};
  $$("[data-edit]").forEach(b=>b.onclick=()=>openProcess(b.dataset.edit));
  $$("[data-suggest]").forEach(b=>b.onclick=()=>openAudit(b.dataset.suggest,true));
  $$("[data-audit]").forEach(b=>b.onclick=()=>openAudit(b.dataset.audit,false));
  $$("[data-history]").forEach(b=>b.onclick=()=>openHistory(b.dataset.history));
  $$("[data-attendance]").forEach(b=>b.onclick=()=>openAttendance(b.dataset.attendance));
  $$("[data-contact]").forEach(b=>b.onclick=()=>markContacted(b.dataset.contact));
  $$("[data-new-record]").forEach(b=>b.onclick=()=>openProcess(""));
}
function renderProcessos(){
  const all=filteredRows(state.rows),rows=all.slice(0,pageLimit("processos"));
  $("#content").innerHTML=processTable(rows,{company:false,total:all.length,view:"processos"});
  bindProcessList(renderProcessos,"processos");bindPagination("processos",renderProcessos,all.length);
}
function renderEmpresa(){
  const all=filteredRows(state.companyRows),rows=all.slice(0,pageLimit("empresa"));
  $("#content").innerHTML=processTable(rows,{company:true,total:all.length,view:"empresa"});
  bindProcessList(renderEmpresa,"empresa");bindPagination("empresa",renderEmpresa,all.length);
}
function plainStatus(r){
  const blob=norm([latestMove(r),pick(r,"Diagnóstico Processual"),pick(r,"Tipo de Evento","Evento_Tipo")].join(" "));
  if(/improcedent|decisao desfavoravel/.test(blob))return"Decisão desfavorável (a confirmar nos autos)";
  if(/procedent|decisao favoravel/.test(blob))return"Decisão favorável identificada (a confirmar nos autos)";
  if(/baixa definitiva|transito em julgado|arquiv/.test(blob))return"Possível encerramento/baixa — revisar pendências";
  if(/cumprimento|execucao/.test(blob))return"Fase de cumprimento/execução identificada";
  if(/audienc/.test(blob))return"Audiência ou ato relacionado identificado";
  if(/conclus/.test(blob))return"Processo concluso para análise do juízo";
  return String(latestMove(r)||"Movimentação registrada na planilha").slice(0,180);
}
function whatsappHref(r,msg){
  let tel=digits(pick(r,"Telefone"));if(!tel)return"#";
  if(tel.length===10||tel.length===11)tel="55"+tel;
  return "https://wa.me/"+tel+"?text="+encodeURIComponent(msg||"");
}
function taskBadges(r,w){
  const out=[badge(priority(w),w>=950?"bad":w>=800?"warn":w>=600?"blue":"good")];
  const move=norm(latestMove(r));
  if(boolish(pick(r,"Encerrado no Tribunal","DatajudEncerrado","isBaixaTribunal"))||/baixa definitiva|transito/.test(move))out.push(badge("BAIXA NO TRIBUNAL","gray"));
  if(boolish(pick(r,"Nova Atualização","Novo Andamento","Novo_Andamento")))out.push(badge("NOVO ANDAMENTO","bad"));
  if(boolish(pick(r,"Improcedente"))||/improcedent/.test(move))out.push(badge("IMPROCEDENTE","warn"));
  else if(boolish(pick(r,"Procedente"))||/procedent/.test(move))out.push(badge("PROCEDENTE","good"));
  return out.join("");
}
function taskCardHtml(x){
  const r=x.r||{},g=x.group||{cases:[r]},key=keyOf(r),msg=window.LexisSuggest?.quickMessage?window.LexisSuggest.quickMessage(r):"";
  const next=pick(r,"Próximo Retorno"),d=daysTo(next),deadline=d!==null&&d<0?'<span class="deadline">VENCIDO HÁ '+Math.abs(d)+' DIA(S)</span>':d===0?'<span class="deadline">VENCE HOJE</span>':"";
  const pub=officialDjen(r),legacy=legacyDjenSummary(r);
  const cls=x.w>=950?"critical":x.w>=800?"high":x.w>=600?"medium":"calm";
  return '<article class="task-card '+cls+'"><div class="task-card-head"><div><span class="eyebrow">FILA DE ATENDIMENTO</span></div><div class="task-card-badges">'+taskBadges(r,x.w)+'</div></div>'+
    '<div class="task-card-body"><div><h3 class="task-client">'+esc(pick(r,"Cliente")||"SEM NOME")+'</h3><div class="task-meta">'+esc(pick(r,"Advogado Atual","Advogado")||"NÃO ATRIBUÍDO")+' • '+esc(pick(r,"DataJud • Data","Data da Movimentação","Data_Movimentacao")||"sem data")+' • '+esc(String(latestMove(r)||"sem movimentação").slice(0,120))+'</div><div class="task-meta"><strong>Tratar:</strong> '+esc(taskLabel(r))+'</div></div>'+
    '<span class="cnj-chip">'+esc(cnjFormatted(pick(r,"Protocolo")))+'</span><div class="case-owner">▧ '+esc(pick(r,"Escritório","Escritorio")||"GERAL")+' · '+esc(pick(r,"Assistente")||"SEM ASSISTENTE")+(g.cases?.length>1?' · '+g.cases.length+' processos':'')+'</div>'+
    '<div class="case-box"><div class="case-box-label">Em linguagem simples</div><strong>'+esc(plainStatus(r))+'</strong><p>'+esc(String(latestMove(r)||"").slice(0,260))+'</p>'+deadline+'</div>'+
    '<div class="case-box publication-box"><div class="publication-text"><div class="case-box-label">'+(pub?"Publicação DJEN oficial":"DJEN oficial ainda não salvo")+'</div>'+esc(String(pub||"Nenhuma publicação DJEN oficial persistida na planilha.").slice(0,240))+(legacy&&!pub?'<div class="cell-sub">Resumo legado: '+esc(String(legacy).slice(0,150))+'</div>':'')+'</div><button class="task-icon audit" data-audit="'+esc(key)+'">Audit 3D</button></div>'+
    '<div class="quick-box"><div class="case-box-label">Atendimento rápido (1 → 2 → 3)</div><p>'+esc(msg)+'</p><div class="quick-actions"><button data-copy="'+esc(key)+'">1. Copiar</button><a target="_blank" rel="noopener" href="'+esc(whatsappHref(r,msg))+'">2. WhatsApp</a><button class="contacted" data-contact="'+esc(key)+'">3. Contatado</button></div></div></div>'+
    '<div class="task-card-foot"><div class="task-icon-actions"><button class="task-icon suggest" data-suggest="'+esc(key)+'">Sugerir resposta</button><button class="task-icon audit" data-audit="'+esc(key)+'">Audit 3D</button><button class="task-icon audit" data-history="'+esc(key)+'">Histórico</button><a class="task-icon wa" target="_blank" rel="noopener" href="'+esc(whatsappHref(r,msg))+'">WhatsApp</a><button class="task-icon" data-edit="'+esc(key)+'">Editar</button></div><button class="task-icon task-manage" data-edit="'+esc(key)+'">Gerir ›</button></div></article>';
}
function bindTaskActions(){
  $$("[data-copy]").forEach(b=>b.onclick=async()=>{
    const r=findRow(b.dataset.copy),msg=window.LexisSuggest?.quickMessage?window.LexisSuggest.quickMessage(r):"";
    try{await navigator.clipboard.writeText(msg);showBanner("Mensagem copiada.","good")}catch(_){showBanner("Não foi possível copiar automaticamente.","bad")}
  });
  $$("[data-contact]").forEach(b=>b.onclick=()=>markContacted(b.dataset.contact));
  $$("[data-suggest]").forEach(b=>b.onclick=()=>openAudit(b.dataset.suggest,true));
  $$("[data-audit]").forEach(b=>b.onclick=()=>openAudit(b.dataset.audit,false));
  $$("[data-history]").forEach(b=>b.onclick=()=>openHistory(b.dataset.history));
  $$("[data-edit]").forEach(b=>b.onclick=()=>openProcess(b.dataset.edit));
}
function taskMatchesSearch(x,q){
  if(!q)return true;
  const g=x.group||{},cases=Array.isArray(g.cases)?g.cases:[x.r||{}];
  return cases.some(r=>norm([
    pick(r,"Cliente"),pick(r,"Protocolo"),pick(r,"Advogado Atual","Advogado"),
    pick(r,"Assistente"),pick(r,"Escritório","Escritorio"),pick(r,"Tribunal"),
    latestMove(r),pick(r,"Telefone"),pick(r,"Status")
  ].join(" ")).includes(q));
}
function renderTarefas(){
  const source=tasks(),q=norm(state.query),all=source.filter(x=>taskMatchesSearch(x,q)),list=all.slice(0,pageLimit("tarefas"));
  const critical=all.filter(x=>x.w>=950).length,high=all.filter(x=>x.w>=800&&x.w<950).length,explicit=(state.crm.TarefasCRM||[]).filter(x=>!/conclu|feito|cancel/i.test(String(x.Status||""))&&(!q||norm([x.Titulo,x.Responsavel,x.Protocolo,x.Descricao].join(" ")).includes(q)));
  $("#content").innerHTML=
    '<div class="task-header"><div><span class="eyebrow">FILA DE ATENDIMENTO</span><h2>Prioridade operacional</h2><p>Do pior caso e maior urgência até a rotina mais tranquila. Movimentações já salvas na planilha são reaproveitadas.</p></div><div class="queue-summary">'+badge(critical+" críticas","bad")+badge(high+" altas","warn")+badge(all.length+(q?" de "+source.length:"")+" clientes","gray")+'</div></div>'+
    '<div class="task-searchbar">'+searchFieldHtml("taskSearch","Pesquisar cliente, CNJ, advogado, assistente ou movimentação…",state.query)+'</div>'+
    '<div class="kpi-grid">'+kpi("Fila filtrada",all.length,q?source.length+" no total":"clientes priorizados")+kpi("Tarefas CRM",explicit.length,"registradas")+kpi("Críticas",critical,"ação imediata","bad")+kpi("Altas",high,"alta prioridade","warn")+kpi("Novidades",all.filter(x=>boolish(pick(x.r,"Nova Atualização","Novo Andamento"))).length,"já registradas na planilha")+kpi("Vencidos",all.filter(x=>statusRet(x.r)==="VENCIDO").length,"retorno vencido","bad")+'</div>'+
    (explicit.length?'<section class="card explicit-tasks"><div class="card-head"><h3>Tarefas registradas</h3></div><div class="table-wrap flat"><table class="table compact"><thead><tr><th>Tarefa</th><th>Responsável</th><th>Prioridade</th><th>Vencimento</th><th>Status</th></tr></thead><tbody>'+explicit.slice(0,50).map(x=>'<tr><td>'+esc(x.Titulo||"Tarefa")+'</td><td>'+esc(x.Responsavel||"—")+'</td><td>'+esc(x.Prioridade||"—")+'</td><td>'+esc(x.Vencimento||"—")+'</td><td>'+badge(x.Status||"PENDENTE","gray")+'</td></tr>').join("")+'</tbody></table></div></section>':'')+
    '<div class="task-grid">'+list.map(taskCardHtml).join("")+'</div>'+paginationHtml("tarefas",list.length,all.length,"clientes na fila");
  bindSearchInput("#taskSearch","tarefas",renderTarefas);
  bindTaskActions();bindPagination("tarefas",renderTarefas,all.length);
}

function clientProcesses(c){
  const idx=clientProcessIndex(),id=String(c?.ClienteId||"").trim();
  const byId=id?(idx.byId.get(id)||[]):[];
  if(byId.length)return byId;
  return idx.byName.get(norm(c?.Nome||c?.Cliente||""))||[];
}
function clientPipeline(c){
  const rows=crmRowsForClient("PipelineCRM",c.ClienteId);
  if(rows.length)return rows;
  const procs=clientProcesses(c),sample=procs.find(r=>commercialStatus(r).includes("POTENCIAL"))||procs[0];
  if(!sample)return[];
  const cs=commercialStatus(sample);
  const etapa=cs.includes("NÃO VENDER")?"Perdido":cs.includes("POTENCIAL")?"Oportunidade":"Triagem";
  return [{OportunidadeId:"derived:"+c.ClienteId,ClienteId:c.ClienteId,Protocolo:pick(sample,"Protocolo"),Etapa:etapa,Servico:pick(sample,"Produto / Oportunidade","Produtos"),Responsavel:c.Responsavel,_derived:true}];
}
function parseMoney(v){
  if(typeof v==="number")return v;
  let s=String(v??"").trim().replace(/R\$\s*/g,"").replace(/\./g,"").replace(",",".");
  const n=Number(s);return Number.isFinite(n)?n:0;
}
function money(v){return Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}
function renderClientes(){
  const clients=crmClients(),q=norm(state.query);
  if(state.clientId){renderCliente360(state.clientId);return}
  const all=clients.filter(c=>!q||norm([c.Nome,c.Telefone_Principal,c.Responsavel,...(c.protocolos||[])].join(" ")).includes(q));
  const rows=all.slice(0,pageLimit("clientes"));
  $("#content").innerHTML=
    '<div class="record-toolbar"><div class="record-title"><span class="eyebrow">CRM • GOOGLE SHEETS</span><strong>Clientes</strong><span>'+rows.length+' de '+all.length+' cliente(s)</span></div><div class="toolbar"><input id="clientSearch" placeholder="Pesquisar cliente, telefone ou CNJ…" value="'+esc(state.query)+'"/><span class="badge '+(state.crmBridgeReady?'b-good':'b-warn')+'">'+(state.crmBridgeReady?'CRM sincronizado':'CRM derivado de Processos')+'</span></div></div>'+
    '<div class="table-wrap crm-table"><table class="table"><thead><tr><th>Cliente</th><th>Contato</th><th>Processos</th><th>Assistente</th><th>Último retorno</th><th>Próximo retorno</th><th>Pipeline</th><th></th></tr></thead><tbody>'+
    rows.map(c=>{
      const procs=clientProcesses(c),pipe=clientPipeline(c)[0]||{};
      return '<tr><td><div class="cell-main">'+esc(c.Nome||"SEM NOME")+'</div><div class="cell-sub mono">'+esc(c.ClienteId||"")+'</div></td><td><div class="cell-main">'+esc(c.Telefone_Principal||"—")+'</div><div class="cell-sub">'+esc(c.Email||"")+'</div></td><td>'+badge(procs.length,"blue")+'</td><td>'+esc(c.Responsavel||"—")+'</td><td>'+esc(c.ultimoRetorno||"—")+'</td><td>'+esc(c.proximoRetorno||"—")+'</td><td>'+badge(pipe.Etapa||"Triagem",pipe.Etapa==="Perdido"?"bad":pipe.Etapa==="Oportunidade"?"good":"gray")+'</td><td><button class="icon-action" data-client-open="'+esc(c.ClienteId)+'">Abrir 360°</button></td></tr>';
    }).join("")+'</tbody></table></div>'+paginationHtml("clientes",rows.length,all.length,"clientes");
  $("#clientSearch").oninput=e=>{state.query=e.target.value;resetPage("clientes");renderClientes()};
  $$("[data-client-open]").forEach(b=>b.onclick=()=>{state.clientId=b.dataset.clientOpen;state.query="";renderClientes()});
  bindPagination("clientes",renderClientes,all.length);
}
function renderCliente360(id){
  const c=clientById(id);if(!c){state.clientId=null;renderClientes();return}
  const procs=clientProcesses(c),inter=crmRowsForClient("Interacoes",id).sort((a,b)=>String(b.DataHora||"").localeCompare(String(a.DataHora||"")));
  const pipe=clientPipeline(c),agenda=crmRowsForClient("AgendaCRM",id),fin=(state.crm.Honorarios||[]).filter(x=>String(x.cliente_id||x.ClienteId||"")===String(id)||procs.some(p=>digits(x.protocolo)===digits(pick(p,"Protocolo"))));
  const openValue=fin.filter(x=>!/pago|quitado/i.test(String(x.status||""))).reduce((a,x)=>a+parseMoney(x.valor),0);
  $("#content").innerHTML=
    '<div class="crm360-head"><div><button class="btn sm" id="clientBack">← Clientes</button><span class="eyebrow">CLIENTE 360° • PLANILHA</span><h2>'+esc(c.Nome||"SEM NOME")+'</h2><p>'+esc(c.Telefone_Principal||"Sem telefone")+' · '+esc(c.Email||"sem e-mail")+' · Responsável '+esc(c.Responsavel||"—")+'</p></div><div class="command-actions"><button class="btn" id="clientWhatsApp">WhatsApp</button><button class="btn primary" id="clientNewProcess">Novo processo</button></div></div>'+
    '<div class="kpi-grid crm-kpis">'+kpi("Processos",procs.length,"vinculados por ClienteId")+kpi("Interações",inter.length,"linha do tempo")+kpi("Pipeline",pipe[0]?.Etapa||"Triagem",pipe.length+" oportunidade(s)")+kpi("Agenda",agenda.length,"eventos CRM")+kpi("Financeiro",elevatedUser()?money(openValue):"Restrito","em aberto")+kpi("Próximo retorno",c.proximoRetorno||"—","carteira processual")+'</div>'+
    '<div class="crm360-grid"><section class="card"><div class="card-head"><div><span class="eyebrow">RELACIONAMENTO</span><h3>Linha do tempo</h3></div></div><div class="card-body"><div class="interaction-compose"><select id="interactionCanal"><option>WhatsApp</option><option>Telefone</option><option>E-mail</option><option>Reunião</option><option>Interno</option></select><input id="interactionSubject" placeholder="Assunto"/><textarea id="interactionText" placeholder="Registre o que aconteceu e o próximo passo"></textarea><button class="btn primary" id="saveInteractionBtn">Registrar interação</button></div><div class="timeline">'+
    (inter.length?inter.slice(0,30).map(x=>'<div class="timeline-item"><div class="timeline-dot"></div><div><strong>'+esc(x.Assunto||x.Tipo||x.Canal||"Interação")+'</strong><small>'+esc(x.DataHora||"")+' · '+esc(x.Usuario||"")+' · '+esc(x.Canal||"")+'</small><p>'+esc(x.Conteudo||"")+'</p>'+(x.ProximoPasso?'<span>Próximo: '+esc(x.ProximoPasso)+'</span>':'')+'</div></div>').join(""):'<div class="empty">Nenhuma interação CRM registrada ainda.</div>')+
    '</div></div></section>'+
    '<section class="card"><div class="card-head"><div><span class="eyebrow">OPERAÇÃO</span><h3>Processos vinculados</h3></div></div><div class="table-wrap flat"><table class="table compact"><thead><tr><th>CNJ</th><th>Status</th><th>Movimentação</th><th>Retorno</th><th></th></tr></thead><tbody>'+
    procs.map(r=>'<tr><td class="mono">'+esc(cnjFormatted(pick(r,"Protocolo")))+'</td><td>'+badge(statusRet(r),statusRet(r)==="VENCIDO"?"bad":statusRet(r)==="ATENÇÃO"?"warn":"gray")+'</td><td><div class="clamp2">'+esc(String(latestMove(r)||"").slice(0,160))+'</div></td><td>'+esc(pick(r,"Próximo Retorno")||"—")+'</td><td><button class="icon-action" data-edit="'+esc(keyOf(r))+'">Gerir</button></td></tr>').join("")+
    '</tbody></table></div></section></div>'+
    '<div class="grid-2 crm-bottom"><section class="card"><div class="card-head"><div><span class="eyebrow">PIPELINE</span><h3>Comercial</h3></div></div><div class="card-body metric-list">'+(pipe.length?pipe.map(x=>metricRow(x.Servico||"Oportunidade",x.Etapa||"Triagem",x.Responsavel||"")).join(""):'<div class="empty">Sem oportunidade.</div>')+'</div></section>'+
    '<section class="card"><div class="card-head"><div><span class="eyebrow">AGENDA</span><h3>Próximos compromissos</h3></div></div><div class="card-body metric-list">'+(agenda.length?agenda.slice(0,10).map(x=>metricRow(x.Titulo||x.Tipo,x.Inicio||"—",x.Responsavel||"")).join(""):'<div class="empty">Sem eventos CRM.</div>')+'</div></section></div>';
  $("#clientBack").onclick=()=>{state.clientId=null;renderClientes()};
  $("#clientNewProcess").onclick=()=>openProcess("");
  $("#clientWhatsApp").onclick=()=>{const tel=window.LexisCRM?.normalizePhone(c.Telefone_Principal)||"";if(!tel)return showBanner("Cliente sem telefone válido.","bad");window.open("https://wa.me/"+digits(tel),"_blank","noopener")};
  $("#saveInteractionBtn").onclick=()=>saveClientInteraction(c);
  $$("[data-edit]").forEach(b=>b.onclick=()=>openProcess(b.dataset.edit));
}
async function saveClientInteraction(c){
  const text=String($("#interactionText")?.value||"").trim();if(!text){showBanner("Escreva o conteúdo da interação.","bad");return}
  const actor=currentUser().nome||currentUser().usuario||"Usuário",ts=new Date().toISOString();
  const row={
    InteracaoId:window.LexisCRM?.stableId("int",c.ClienteId,ts,actor)||("int_"+Date.now()),
    ClienteId:c.ClienteId,Protocolo:"",Canal:$("#interactionCanal").value,Tipo:"Contato",
    Assunto:$("#interactionSubject").value.trim()||"Contato com cliente",Conteudo:text,Usuario:actor,DataHora:ts,Resultado:"Registrado",ProximoPasso:"",DataProximoPasso:"",OptOut:c.OptOutWhatsApp||""
  };
  await crmWrite("Interacoes",row);renderCliente360(c.ClienteId);
}
function pipelineData(){
  if(state.crm.PipelineCRM?.length)return state.crm.PipelineCRM;
  const rows=[];for(const c of crmClients())rows.push(...clientPipeline(c));return rows;
}
function renderPipeline(){
  const rows=pipelineData(),stages=["Lead","Triagem","Consulta","Oportunidade","Proposta","Contrato","Cliente Ativo","Perdido"];
  const normalized=s=>String(s||"Triagem");
  $("#content").innerHTML='<div class="command-strip"><div><span class="eyebrow">CRM • FUNIL COMERCIAL</span><h2>Pipeline</h2><p>Lead → consulta → proposta → contrato → cliente ativo. Enquanto não houver registro explícito, a triagem é derivada da análise comercial dos processos.</p></div></div><div class="pipeline-board">'+stages.map(stage=>{
    const items=rows.filter(x=>normalized(x.Etapa)===stage);
    return '<section class="pipeline-col"><header><strong>'+esc(stage)+'</strong><span>'+items.length+'</span></header><div>'+items.slice(0,80).map(x=>{const cl=clientById(x.ClienteId);return '<button class="pipeline-card" data-client-open="'+esc(x.ClienteId||"")+'"><strong>'+esc(cl?.Nome||x.Cliente||"Cliente")+'</strong><small>'+esc(x.Servico||x.Origem||"")+'</small>'+(x.ValorEstimado?'<span>'+esc(money(parseMoney(x.ValorEstimado)))+'</span>':'')+'</button>'}).join("")+'</div></section>';
  }).join("")+'</div>';
  $$("[data-client-open]").forEach(b=>b.onclick=()=>{state.clientId=b.dataset.clientOpen;setView("clientes")});
}
function localDateKey(d){
  if(!(d instanceof Date)||Number.isNaN(d.getTime()))return"";
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
function agendaEvents(){
  const explicit=[...(state.crm.AgendaCRM||[])].map(x=>({...x,_source:"AgendaCRM"}));
  const derived=state.companyRows.filter(r=>pick(r,"Próximo Retorno")).map(r=>({
    EventoId:"ret:"+keyOf(r),ClienteId:pick(r,"ClienteId"),Protocolo:pick(r,"Protocolo"),Tipo:"Retorno",Titulo:"Retorno • "+(pick(r,"Cliente")||"Cliente"),Inicio:pick(r,"Próximo Retorno"),Responsavel:pick(r,"Assistente"),Status:statusRet(r),_source:"Processos"
  }));
  return [...explicit,...derived].filter(x=>parseDate(x.Inicio)).sort((a,b)=>parseDate(a.Inicio)-parseDate(b.Inicio));
}
function agendaMonthDate(){
  const nowD=new Date(),m=String(state.agendaMonth||"");
  const hit=m.match(/^(\d{4})-(\d{2})$/);
  return hit?new Date(Number(hit[1]),Number(hit[2])-1,1,12):new Date(nowD.getFullYear(),nowD.getMonth(),1,12);
}
function renderAgenda(){
  const today=new Date(),todayKey=localDateKey(today);
  if(!state.agendaMonth)state.agendaMonth=todayKey.slice(0,7);
  if(!state.agendaDay)state.agendaDay=todayKey;
  const month=agendaMonthDate(),year=month.getFullYear(),mon=month.getMonth();
  const events=agendaEvents(),byDay=new Map(),clients=crmClients(),clientMap=new Map(clients.map(c=>[String(c.ClienteId||""),c]));
  for(const ev of events){const k=localDateKey(parseDate(ev.Inicio));if(!k)continue;const a=byDay.get(k)||[];a.push(ev);byDay.set(k,a)}
  const start=new Date(year,mon,1-month.getDay(),12),cells=[];
  for(let i=0;i<42;i++){
    const d=new Date(start);d.setDate(start.getDate()+i);const key=localDateKey(d),list=byDay.get(key)||[];
    const outside=d.getMonth()!==mon,selected=key===state.agendaDay,isToday=key===todayKey;
    cells.push('<button class="calendar-day '+(outside?"outside ":"")+(selected?"selected ":"")+(isToday?"today ":"")+'" data-agenda-day="'+key+'"><span class="calendar-number">'+d.getDate()+'</span><span class="calendar-events">'+list.slice(0,3).map(ev=>'<span class="calendar-event">'+esc(ev.Tipo||"Evento")+' · '+esc((clientMap.get(String(ev.ClienteId||""))?.Nome||ev.Titulo||"").slice(0,34))+'</span>').join("")+(list.length>3?'<span class="calendar-more">+'+(list.length-3)+' evento(s)</span>':'')+'</span></button>');
  }
  const selected=byDay.get(state.agendaDay)||[],monthLabel=month.toLocaleDateString("pt-BR",{month:"long",year:"numeric"});
  $("#content").innerHTML=
    '<div class="command-strip agenda-head"><div><span class="eyebrow">CRM • AGENDA</span><h2>Agenda</h2><p>Calendário real de retornos processuais e compromissos do AgendaCRM.</p></div><div class="agenda-nav"><button class="btn sm" data-agenda-nav="-1">‹</button><button class="btn sm" data-agenda-today>Hoje</button><button class="btn sm" data-agenda-nav="1">›</button></div></div>'+
    '<div class="agenda-layout"><section class="card calendar-card"><div class="calendar-title"><strong>'+esc(monthLabel)+'</strong><span>'+events.length+' compromisso(s) no índice</span></div><div class="calendar-weekdays">'+["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map(x=>'<span>'+x+'</span>').join("")+'</div><div class="calendar-grid">'+cells.join("")+'</div></section>'+
    '<aside class="card agenda-day-panel"><div class="card-head"><div><span class="eyebrow">DIA SELECIONADO</span><h3>'+esc(new Date(state.agendaDay+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"}))+'</h3></div>'+badge(selected.length+" evento(s)","blue")+'</div><div class="agenda-day-list">'+
    (selected.length?selected.map(ev=>{const cl=clientMap.get(String(ev.ClienteId||""));return '<article class="agenda-event-card"><div><strong>'+esc(ev.Titulo||ev.Tipo||"Compromisso")+'</strong><small>'+esc(String(ev.Inicio||"").replace("T"," ").slice(0,16))+' · '+esc(ev.Responsavel||"—")+'</small><p>'+esc(cl?.Nome||cnjFormatted(ev.Protocolo||"")||ev._source||"")+'</p></div>'+badge(ev.Status||"PENDENTE",/venc/i.test(ev.Status||"")?"bad":/aten|hoje/i.test(ev.Status||"")?"warn":"gray")+'</article>'}).join(""):'<div class="empty">Nenhum compromisso neste dia.</div>')+
    '</div><div class="agenda-compose"><h4>Novo compromisso</h4><input id="agendaTitle" placeholder="Título do compromisso"/><div class="grid-2"><input id="agendaTime" type="time" value="09:00"/><select id="agendaType"><option>Reunião</option><option>Retorno</option><option>Audiência</option><option>Prazo</option><option>Ligação</option><option>Outro</option></select></div><input id="agendaProtocol" placeholder="CNJ (opcional)"/><input id="agendaResp" placeholder="Responsável" value="'+esc(currentUser().nome||currentUser().usuario||"")+'"/><button class="btn primary" id="agendaSaveBtn">Salvar compromisso</button></div></aside></div>';
  $$("[data-agenda-day]").forEach(b=>b.onclick=()=>{state.agendaDay=b.dataset.agendaDay;state.agendaMonth=state.agendaDay.slice(0,7);renderAgenda()});
  $$("[data-agenda-nav]").forEach(b=>b.onclick=()=>{const d=agendaMonthDate();d.setMonth(d.getMonth()+Number(b.dataset.agendaNav));state.agendaMonth=localDateKey(d).slice(0,7);renderAgenda()});
  $("[data-agenda-today]").onclick=()=>{state.agendaMonth=todayKey.slice(0,7);state.agendaDay=todayKey;renderAgenda()};
  $("#agendaSaveBtn").onclick=saveAgendaEvent;
}
async function saveAgendaEvent(){
  const title=String($("#agendaTitle")?.value||"").trim();if(!title){showBanner("Informe o título do compromisso.","bad");return}
  const day=state.agendaDay||localDateKey(new Date()),time=String($("#agendaTime")?.value||"09:00"),proto=String($("#agendaProtocol")?.value||"").trim();
  const linked=proto?state.companyRows.find(r=>digits(pick(r,"Protocolo"))===digits(proto)):null,ts=new Date().toISOString();
  const row={EventoId:window.LexisCRM?.stableId?.("evt",day,time,title)||("evt_"+Date.now()),ClienteId:linked?pick(linked,"ClienteId"):"",Protocolo:proto,Tipo:$("#agendaType")?.value||"Evento",Titulo:title,Inicio:day+"T"+time+":00",Fim:"",Responsavel:String($("#agendaResp")?.value||"").trim(),Status:"PENDENTE",LembreteMin:"30",Observacao:"",CriadoEm:ts,AtualizadoEm:ts};
  await crmWrite("AgendaCRM",row);showBanner("Compromisso salvo na AgendaCRM.","good");renderAgenda();
}
function renderFinanceiro(){
  if(!elevatedUser()){
    $("#content").innerHTML='<div class="permission-card"><span class="eyebrow">FINANCEIRO • ACESSO RESTRITO</span><h2>Honorários e receita</h2><p>Esta área fica restrita a administrador/supervisor. A planilha continua sendo a fonte de verdade.</p></div>';return;
  }
  const rows=state.crm.Honorarios||[],total=rows.reduce((a,x)=>a+parseMoney(x.valor),0),paid=rows.filter(x=>/pago|quitado/i.test(String(x.status||""))).reduce((a,x)=>a+parseMoney(x.valor),0);
  $("#content").innerHTML='<div class="kpi-grid">'+kpi("Honorários",rows.length,"lançamentos")+kpi("Valor total",money(total),"contratado")+kpi("Recebido",money(paid),"pago","good")+kpi("Em aberto",money(total-paid),"previsto",total-paid>0?"warn":"good")+kpi("Inadimplência",rows.filter(x=>/venc|inadimpl/i.test(String(x.status||""))).length,"títulos","bad")+kpi("Fonte","Honorarios","Google Sheets")+'</div><div class="table-wrap"><table class="table"><thead><tr><th>Cliente</th><th>Processo</th><th>Tipo</th><th>Valor</th><th>Status</th><th>Vencimento</th><th>Responsável</th></tr></thead><tbody>'+rows.map(x=>'<tr><td>'+esc(x.cliente||clientById(x.cliente_id)?.Nome||"—")+'</td><td class="mono">'+esc(cnjFormatted(x.protocolo||""))+'</td><td>'+esc(x.tipo||"—")+'</td><td>'+esc(money(parseMoney(x.valor)))+'</td><td>'+badge(x.status||"—",/pago|quitado/i.test(x.status||"")?"good":/venc|inadimpl/i.test(x.status||"")?"bad":"warn")+'</td><td>'+esc(x.vencimento||"—")+'</td><td>'+esc(x.responsavel||"—")+'</td></tr>').join("")+'</tbody></table></div>';
}

function renderAnalise(){
  const m=metrics(),stages={},lawyers={},commercial={},favored={};
  state.rows.forEach(r=>{
    const st=String(latestMove(r)).split("—")[0].trim()||"Sem diagnóstico";stages[st]=(stages[st]||0)+1;
    const adv=String(pick(r,"Advogado Atual","Advogado")||"NÃO ATRIBUÍDO").trim();lawyers[adv]=(lawyers[adv]||0)+1;
    const cm=String(pick(r,"Comercial")||"REVISAR");commercial[cm]=(commercial[cm]||0)+1;
    const fv=String(pick(r,"_Favorecido")||"INDEFINIDO");favored[fv]=(favored[fv]||0)+1;
  });
  const stageTop=Object.entries(stages).sort((a,b)=>b[1]-a[1]).slice(0,10),lawTop=Object.entries(lawyers).sort((a,b)=>b[1]-a[1]).slice(0,10),comTop=Object.entries(commercial).sort((a,b)=>b[1]-a[1]),favTop=Object.entries(favored).sort((a,b)=>b[1]-a[1]);
  $("#content").innerHTML='<div class="kpi-grid">'+kpi("BOM",m.good,"qualidade alta","good")+kpi("NEUTRO",m.neutral,"revisão normal","warn")+kpi("RUIM",m.bad,"revisão prioritária","bad")+kpi("Procedentes",m.proc,"classificados")+kpi("Improcedentes",m.improc,"classificados","bad")+kpi("Score médio",m.avg+"/100","evidência processual")+'</div>'+
  '<div class="analysis-grid"><div class="analysis-tile"><h4>Fases processuais</h4>'+bars(stageTop,m.total)+'</div><div class="analysis-tile"><h4>Advogados atuais</h4>'+bars(lawTop,m.total)+'</div><div class="analysis-tile"><h4>Triagem comercial</h4>'+bars(comTop,m.total)+'</div><div class="analysis-tile"><h4>Lado favorecido</h4>'+bars(favTop,m.total)+'</div></div>'+
  '<div class="section-title"><div><h2>Revisão comercial e jurídica</h2><p>NÃO VENDER e REVISAR ANTES dependem de DataJud/DJEN e continuam sujeitos à revisão humana.</p></div></div>'+
  '<div class="table-wrap crm-table"><table class="table"><thead><tr><th>Cliente</th><th>CNJ</th><th>Diagnóstico</th><th>Favorecido</th><th>Cumprimento</th><th>Comercial</th><th>Produto</th></tr></thead><tbody>'+
  state.rows.filter(r=>commercialStatus(r).includes("NÃO VENDER")||commercialStatus(r).includes("REVISAR ANTES")||commercialStatus(r).includes("POTENCIAL")).sort((a,b)=>score(b)-score(a)).slice(0,220).map(r=>'<tr><td>'+esc(pick(r,"Cliente"))+'</td><td class="mono">'+esc(cnjFormatted(pick(r,"Protocolo")))+'</td><td class="clamp2">'+esc(String(latestMove(r)).slice(0,120))+'</td><td>'+favoredHtml(r)+'</td><td>'+execHtml(r)+'</td><td>'+commercialHtml(r)+'</td><td>'+esc(pick(r,"Produto / Oportunidade"))+'</td></tr>').join("")+
  '</tbody></table></div>';
}
function bars(entries,total){const max=Math.max(...entries.map(x=>x[1]),1);return '<div class="bars">'+entries.map(([k,v])=>'<div class="barline"><span title="'+esc(k)+'">'+esc(k.slice(0,22))+'</span><div class="bar"><span style="width:'+Math.round(v/max*100)+'%"></span></div><b>'+v+'</b></div>').join("")+'</div>'}

function renderReport(){
  const m=metrics(),potential=state.rows.filter(r=>commercialStatus(r).includes("POTENCIAL")),blocked=state.rows.filter(r=>commercialStatus(r).includes("NÃO VENDER"));
  const assistants={},tribs={},execs={};
  state.rows.forEach(r=>{
    const a=String(pick(r,"Assistente")||"NÃO ATRIBUÍDO");assistants[a]=(assistants[a]||0)+1;
    const t=String(pick(r,"Tribunal")||"OUTROS");tribs[t]=(tribs[t]||0)+1;
    const e=String(pick(r,"_ExecStatus")||"INDEFINIDO");execs[e]=(execs[e]||0)+1;
  });
  const topA=Object.entries(assistants).sort((a,b)=>b[1]-a[1]).slice(0,12),topT=Object.entries(tribs).sort((a,b)=>b[1]-a[1]).slice(0,12);
  const topCrit=tasks().slice(0,10),myVenc=state.rows.filter(r=>statusRet(r)==="VENCIDO").slice(0,12),myNews=state.rows.filter(r=>boolish(pick(r,"Nova Atualização","Novo Andamento","Novo_Andamento"))).slice(0,12);
  $("#content").innerHTML=
    '<div class="lexis-page-shell report-page"><div class="report-head lexis-page-header"><div><span class="eyebrow">DOSSIÊ OPERACIONAL</span><h2>Relatório executivo da carteira</h2><p>Resumo consolidado do app, Google Sheets, DataJud e DJEN.</p></div><div class="command-actions"><button class="btn" data-goto="dashboard">Dashboard</button><button class="btn primary" id="printReport">Imprimir / PDF</button></div></div>'+
    '<div class="kpi-grid">'+kpi("Carteira",m.total,m.active+" ativos")+kpi("Vencidos",m.venc,"retornos","bad")+kpi("Novidades",m.newer,"pós-retorno",m.newer?"warn":"good")+kpi("Potencial",potential.length,"triagem comercial","good")+kpi("DataJud",m.dj,"processos auditados")+kpi("DJEN",m.djen,"processos com publicação")+'</div>'+
    '<section class="report-sheet"><div class="report-band"><div><span class="eyebrow">CRITICIDADE</span><h3>Top 10 · prioridade por movimentação e prazo</h3></div></div><div class="table-wrap flat report-table"><table class="table"><thead><tr><th>#</th><th>Cliente / CNJ</th><th>Motivo</th><th>Retorno</th><th>Tribunal</th><th>Ações</th></tr></thead><tbody>'+
      topCrit.map((x,i)=>{const r=x.r,key=keyOf(r);return '<tr><td><strong>'+(i+1)+'</strong></td><td><div class="cell-main">'+esc(pick(r,"Cliente"))+'</div><div class="cell-sub mono">'+esc(cnjFormatted(pick(r,"Protocolo")))+'</div></td><td>'+esc(taskLabel(r))+'</td><td>'+badge(statusRet(r),statusRet(r)==="VENCIDO"?"bad":statusRet(r)==="ATENÇÃO"?"warn":"gray")+'</td><td>'+esc(pick(r,"Tribunal")||"—")+'</td><td class="actions"><button class="icon-action" data-history="'+esc(key)+'">Histórico inteiro</button><button class="icon-action" data-attendance="'+esc(key)+'">Registrar atendimento</button></td></tr>'}).join("")+
    '</tbody></table></div></section>'+
    '<div class="analysis-grid report-grid"><div class="analysis-tile"><h4>Por assistente</h4>'+bars(topA,m.total)+'</div><div class="analysis-tile"><h4>Por tribunal</h4>'+bars(topT,m.total)+'</div><div class="analysis-tile"><h4>Execução / cumprimento</h4>'+bars(Object.entries(execs).sort((a,b)=>b[1]-a[1]),m.total)+'</div></div>'+
    '<section class="report-sheet"><div class="report-band neutral"><div><span class="eyebrow">AUDITORIA DE RESPONSABILIDADE</span><h3>Minha carteira</h3></div><div>'+badge(myVenc.length+" vencidos","bad")+badge(myNews.length+" novidades","blue")+'</div></div><div class="grid-2 responsibility-grid"><div><h4>Meus prazos vencidos</h4><div class="report-list">'+(myVenc.length?myVenc.map(r=>{const key=keyOf(r);return '<div class="report-list-item danger"><div><strong>'+esc(pick(r,"Cliente"))+'</strong><small>'+esc(cnjFormatted(pick(r,"Protocolo")))+' · '+esc(pick(r,"Próximo Retorno")||"sem data")+'</small></div><button class="icon-action" data-attendance="'+esc(key)+'">Atender</button></div>'}).join(""):'<div class="empty">Nenhum prazo vencido.</div>')+'</div></div>'+
    '<div><h4>Novidades pendentes</h4><div class="report-list">'+(myNews.length?myNews.map(r=>{const key=keyOf(r);return '<div class="report-list-item info"><div><strong>'+esc(pick(r,"Cliente"))+'</strong><small>'+esc(String(latestMove(r)||"").slice(0,120))+'</small></div><button class="icon-action" data-history="'+esc(key)+'">Ver tribunal</button></div>'}).join(""):'<div class="empty">Nenhuma novidade pendente.</div>')+'</div></div></div></section>'+
    '<div class="grid-2 report-sections"><div class="card"><div class="card-head"><h3>Oportunidades</h3></div><div class="table-wrap flat"><table class="table compact"><thead><tr><th>Cliente</th><th>CNJ</th><th>Produto</th></tr></thead><tbody>'+potential.slice(0,30).map(r=>'<tr><td>'+esc(pick(r,"Cliente"))+'</td><td class="mono">'+esc(cnjFormatted(pick(r,"Protocolo")))+'</td><td>'+esc(pick(r,"Produto / Oportunidade"))+'</td></tr>').join("")+'</tbody></table></div></div>'+
    '<div class="card"><div class="card-head"><h3>Bloqueios comerciais</h3></div><div class="table-wrap flat"><table class="table compact"><thead><tr><th>Cliente</th><th>CNJ</th><th>Motivo</th></tr></thead><tbody>'+blocked.slice(0,30).map(r=>'<tr><td>'+esc(pick(r,"Cliente"))+'</td><td class="mono">'+esc(cnjFormatted(pick(r,"Protocolo")))+'</td><td>'+esc(pick(r,"Produto / Oportunidade","_CommercialReason"))+'</td></tr>').join("")+'</tbody></table></div></div></div></div>';
  $("#printReport").onclick=()=>window.print();
  bindGotos();
  $$("[data-history]").forEach(b=>b.onclick=()=>openHistory(b.dataset.history));
  $$("[data-attendance]").forEach(b=>b.onclick=()=>openAttendance(b.dataset.attendance));
}
function renderScanner(){
  const valid=state.rows.filter(r=>digits(pick(r,"Protocolo")).length===20);
  const withDjen=state.rows.filter(r=>pick(r,"DJEN • Última Publicação")).length;
  const withDataJud=state.rows.filter(r=>pick(r,"DataJud • Último Movimento")).length;
  const activeExec=state.rows.filter(r=>String(pick(r,"_ExecStatus")).toUpperCase()==="ATIVO").length;
  $("#content").innerHTML=
  '<div class="scanner-hero"><div><span class="eyebrow">SCANNER OMNICANAL</span><h2>DataJud + DJEN</h2><p>Valida fase processual, cumprimento real, lado favorecido e oportunidade comercial.</p>'+(djenPaused()?'<div class="offline-note">'+esc(djenPauseText())+'</div>':'')+'</div><div class="scanner-health"><span>'+valid.length+' CNJs</span><span>'+withDataJud+' DataJud</span><span>'+withDjen+' DJEN</span><span>'+activeExec+' cumprimento ativo</span></div></div>'+
  '<div class="scanner-grid">'+
    '<div class="card scanner-main"><div class="card-head"><div><span class="eyebrow">AUDITORIA INDIVIDUAL</span><h3>Consulta unificada</h3></div><span class="live-pill">REDE OFICIAL</span></div><div class="card-body">'+
      '<div class="scan-box"><input id="scanCnj" placeholder="0000000-00.0000.0.00.0000"/><button class="btn primary" id="scanOneBtn">Auditar processo</button></div>'+
      '<div id="scanResult" class="scan-result judicial-result" style="margin-top:14px">'+(state.lastScan?renderScanResult(state.lastScan):'<div class="empty-state"><strong>Informe um CNJ</strong><span>O scanner cruza DataJud, DJEN, cumprimento e lado favorecido.</span></div>')+'</div>'+
    '</div></div>'+
    '<div class="stack"><div class="card"><div class="card-head"><div><span class="eyebrow">DISCOVERY</span><h3>Pesquisa avançada</h3></div></div><div class="card-body">'+
      '<div class="form-grid"><label>Fonte<select id="judSearchMode"><option value="datajud-nome">DataJud • Nome</option><option value="datajud-cpf">DataJud • CPF/CNPJ</option><option value="djen-nome">DJEN • Nome da parte</option><option value="djen-texto">DJEN • Texto</option></select></label><label>Consulta<input id="judSearchQuery" placeholder="nome, CPF/CNPJ ou texto"/></label><label>Tribunal<input id="judSearchTribunal" placeholder="TJSP"/></label><label class="full"><button type="button" class="btn block" id="judSearchBtn">Pesquisar</button></label></div><div id="judSearchResult" class="scan-result" style="margin-top:14px"></div>'+
    '</div></div>'+
    '<div class="card"><div class="card-head"><div><span class="eyebrow">CICLO DE CARTEIRA</span><h3>Varredura sequencial</h3></div></div><div class="card-body"><div class="metric-list">'+metricRow("CNJs válidos",valid.length,"aptos")+metricRow("Cobertura DataJud",withDataJud,"movimento salvo")+metricRow("Cobertura DJEN",withDjen,"publicação salva")+'</div><div class="row" style="margin-top:14px"><button class="btn primary" id="scanQueueBtn">'+(state.scanning?"Parar":"Iniciar ciclo")+'</button><button class="btn" id="clearScanLog">Limpar</button></div><div class="progress" style="margin:14px 0"><span id="scanProgress" style="width:0%"></span></div><div id="queueLog" class="queue-log"></div></div></div></div>'+
  '</div>';
  $("#scanOneBtn").onclick=()=>scanOne($("#scanCnj").value);
  $("#judSearchBtn").onclick=advancedJudicialSearch;
  $("#scanQueueBtn").onclick=()=>state.scanning?(state.scanStop=true):(scanQueue());
  $("#clearScanLog").onclick=()=>$("#queueLog").innerHTML="";
}
function renderScanResult(x){
  if(!x)return "";
  if(x.retry&&(!x.datajud&&!x.djen))return '<div class="banner bad">'+esc(x.error||"Consulta temporariamente pausada")+'</div>';
  const data=x.datajud||null,djen=x.djen||null,intel=x.intelligence||{},com=intel.commercial||{},parts=[];
  if(x.djenPaused&&x.djenPauseMessage)parts.push('<div class="offline-note">'+esc(x.djenPauseMessage)+'</div>');
  if(com&&Object.keys(com).length){
    const side=com.side?.favorecido||x.patch?._Favorecido||"INDEFINIDO",exec=com.execution?.status||x.patch?._ExecStatus||"INDEFINIDO";
    parts.push('<div class="decision-card"><div><span class="eyebrow">DECISÃO DE TRIAGEM</span><h3>'+esc(com.decision||"REVISAR")+'</h3><p>'+esc(com.product||"Sem oferta automática")+'</p></div><div class="decision-meta"><span>'+esc("Favorecido: "+side)+'</span><span>'+esc("Cumprimento: "+exec)+'</span><span>'+esc("Confiança: "+(com.confidence??"—"))+'</span></div><small>'+esc(com.reason||"Revisão humana necessária.")+'</small></div>');
  }
  if(data){
    const last=intel.datajud?.last||data.movimentos?.[0]||null;
    parts.push('<div class="publication source-card"><div class="source-head"><strong>DataJud</strong><span>'+esc(data.tribunal||"")+'</span></div><h4>'+esc(data.classe||"Processo")+'</h4><p><strong>Último movimento:</strong> '+esc(last?[last.nome,last.complemento].filter(Boolean).join(" — "):data.message||"Nenhum movimento retornado")+'</p><div class="source-foot"><span>'+esc(data.orgaoJulgador||"")+'</span><span>'+esc(last?.dataHora||"")+'</span></div></div>');
  }
  if(djen){
    if(djen.success){
      const y=intel.djen?.latest||djen.items?.[0]||null;
      parts.push(y?'<div class="publication source-card"><div class="source-head"><strong>DJEN</strong><span>'+esc(y.siglaTribunal||"")+'</span></div><h4>'+esc(intel.djen?.event||y.tipoComunicacao||"Publicação")+'</h4><small>'+esc(y.data_disponibilizacao||"")+' • '+esc(y.nomeOrgao||"")+'</small><p>'+esc(y.texto||"")+'</p>'+(y.link?'<a target="_blank" rel="noopener" href="'+esc(y.link)+'">Abrir publicação oficial</a>':'')+'</div>':'<div class="offline-note">DJEN consultado: nenhuma publicação localizada no período.</div>');
    }else parts.push('<div class="banner bad">'+esc(djen.error||"Falha DJEN")+'</div>');
  }
  if(!parts.length)parts.push('<div class="banner bad">'+esc(x.error||"Consulta sem resultado")+'</div>');
  if(x.partial)parts.unshift('<div class="offline-note">Resultado parcial: a fonte disponível foi preservada e a indisponível poderá ser tentada novamente.</div>');
  return parts.join("");
}
async function advancedJudicialSearch(){
  const mode=$("#judSearchMode").value,q=$("#judSearchQuery").value.trim(),trib=$("#judSearchTribunal").value.trim();
  const out=$("#judSearchResult");out.innerHTML='<div class="offline-note">Pesquisando…</div>';
  if(!q){out.innerHTML='<div class="banner bad">Informe uma consulta.</div>';return}
  try{
    let url,body;
    if(mode.startsWith("datajud-")){
      url="/api/datajud-search";
      body={mode:mode.endsWith("cpf")?"cpf":"nome",query:q,size:12};
    }else{
      url="/api/djen-search";
      body={mode:mode.endsWith("texto")?"texto":"nome",query:q,siglaTribunal:trib||undefined,itensPorPagina:50};
    }
    const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),cache:"no-store"});
    const j=await r.json();if(!r.ok&&r.status!==429)throw new Error(j.error||"Falha na pesquisa");
    if(r.status===429){const ms=Math.max(60000,Number(j.retryAfterMs)||60000);state.djenBlockedUntil=Date.now()+ms;out.innerHTML='<div class="banner bad">'+esc(j.error||"DJEN 429")+'</div>';return}
    const items=j.items||[];
    if(!items.length){out.innerHTML='<div class="offline-note">Nenhum resultado localizado.</div>';return}
    out.innerHTML='<div class="table-wrap"><table class="table"><thead><tr><th>Processo / Data</th><th>Tribunal</th><th>Classe / Tipo</th><th>Detalhe</th></tr></thead><tbody>'+
      items.slice(0,50).map(it=>'<tr><td>'+esc(it.numeroProcesso||it.numero_processo||it.data_disponibilizacao||"—")+'</td><td>'+esc(it.tribunal||it.siglaTribunal||"—")+'</td><td>'+esc(it.classe||it.tipoComunicacao||it.tipoDocumento||"—")+'</td><td>'+esc(String(it.texto||[...(it.poloAtivo||[]),...(it.poloPassivo||[])].join(" × ")||it.orgaoJulgador||"").slice(0,220))+'</td></tr>').join("")+
      '</tbody></table></div>';
  }catch(e){out.innerHTML='<div class="banner bad">'+esc(e.message||String(e))+'</div>'}
}
async function scanOne(cnj,quiet=false){
  const d=digits(cnj);if(d.length!==20){if(!quiet)showBanner("CNJ inválido. Use 20 dígitos.","bad");return null}
  const djenWasPaused=djenPaused();
  const row=state.companyRows.find(x=>digits(pick(x,"Protocolo"))===d)||null;
  try{
    const r=await fetch("/api/judicial-scan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cnj:cnjFormatted(d),tribunal:row?pick(row,"Tribunal"):"",cliente:row?pick(row,"Cliente"):"",ultimoRetorno:row?pick(row,"Último Retorno"):"",lastDjenId:row?pick(row,"_DJENId"):"",lastDjenDate:row?pick(row,"_DJENDate","DJEN • Data"):"",mode:djenWasPaused?"datajud":"both"}),cache:"no-store"});
    const j=await r.json();state.lastScan=j;
    const djenBlocked=djenWasPaused||j?.djen?.isGeoBlocked||Number(j?.djen?.status)===403;
    if(djenBlocked){
      const fb=await djenViaSheetsBridge(d,row);
      if(fb.success){
        j.djen={success:true,items:fb.items,count:fb.items.length,source:fb.source};
        j.patch={...(j.patch||{}),...(fb.patch||{})};
        j.djenPaused=false;j.djenPauseMessage="";
      }else{
        setDjenBlock(DJEN_GEO_BLOCK_MS);j.djenPaused=true;j.djenPauseMessage="DJEN HTTP 403: origem Vercel bloqueada e fallback da planilha indisponível. DataJud continua.";
        j.djenFallbackError=fb.error;
      }
    }
    if(j.patch&&row){
      Object.assign(row,j.patch);
      refreshScopes();
      await saveRows(state.companyRows);
      try{
        await queueWrite(judicialWritePatch(row,j));
        await flushOutbox();
      }catch(e){j.sheetError=e.message||String(e)}
    }
    if((j?.djen?.isGeoBlocked||Number(j?.djen?.status)===403)&&!j?.djen?.success){
      setDjenBlock(DJEN_GEO_BLOCK_MS);j.djenPaused=true;j.djenPauseMessage="DJEN HTTP 403: origem bloqueada. Nova tentativa em até 10 min; DataJud continua.";
      if(!quiet)showBanner(j.djenPauseMessage,"bad");
    }else if(r.status===429||j?.djen?.isRateLimited){
      const ms=Math.max(60000,Number(j?.djen?.retryAfterMs||j.retryAfterMs)||60000);
      setDjenBlock(ms);j.retry=true;j.retryAfterMs=ms;j.djenPaused=true;j.djenPauseMessage="DJEN em pausa por limite oficial; DataJud continua.";
    }
    if(!quiet&&state.view==="scanner")$("#scanResult").innerHTML=renderScanResult(j);
    if(j.sheetError&&!quiet)showBanner("Consulta concluída, mas a planilha recusou o salvamento: "+j.sheetError,"bad");
    return j;
  }catch(e){
    const j={ok:false,error:e.message||String(e)};state.lastScan=j;if(!quiet&&state.view==="scanner")$("#scanResult").innerHTML=renderScanResult(j);return j;
  }
}
function logQueue(msg){const el=$("#queueLog");if(!el)return;const d=document.createElement("div");d.textContent=new Date().toLocaleTimeString("pt-BR")+" • "+msg;el.appendChild(d);el.scrollTop=el.scrollHeight}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function scanQueue(){
  if(state.scanning)return;state.scanning=true;state.scanStop=false;renderScanner();
  const list=state.rows.filter(r=>digits(pick(r,"Protocolo")).length===20).sort((a,b)=>{
    const aa=Number(!pick(a,"DataJud • Último Movimento"))+Number(!pick(a,"DJEN • Última Publicação"));
    const bb=Number(!pick(b,"DataJud • Último Movimento"))+Number(!pick(b,"DJEN • Última Publicação"));
    return bb-aa;
  });
  let done=0;
  for(const row of list){
    if(state.scanStop)break;
    const cnj=pick(row,"Protocolo");logQueue("DataJud + DJEN • "+cnjFormatted(cnj));
    const j=await scanOne(cnj,true);done++;const p=$("#scanProgress");if(p)p.style.width=Math.round(done/list.length*100)+"%";
    if(j?.sheetError){logQueue("Salvamento pendente • "+j.sheetError);showBanner(j.sheetError,"bad");break;}
    if(j?.djen?.isGeoBlocked||Number(j?.djen?.status)===403)logQueue("DJEN HTTP 403 • nova tentativa em até 10 min; DataJud continua");
    else if(j?.retry)logQueue("DJEN em pausa • DataJud continua");
    await sleep(j?.djenPaused?1500:6000);
    if(done%10===0)logQueue("Checkpoint • "+done+" processos");
  }
  state.scanning=false;state.scanStop=false;logQueue("Fila finalizada/pausada.");renderScanner();
}

function bindGotos(){$$("[data-goto]").forEach(b=>b.onclick=()=>setView(b.dataset.goto))}
function findRow(key){return state.companyRows.find(x=>keyOf(x)===key)||state.rows.find(x=>keyOf(x)===key)||null}
function todayBrazil(){
  const parts=new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit",year:"numeric"}).formatToParts(new Date());
  const o={};parts.forEach(p=>o[p.type]=p.value);return o.day+"/"+o.month+"/"+o.year;
}
function updateLocalRow(row){
  const idx=state.companyRows.findIndex(x=>keyOf(x)===keyOf(row));
  if(idx>=0)state.companyRows[idx]=row;else state.companyRows.unshift(row);
  invalidateCrmIndexes();refreshScopes();
}
async function markContacted(key){
  const row=findRow(key);if(!row)return;
  const actor=currentUser().nome||currentUser().usuario||"Usuário";
  const retorno=todayBrazil(),nowIso=new Date().toISOString();
  const clientId=pick(row,"ClienteId")||(window.LexisCRM?.stableClientId?window.LexisCRM.stableClientId({Cliente:pick(row,"Cliente"),Telefone:pick(row,"Telefone")}):"");
  if(clientId&&!pick(row,"ClienteId"))row.ClienteId=clientId;
  Object.assign(row,{"AtendidoPor":actor,"Último Retorno":retorno,"Nova Atualização":"NÃO","Novo Andamento":"NÃO","Novo_Andamento":"NÃO","atendido_em":nowIso});
  updateLocalRow(row);await saveRows(state.companyRows);
  const patch={"Protocolo":pick(row,"Protocolo"),"ClienteId":clientId,"AtendidoPor":actor,"Último Retorno":retorno,"Nova Atualização":"NÃO","Novo Andamento":"NÃO","Novo_Andamento":"NÃO","atendido_em":nowIso};
  await queueWrite(patch);
  if(window.WAAutoModule?.syncRows)void window.WAAutoModule.syncRows([row],crmClients(),{quiet:true}).catch(()=>{});
  if(clientId){
    const interaction={InteracaoId:window.LexisCRM?.stableId("int",clientId,nowIso,actor)||("int_"+Date.now()),ClienteId:clientId,Protocolo:pick(row,"Protocolo"),Canal:"Atendimento",Tipo:"Retorno",Assunto:"Atendimento registrado",Conteudo:"Cliente marcado como contatado no SheetsPredict.",Usuario:actor,DataHora:nowIso,Resultado:"Contatado",ProximoPasso:"",DataProximoPasso:"",OptOut:""};
    await crmWrite("Interacoes",interaction,{quiet:true});
  }
  render();
  if(!navigator.onLine){showBanner("Atendimento e histórico CRM salvos no cache. Serão enviados quando a conexão voltar.","good");return}
  try{await flushOutbox();await flushCrmOutbox().catch(()=>{});showBanner("Atendimento registrado por "+actor+" sem alterar o Assistente da carteira.","good")}
  catch(e){showBanner("Atendimento ficou pendente para a planilha: "+(e.message||String(e)),"bad")}
}

function dateInputValue(v){
  const d=parseDate(v);if(!d)return"";
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");
  return y+"-"+m+"-"+day;
}
function brDateFromInput(v){
  const m=String(v||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m?m[3]+"/"+m[2]+"/"+m[1]:String(v||"");
}
function openAttendance(key){
  const row=findRow(key);if(!row)return;
  $("#attendanceKey").value=key;
  $("#attendanceTitle").textContent="Registrar atendimento • "+(pick(row,"Cliente")||"Processo");
  $("#attendanceResult").value=isClosed(row)?"ENCERRADO":"EM ANDAMENTO";
  $("#attendanceNext").value=dateInputValue(pick(row,"Próximo Retorno"));
  $("#attendanceNote").value="";
  $("#attendanceStatus").textContent="";
  $("#attendanceSummary").innerHTML='<strong>'+esc(pick(row,"Cliente")||"SEM NOME")+'</strong><span class="mono">'+esc(cnjFormatted(pick(row,"Protocolo")))+'</span><span>Assistente: '+esc(pick(row,"Assistente")||"—")+'</span><span>Último retorno: '+esc(pick(row,"Último Retorno")||"—")+'</span>';
  $("#attendanceDialog").showModal();
}
async function saveAttendance(){
  const key=$("#attendanceKey").value,row=findRow(key);if(!row)return;
  const btn=$("#saveAttendanceBtn");btn.disabled=true;btn.textContent="Salvando…";
  const actor=currentUser().nome||currentUser().usuario||"Usuário";
  const nowIso=new Date().toISOString(),retorno=todayBrazil();
  const result=$("#attendanceResult").value||"EM ANDAMENTO";
  const next=brDateFromInput($("#attendanceNext").value);
  const note=$("#attendanceNote").value.trim();
  const clientId=pick(row,"ClienteId")||(window.LexisCRM?.stableClientId?window.LexisCRM.stableClientId({Cliente:pick(row,"Cliente"),Telefone:pick(row,"Telefone")}):"");
  const patch={"Protocolo":pick(row,"Protocolo"),"ClienteId":clientId,"AtendidoPor":actor,"Último Retorno":retorno,"Nova Atualização":"NÃO","Novo Andamento":"NÃO","Novo_Andamento":"NÃO","atendido_em":nowIso};
  if(next)patch["Próximo Retorno"]=next;
  if(result==="ENCERRADO"){patch["Status"]="Encerrado";patch["Situacao"]="ENCERRADO"}
  else if(result!=="SEM CONTATO"){patch["Situacao"]="EM ANDAMENTO"}
  if(note)patch["Observações"]=note;
  Object.assign(row,patch);updateLocalRow(row);await saveRows(state.companyRows);await queueWrite(patch);if(window.WAAutoModule?.syncRows)void window.WAAutoModule.syncRows([row],crmClients(),{quiet:true}).catch(()=>{});
  if(clientId){
    const interaction={
      InteracaoId:window.LexisCRM?.stableId("int",clientId,nowIso,actor)||("int_"+Date.now()),
      ClienteId:clientId,Protocolo:pick(row,"Protocolo"),Canal:"Atendimento",Tipo:"Retorno",
      Assunto:result==="ENCERRADO"?"Atendimento e encerramento":"Atendimento registrado",
      Conteudo:note||("Resultado: "+result),Usuario:actor,DataHora:nowIso,Resultado:result,
      ProximoPasso:next?"Retorno em "+next:"",DataProximoPasso:next,OptOut:""
    };
    await crmWrite("Interacoes",interaction,{quiet:true});
  }
  render();
  try{
    if(navigator.onLine){await flushOutbox();await flushCrmOutbox().catch(()=>{})}
    $("#attendanceDialog").close();
    showBanner("Atendimento registrado por "+actor+" sem transferir o processo.","good");
  }catch(e){
    $("#attendanceDialog").close();
    showBanner("Atendimento salvo no cache e pendente para a planilha: "+(e.message||String(e)),"bad");
  }finally{btn.disabled=false;btn.textContent="Registrar atendimento"}
}
function historyDate(raw){
  const d=parseDate(raw);return d&&!Number.isNaN(d.getTime())?d:new Date(0);
}
function buildTribunalTimeline(scan,row){
  const out=[];
  const movs=scan?.datajud?.movimentos||scan?.movimentos||[];
  for(const m of movs){
    const date=m?.dataHora||m?.data||m?.dataMovimento||m?.data_hora||"";
    const title=m?.nome||m?.nomeMovimento||m?.descricao||m?.movimento||"Movimentação";
    const detail=[m?.complemento,m?.observacao,m?.descricao].filter(Boolean).join(" — ");
    out.push({source:"DataJud",date,title,detail,link:""});
  }
  const pubs=scan?.djen?.items||scan?.comunicacoes||[];
  for(const d of pubs){
    const date=d?.data_disponibilizacao||d?.dataDisponibilizacao||d?.data||"";
    const title=d?.tipoComunicacao||d?.tipoDocumento||"Publicação DJEN";
    const detail=String(d?.texto||d?.conteudo||d?.inteiroTeor||"");
    out.push({source:"DJEN",date,title,detail,link:d?.link||""});
  }
  if(!out.length&&row){
    if(latestMove(row))out.push({source:"Planilha / DataJud",date:pick(row,"DataJud • Data","Data da Movimentação","Data_Movimentacao"),title:"Último movimento salvo",detail:String(latestMove(row)),link:""});
    const pub=officialDjen(row);
    if(pub)out.push({source:"Planilha / DJEN",date:pick(row,"DJEN • Data","_DJENDate"),title:"Última publicação DJEN oficial salva",detail:String(pub),link:""});
  }
  return out.sort((a,b)=>historyDate(b.date).getTime()-historyDate(a.date).getTime());
}
function renderHistoryDialog(){
  const row=findRow(state.historyKey);if(!row)return;
  const items=buildTribunalTimeline(state.historyScan,row),scan=state.historyScan;
  const djCount=scan?.datajud?.movimentos?.length||0,djenCount=scan?.djen?.items?.length||0;
  const djError=scan?.datajud?.error?(scan.datajud.message||scan.datajud.error):"";
  const djenError=scan?.djen&&scan.djen.success===false?(scan.djen.error||"DJEN indisponível"):"";
  $("#historyTitle").textContent="Histórico inteiro • "+(pick(row,"Cliente")||"Processo");
  $("#historyMeta").innerHTML='<span class="mono">'+esc(cnjFormatted(pick(row,"Protocolo")))+'</span><span>'+esc(pick(row,"Tribunal")||"Tribunal não informado")+'</span><span>'+items.length+' evento(s)</span><span>'+djCount+' DataJud</span><span>'+djenCount+' DJEN</span>'+(state.historyLoading?'<span class="history-loading">Atualizando…</span>':'');
  if(state.historyLoading&&!scan){
    $("#historyContent").innerHTML='<div class="history-empty">Consultando o histórico completo no DataJud e as publicações DJEN…</div>';return;
  }
  const warnings=[djError?'<div class="banner bad"><strong>DataJud ao vivo:</strong> '+esc(djError)+'</div>':'',djenError?'<div class="offline-note"><strong>DJEN:</strong> '+esc(djenError)+'</div>':''].filter(Boolean).join("");
  if(!items.length){
    $("#historyContent").innerHTML=warnings+'<div class="history-empty">Nenhum evento judicial foi retornado ou persistido para este CNJ.</div>';return;
  }
  const partial=(djCount<=1&&!!djError)?'<div class="offline-note"><strong>Histórico parcial:</strong> exibindo o que já está salvo na planilha; a consulta completa do DataJud falhou nesta tentativa.</div>':'';
  $("#historyContent").innerHTML=warnings+partial+'<div class="history-list">'+items.map((x,i)=>
    '<article class="history-item '+(x.source.includes("DJEN")?"djen":"court")+'"><div class="history-index">'+(i+1)+'</div><div class="history-body"><div class="history-item-head"><strong>'+esc(x.title)+'</strong><span>'+esc(x.source)+'</span></div><small>'+esc(x.date||"Data não informada")+'</small><p>'+esc(x.detail||"Sem complemento.")+'</p>'+(x.link?'<a target="_blank" rel="noopener" href="'+esc(x.link)+'">Abrir publicação oficial</a>':'')+'</div></article>'
  ).join("")+'</div>';
}
async function loadHistory(key,{force=false}={}){
  const row=findRow(key);if(!row)return;
  if(state.historyLoading)return;
  if(state.historyScan&&!force){renderHistoryDialog();return}
  const cnj=digits(pick(row,"Protocolo"));
  if(cnj.length!==20){showBanner("CNJ inválido para consultar histórico.","bad");return}
  state.historyLoading=true;renderHistoryDialog();
  try{
    // Primeiro lê TODO o histórico já persistido nas abas Movimentações_DataJud/Publicações_DJEN.
    try{
      const stored=await apiSheets({action:"judicial_history",protocolo:cnjFormatted(cnj)});
      state.historyScan=mergeJudicialScan(state.historyScan,storedHistoryScan(stored));renderHistoryDialog();
    }catch(_){}
    if(!navigator.onLine)return;
    const r=await fetch("/api/judicial-scan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cnj:cnjFormatted(cnj),tribunal:pick(row,"Tribunal"),cliente:pick(row,"Cliente"),ultimoRetorno:pick(row,"Último Retorno"),lastDjenId:pick(row,"_DJENId"),lastDjenDate:pick(row,"_DJENDate","DJEN • Data"),mode:djenPaused()?"datajud":"both"}),cache:"no-store"});
    let j=await r.json();
    if(djenPaused()||j?.djen?.isGeoBlocked||Number(j?.djen?.status)===403){
      const fb=await djenViaSheetsBridge(cnj,row);
      if(fb.success)j=mergeJudicialScan(j,{djen:{success:true,items:fb.items,source:fb.source},patch:fb.patch});
      else setDjenBlock(DJEN_GEO_BLOCK_MS);
    }else if(r.status===429||j?.djen?.isRateLimited){
      setDjenBlock(Math.max(60000,Number(j?.djen?.retryAfterMs||j.retryAfterMs)||60000));
    }
    state.historyScan=mergeJudicialScan(state.historyScan,j);

    // Se o scanner unificado não trouxe o histórico completo do DataJud,
    // consulta a rota dedicada e injeta todos os movimentos disponíveis.
    const liveDjCount=state.historyScan?.datajud?.movimentos?.length||0;
    if(liveDjCount<=1){
      try{
        const djResp=await fetch("/api/datajud?cnj="+encodeURIComponent(cnjFormatted(cnj))+"&ultimoRetorno="+encodeURIComponent(pick(row,"Último Retorno")||""),{cache:"no-store"});
        const djJson=await djResp.json();
        if(djJson?.data&&!djJson.data.error&&Array.isArray(djJson.data.movimentos)&&djJson.data.movimentos.length){
          state.historyScan=mergeJudicialScan(state.historyScan,{datajud:djJson.data});
          j=mergeJudicialScan(j,{datajud:djJson.data});
        }
      }catch(_){}
    }

    if(j.patch){
      Object.assign(row,j.patch);updateLocalRow(row);await saveRows(state.companyRows);
      await queueWrite(judicialWritePatch(row,j));
      if(navigator.onLine)await flushOutbox();
    }
    // Relê as abas após persistir para o modal refletir exatamente a fonte de verdade.
    try{
      const stored2=await apiSheets({action:"judicial_history",protocolo:cnjFormatted(cnj)});
      state.historyScan=mergeJudicialScan(state.historyScan,storedHistoryScan(stored2));
    }catch(_){}
    if(!r.ok&&r.status!==207&&r.status!==429&&!(state.historyScan?.datajud?.movimentos?.length||state.historyScan?.djen?.items?.length))showBanner(j.error||"Histórico retornou resultado parcial.","bad");
  }catch(e){state.historyScan={...(state.historyScan||{}),error:e.message||String(e)};showBanner(e.message||String(e),"bad")}
  finally{state.historyLoading=false;renderHistoryDialog();render()}
}
function openHistory(key){
  const row=findRow(key);if(!row)return;
  state.historyKey=key;state.historyScan=null;state.historyLoading=false;
  $("#historyDialog").showModal();renderHistoryDialog();void loadHistory(key);
}
function auditCached(row){
  return {
    move:latestMove(row)||"Sem movimentação registrada no cache.",
    moveDate:pick(row,"DataJud • Data","Data da Movimentação","Data_Movimentacao")||"",
    djen:officialDjen(row),
    djenLegacy:legacyDjenSummary(row),
    djenDate:pick(row,"DJEN • Data","_DJENDate")||"",
    owner:pick(row,"Assistente")||"—",
    attended:pick(row,"AtendidoPor")||"—",
    lastReturn:pick(row,"Último Retorno")||"—",
    nextReturn:pick(row,"Próximo Retorno")||"—"
  };
}
function scanLatestMovement(scan){
  const movs=scan?.datajud?.movimentos||scan?.movimentos||[];
  const m=scan?.intelligence?.datajud?.last||movs[0]||null;
  return m?[m.nome,m.complemento,m.descricao].filter(Boolean).join(" — "):"";
}
function scanLatestDjen(scan){
  const item=scan?.intelligence?.djen?.latest||scan?.djen?.items?.[0]||scan?.comunicacoes?.[0]||null;
  return item?String(item.texto||item.conteudo||item.inteiroTeor||item.tipoComunicacao||""):"";
}
function renderAuditDialog(){
  const row=findRow(state.auditKey);if(!row)return;
  const cached=auditCached(row),scan=state.auditScan||null;
  const networkMove=scanLatestMovement(scan),networkDjen=scanLatestDjen(scan);
  const move=networkMove||cached.move,djen=networkDjen||cached.djen;
  const suggestions=state.auditSuggest&&window.LexisSuggest?.suggestResponses?window.LexisSuggest.suggestResponses({row,scan}):[];
  $("#auditTitle").textContent=(state.auditSuggest?"Sugerir resposta • ":"Audit 3D • ")+(pick(row,"Cliente")||"Processo");
  $("#auditContent").innerHTML=
    '<div class="audit-hero"><div><span class="eyebrow">CACHE-FIRST • GOOGLE SHEETS</span><h4>'+esc(pick(row,"Cliente")||"SEM NOME")+'</h4><p>'+esc(cnjFormatted(pick(row,"Protocolo")))+' · '+esc(pick(row,"Tribunal")||"")+' · Assistente '+esc(cached.owner)+'</p></div><div>'+badge(statusRet(row),statusRet(row)==="VENCIDO"?"bad":statusRet(row)==="ATENÇÃO"||statusRet(row)==="É HOJE"?"warn":"good")+'</div></div>'+
    '<div class="audit-grid"><section class="audit-panel"><h4>Movimentação mais recente</h4><div class="audit-kv"><span>Data</span><strong>'+esc(cached.moveDate||"—")+'</strong></div><div class="audit-kv"><span>Fonte</span><strong>'+(networkMove?"DataJud atualizado agora":"Planilha / cache local")+'</strong></div><div class="audit-source">'+esc(move)+'</div></section>'+
    '<section class="audit-panel"><h4>Publicação DJEN oficial</h4><div class="audit-kv"><span>Data</span><strong>'+esc(cached.djenDate||"—")+'</strong></div><div class="audit-kv"><span>Fonte</span><strong>'+(networkDjen?"DJEN atualizado agora":cached.djen?"Planilha / DJEN oficial":"Ainda não persistido")+'</strong></div><div class="audit-source">'+esc(djen||"Nenhuma publicação DJEN oficial registrada na planilha.")+(cached.djenLegacy&&!djen?'<br><br><small>Resumo legado existente: '+esc(cached.djenLegacy)+'</small>':'')+'</div></section></div>'+
    '<div class="audit-grid"><section class="audit-panel"><h4>Operação</h4><div class="audit-kv"><span>Assistente</span><strong>'+esc(cached.owner)+'</strong></div><div class="audit-kv"><span>Atendido por</span><strong>'+esc(cached.attended)+'</strong></div><div class="audit-kv"><span>Último retorno</span><strong>'+esc(cached.lastReturn)+'</strong></div><div class="audit-kv"><span>Próximo retorno</span><strong>'+esc(cached.nextReturn)+'</strong></div></section>'+
    '<section class="audit-panel"><h4>Leitura simples</h4><div class="audit-source"><strong>'+esc(plainStatus(row))+'</strong><br><br>'+esc(String(move).slice(0,900))+'</div></section></div>'+
    (state.auditSuggest?'<section class="audit-panel"><h4>Sugestões de resposta</h4><div class="suggestions">'+suggestions.map((s,i)=>'<div class="suggestion"><h5>'+esc(s.titulo)+'</h5><p>'+esc(s.texto)+'</p><div class="audit-actions"><button class="btn sm" data-copy-suggestion="'+i+'">Copiar resposta</button></div></div>').join("")+'</div></section>':'')+
    (scan?.error?'<div class="banner bad">'+esc(scan.error)+'</div>':'')+
    '<div class="audit-actions"><button class="btn" id="auditHistoryBtn">Histórico inteiro do tribunal</button><button class="btn" id="auditEditBtn">Editar cadastro</button><button class="btn" id="auditContactBtn">Registrar atendimento</button><button class="btn" id="auditSuggestBtn">Sugerir resposta</button><button class="btn primary" id="auditRefreshBtn">Atualizar DataJud + DJEN</button></div>';
  $("#auditHistoryBtn").onclick=()=>openHistory(state.auditKey);
  $("#auditEditBtn").onclick=()=>{ $("#auditDialog").close();openProcess(state.auditKey) };
  $("#auditContactBtn").onclick=()=>openAttendance(state.auditKey);
  $("#auditSuggestBtn").onclick=()=>{state.auditSuggest=true;renderAuditDialog()};
  $("#auditRefreshBtn").onclick=()=>refreshAudit(state.auditSuggest);
  $$("[data-copy-suggestion]").forEach(b=>b.onclick=async()=>{
    const s=suggestions[Number(b.dataset.copySuggestion)];if(!s)return;
    try{await navigator.clipboard.writeText(s.texto);showBanner("Resposta copiada.","good")}catch(_){showBanner("Não foi possível copiar automaticamente.","bad")}
  });
}
function openAudit(key,suggest=false){
  const row=findRow(key);if(!row)return;
  state.auditKey=key;state.auditScan=null;state.auditSuggest=!!suggest;
  $("#auditDialog").showModal();renderAuditDialog();
  const needsOfficial=!latestMove(row)||!officialDjen(row);
  if(needsOfficial&&navigator.onLine)void refreshAudit(suggest);
}
async function refreshAudit(keepSuggest=false){
  const row=findRow(state.auditKey);if(!row)return;
  const cnj=digits(pick(row,"Protocolo"));
  if(cnj.length!==20){showBanner("CNJ inválido para atualização oficial.","bad");return}
  const btn=$("#auditRefreshBtn");if(btn){btn.disabled=true;btn.textContent="Atualizando…"}
  try{
    const r=await fetch("/api/judicial-scan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cnj:cnjFormatted(cnj),tribunal:pick(row,"Tribunal"),cliente:pick(row,"Cliente"),ultimoRetorno:pick(row,"Último Retorno"),lastDjenId:pick(row,"_DJENId"),lastDjenDate:pick(row,"_DJENDate","DJEN • Data"),mode:djenPaused()?"datajud":"both"}),cache:"no-store"});
    let j=await r.json();state.auditSuggest=!!keepSuggest;
    if(djenPaused()||j?.djen?.isGeoBlocked||Number(j?.djen?.status)===403){
      const fb=await djenViaSheetsBridge(cnj,row);
      if(fb.success)j=mergeJudicialScan(j,{djen:{success:true,items:fb.items,source:fb.source},patch:fb.patch});
      else{setDjenBlock(DJEN_GEO_BLOCK_MS);j.djenFallbackError=fb.error}
    }
    state.auditScan=j;
    if(j.patch){
      Object.assign(row,j.patch);updateLocalRow(row);await saveRows(state.companyRows);
      await queueWrite(judicialWritePatch(row,j));
      if(navigator.onLine)await flushOutbox();
    }
    if((j?.djen?.isGeoBlocked||Number(j?.djen?.status)===403)&&!j?.djen?.success){
      setDjenBlock(DJEN_GEO_BLOCK_MS);j.djenPaused=true;j.djenPauseMessage="DJEN HTTP 403: origem bloqueada. Nova tentativa em até 10 min; DataJud continua.";showBanner(j.djenPauseMessage,"bad");
    }else if(r.status===429||j?.djen?.isRateLimited){
      const ms=Math.max(60000,Number(j?.djen?.retryAfterMs||j.retryAfterMs)||60000);setDjenBlock(ms);
    }
  }catch(e){state.auditScan={...(state.auditScan||{}),ok:false,error:e.message||String(e)};showBanner(e.message||String(e),"bad")}
  renderAuditDialog();render();
}
function openProcess(key){
  const isNew=!key,u=currentUser(),linkedClient=isNew&&state.clientId?clientById(state.clientId):null;
  const r=findRow(key)||{};
  $("#editKey").value=key||"";$("#processDialogTitle").textContent=isNew?"Novo cadastro":"Editar processo";
  $("#fCliente").value=pick(r,"Cliente")||linkedClient?.Nome||"";$("#fProtocolo").value=pick(r,"Protocolo");
  $("#fAssistente").value=pick(r,"Assistente")||linkedClient?.Responsavel||(u.nome||u.usuario||"");
  $("#fAssistente").readOnly=!isNew;$("#fProtocolo").readOnly=!isNew;
  $("#assistenteHint").textContent=isNew?"Novo cadastro entra na sua carteira por padrão.":"Editar não transfere a carteira. Assistente permanece "+($("#fAssistente").value||"inalterado")+".";
  $("#fAdvogado").value=pick(r,"Advogado");$("#fEscritorio").value=pick(r,"Escritório","Escritorio");$("#fTribunal").value=pick(r,"Tribunal");$("#fStatus").value=pick(r,"Status");$("#fTelefone").value=pick(r,"Telefone")||linkedClient?.Telefone_Principal||"";$("#fRetorno").value=pick(r,"Último Retorno");$("#fProximo").value=pick(r,"Próximo Retorno");$("#fObs").value=pick(r,"Observações","Observacao");$("#processStatus").textContent="";$("#processDialog").showModal()
}
async function saveProcess(){
  const key=$("#editKey").value,isNew=!key;
  const current=findRow(key)||{};
  const next={...current,
    "Cliente":$("#fCliente").value.trim(),
    "Protocolo":$("#fProtocolo").value.trim(),
    "Assistente":isNew?($("#fAssistente").value.trim()||currentUser().nome||currentUser().usuario||""):pick(current,"Assistente"),
    "Advogado":$("#fAdvogado").value.trim(),
    "Escritório":$("#fEscritorio").value.trim(),
    "Tribunal":$("#fTribunal").value.trim(),
    "Status":$("#fStatus").value.trim(),
    "Telefone":$("#fTelefone").value.trim(),
    "Último Retorno":$("#fRetorno").value.trim(),
    "Próximo Retorno":$("#fProximo").value.trim(),
    "Observações":$("#fObs").value.trim()
  };
  if(!String(next["Protocolo"]||"").trim()){showBanner("Informe o Protocolo/CNJ.","bad");return}
  const crm=window.LexisCRM;
  if(crm){
    const validation=crm.validateProcess(next);
    if(!validation.ok){showBanner(validation.errors.join(" • "),"bad");return}
    if(next["Telefone"])next["Telefone"]=crm.normalizePhone(next["Telefone"])||next["Telefone"];
  }
  const linkedClient=state.clientId?clientById(state.clientId):null;
  const clientId=pick(current,"ClienteId")||linkedClient?.ClienteId||(crm?.stableClientId?crm.stableClientId({Cliente:next["Cliente"],Telefone:next["Telefone"]}):"");
  next["ClienteId"]=clientId;
  if(digits(next["Protocolo"]).length===20){next["Automação"]="PENDENTE";next["Próxima Sincronização"]=""}
  updateLocalRow(next);await saveRows(state.companyRows);
  if(clientId){
    const clientRecord={ClienteId:clientId,Tipo:"Pessoa",Nome:next["Cliente"],Telefone_Principal:next["Telefone"],Origem:"App",Status:"ATIVO",Responsavel:next["Assistente"],OptOutWhatsApp:"NÃO",AtualizadoEm:new Date().toISOString()};
    await crmWrite("Clientes",clientRecord,{quiet:true});
  }
  const writePayload={
    "Protocolo":next["Protocolo"],"ClienteId":clientId,"Cliente":next["Cliente"],"Advogado":next["Advogado"],"Escritório":next["Escritório"],"Tribunal":next["Tribunal"],"Status":next["Status"],"Telefone":next["Telefone"],"Último Retorno":next["Último Retorno"],"Próximo Retorno":next["Próximo Retorno"],"Observações":next["Observações"],"Automação":next["Automação"]||"","Próxima Sincronização":next["Próxima Sincronização"]||""
  };
  if(isNew)writePayload["Assistente"]=next["Assistente"];
  await queueWrite(writePayload);render();
  $("#processStatus").textContent="Salvo neste dispositivo. Enviando para a planilha…";
  if(!navigator.onLine){$("#processDialog").close();showBanner("Cadastro salvo no cache e aguardando conexão.","good");return}
  try{
    const j=await flushOutbox();if(Number(j.rejected_count||0)>0)throw new Error("A planilha recusou a alteração.");
    $("#processDialog").close();showBanner((isNew?"Cadastro criado":"Alteração salva")+" sem transferir a carteira.","good");
  }catch(e){$("#processDialog").close();showBanner("Alteração preservada no app e ficou pendente para a planilha: "+(e.message||String(e)),"bad")}
}

function exportJson(){const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),rows:state.companyRows},null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="sheetspredict-"+new Date().toISOString().slice(0,10)+".json";a.click();URL.revokeObjectURL(a.href)}
function csvSplit(line,sep){const out=[];let cur="",q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==="\""){if(q&&line[i+1]==="\""){cur+="\"";i++}else q=!q}else if(c===sep&&!q){out.push(cur);cur=""}else cur+=c}out.push(cur);return out}
async function importCsv(ev){const f=ev.target.files?.[0];if(!f)return;const text=await f.text(),lines=text.replace(/^\uFEFF/,"").split(/\r?\n/).filter(Boolean);if(lines.length<2)return;const sep=(lines[0].match(/;/g)||[]).length>(lines[0].match(/,/g)||[]).length?";":",";const headers=csvSplit(lines[0],sep).map(x=>x.trim());const rows=lines.slice(1).map(l=>{const a=csvSplit(l,sep),r={};headers.forEach((h,i)=>r[h]=a[i]??"");return r});state.companyRows=rows;invalidateCrmIndexes();refreshScopes();await saveRows(rows);showBanner(rows.length+" processos importados para o cache local.","good");render()}
function setupEvents(){
  ensureGlobalXScroll();
  const content=$("#content");
  if(content){
    content.addEventListener("scroll",e=>{
      if(e.target===globalXTarget&&!globalXBusy){
        const dock=document.getElementById("globalXScroll");
        if(dock){
          const targetRange=Math.max(0,globalXTarget.scrollWidth-globalXTarget.clientWidth);
          const dockRange=Math.max(0,dock.scrollWidth-dock.clientWidth);
          const ratio=targetRange?globalXTarget.scrollLeft/targetRange:0;
          globalXBusy=true;dock.scrollLeft=ratio*dockRange;globalXBusy=false;
        }
      }
      scheduleGlobalXScroll();
    },true);
  }
  window.addEventListener("resize",scheduleGlobalXScroll);
  const savedSidebar=localStorage.getItem("lexis_sidebar_collapsed")==="1";
  document.body.classList.toggle("sidebar-collapsed",savedSidebar);
  const toggle=$("#sidebarToggle");
  if(toggle){
    toggle.textContent=savedSidebar?"›":"‹";
    toggle.onclick=()=>{
      const collapsed=!document.body.classList.contains("sidebar-collapsed");
      document.body.classList.toggle("sidebar-collapsed",collapsed);
      localStorage.setItem("lexis_sidebar_collapsed",collapsed?"1":"0");
      toggle.textContent=collapsed?"›":"‹";
      scheduleGlobalXScroll();
    };
  }
  $$("#nav .nav-item").forEach(b=>b.onclick=()=>setView(b.dataset.view));
  $("#syncBtn").onclick=async()=>{try{await syncFromCloud()}catch(e){showBanner(e.message,"bad")}};
  $("#newProcessBtn").onclick=()=>openProcess("");
  $("#closeAuditBtn").onclick=()=>$("#auditDialog").close();
  $("#closeAttendanceBtn").onclick=()=>$("#attendanceDialog").close();
  $("#cancelAttendanceBtn").onclick=()=>$("#attendanceDialog").close();
  $("#saveAttendanceBtn").onclick=saveAttendance;
  $("#closeHistoryBtn").onclick=()=>$("#historyDialog").close();
  $("#historyRefreshBtn").onclick=()=>state.historyKey&&loadHistory(state.historyKey,{force:true});
  $("#historyAttendanceBtn").onclick=()=>{const key=state.historyKey;$("#historyDialog").close();if(key)openAttendance(key)};
  $("#logoutBtn").onclick=async()=>{
    stopAutoSync();try{await apiSheets({action:"logout"})}catch(_){}
    saveSession(null);state.rows=[];state.companyRows=[];state.crm={Clientes:[],Interacoes:[],PipelineCRM:[],AgendaCRM:[],TarefasCRM:[],DocumentosCRM:[],Honorarios:[]};invalidateCrmIndexes();state.lastSync=null;state.lastSyncAt=0;state.clientId=null;
    await Promise.all([idbClear("rows").catch(()=>{}),idbClear("meta").catch(()=>{}),idbClear("outbox").catch(()=>{}),idbClear("crm").catch(()=>{}),idbClear("crmOutbox").catch(()=>{})]);
    setLogged(false);updateSyncUi();
  };
  $("#saveProcessBtn").onclick=saveProcess;
  $("#loginBtn").onclick=async()=>{
    const u=$("#loginUser").value.trim(),p=$("#loginPass").value;
    $("#loginStatus").textContent="Autenticando…";
    if(!u||!p){$("#loginStatus").textContent="Informe usuário e senha.";return}
    try{
      const j=await loginCloud(u,p);
      saveSession({user:j.user||j.usuario||{usuario:u}});
      state.companyRows=[];state.rows=[];state.lastSyncAt=0;
      await syncFromCloud();
      setLogged(true);applyUser();render();startAutoSync();$("#loginStatus").textContent="";
    }catch(e){
      saveSession(null);state.rows=[];state.companyRows=[];setLogged(false);
      $("#loginStatus").textContent=e.message||String(e);
    }
  };
  window.addEventListener("online",async()=>{
    updateSyncUi();
    if(state.session){
      const pending=await outboxCount().catch(()=>0),crmPending=(await idbAll("crmOutbox").catch(()=>[])).length;
      if(!cacheFresh()||pending||crmPending){
        showBanner("Conexão restaurada. Sincronizando alterações pendentes…","good");
        try{await syncFromCloud({quiet:true})}catch(_){}
      }
    }
  });
  window.addEventListener("offline",()=>{updateSyncUi();if(state.session&&state.companyRows.length)showBanner("Modo offline: usando a carteira em cache.","good")});
  window.addEventListener("focus",async()=>{
    if(!state.session||!navigator.onLine||state.syncing)return;
    const pending=await outboxCount().catch(()=>0),crmPending=(await idbAll("crmOutbox").catch(()=>[])).length;
    if(!cacheFresh()||pending||crmPending)try{await syncFromCloud({quiet:true})}catch(_){}
  });
  window.addEventListener("popstate",()=>setView(pathView(),false));
}
function applyUser(){const u=state.session?.user||{};$("#userName").textContent=u.nome||u.usuario||"Usuário";$("#userRole").textContent=u.perfil||"autenticado"}

async function boot(){
  applyTheme(savedTheme(),{persist:false});
  setupEvents();
  restoreDjenBlock();
  state.view=pathView();
  const cachedSession=restoreSession();
  if("serviceWorker"in navigator)navigator.serviceWorker.register("/sw.js",{updateViaCache:"none"}).then(r=>r.update()).catch(()=>{});
  try{await loadLocal()}catch(_){state.companyRows=[];state.rows=[]}
  try{await loadCrmCache()}catch(_){}

  // Offline-first: em F5 sem rede, mantém a sessão visual e os dados já validados
  // anteriormente neste navegador. Nenhum token é salvo no localStorage.
  if(!navigator.onLine&&cachedSession&&state.companyRows.length){
    setLogged(true);applyUser();render();startAutoSync();updateSyncUi();return;
  }

  try{
    const check=await apiSheets({action:"auto"});
    if(!check?.ok)throw new Error(check?.error||"Sessão inválida");
    saveSession({user:check.user||cachedSession?.user||{}});
    refreshScopes();
    setLogged(true);applyUser();render();startAutoSync();

    const pending=await outboxCount().catch(()=>0);
    if(!cacheFresh()||!state.companyRows.length||pending){
      // Renderiza primeiro o cache; a sincronização pesada vem depois.
      void syncFromCloud({quiet:true}).catch(e=>showBanner("Cache disponível; sincronização falhou: "+(e.message||String(e)),"bad"));
    } else {
      void syncCRM({quiet:true}).catch(()=>{});
    }
  }catch(e){
    saveSession(null);state.rows=[];state.companyRows=[];setLogged(false);
  }
  updateSyncUi();
}
document.addEventListener("DOMContentLoaded",boot);
})();
