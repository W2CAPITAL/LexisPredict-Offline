(() => {
"use strict";

const SHEET_DEFAULT="https://docs.google.com/spreadsheets/d/1qbuJee6DCv0bh9XGvnBDPltc0Ziphdn2yx11QKOnchc/edit";
const DB_NAME="lexispredict-secure-cache-v3";
const SESSION_SNAPSHOT_KEY="lexis_user_snapshot_v2";
const CACHE_TTL_MS=5*60*1000;
const state={rows:[],companyRows:[],view:"dashboard",query:"",status:"",quality:"",session:null,scanning:false,scanStop:false,lastScan:null,auditKey:null,auditScan:null,historyKey:null,historyScan:null,historyLoading:false,serverCfg:{},djenBlockedUntil:0,syncing:false,autoSyncTimer:null,lastSync:null,lastSyncAt:0,crm:{Clientes:[],Interacoes:[],PipelineCRM:[],AgendaCRM:[],Honorarios:[]},crmLoaded:false,crmLoading:false,crmBridgeReady:true,clientId:null};

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
const norm=s=>String(s??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const digits=s=>String(s??"").replace(/\D/g,"");
const now=()=>new Date().toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"});

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
function assistantSegments(v){return String(v??"").split(/[\\/|;,]+/).map(x=>norm(x)).filter(Boolean)}
function isMine(r){
  if(elevatedUser())return true;
  const u=currentUser(),target=norm(u.nome||u.usuario||"");
  if(!target)return false;
  const segs=assistantSegments(pick(r,"Assistente"));
  if(segs.includes(target))return true;
  const first=target.split(/\\s+/)[0];
  return !!first&&segs.includes(first);
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
const CRM_KEYS={Clientes:"ClienteId",Interacoes:"InteracaoId",PipelineCRM:"OportunidadeId",AgendaCRM:"EventoId",Honorarios:"id"};
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
    const tables=["Clientes","Interacoes","PipelineCRM","AgendaCRM"];
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
  const derived=window.LexisCRM?.groupProcessesByClient?window.LexisCRM.groupProcessesByClient(state.companyRows):[];
  const pById=new Map(derived.map(x=>[String(x.ClienteId),x]));
  if(!state.crm.Clientes?.length)return derived;
  const out=state.crm.Clientes.map(c=>{
    const id=String(c.ClienteId||""),p=pById.get(id)||{};
    return {...p,...c,ClienteId:id,Nome:c.Nome||p.Nome||"",processos:p.processos||[],protocolos:p.protocolos||[],Telefone_Principal:c.Telefone_Principal||p.Telefone_Principal||"",Responsavel:c.Responsavel||p.Responsavel||""};
  });
  for(const d of derived)if(!out.some(x=>String(x.ClienteId)===String(d.ClienteId)))out.push(d);
  return out.sort((a,b)=>String(a.Nome||"").localeCompare(String(b.Nome||""),"pt-BR"));
}
function clientById(id){return crmClients().find(c=>String(c.ClienteId)===String(id))||null}
function crmRowsForClient(table,id){return (state.crm[table]||[]).filter(x=>String(x.ClienteId||x.cliente_id||"")===String(id))}

async function queueWrite(row){
  const list=await idbAll("outbox"),k=keyOf(row);
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
  if(!r.ok||j.ok===false)throw new Error(j.error||"Falha ao acessar a planilha");
  return j;
}
async function loginCloud(user,pass){return apiSheets({action:"login",usuario:user,login:user,senha:pass})}
async function syncFromCloud(opts={}){
  if(state.syncing)return;
  state.syncing=true;
  if(!opts.quiet)showBanner("Sincronizando carteira com o Google Sheets…","good");
  try{
    try{await flushOutbox()}catch(e){if(!opts.quiet)showBanner("Há edição pendente: "+(e.message||String(e)),"bad")}
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
    void syncCRM({quiet:true}).catch(()=>{});
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
  const keys=Object.keys(row).filter(k=>!["Automação","Próxima Sincronização"].includes(k));
  const bad=[];
  for(const k of keys){
    const expected=comparable(row[k],k),actual=comparable(pick(saved,k),k);
    if(expected!==actual)bad.push(k);
  }
  return bad.length?{ok:false,error:"A planilha não confirmou: "+bad.slice(0,5).join(", ")}:{ok:true,row:saved};
}
async function flushOutbox(){
  const list=await idbAll("outbox");if(!list.length)return {ok:true,written:0};
  const latest=new Map();list.forEach(x=>latest.set(keyOf(x.row),x.row));
  const rows=[...latest.values()];
  const j=await apiSheets({action:"write",rows});
  const rejected=Number(j.rejected_count||0);
  if(j.ok===false||rejected>0){
    const why=(j.rejected||[]).map(x=>x.motivo||x.reason).filter(Boolean).join("; ");
    throw new Error(why||j.error||"A planilha recusou uma ou mais alterações.");
  }
  for(const row of rows){
    const verify=await verifySheetWrite(row);
    if(!verify.ok)throw new Error(verify.error);
  }
  await idbClear("outbox");
  return {...j,written:Number(j.written??j.updated??rows.length),verified:true};
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
  processos:["CARTEIRA","Processos"],
  empresa:["EMPRESA","Processos da empresa"],
  clientes:["CRM","Clientes"],
  pipeline:["CRM","Pipeline"],
  agenda:["CRM","Agenda"],
  financeiro:["CRM","Financeiro"],
  tarefas:["OPERAÇÃO","Tarefas"],
  analise:["INTELIGÊNCIA","Análise"],
  report:["EXECUTIVO","Report"],
  scanner:["REDE JUDICIAL","DataJud + DJEN"]
}[v]||["LEXISPREDICT","Dashboard"]}
const viewPaths={dashboard:"/",processos:"/cases",empresa:"/processos",clientes:"/clientes",pipeline:"/pipeline",agenda:"/agenda",financeiro:"/financeiro",tarefas:"/tarefas",analise:"/analise",report:"/report",scanner:"/scanner"};
function pathView(){const p=location.pathname.replace(/\/+$/,"")||"/";if(p==="/processos-empresa")return"empresa";return Object.entries(viewPaths).find(([,x])=>x===p)?.[0]||"dashboard"}
function setView(v,push=true){
  state.view=v;
  $$(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===v));
  const [e,t]=titleFor(v);$("#viewEyebrow").textContent=e;$("#viewTitle").textContent=t;
  if(push&&viewPaths[v]&&location.pathname!==viewPaths[v])history.pushState({view:v},"",viewPaths[v]);
  render();
}
function render(){
  const m=metrics();$("#navProcessos").textContent=m.total;$("#navEmpresa").textContent=state.companyRows.length;$("#navClientes").textContent=crmClients().length;$("#navTarefas").textContent=tasks().length;updateSyncUi();
  if(state.view==="dashboard")renderDashboard();
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
  else setView("dashboard",false);
}
async function updateSyncUi(){const count=await outboxCount(),crmCount=(await idbAll("crmOutbox").catch(()=>[])).length,online=navigator.onLine,authenticated=!!state.session;$("#modeChip").textContent=authenticated?(online?"AUTENTICADO":"SEM CONEXÃO"):"BLOQUEADO";$("#syncDot").className="dot "+(authenticated&&online?"ok":"bad");$("#syncText").textContent=(state.lastSync?"Sync "+state.lastSync:"Aguardando autenticação")+((count+crmCount)?" • "+(count+crmCount)+" pendente(s)":"")}
function kpi(label,value,sub,cls=""){return '<div class="kpi '+cls+'"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(sub||"")+'</small></div>'}
function renderDashboard(){
  const m=metrics(),classified=m.proc+m.improc,procPct=classified?Math.round(m.proc/classified*1000)/10:0,djenPct=m.total?Math.round(m.djen/m.total*1000)/10:0,djPct=m.total?Math.round(m.dj/m.total*1000)/10:0;
  const critical=tasks().slice(0,10);
  const potential=state.rows.filter(r=>commercialStatus(r).includes("POTENCIAL")).length;
  const noSell=state.rows.filter(r=>commercialStatus(r).includes("NÃO VENDER")).length;
  const clientFav=state.rows.filter(r=>String(pick(r,"_Favorecido")).toUpperCase()==="CLIENTE").length;
  const bankFav=state.rows.filter(r=>String(pick(r,"_Favorecido")).toUpperCase()==="BANCO").length;
  $("#content").innerHTML=
  '<div class="command-strip"><div><span class="eyebrow">CARTEIRA EM TEMPO REAL</span><h2>Command Center Jurídico</h2><p>Processos, prazos, rede judicial e oportunidade comercial na mesma visão.</p></div><div class="command-actions"><button class="btn" data-goto="report">Abrir report</button><button class="btn primary" data-goto="scanner">Auditar tribunal</button></div></div>'+
  '<div class="kpi-grid">'+
    kpi("Processos",m.total,m.active+" ativos")+
    kpi("Vencidos",m.venc,m.attention+" em atenção","bad")+
    kpi("Novidades",m.newer,"após último retorno",m.newer?"warn":"good")+
    kpi("Potencial comercial",potential,"triagem DataJud/DJEN",potential?"good":"")+
    kpi("Não vender",noSell,bankFav+" com banco favorecido",noSell?"bad":"")+
    kpi("Cobertura judicial",Math.round((m.dj+m.djen)/(Math.max(1,m.total*2))*100)+"%",m.dj+" DataJud • "+m.djen+" DJEN")+
  '</div>'+
  '<div class="dashboard-layout"><div class="card"><div class="card-head"><div><span class="eyebrow">PRIORIDADE</span><h3>Fila crítica</h3></div><button class="btn sm" data-goto="tarefas">Ver todas</button></div><div class="table-wrap flat"><table class="table compact"><thead><tr><th>Prioridade</th><th>Cliente</th><th>CNJ</th><th>Motivo</th><th>Comercial</th></tr></thead><tbody>'+
  critical.map(x=>'<tr><td>'+badge(priority(x.w),x.w>=1000?"bad":x.w>=850?"warn":"blue")+'</td><td><div class="cell-main">'+esc(pick(x.r,"Cliente"))+'</div><div class="cell-sub">'+esc(pick(x.r,"Assistente"))+'</div></td><td class="mono">'+esc(cnjFormatted(pick(x.r,"Protocolo")))+'</td><td>'+esc(taskLabel(x.r))+'</td><td>'+commercialHtml(x.r)+'</td></tr>').join("")+
  '</tbody></table></div></div>'+
  '<div class="stack"><div class="card"><div class="card-head"><div><span class="eyebrow">REDE JUDICIAL</span><h3>Cobertura</h3></div></div><div class="card-body metric-list">'+
    metricRow("DataJud",djPct+"%",m.dj+" processos com movimento")+
    metricRow("DJEN",djenPct+"%",m.djen+" processos com publicação")+
    metricRow("Procedência",procPct+"%",classified+" resultados classificados")+
    metricRow("Cliente favorecido",clientFav,bankFav+" banco favorecido")+
  '</div></div>'+
  '<div class="card"><div class="card-head"><div><span class="eyebrow">COMERCIAL</span><h3>Esteira de oportunidade</h3></div></div><div class="card-body metric-list">'+
    metricRow("Potencial",potential,"crédito/direito a revisar")+
    metricRow("Não vender",noSell,"resultado adverso ou fase encerrada")+
    metricRow("Revisar",state.rows.length-potential-noSell,"sem gatilho conclusivo")+
  '</div></div></div></div>';
  bindGotos();
}
function metricRow(label,value,sub){return '<div class="metric-row"><div><div class="cell-main">'+esc(label)+'</div><div class="cell-sub">'+esc(sub)+'</div></div><strong>'+esc(value)+'</strong></div>'}
function filteredRows(source=state.rows){
  const q=norm(state.query),st=state.status,qual=state.quality;
  return (source||[]).filter(r=>(!q||norm(Object.values(r).join(" ")).includes(q))&&(!st||statusRet(r)===st)&&(!qual||quality(r)===qual));
}
function processTable(rows,{company=false}={}){
  const title=company?"Processos da empresa":"Carteira atribuída";
  const subtitle=company
    ?"Todos os usuários autenticados podem consultar e editar. Editar ou atender não transfere a carteira."
    :"Processos vinculados ao seu Assistente/perfil.";
  return '<div class="record-toolbar"><div class="record-title"><span class="eyebrow">'+(company?"EMPRESA • LIST VIEW":"CARTEIRA • LIST VIEW")+'</span><strong>'+title+'</strong><span>'+rows.length+' registro(s) nesta visão</span></div><div class="toolbar"><input id="search" placeholder="Pesquisar cliente, CNJ, advogado, andamento…" value="'+esc(state.query)+'"/><select id="statusFilter"><option value="">Retorno: todos</option>'+["VENCIDO","ATENÇÃO","EM DIA","SEM DATA"].map(x=>'<option '+(state.status===x?"selected":"")+'>'+x+'</option>').join("")+'</select><select id="qualityFilter"><option value="">Qualidade: todas</option>'+["BOM","NEUTRO","RUIM"].map(x=>'<option '+(state.quality===x?"selected":"")+'>'+x+'</option>').join("")+'</select><button class="btn primary sm" data-new-record>+ Novo cadastro</button></div></div>'+
  '<div class="company-note">'+esc(subtitle)+'</div>'+
  '<div class="table-wrap crm-table"><table class="table"><thead><tr><th>Cliente / Conta</th><th>Processo</th><th>Última movimentação</th><th>Cumprimento</th><th>Favorecido</th><th>Comercial</th><th>Retorno</th><th>Assistente</th><th>Atendido por</th><th></th></tr></thead><tbody>'+
  rows.map(r=>{
    const key=keyOf(r),move=String(latestMove(r)||"Sem movimentação em cache").slice(0,180);
    const moveDate=pick(r,"DataJud • Data","Data da Movimentação","Data_Movimentacao","DJEN • Data");
    return '<tr><td><div class="cell-main">'+esc(pick(r,"Cliente"))+'</div><div class="cell-sub">'+esc(pick(r,"Escritório","Escritorio"))+'</div></td><td><div class="mono">'+esc(cnjFormatted(pick(r,"Protocolo")))+'</div><div class="cell-sub">'+esc(pick(r,"Tribunal"))+' • '+esc(pick(r,"Advogado Atual","Advogado"))+'</div></td><td><div class="cell-main clamp2">'+esc(move)+'</div><div class="cell-sub">'+esc(moveDate||"movimentação já registrada na planilha")+'</div></td><td>'+execHtml(r)+'</td><td>'+favoredHtml(r)+'</td><td>'+commercialHtml(r)+'</td><td>'+badge(statusRet(r),statusRet(r)==="VENCIDO"?"bad":statusRet(r)==="ATENÇÃO"||statusRet(r)==="É HOJE"?"warn":statusRet(r)==="EM DIA"?"good":"gray")+'<div class="cell-sub">'+esc(pick(r,"Próximo Retorno"))+'</div></td><td><div class="cell-main">'+esc(pick(r,"Assistente")||"—")+'</div></td><td><div class="cell-main">'+esc(pick(r,"AtendidoPor","Atendido por")||"—")+'</div><div class="cell-sub">'+esc(pick(r,"Último Retorno")||"")+'</div></td><td class="actions"><button class="icon-action" data-edit="'+esc(key)+'">Editar</button><button class="icon-action" data-suggest="'+esc(key)+'">Sugerir resposta</button><button class="icon-action" data-audit="'+esc(key)+'">Audit 3D</button><button class="icon-action" data-contact="'+esc(key)+'">Atendido</button></td></tr>';
  }).join("")+
  '</tbody></table></div>';
}
function bindProcessList(renderFn){
  const search=$("#search"),status=$("#statusFilter"),qual=$("#qualityFilter");
  if(search)search.oninput=e=>{state.query=e.target.value;renderFn()};
  if(status)status.onchange=e=>{state.status=e.target.value;renderFn()};
  if(qual)qual.onchange=e=>{state.quality=e.target.value;renderFn()};
  $$("[data-edit]").forEach(b=>b.onclick=()=>openProcess(b.dataset.edit));
  $$("[data-suggest]").forEach(b=>b.onclick=()=>openAudit(b.dataset.suggest,true));
  $$("[data-audit]").forEach(b=>b.onclick=()=>openAudit(b.dataset.audit,false));
  $$("[data-contact]").forEach(b=>b.onclick=()=>markContacted(b.dataset.contact));
  $$("[data-new-record]").forEach(b=>b.onclick=()=>openProcess(""));
}
function renderProcessos(){
  const rows=filteredRows(state.rows).slice(0,1200);
  $("#content").innerHTML=processTable(rows,{company:false});
  bindProcessList(renderProcessos);
}
function renderEmpresa(){
  const rows=filteredRows(state.companyRows).slice(0,1800);
  $("#content").innerHTML=processTable(rows,{company:true});
  bindProcessList(renderEmpresa);
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
  const pub=pick(r,"DJEN • Última Publicação","Resumo DJEN","DJEN_Resumo")||"Sem publicação DJEN registrada no cache.";
  const cls=x.w>=950?"critical":x.w>=800?"high":x.w>=600?"medium":"calm";
  return '<article class="task-card '+cls+'"><div class="task-card-head"><div><span class="eyebrow">FILA DE ATENDIMENTO</span></div><div class="task-card-badges">'+taskBadges(r,x.w)+'</div></div>'+
    '<div class="task-card-body"><div><h3 class="task-client">'+esc(pick(r,"Cliente")||"SEM NOME")+'</h3><div class="task-meta">'+esc(pick(r,"Advogado Atual","Advogado")||"NÃO ATRIBUÍDO")+' • '+esc(pick(r,"DataJud • Data","Data da Movimentação","Data_Movimentacao")||"sem data")+' • '+esc(String(latestMove(r)||"sem movimentação").slice(0,120))+'</div><div class="task-meta"><strong>Tratar:</strong> '+esc(taskLabel(r))+'</div></div>'+
    '<span class="cnj-chip">'+esc(cnjFormatted(pick(r,"Protocolo")))+'</span><div class="case-owner">▧ '+esc(pick(r,"Escritório","Escritorio")||"GERAL")+' · '+esc(pick(r,"Assistente")||"SEM ASSISTENTE")+(g.cases?.length>1?' · '+g.cases.length+' processos':'')+'</div>'+
    '<div class="case-box"><div class="case-box-label">Em linguagem simples</div><strong>'+esc(plainStatus(r))+'</strong><p>'+esc(String(latestMove(r)||"").slice(0,260))+'</p>'+deadline+'</div>'+
    '<div class="case-box publication-box"><div class="publication-text"><div class="case-box-label">Publicação / último dado judicial</div>'+esc(String(pub).slice(0,240))+'</div><button class="task-icon audit" data-audit="'+esc(key)+'">Audit 3D</button></div>'+
    '<div class="quick-box"><div class="case-box-label">Atendimento rápido (1 → 2 → 3)</div><p>'+esc(msg)+'</p><div class="quick-actions"><button data-copy="'+esc(key)+'">1. Copiar</button><a target="_blank" rel="noopener" href="'+esc(whatsappHref(r,msg))+'">2. WhatsApp</a><button class="contacted" data-contact="'+esc(key)+'">3. Contatado</button></div></div></div>'+
    '<div class="task-card-foot"><div class="task-icon-actions"><button class="task-icon suggest" data-suggest="'+esc(key)+'">Sugerir resposta</button><button class="task-icon audit" data-audit="'+esc(key)+'">Audit 3D</button><a class="task-icon wa" target="_blank" rel="noopener" href="'+esc(whatsappHref(r,msg))+'">WhatsApp</a><button class="task-icon" data-edit="'+esc(key)+'">Editar</button></div><button class="task-icon task-manage" data-edit="'+esc(key)+'">Gerir ›</button></div></article>';
}
function bindTaskActions(){
  $$("[data-copy]").forEach(b=>b.onclick=async()=>{
    const r=findRow(b.dataset.copy),msg=window.LexisSuggest?.quickMessage?window.LexisSuggest.quickMessage(r):"";
    try{await navigator.clipboard.writeText(msg);showBanner("Mensagem copiada.","good")}catch(_){showBanner("Não foi possível copiar automaticamente.","bad")}
  });
  $$("[data-contact]").forEach(b=>b.onclick=()=>markContacted(b.dataset.contact));
  $$("[data-suggest]").forEach(b=>b.onclick=()=>openAudit(b.dataset.suggest,true));
  $$("[data-audit]").forEach(b=>b.onclick=()=>openAudit(b.dataset.audit,false));
  $$("[data-edit]").forEach(b=>b.onclick=()=>openProcess(b.dataset.edit));
}
function renderTarefas(){
  const list=tasks().slice(0,1200);
  const critical=list.filter(x=>x.w>=950).length,high=list.filter(x=>x.w>=800&&x.w<950).length;
  $("#content").innerHTML=
    '<div class="task-header"><div><span class="eyebrow">FILA DE ATENDIMENTO</span><h2>Prioridade operacional</h2><p>Do pior caso e maior urgência até a rotina mais tranquila. Movimentações já salvas na planilha são reaproveitadas.</p></div><div class="queue-summary">'+badge(critical+" críticas","bad")+badge(high+" altas","warn")+badge(list.length+" clientes","gray")+'</div></div>'+
    '<div class="kpi-grid">'+kpi("Fila total",list.length,"clientes priorizados")+kpi("Críticas",critical,"ação imediata","bad")+kpi("Altas",high,"alta prioridade","warn")+kpi("Novidades",list.filter(x=>boolish(pick(x.r,"Nova Atualização","Novo Andamento"))).length,"já registradas na planilha")+kpi("Vencidos",list.filter(x=>statusRet(x.r)==="VENCIDO").length,"retorno vencido","bad")+kpi("Rotina",list.filter(x=>x.w<600).length,"casos mais tranquilos","good")+'</div>'+
    '<div class="task-grid">'+list.map(taskCardHtml).join("")+'</div>';
  bindTaskActions();
}

function clientProcesses(c){
  const id=String(c?.ClienteId||"");
  const byId=state.companyRows.filter(r=>String(pick(r,"ClienteId")||"")===id);
  if(byId.length)return byId;
  const name=norm(c?.Nome||c?.Cliente||"");
  return state.companyRows.filter(r=>norm(pick(r,"Cliente"))===name);
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
  const rows=clients.filter(c=>!q||norm([c.Nome,c.Telefone_Principal,c.Responsavel,...(c.protocolos||[])].join(" ")).includes(q)).slice(0,3000);
  $("#content").innerHTML=
    '<div class="record-toolbar"><div class="record-title"><span class="eyebrow">CRM • GOOGLE SHEETS</span><strong>Clientes</strong><span>'+rows.length+' de '+clients.length+' cliente(s)</span></div><div class="toolbar"><input id="clientSearch" placeholder="Pesquisar cliente, telefone ou CNJ…" value="'+esc(state.query)+'"/><span class="badge '+(state.crmBridgeReady?'b-good':'b-warn')+'">'+(state.crmBridgeReady?'CRM sincronizado':'CRM derivado de Processos')+'</span></div></div>'+
    '<div class="table-wrap crm-table"><table class="table"><thead><tr><th>Cliente</th><th>Contato</th><th>Processos</th><th>Assistente</th><th>Último retorno</th><th>Próximo retorno</th><th>Pipeline</th><th></th></tr></thead><tbody>'+
    rows.map(c=>{
      const procs=clientProcesses(c),pipe=clientPipeline(c)[0]||{};
      return '<tr><td><div class="cell-main">'+esc(c.Nome||"SEM NOME")+'</div><div class="cell-sub mono">'+esc(c.ClienteId||"")+'</div></td><td><div class="cell-main">'+esc(c.Telefone_Principal||"—")+'</div><div class="cell-sub">'+esc(c.Email||"")+'</div></td><td>'+badge(procs.length,"blue")+'</td><td>'+esc(c.Responsavel||"—")+'</td><td>'+esc(c.ultimoRetorno||"—")+'</td><td>'+esc(c.proximoRetorno||"—")+'</td><td>'+badge(pipe.Etapa||"Triagem",pipe.Etapa==="Perdido"?"bad":pipe.Etapa==="Oportunidade"?"good":"gray")+'</td><td><button class="icon-action" data-client-open="'+esc(c.ClienteId)+'">Abrir 360°</button></td></tr>';
    }).join("")+'</tbody></table></div>';
  $("#clientSearch").oninput=e=>{state.query=e.target.value;renderClientes()};
  $("[data-client-open]").forEach(b=>b.onclick=()=>{state.clientId=b.dataset.clientOpen;state.query="";renderClientes()});
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
  $("[data-edit]").forEach(b=>b.onclick=()=>openProcess(b.dataset.edit));
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
  $("[data-client-open]").forEach(b=>b.onclick=()=>{state.clientId=b.dataset.clientOpen;setView("clientes")});
}
function renderAgenda(){
  const explicit=[...(state.crm.AgendaCRM||[])].map(x=>({...x,_source:"CRM"}));
  const derived=state.companyRows.filter(r=>pick(r,"Próximo Retorno")).map(r=>({
    EventoId:"ret:"+keyOf(r),ClienteId:pick(r,"ClienteId"),Protocolo:pick(r,"Protocolo"),Tipo:"Retorno",Titulo:"Retorno • "+(pick(r,"Cliente")||"Cliente"),Inicio:pick(r,"Próximo Retorno"),Responsavel:pick(r,"Assistente"),Status:statusRet(r),_source:"Processos"
  }));
  const rows=[...explicit,...derived].sort((a,b)=>(parseDate(a.Inicio)?.getTime()||9e15)-(parseDate(b.Inicio)?.getTime()||9e15)).slice(0,1200);
  $("#content").innerHTML='<div class="command-strip"><div><span class="eyebrow">CRM • AGENDA</span><h2>Agenda operacional</h2><p>Retornos processuais + compromissos gravados em AgendaCRM.</p></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Quando</th><th>Tipo</th><th>Cliente / título</th><th>CNJ</th><th>Responsável</th><th>Status</th><th>Fonte</th></tr></thead><tbody>'+rows.map(x=>{const cl=clientById(x.ClienteId);return '<tr><td>'+esc(x.Inicio||"—")+'</td><td>'+esc(x.Tipo||"Evento")+'</td><td><div class="cell-main">'+esc(cl?.Nome||x.Titulo||"—")+'</div><div class="cell-sub">'+esc(x.Titulo||"")+'</div></td><td class="mono">'+esc(cnjFormatted(x.Protocolo||""))+'</td><td>'+esc(x.Responsavel||"—")+'</td><td>'+badge(x.Status||"PENDENTE",/venc/i.test(x.Status||"")?"bad":/aten|hoje/i.test(x.Status||"")?"warn":"gray")+'</td><td>'+esc(x._source)+'</td></tr>'}).join("")+'</tbody></table></div>';
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
  $("#content").innerHTML=
    '<div class="report-head"><div><span class="eyebrow">DOSSIÊ OPERACIONAL</span><h2>Relatório executivo da carteira</h2><p>Resumo consolidado do app, planilha, DataJud e DJEN.</p></div><button class="btn primary" id="printReport">Imprimir / PDF</button></div>'+
    '<div class="kpi-grid">'+kpi("Carteira",m.total,m.active+" ativos")+kpi("Vencidos",m.venc,"retornos","bad")+kpi("Potencial",potential.length,"triagem comercial","good")+kpi("Não vender",blocked.length,"bloqueios","bad")+kpi("DataJud",m.dj,"processos auditados")+kpi("DJEN",m.djen,"processos com publicação")+'</div>'+
    '<div class="analysis-grid report-grid"><div class="analysis-tile"><h4>Por assistente</h4>'+bars(topA,m.total)+'</div><div class="analysis-tile"><h4>Por tribunal</h4>'+bars(topT,m.total)+'</div><div class="analysis-tile"><h4>Execução / cumprimento</h4>'+bars(Object.entries(execs).sort((a,b)=>b[1]-a[1]),m.total)+'</div></div>'+
    '<div class="grid-2 report-sections"><div class="card"><div class="card-head"><h3>Oportunidades</h3></div><div class="table-wrap flat"><table class="table compact"><thead><tr><th>Cliente</th><th>CNJ</th><th>Produto</th></tr></thead><tbody>'+potential.slice(0,30).map(r=>'<tr><td>'+esc(pick(r,"Cliente"))+'</td><td class="mono">'+esc(cnjFormatted(pick(r,"Protocolo")))+'</td><td>'+esc(pick(r,"Produto / Oportunidade"))+'</td></tr>').join("")+'</tbody></table></div></div>'+
    '<div class="card"><div class="card-head"><h3>Bloqueios comerciais</h3></div><div class="table-wrap flat"><table class="table compact"><thead><tr><th>Cliente</th><th>CNJ</th><th>Motivo</th></tr></thead><tbody>'+blocked.slice(0,30).map(r=>'<tr><td>'+esc(pick(r,"Cliente"))+'</td><td class="mono">'+esc(cnjFormatted(pick(r,"Protocolo")))+'</td><td>'+esc(pick(r,"Produto / Oportunidade","_CommercialReason"))+'</td></tr>').join("")+'</tbody></table></div></div></div>';
  $("#printReport").onclick=()=>window.print();
}
function renderScanner(){
  const valid=state.rows.filter(r=>digits(pick(r,"Protocolo")).length===20);
  const withDjen=state.rows.filter(r=>pick(r,"DJEN • Última Publicação")).length;
  const withDataJud=state.rows.filter(r=>pick(r,"DataJud • Último Movimento")).length;
  const activeExec=state.rows.filter(r=>String(pick(r,"_ExecStatus")).toUpperCase()==="ATIVO").length;
  $("#content").innerHTML=
  '<div class="scanner-hero"><div><span class="eyebrow">SCANNER OMNICANAL</span><h2>DataJud + DJEN</h2><p>Valida fase processual, cumprimento real, lado favorecido e oportunidade comercial.</p></div><div class="scanner-health"><span>'+valid.length+' CNJs</span><span>'+withDataJud+' DataJud</span><span>'+withDjen+' DJEN</span><span>'+activeExec+' cumprimento ativo</span></div></div>'+
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
  if(state.djenBlockedUntil>Date.now()){
    const wait=Math.max(1,Math.ceil((state.djenBlockedUntil-Date.now())/1000));
    const j={ok:false,error:"DJEN em pausa por limite oficial. Tente novamente em "+wait+"s.",retry:true,retryAfterMs:wait*1000};
    state.lastScan=j;if(!quiet&&state.view==="scanner")$("#scanResult").innerHTML=renderScanResult(j);return j;
  }
  const row=state.companyRows.find(x=>digits(pick(x,"Protocolo"))===d)||null;
  try{
    const r=await fetch("/api/judicial-scan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cnj:cnjFormatted(d),tribunal:row?pick(row,"Tribunal"):"",cliente:row?pick(row,"Cliente"):"",ultimoRetorno:row?pick(row,"Último Retorno"):"",lastDjenId:row?pick(row,"_DJENId"):"",lastDjenDate:row?pick(row,"_DJENDate","DJEN • Data"):"",mode:"both"}),cache:"no-store"});
    const j=await r.json();state.lastScan=j;
    if(j.patch&&row){
      Object.assign(row,j.patch);
      refreshScopes();
      await saveRows(state.companyRows);
      const writePatch={"Protocolo":pick(row,"Protocolo"),...j.patch};
      try{
        const wr=await apiSheets({action:"write",rows:[writePatch]});
        if(Number(wr.rejected_count||0)>0)throw new Error((wr.rejected||[]).map(x=>x.motivo).filter(Boolean).join("; ")||"Alteração recusada");
      }catch(e){j.sheetError=e.message||String(e)}
    }
    if(r.status===429||j?.djen?.isRateLimited){
      const ms=Math.max(60000,Number(j?.djen?.retryAfterMs||j.retryAfterMs)||60000);
      state.djenBlockedUntil=Date.now()+ms;j.retry=true;j.retryAfterMs=ms;
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
    if(j?.retry){const ms=Math.max(60000,Number(j.retryAfterMs)||60000);logQueue("DJEN 429 • pausa de "+Math.ceil(ms/1000)+"s");await sleep(ms)}
    else await sleep(6000);
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
  refreshScopes();
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
  if(clientId){
    const interaction={InteracaoId:window.LexisCRM?.stableId("int",clientId,nowIso,actor)||("int_"+Date.now()),ClienteId:clientId,Protocolo:pick(row,"Protocolo"),Canal:"Atendimento",Tipo:"Retorno",Assunto:"Atendimento registrado",Conteudo:"Cliente marcado como contatado no SheetsPredict.",Usuario:actor,DataHora:nowIso,Resultado:"Contatado",ProximoPasso:"",DataProximoPasso:"",OptOut:""};
    await crmWrite("Interacoes",interaction,{quiet:true});
  }
  render();
  if(!navigator.onLine){showBanner("Atendimento e histórico CRM salvos no cache. Serão enviados quando a conexão voltar.","good");return}
  try{await flushOutbox();await flushCrmOutbox().catch(()=>{});showBanner("Atendimento registrado por "+actor+" sem alterar o Assistente da carteira.","good")}
  catch(e){showBanner("Atendimento ficou pendente para a planilha: "+(e.message||String(e)),"bad")}
}
function auditCached(row){
  return {
    move:latestMove(row)||"Sem movimentação registrada no cache.",
    moveDate:pick(row,"DataJud • Data","Data da Movimentação","Data_Movimentacao")||"",
    djen:pick(row,"DJEN • Última Publicação","Resumo DJEN","DJEN_Resumo")||"",
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
    '<section class="audit-panel"><h4>Publicação DJEN</h4><div class="audit-kv"><span>Data</span><strong>'+esc(cached.djenDate||"—")+'</strong></div><div class="audit-kv"><span>Fonte</span><strong>'+(networkDjen?"DJEN atualizado agora":"Planilha / cache local")+'</strong></div><div class="audit-source">'+esc(djen||"Nenhuma publicação DJEN registrada.")+'</div></section></div>'+
    '<div class="audit-grid"><section class="audit-panel"><h4>Operação</h4><div class="audit-kv"><span>Assistente</span><strong>'+esc(cached.owner)+'</strong></div><div class="audit-kv"><span>Atendido por</span><strong>'+esc(cached.attended)+'</strong></div><div class="audit-kv"><span>Último retorno</span><strong>'+esc(cached.lastReturn)+'</strong></div><div class="audit-kv"><span>Próximo retorno</span><strong>'+esc(cached.nextReturn)+'</strong></div></section>'+
    '<section class="audit-panel"><h4>Leitura simples</h4><div class="audit-source"><strong>'+esc(plainStatus(row))+'</strong><br><br>'+esc(String(move).slice(0,900))+'</div></section></div>'+
    (state.auditSuggest?'<section class="audit-panel"><h4>Sugestões de resposta</h4><div class="suggestions">'+suggestions.map((s,i)=>'<div class="suggestion"><h5>'+esc(s.titulo)+'</h5><p>'+esc(s.texto)+'</p><div class="audit-actions"><button class="btn sm" data-copy-suggestion="'+i+'">Copiar resposta</button></div></div>').join("")+'</div></section>':'')+
    (scan?.error?'<div class="banner bad">'+esc(scan.error)+'</div>':'')+
    '<div class="audit-actions"><button class="btn" id="auditEditBtn">Editar cadastro</button><button class="btn" id="auditContactBtn">Registrar atendimento</button><button class="btn" id="auditSuggestBtn">Sugerir resposta</button><button class="btn primary" id="auditRefreshBtn">Atualizar DataJud + DJEN</button></div>';
  $("#auditEditBtn").onclick=()=>{ $("#auditDialog").close();openProcess(state.auditKey) };
  $("#auditContactBtn").onclick=()=>markContacted(state.auditKey);
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
  const hasCache=!!latestMove(row)||!!pick(row,"DJEN • Última Publicação","Resumo DJEN","DJEN_Resumo");
  if(!hasCache&&navigator.onLine)void refreshAudit(suggest);
}
async function refreshAudit(keepSuggest=false){
  const row=findRow(state.auditKey);if(!row)return;
  const cnj=digits(pick(row,"Protocolo"));
  if(cnj.length!==20){showBanner("CNJ inválido para atualização oficial.","bad");return}
  const btn=$("#auditRefreshBtn");if(btn){btn.disabled=true;btn.textContent="Atualizando…"}
  try{
    const r=await fetch("/api/judicial-scan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cnj:cnjFormatted(cnj),tribunal:pick(row,"Tribunal"),cliente:pick(row,"Cliente"),ultimoRetorno:pick(row,"Último Retorno"),lastDjenId:pick(row,"_DJENId"),lastDjenDate:pick(row,"_DJENDate","DJEN • Data"),mode:"both"}),cache:"no-store"});
    const j=await r.json();state.auditScan=j;state.auditSuggest=!!keepSuggest;
    if(j.patch){
      Object.assign(row,j.patch);updateLocalRow(row);await saveRows(state.companyRows);
      await queueWrite({"Protocolo":pick(row,"Protocolo"),...j.patch});
      if(navigator.onLine)await flushOutbox();
    }
    if(r.status===429||j?.djen?.isRateLimited){
      const ms=Math.max(60000,Number(j?.djen?.retryAfterMs||j.retryAfterMs)||60000);state.djenBlockedUntil=Date.now()+ms;
    }
  }catch(e){state.auditScan={ok:false,error:e.message||String(e)}}
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

function exportJson(){const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),rows:state.companyRows},null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="lexispredict-offline-"+new Date().toISOString().slice(0,10)+".json";a.click();URL.revokeObjectURL(a.href)}
function csvSplit(line,sep){const out=[];let cur="",q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==="\""){if(q&&line[i+1]==="\""){cur+="\"";i++}else q=!q}else if(c===sep&&!q){out.push(cur);cur=""}else cur+=c}out.push(cur);return out}
async function importCsv(ev){const f=ev.target.files?.[0];if(!f)return;const text=await f.text(),lines=text.replace(/^\uFEFF/,"").split(/\r?\n/).filter(Boolean);if(lines.length<2)return;const sep=(lines[0].match(/;/g)||[]).length>(lines[0].match(/,/g)||[]).length?";":",";const headers=csvSplit(lines[0],sep).map(x=>x.trim());const rows=lines.slice(1).map(l=>{const a=csvSplit(l,sep),r={};headers.forEach((h,i)=>r[h]=a[i]??"");return r});state.companyRows=rows;refreshScopes();await saveRows(rows);showBanner(rows.length+" processos importados para o cache local.","good");render()}
function setupEvents(){
  $$("#nav .nav-item").forEach(b=>b.onclick=()=>setView(b.dataset.view));
  $("#syncBtn").onclick=async()=>{try{await syncFromCloud()}catch(e){showBanner(e.message,"bad")}};
  $("#newProcessBtn").onclick=()=>openProcess("");
  $("#closeAuditBtn").onclick=()=>$("#auditDialog").close();
  $("#logoutBtn").onclick=async()=>{
    stopAutoSync();try{await apiSheets({action:"logout"})}catch(_){}
    saveSession(null);state.rows=[];state.companyRows=[];state.crm={Clientes:[],Interacoes:[],PipelineCRM:[],AgendaCRM:[],Honorarios:[]};state.lastSync=null;state.lastSyncAt=0;state.clientId=null;
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
  setupEvents();
  state.view=pathView();
  const cachedSession=restoreSession();
  if("serviceWorker"in navigator)navigator.serviceWorker.register("/sw.js").catch(()=>{});
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