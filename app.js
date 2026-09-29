(() => {
"use strict";

const SHEET_DEFAULT="https://docs.google.com/spreadsheets/d/1qbuJee6DCv0bh9XGvnBDPltc0Ziphdn2yx11QKOnchc/edit";
const DB_NAME="lexispredict-secure-cache-v2";
const state={rows:[],view:"dashboard",query:"",status:"",quality:"",session:null,scanning:false,scanStop:false,lastScan:null,serverCfg:{},djenBlockedUntil:0,syncing:false,autoSyncTimer:null};

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
function latestMove(r){return pick(r,"Diagnóstico Processual","DataJud • Último Movimento","Último Andamento","Andamento")}
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

function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains("rows"))db.createObjectStore("rows",{keyPath:"_key"});if(!db.objectStoreNames.contains("meta"))db.createObjectStore("meta",{keyPath:"key"});if(!db.objectStoreNames.contains("outbox"))db.createObjectStore("outbox",{keyPath:"id",autoIncrement:true})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function idbAll(store){const db=await openDb();return new Promise((res,rej)=>{const tx=db.transaction(store,"readonly"),rq=tx.objectStore(store).getAll();rq.onsuccess=()=>res(rq.result);rq.onerror=()=>rej(rq.error)})}
async function idbPut(store,value){const db=await openDb();return new Promise((res,rej)=>{const tx=db.transaction(store,"readwrite");tx.objectStore(store).put(value);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
async function idbClear(store){const db=await openDb();return new Promise((res,rej)=>{const tx=db.transaction(store,"readwrite");tx.objectStore(store).clear();tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
async function saveRows(rows){await idbClear("rows");const db=await openDb();return new Promise((res,rej)=>{const tx=db.transaction("rows","readwrite"),st=tx.objectStore("rows");rows.forEach(r=>st.put({...r,_key:keyOf(r)}));tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
async function loadLocal(){state.rows=(await idbAll("rows")).map(({_key,...r})=>r);const meta=(await idbAll("meta")).find(x=>x.key==="lastSync");if(meta)state.lastSync=meta.value;return state.rows}
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
    const payload={action:"list",limit:8000};
    const j=await apiSheets(payload);
    let rows=j.rows||j.data||j.todas||[];if(!Array.isArray(rows))throw new Error("Bridge não retornou uma lista de processos.");
    const pending=await idbAll("outbox");
    rows=mergePending(rows,pending);
    state.rows=rows;await saveRows(rows);state.lastSync=now();await idbPut("meta",{key:"lastSync",value:state.lastSync});
    if(!opts.quiet){
      const scope=j.scope?.field==="Assistente"?" • carteira de "+(j.scope.value||"assistente"):"";
      showBanner("Sincronização concluída: "+rows.length+" processos carregados"+scope+(pending.length?" • "+pending.length+" edição(ões) pendente(s)":"")+".","good");
    }
    render();
  } finally { state.syncing=false; }
}
function startAutoSync(){
  if(state.autoSyncTimer)clearInterval(state.autoSyncTimer);
  state.autoSyncTimer=setInterval(async()=>{
    if(!state.session||!navigator.onLine||document.hidden||state.syncing)return;
    try{await syncFromCloud({quiet:true})}catch(_){}
  },60000);
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
function saveSession(s){state.session=s||null}
function restoreSession(){state.session=null}

function metrics(rows=state.rows){
  const m={total:rows.length,active:0,closed:0,venc:0,attention:0,good:0,neutral:0,bad:0,newer:0,djen:0,dj:0,scoreSum:0,scoreN:0,proc:0,improc:0};
  rows.forEach(r=>{if(isClosed(r))m.closed++;else m.active++;const sr=statusRet(r);if(sr==="VENCIDO")m.venc++;if(sr==="ATENÇÃO")m.attention++;
    const q=quality(r);if(q==="BOM")m.good++;else if(q==="RUIM")m.bad++;else m.neutral++;
    if(boolish(pick(r,"Nova Atualização")))m.newer++;if(pick(r,"DJEN • Última Publicação"))m.djen++;if(pick(r,"DataJud • Último Movimento"))m.dj++;
    const sc=score(r);m.scoreSum+=sc;m.scoreN++;if(boolish(pick(r,"Procedente")))m.proc++;if(boolish(pick(r,"Improcedente")))m.improc++;
  });m.avg=m.scoreN?Math.round(m.scoreSum/m.scoreN):0;return m;
}
function taskWeight(r){
  if(isClosed(r))return 0;let w=0;const sr=statusRet(r),q=quality(r),move=latestMove(r).toLowerCase();
  if(sr==="VENCIDO")w+=1000+Math.min(300,Math.abs(daysTo(pick(r,"Próximo Retorno"))||0));else if(sr==="ATENÇÃO")w+=950;
  if(/audienc/.test(move))w+=880;if(/cumprimento|execu/.test(move))w+=850;if(/decurso|transito/.test(move))w+=830;
  if(boolish(pick(r,"Nova Atualização")))w+=780;if(q==="RUIM")w+=180;if(/erro|parcial/i.test(pick(r,"Automação","Status Sync")))w+=120;return w;
}
function tasks(){return state.rows.map(r=>({r,w:taskWeight(r)})).filter(x=>x.w>0).sort((a,b)=>b.w-a.w)}
function priority(w){return w>=1000?"CRÍTICA":w>=850?"ALTA":w>=650?"MÉDIA":"NORMAL"}
function taskLabel(r){
  const sr=statusRet(r),move=latestMove(r).toLowerCase();if(sr==="VENCIDO")return"Retorno vencido";if(sr==="ATENÇÃO")return"Retorno hoje";
  if(/transito/.test(move))return"Revisar trânsito em julgado";if(/decurso/.test(move))return"Revisar decurso de prazo";if(/audienc/.test(move))return"Audiência";
  if(/cumprimento|execu/.test(move))return"Cumprimento / execução";if(boolish(pick(r,"Nova Atualização")))return"Nova atualização";if(quality(r)==="RUIM")return"Qualidade processual ruim";return"Revisão operacional";
}

function titleFor(v){return {
  dashboard:["COMMAND CENTER","Dashboard"],
  processos:["CARTEIRA","Processos"],
  tarefas:["OPERAÇÃO","Tarefas"],
  analise:["INTELIGÊNCIA","Análise"],
  report:["EXECUTIVO","Report"],
  scanner:["REDE JUDICIAL","DataJud + DJEN"]
}[v]||["LEXISPREDICT","Dashboard"]}
const viewPaths={dashboard:"/",processos:"/processos",tarefas:"/tarefas",analise:"/analise",report:"/report",scanner:"/scanner"};
function pathView(){const p=location.pathname.replace(/\/+$/,"")||"/";return Object.entries(viewPaths).find(([,x])=>x===p)?.[0]||"dashboard"}
function setView(v,push=true){
  state.view=v;
  $$(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===v));
  const [e,t]=titleFor(v);$("#viewEyebrow").textContent=e;$("#viewTitle").textContent=t;
  if(push&&viewPaths[v]&&location.pathname!==viewPaths[v])history.pushState({view:v},"",viewPaths[v]);
  render();
}
function render(){
  const m=metrics();$("#navProcessos").textContent=m.total;$("#navTarefas").textContent=tasks().length;updateSyncUi();
  if(state.view==="dashboard")renderDashboard();
  else if(state.view==="processos")renderProcessos();
  else if(state.view==="tarefas")renderTarefas();
  else if(state.view==="analise")renderAnalise();
  else if(state.view==="report")renderReport();
  else if(state.view==="scanner")renderScanner();
  else setView("dashboard",false);
}
async function updateSyncUi(){const count=await outboxCount(),online=navigator.onLine,authenticated=!!state.session;$("#modeChip").textContent=authenticated?(online?"AUTENTICADO":"SEM CONEXÃO"):"BLOQUEADO";$("#syncDot").className="dot "+(authenticated&&online?"ok":"bad");$("#syncText").textContent=(state.lastSync?"Sync "+state.lastSync:"Aguardando autenticação")+(count?" • "+count+" pendente(s)":"")}
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
function filteredRows(){
  const q=norm(state.query),st=state.status,qual=state.quality;
  return state.rows.filter(r=>(!q||norm(Object.values(r).join(" ")).includes(q))&&(!st||statusRet(r)===st)&&(!qual||quality(r)===qual));
}
function renderProcessos(){
  const rows=filteredRows().slice(0,700);
  $("#content").innerHTML=
  '<div class="record-toolbar"><div class="record-title"><span class="eyebrow">LIST VIEW</span><strong>Carteira principal</strong><span>'+rows.length+' de '+state.rows.length+'</span></div><div class="toolbar"><input id="search" placeholder="Pesquisar cliente, CNJ, advogado, andamento…" value="'+esc(state.query)+'"/><select id="statusFilter"><option value="">Retorno: todos</option>'+["VENCIDO","ATENÇÃO","EM DIA","SEM DATA"].map(x=>'<option '+(state.status===x?"selected":"")+'>'+x+'</option>').join("")+'</select><select id="qualityFilter"><option value="">Qualidade: todas</option>'+["BOM","NEUTRO","RUIM"].map(x=>'<option '+(state.quality===x?"selected":"")+'>'+x+'</option>').join("")+'</select></div></div>'+
  '<div class="table-wrap crm-table"><table class="table"><thead><tr><th>Cliente / Conta</th><th>Processo</th><th>Fase</th><th>Cumprimento</th><th>Favorecido</th><th>Comercial</th><th>Produto</th><th>Retorno</th><th>Responsável</th><th></th></tr></thead><tbody>'+
  rows.map(r=>'<tr><td><div class="cell-main">'+esc(pick(r,"Cliente"))+'</div><div class="cell-sub">'+esc(pick(r,"Escritório"))+'</div></td><td><div class="mono">'+esc(cnjFormatted(pick(r,"Protocolo")))+'</div><div class="cell-sub">'+esc(pick(r,"Tribunal"))+' • '+esc(pick(r,"Advogado Atual","Advogado"))+'</div></td><td><div class="cell-main clamp2">'+esc(String(latestMove(r)).slice(0,150))+'</div><div class="cell-sub">'+esc(pick(r,"DataJud • Data","DJEN • Data"))+'</div></td><td>'+execHtml(r)+'</td><td>'+favoredHtml(r)+'</td><td>'+commercialHtml(r)+'</td><td><div class="cell-main clamp2">'+esc(pick(r,"Produto / Oportunidade")||"—")+'</div></td><td>'+badge(statusRet(r),statusRet(r)==="VENCIDO"?"bad":statusRet(r)==="ATENÇÃO"?"warn":statusRet(r)==="EM DIA"?"good":"gray")+'<div class="cell-sub">'+esc(pick(r,"Próximo Retorno"))+'</div></td><td>'+esc(pick(r,"Assistente","Responsável"))+'</td><td class="actions"><button class="icon-action" data-edit="'+esc(keyOf(r))+'">Editar</button><button class="icon-action" data-scan="'+esc(digits(pick(r,"Protocolo")))+'">Auditar</button></td></tr>').join("")+
  '</tbody></table></div>';
  $("#search").oninput=e=>{state.query=e.target.value;renderProcessos()};
  $("#statusFilter").onchange=e=>{state.status=e.target.value;renderProcessos()};
  $("#qualityFilter").onchange=e=>{state.quality=e.target.value;renderProcessos()};
  $$("[data-edit]").forEach(b=>b.onclick=()=>openProcess(b.dataset.edit));
  $$("[data-scan]").forEach(b=>b.onclick=()=>{setView("scanner");setTimeout(()=>{$("#scanCnj").value=b.dataset.scan;scanOne(b.dataset.scan)},0)});
}
function renderTarefas(){
  const list=tasks().slice(0,900);
  const high=list.filter(x=>priority(x.w)==="CRÍTICA"||priority(x.w)==="ALTA").length;
  $("#content").innerHTML=
  '<div class="command-strip slim"><div><span class="eyebrow">WORK QUEUE</span><h2>Fila operacional</h2><p>Ordenada por prazo, evento judicial, novidade e qualidade.</p></div><div class="queue-summary">'+badge(high+" altas","warn")+badge(list.filter(x=>statusRet(x.r)==="VENCIDO").length+" vencidas","bad")+'</div></div>'+
  '<div class="kpi-grid">'+kpi("Fila total",list.length,"ações priorizadas")+kpi("Críticas",list.filter(x=>priority(x.w)==="CRÍTICA").length,"ação imediata","bad")+kpi("Altas",list.filter(x=>priority(x.w)==="ALTA").length,"prioridade alta","warn")+kpi("Novidades",list.filter(x=>boolish(pick(x.r,"Nova Atualização"))).length,"andamentos novos")+kpi("Potencial",list.filter(x=>commercialStatus(x.r).includes("POTENCIAL")).length,"oportunidade comercial","good")+kpi("Não vender",list.filter(x=>commercialStatus(x.r).includes("NÃO VENDER")).length,"bloqueio comercial","bad")+'</div>'+
  '<div class="table-wrap crm-table"><table class="table"><thead><tr><th>Prioridade</th><th>Tarefa</th><th>Cliente</th><th>CNJ</th><th>Fase judicial</th><th>Cumprimento</th><th>Comercial</th><th>Responsável</th><th></th></tr></thead><tbody>'+
  list.map(x=>'<tr><td>'+badge(priority(x.w),x.w>=1000?"bad":x.w>=850?"warn":"blue")+'</td><td><div class="cell-main">'+esc(taskLabel(x.r))+'</div><div class="cell-sub">'+esc(statusRet(x.r))+'</div></td><td>'+esc(pick(x.r,"Cliente"))+'</td><td class="mono">'+esc(cnjFormatted(pick(x.r,"Protocolo")))+'</td><td class="clamp2">'+esc(String(latestMove(x.r)).slice(0,120))+'</td><td>'+execHtml(x.r)+'</td><td>'+commercialHtml(x.r)+'</td><td>'+esc(pick(x.r,"Assistente"))+'</td><td><button class="icon-action" data-edit="'+esc(keyOf(x.r))+'">Abrir</button></td></tr>').join("")+
  '</tbody></table></div>';
  $$("[data-edit]").forEach(b=>b.onclick=()=>openProcess(b.dataset.edit));
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
  const row=state.rows.find(x=>digits(pick(x,"Protocolo"))===d)||null;
  try{
    const r=await fetch("/api/judicial-scan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cnj:cnjFormatted(d),tribunal:row?pick(row,"Tribunal"):"",cliente:row?pick(row,"Cliente"):"",ultimoRetorno:row?pick(row,"Último Retorno"):"",lastDjenId:row?pick(row,"_DJENId"):"",lastDjenDate:row?pick(row,"_DJENDate","DJEN • Data"):"",mode:"both"}),cache:"no-store"});
    const j=await r.json();state.lastScan=j;
    if(j.patch&&row){
      Object.assign(row,j.patch);
      await saveRows(state.rows);
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
function openProcess(key){
  const r=state.rows.find(x=>keyOf(x)===key)||{};$("#editKey").value=key||"";$("#processDialogTitle").textContent=key?"Editar processo":"Novo processo";
  $("#fCliente").value=pick(r,"Cliente");$("#fProtocolo").value=pick(r,"Protocolo");$("#fAssistente").value=pick(r,"Assistente");$("#fAdvogado").value=pick(r,"Advogado");$("#fEscritorio").value=pick(r,"Escritório");$("#fTribunal").value=pick(r,"Tribunal");$("#fStatus").value=pick(r,"Status");$("#fTelefone").value=pick(r,"Telefone");$("#fRetorno").value=pick(r,"Último Retorno");$("#fProximo").value=pick(r,"Próximo Retorno");$("#fObs").value=pick(r,"Observações");$("#processStatus").textContent="";$("#processDialog").showModal()
}
async function saveProcess(){
  const key=$("#editKey").value;
  const current=state.rows.find(x=>keyOf(x)===key)||{};
  const next={...current,
    "Cliente":$("#fCliente").value.trim(),
    "Protocolo":$("#fProtocolo").value.trim(),
    "Assistente":$("#fAssistente").value.trim(),
    "Advogado":$("#fAdvogado").value.trim(),
    "Escritório":$("#fEscritorio").value.trim(),
    "Tribunal":$("#fTribunal").value.trim(),
    "Status":$("#fStatus").value.trim(),
    "Telefone":$("#fTelefone").value.trim(),
    "Último Retorno":$("#fRetorno").value.trim(),
    "Próximo Retorno":$("#fProximo").value.trim(),
    "Observações":$("#fObs").value.trim()
  };
  if(digits(next["Protocolo"]).length===20){next["Automação"]="PENDENTE";next["Próxima Sincronização"]=""}
  const idx=state.rows.findIndex(x=>keyOf(x)===key);
  if(idx>=0)state.rows[idx]=next;else state.rows.unshift(next);
  await saveRows(state.rows);
  const writePayload={
    "Protocolo":next["Protocolo"],
    "Cliente":next["Cliente"],
    "Assistente":next["Assistente"],
    "Advogado":next["Advogado"],
    "Escritório":next["Escritório"],
    "Tribunal":next["Tribunal"],
    "Status":next["Status"],
    "Telefone":next["Telefone"],
    "Último Retorno":next["Último Retorno"],
    "Próximo Retorno":next["Próximo Retorno"],
    "Observações":next["Observações"],
    "Automação":next["Automação"]||"",
    "Próxima Sincronização":next["Próxima Sincronização"]||""
  };
  await queueWrite(writePayload);
  render();
  $("#processStatus").textContent="Salvo neste dispositivo. Enviando para a planilha…";
  try{
    const j=await flushOutbox();
    if(Number(j.rejected_count||0)>0)throw new Error("A planilha recusou a alteração.");
    $("#processDialog").close();
    showBanner("Alteração salva no app e confirmada na planilha.","good");
    await syncFromCloud({quiet:true});
  }catch(e){
    $("#processDialog").close();
    showBanner("Alteração preservada no app e ficou pendente para a planilha: "+(e.message||String(e)),"bad");
  }
}
function exportJson(){const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),rows:state.rows},null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="lexispredict-offline-"+new Date().toISOString().slice(0,10)+".json";a.click();URL.revokeObjectURL(a.href)}
function csvSplit(line,sep){const out=[];let cur="",q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==="\""){if(q&&line[i+1]==="\""){cur+="\"";i++}else q=!q}else if(c===sep&&!q){out.push(cur);cur=""}else cur+=c}out.push(cur);return out}
async function importCsv(ev){const f=ev.target.files?.[0];if(!f)return;const text=await f.text(),lines=text.replace(/^\uFEFF/,"").split(/\r?\n/).filter(Boolean);if(lines.length<2)return;const sep=(lines[0].match(/;/g)||[]).length>(lines[0].match(/,/g)||[]).length?";":",";const headers=csvSplit(lines[0],sep).map(x=>x.trim());const rows=lines.slice(1).map(l=>{const a=csvSplit(l,sep),r={};headers.forEach((h,i)=>r[h]=a[i]??"");return r});state.rows=rows;await saveRows(rows);showBanner(rows.length+" processos importados para o cache local.","good");render()}
function setupEvents(){
  $$("#nav .nav-item").forEach(b=>b.onclick=()=>setView(b.dataset.view));
  $("#syncBtn").onclick=async()=>{try{await syncFromCloud()}catch(e){showBanner(e.message,"bad")}};
  $("#newProcessBtn").onclick=()=>openProcess("");
  $("#logoutBtn").onclick=async()=>{stopAutoSync();try{await apiSheets({action:"logout"})}catch(_){}saveSession(null);state.rows=[];setLogged(false);updateSyncUi()};
  $("#saveProcessBtn").onclick=saveProcess;
  $("#loginBtn").onclick=async()=>{
    const u=$("#loginUser").value.trim(),p=$("#loginPass").value;
    $("#loginStatus").textContent="Autenticando…";
    if(!u||!p){$("#loginStatus").textContent="Informe usuário e senha.";return}
    try{
      const j=await loginCloud(u,p);
      const next={user:j.user||j.usuario||{usuario:u}};
      saveSession(next);
      state.rows=[];
      await syncFromCloud();
      setLogged(true);
      applyUser();
      render();
      startAutoSync();
      $("#loginStatus").textContent="";
    }catch(e){
      saveSession(null);
      state.rows=[];
      setLogged(false);
      $("#loginStatus").textContent=e.message||String(e);
    }
  };
  window.addEventListener("online",async()=>{updateSyncUi();if(state.session){showBanner("Conexão restaurada. Sincronizando…","good");try{await syncFromCloud({quiet:true})}catch(_){}}});
  window.addEventListener("offline",()=>{updateSyncUi();showBanner("Sem conexão. Novo login e sincronização exigem acesso ao servidor.","bad")});
  window.addEventListener("focus",async()=>{if(state.session&&navigator.onLine&&!state.syncing){try{await syncFromCloud({quiet:true})}catch(_){}}});
  window.addEventListener("popstate",()=>setView(pathView(),false));
}
function applyUser(){const u=state.session?.user||{};$("#userName").textContent=u.nome||u.usuario||"Usuário";$("#userRole").textContent=u.perfil||"autenticado"}

async function boot(){
  setupEvents();
  state.view=pathView();
  restoreSession();
  if("serviceWorker"in navigator)navigator.serviceWorker.register("/sw.js").catch(()=>{});
  try{
    const check=await apiSheets({action:"auto"});
    if(!check?.ok)throw new Error(check?.error||"Sessão inválida");
    saveSession({user:check.user||{}});
    await syncFromCloud();
    setLogged(true);
    applyUser();
    render();
    startAutoSync();
  }catch(_){
    saveSession(null);
    state.rows=[];
    setLogged(false);
  }
  updateSyncUi();
}
document.addEventListener("DOMContentLoaded",boot);
})();