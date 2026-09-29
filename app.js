(() => {
"use strict";

const SHEET_DEFAULT="https://docs.google.com/spreadsheets/d/1qbuJee6DCv0bh9XGvnBDPltc0Ziphdn2yx11QKOnchc/edit";
const DB_NAME="lexispredict-offline-v1";
const LS={cfg:"lexis.offline.config",session:"lexis.offline.session"};
const state={rows:[],view:"dashboard",query:"",status:"",quality:"",session:null,scanning:false,scanStop:false,lastScan:null,serverCfg:{}};

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
const norm=s=>String(s??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const digits=s=>String(s??"").replace(/\D/g,"");
const now=()=>new Date().toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"});
const cfg=()=>{try{return {...{bridgeUrl:"",sheetUrl:SHEET_DEFAULT},...JSON.parse(localStorage.getItem(LS.cfg)||"{}")}}catch{return{bridgeUrl:"",sheetUrl:SHEET_DEFAULT}}};
const saveCfg=x=>localStorage.setItem(LS.cfg,JSON.stringify(x));
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

function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains("rows"))db.createObjectStore("rows",{keyPath:"_key"});if(!db.objectStoreNames.contains("meta"))db.createObjectStore("meta",{keyPath:"key"});if(!db.objectStoreNames.contains("outbox"))db.createObjectStore("outbox",{keyPath:"id",autoIncrement:true})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function idbAll(store){const db=await openDb();return new Promise((res,rej)=>{const tx=db.transaction(store,"readonly"),rq=tx.objectStore(store).getAll();rq.onsuccess=()=>res(rq.result);rq.onerror=()=>rej(rq.error)})}
async function idbPut(store,value){const db=await openDb();return new Promise((res,rej)=>{const tx=db.transaction(store,"readwrite");tx.objectStore(store).put(value);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
async function idbClear(store){const db=await openDb();return new Promise((res,rej)=>{const tx=db.transaction(store,"readwrite");tx.objectStore(store).clear();tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
async function saveRows(rows){await idbClear("rows");const db=await openDb();return new Promise((res,rej)=>{const tx=db.transaction("rows","readwrite"),st=tx.objectStore("rows");rows.forEach(r=>st.put({...r,_key:keyOf(r)}));tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
async function loadLocal(){state.rows=(await idbAll("rows")).map(({_key,...r})=>r);const meta=(await idbAll("meta")).find(x=>x.key==="lastSync");if(meta)state.lastSync=meta.value;return state.rows}
async function queueWrite(row){await idbPut("outbox",{row,ts:Date.now()});updateSyncUi()}
async function outboxCount(){return (await idbAll("outbox")).length}

async function apiSheets(payload){
  const c=cfg();
  const body={payload}; if(c.bridgeUrl) body.url=c.bridgeUrl;
  const r=await fetch("/api/sheets",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>({ok:false,error:"Resposta inválida"}));if(!r.ok||j.ok===false)throw new Error(j.error||"Falha ao acessar a planilha");return j;
}
async function loginCloud(user,pass){return apiSheets({action:"login",usuario:user,login:user,senha:pass})}
async function syncFromCloud(){
  showBanner("Sincronizando carteira com o Google Sheets…","good");
  const j=await apiSheets({action:"list",limit:8000,sess:state.session?.sess||state.session?.session||""});
  const rows=j.rows||j.data||j.todas||[];if(!Array.isArray(rows))throw new Error("Bridge não retornou uma lista de processos.");
  state.rows=rows;await saveRows(rows);state.lastSync=now();await idbPut("meta",{key:"lastSync",value:state.lastSync});
  await flushOutbox();showBanner("Sincronização concluída: "+rows.length+" processos carregados.","good");render();
}
async function flushOutbox(){
  const list=await idbAll("outbox");if(!list.length)return;
  const rows=list.map(x=>x.row);
  const j=await apiSheets({action:"write",rows,sess:state.session?.sess||state.session?.session||"",actor:state.session?.user?.usuario||"offline"});
  if(j.ok!==false)await idbClear("outbox");
}
function showBanner(msg,type=""){const b=$("#banner");b.textContent=msg;b.className="banner "+type;b.classList.remove("hidden");clearTimeout(showBanner.t);showBanner.t=setTimeout(()=>b.classList.add("hidden"),7000)}
function setLogged(on){$("#login").classList.toggle("hidden",on);$("#app").classList.toggle("hidden",!on)}
function saveSession(s){state.session=s;sessionStorage.setItem(LS.session,JSON.stringify(s||{}))}
function restoreSession(){try{const s=JSON.parse(sessionStorage.getItem(LS.session)||"null");if(s&&Object.keys(s).length)state.session=s}catch{}}

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

function titleFor(v){return {dashboard:["CARTEIRA JURÍDICA","Visão geral"],processos:["BASE PRINCIPAL","Processos"],tarefas:["FILA INTELIGENTE","Tarefas"],analise:["INTELIGÊNCIA OPERACIONAL","Análise"],scanner:["DATAJUD + DJEN","Scanner DJEN"],config:["OFFLINE FIRST","Configurações"]}[v]||["LEXISPREDICT","Painel"]}
function setView(v){state.view=v;$$(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===v));const [e,t]=titleFor(v);$("#viewEyebrow").textContent=e;$("#viewTitle").textContent=t;render()}
function render(){const m=metrics();$("#navProcessos").textContent=m.total;$("#navTarefas").textContent=tasks().length;updateSyncUi();if(state.view==="dashboard")renderDashboard();else if(state.view==="processos")renderProcessos();else if(state.view==="tarefas")renderTarefas();else if(state.view==="analise")renderAnalise();else if(state.view==="scanner")renderScanner();else renderConfig()}
async function updateSyncUi(){const c=cfg(),count=await outboxCount();const online=navigator.onLine,connected=!!(c.bridgeUrl||state.serverCfg.bridgeConfigured);$("#modeChip").textContent=connected?(online?"SHEETS + LOCAL":"OFFLINE CACHE"):"LOCAL";$("#syncDot").className="dot "+(connected&&online?"ok":online?"warn":"bad");$("#syncText").textContent=(state.lastSync?"Sync "+state.lastSync:"Local")+(count?" • "+count+" pendente(s)":"")}
function kpi(label,value,sub,cls=""){return '<div class="kpi '+cls+'"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(sub||"")+'</small></div>'}
function renderDashboard(){
  const m=metrics(),classified=m.proc+m.improc,procPct=classified?Math.round(m.proc/classified*1000)/10:0,djenPct=m.total?Math.round(m.djen/m.total*1000)/10:0,djPct=m.total?Math.round(m.dj/m.total*1000)/10:0;
  const critical=tasks().slice(0,12);
  $("#content").innerHTML=
  '<div class="kpi-grid">'+
  kpi("Processos",m.total,m.active+" ativos")+
  kpi("Encerrados",m.closed,(m.total?Math.round(m.closed/m.total*100):0)+"% da carteira")+
  kpi("Vencidos",m.venc,m.attention+" para atenção","bad")+
  kpi("Score médio",m.avg+"/100",m.bad+" RUIM • "+m.good+" BOM",m.avg<45?"bad":m.avg>=70?"good":"warn")+
  kpi("DataJud",djPct+"%",m.dj+" com movimento","good")+
  kpi("DJEN",djenPct+"%",m.djen+" com publicação",djenPct<10?"warn":"good")+
  '</div>'+
  '<div class="grid-2"><div class="card"><div class="card-head"><h3>Fila crítica</h3><button class="btn sm" data-goto="tarefas">Abrir tarefas</button></div><div class="table-wrap"><table class="table"><thead><tr><th>Prioridade</th><th>Cliente</th><th>CNJ</th><th>Motivo</th><th>Qualidade</th></tr></thead><tbody>'+
  critical.map(x=>'<tr><td>'+badge(priority(x.w),x.w>=1000?"bad":x.w>=850?"warn":"blue")+'</td><td><div class="cell-main">'+esc(pick(x.r,"Cliente"))+'</div><div class="cell-sub">'+esc(pick(x.r,"Assistente"))+'</div></td><td>'+esc(cnjFormatted(pick(x.r,"Protocolo")))+'</td><td>'+esc(taskLabel(x.r))+'</td><td>'+qBadge(quality(x.r))+'</td></tr>').join("")+
  '</tbody></table></div></div><div class="card"><div class="card-head"><h3>Saúde da carteira</h3></div><div class="card-body metric-list">'+
  metricRow("Procedência classificada",procPct+"%",classified+" resultados classificados")+
  metricRow("Cobertura DataJud",djPct+"%",m.dj+" processos")+
  metricRow("Cobertura DJEN",djenPct+"%",m.djen+" processos")+
  metricRow("Novas atualizações",m.newer,"processos sinalizados")+
  metricRow("Qualidade ruim",m.bad,"exigem revisão")+
  '</div></div></div>';
  bindGotos();
}
function metricRow(label,value,sub){return '<div class="metric-row"><div><div class="cell-main">'+esc(label)+'</div><div class="cell-sub">'+esc(sub)+'</div></div><strong>'+esc(value)+'</strong></div>'}
function filteredRows(){
  const q=norm(state.query),st=state.status,qual=state.quality;
  return state.rows.filter(r=>(!q||norm(Object.values(r).join(" ")).includes(q))&&(!st||statusRet(r)===st)&&(!qual||quality(r)===qual));
}
function renderProcessos(){
  const rows=filteredRows().slice(0,500);
  $("#content").innerHTML='<div class="toolbar"><input id="search" placeholder="Buscar cliente, CNJ, advogado, andamento…" value="'+esc(state.query)+'"/><select id="statusFilter"><option value="">Todos os retornos</option>'+["VENCIDO","ATENÇÃO","EM DIA","SEM DATA"].map(x=>'<option '+(state.status===x?"selected":"")+'>'+x+'</option>').join("")+'</select><select id="qualityFilter"><option value="">Todas as qualidades</option>'+["BOM","NEUTRO","RUIM"].map(x=>'<option '+(state.quality===x?"selected":"")+'>'+x+'</option>').join("")+'</select><span class="spacer"></span><span class="muted">'+rows.length+' de '+state.rows.length+'</span></div>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Cliente</th><th>CNJ</th><th>Responsável</th><th>Advogado</th><th>Andamento</th><th>Score</th><th>Qualidade</th><th>Retorno</th><th>Sync</th><th>Ações</th></tr></thead><tbody>'+
  rows.map(r=>'<tr><td><div class="cell-main">'+esc(pick(r,"Cliente"))+'</div><div class="cell-sub">'+esc(pick(r,"Escritório"))+'</div></td><td>'+esc(cnjFormatted(pick(r,"Protocolo")))+'<div class="cell-sub">'+esc(pick(r,"Tribunal"))+'</div></td><td>'+esc(pick(r,"Assistente","Responsável"))+'</td><td>'+esc(pick(r,"Advogado Atual","Advogado"))+'</td><td><div class="cell-main">'+esc(String(latestMove(r)).slice(0,90))+'</div><div class="cell-sub">'+esc(pick(r,"DataJud • Data","DJEN • Data"))+'</div></td><td>'+scoreHtml(score(r))+'</td><td>'+qBadge(quality(r))+'</td><td>'+badge(statusRet(r),statusRet(r)==="VENCIDO"?"bad":statusRet(r)==="ATENÇÃO"?"warn":statusRet(r)==="EM DIA"?"good":"gray")+'</td><td>'+esc(pick(r,"Automação","Status Sync")||"—")+'</td><td class="actions"><button class="icon-action" data-edit="'+esc(keyOf(r))+'">Editar</button><button class="icon-action" data-scan="'+esc(digits(pick(r,"Protocolo")))+'">DJEN</button></td></tr>').join("")+
  '</tbody></table></div>';
  $("#search").oninput=e=>{state.query=e.target.value;renderProcessos()};$("#statusFilter").onchange=e=>{state.status=e.target.value;renderProcessos()};$("#qualityFilter").onchange=e=>{state.quality=e.target.value;renderProcessos()};
  $$("[data-edit]").forEach(b=>b.onclick=()=>openProcess(b.dataset.edit));$$("[data-scan]").forEach(b=>b.onclick=()=>{setView("scanner");setTimeout(()=>{$("#scanCnj").value=b.dataset.scan;scanOne(b.dataset.scan)},0)});
}
function renderTarefas(){
  const list=tasks().slice(0,800);
  $("#content").innerHTML='<div class="kpi-grid">'+kpi("Fila total",list.length,"ações priorizadas")+kpi("Críticas",list.filter(x=>priority(x.w)==="CRÍTICA").length,"ação imediata","bad")+kpi("Altas",list.filter(x=>priority(x.w)==="ALTA").length,"prioridade alta","warn")+kpi("Novidades",list.filter(x=>boolish(pick(x.r,"Nova Atualização"))).length,"andamentos novos")+kpi("Vencidos",list.filter(x=>statusRet(x.r)==="VENCIDO").length,"retornos vencidos","bad")+kpi("Hoje",list.filter(x=>statusRet(x.r)==="ATENÇÃO").length,"atenção hoje","warn")+'</div>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Prioridade</th><th>Tarefa</th><th>Cliente</th><th>CNJ</th><th>Responsável</th><th>Advogado</th><th>Andamento</th><th>Qualidade</th><th>Ação</th></tr></thead><tbody>'+
  list.map(x=>'<tr><td>'+badge(priority(x.w),x.w>=1000?"bad":x.w>=850?"warn":"blue")+'</td><td class="cell-main">'+esc(taskLabel(x.r))+'</td><td>'+esc(pick(x.r,"Cliente"))+'</td><td>'+esc(cnjFormatted(pick(x.r,"Protocolo")))+'</td><td>'+esc(pick(x.r,"Assistente"))+'</td><td>'+esc(pick(x.r,"Advogado Atual","Advogado"))+'</td><td>'+esc(String(latestMove(x.r)).slice(0,75))+'</td><td>'+qBadge(quality(x.r))+'</td><td><button class="icon-action" data-edit="'+esc(keyOf(x.r))+'">Abrir</button></td></tr>').join("")+
  '</tbody></table></div>';
  $$("[data-edit]").forEach(b=>b.onclick=()=>openProcess(b.dataset.edit));
}
function renderAnalise(){
  const m=metrics(),stages={},lawyers={},commercial={};
  state.rows.forEach(r=>{const st=String(latestMove(r)).split("—")[0].trim()||"Sem diagnóstico";stages[st]=(stages[st]||0)+1;const adv=String(pick(r,"Advogado Atual","Advogado")||"NÃO ATRIBUÍDO").trim();lawyers[adv]=(lawyers[adv]||0)+1;const c=String(pick(r,"Comercial")||"REVISAR");commercial[c]=(commercial[c]||0)+1});
  const stageTop=Object.entries(stages).sort((a,b)=>b[1]-a[1]).slice(0,10),lawTop=Object.entries(lawyers).sort((a,b)=>b[1]-a[1]).slice(0,10),comTop=Object.entries(commercial).sort((a,b)=>b[1]-a[1]);
  $("#content").innerHTML='<div class="kpi-grid">'+kpi("BOM",m.good,"score ≥ 70","good")+kpi("NEUTRO",m.neutral,"score 45–69","warn")+kpi("RUIM",m.bad,"score < 45","bad")+kpi("Procedentes",m.proc,"classificados")+kpi("Improcedentes",m.improc,"classificados","bad")+kpi("Score médio",m.avg+"/100","andamento processual")+'</div>'+
  '<div class="analysis-grid"><div class="analysis-tile"><h4>Fases processuais</h4>'+bars(stageTop,m.total)+'</div><div class="analysis-tile"><h4>Advogados atuais</h4>'+bars(lawTop,m.total)+'</div><div class="analysis-tile"><h4>Triagem comercial</h4>'+bars(comTop,m.total)+'</div></div>'+
  '<div class="section-title"><div><h2>Casos críticos / não vender</h2><p>Triagem automática para revisão humana.</p></div></div>'+
  '<div class="table-wrap"><table class="table"><thead><tr><th>Cliente</th><th>CNJ</th><th>Diagnóstico</th><th>Score</th><th>Recursal</th><th>Comercial</th><th>Produto</th></tr></thead><tbody>'+
  state.rows.filter(r=>quality(r)==="RUIM"||/NÃO VENDER|REVISAR ANTES/i.test(pick(r,"Comercial"))).sort((a,b)=>score(a)-score(b)).slice(0,120).map(r=>'<tr><td>'+esc(pick(r,"Cliente"))+'</td><td>'+esc(cnjFormatted(pick(r,"Protocolo")))+'</td><td>'+esc(String(latestMove(r)).slice(0,100))+'</td><td>'+scoreHtml(score(r))+'</td><td>'+esc(pick(r,"Situação Recursal"))+'</td><td>'+badge(pick(r,"Comercial")||"REVISAR",/NÃO VENDER/i.test(pick(r,"Comercial"))?"bad":/POTENCIAL/i.test(pick(r,"Comercial"))?"good":"warn")+'</td><td>'+esc(pick(r,"Produto / Oportunidade"))+'</td></tr>').join("")+
  '</tbody></table></div>';
}
function bars(entries,total){const max=Math.max(...entries.map(x=>x[1]),1);return '<div class="bars">'+entries.map(([k,v])=>'<div class="barline"><span title="'+esc(k)+'">'+esc(k.slice(0,22))+'</span><div class="bar"><span style="width:'+Math.round(v/max*100)+'%"></span></div><b>'+v+'</b></div>').join("")+'</div>'}

function renderScanner(){
  const valid=state.rows.filter(r=>digits(pick(r,"Protocolo")).length===20),withDjen=state.rows.filter(r=>pick(r,"DJEN • Última Publicação")).length;
  $("#content").innerHTML='<div class="scanner-grid"><div class="card"><div class="card-head"><h3>Consultar DJEN oficial</h3><span class="muted">produção CNJ • rate limit respeitado</span></div><div class="card-body"><div class="scan-box"><input id="scanCnj" placeholder="CNJ do processo"/><button class="btn primary" id="scanOneBtn">Consultar</button></div><div id="scanResult" class="scan-result" style="margin-top:14px">'+(state.lastScan?renderScanResult(state.lastScan):'<div class="offline-note">A consulta usa o endpoint público oficial do DJEN pelo servidor Vercel. Em HTTP 429, o scanner pausa e informa quando pode retomar.</div>')+'</div></div></div>'+
  '<div class="card"><div class="card-head"><h3>Varredura da carteira</h3></div><div class="card-body"><div class="metric-list">'+metricRow("CNJs válidos",valid.length,"aptos para consulta")+metricRow("Com publicação local",withDjen,"cache atual")+metricRow("Restantes estimados",Math.max(0,valid.length-withDjen),"não significa inexistência")+'</div><div class="row" style="margin-top:14px"><button class="btn primary" id="scanQueueBtn">'+(state.scanning?"Parar":"Iniciar fila DJEN")+'</button><button class="btn" id="clearScanLog">Limpar log</button></div><div class="progress" style="margin:14px 0"><span id="scanProgress" style="width:0%"></span></div><div id="queueLog" class="queue-log"></div></div></div></div>';
  $("#scanOneBtn").onclick=()=>scanOne($("#scanCnj").value);$("#scanQueueBtn").onclick=()=>state.scanning?(state.scanStop=true):(scanQueue());$("#clearScanLog").onclick=()=>$("#queueLog").innerHTML="";
}
function renderScanResult(x){
  if(!x)return"";if(!x.ok)return '<div class="banner bad">'+esc(x.error||"Falha no DJEN")+'</div>';
  if(!x.found)return '<div class="offline-note">Nenhuma comunicação retornada nesta consulta. Isso não prova inexistência de publicação; o processo permanece elegível para nova varredura.</div>';
  const y=x.latest||{};return '<div class="publication"><h4>'+esc(y.tipoComunicacao||y.tipo||"Publicação DJEN")+'</h4><small>'+esc(y.data_disponibilizacao||y.data||"")+" • "+esc(y.nomeOrgao||y.orgao||"")+'</small><p>'+esc(y.texto||y.resumo||"")+'</p>'+(y.link?'<a target="_blank" rel="noopener" href="'+esc(y.link)+'">Abrir inteiro teor</a>':'')+'</div>';
}
async function scanOne(cnj,quiet=false){
  const d=digits(cnj);if(d.length!==20){if(!quiet)showBanner("CNJ inválido. Use 20 dígitos.","bad");return null}
  try{
    const r=await fetch("/api/djen?cnj="+encodeURIComponent(cnjFormatted(d)),{cache:"no-store"});const j=await r.json();state.lastScan=j;if(!quiet&&state.view==="scanner")$("#scanResult").innerHTML=renderScanResult(j);
    if(j.ok&&j.found){const row=state.rows.find(x=>digits(pick(x,"Protocolo"))===d);if(row){const y=j.latest||{};row["DJEN • Última Publicação"]=[y.tipoComunicacao,y.tipoDocumento,y.nomeOrgao,y.texto].filter(Boolean).join(" — ").slice(0,2000);row["DJEN • Data"]=y.data_disponibilizacao||"";row["_DJENId"]=String(y.id||y.hash||"");row["_DJENDate"]=y.data_disponibilizacao||"";row["Fonte"]=pick(row,"Fonte")?String(pick(row,"Fonte"))+" + DJEN":"DJEN";row["Última Sincronização"]=now();await saveRows(state.rows);await queueWrite(row)}}
    if(r.status===429)return {...j,retry:true};return j;
  }catch(e){const j={ok:false,error:e.message||String(e)};state.lastScan=j;if(!quiet&&state.view==="scanner")$("#scanResult").innerHTML=renderScanResult(j);return j}
}
function logQueue(msg){const el=$("#queueLog");if(!el)return;const d=document.createElement("div");d.textContent=new Date().toLocaleTimeString("pt-BR")+" • "+msg;el.appendChild(d);el.scrollTop=el.scrollHeight}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function scanQueue(){
  if(state.scanning)return;state.scanning=true;state.scanStop=false;renderScanner();
  const list=state.rows.filter(r=>digits(pick(r,"Protocolo")).length===20).sort((a,b)=>Number(!pick(a,"DJEN • Última Publicação"))-Number(!pick(b,"DJEN • Última Publicação"))).reverse();
  let done=0;
  for(const row of list){
    if(state.scanStop)break;const cnj=pick(row,"Protocolo");logQueue("Consultando "+cnjFormatted(cnj));
    const j=await scanOne(cnj,true);done++;const p=$("#scanProgress");if(p)p.style.width=Math.round(done/list.length*100)+"%";
    if(j?.retry){const ms=Math.max(60000,Number(j.retryAfterMs)||60000);logQueue("HTTP 429 • pausa de "+Math.ceil(ms/1000)+"s");await sleep(ms)}else await sleep(1100);
    if(done%10===0){try{await flushOutbox();logQueue("Checkpoint salvo • "+done+" processos")}catch(e){logQueue("Sync adiado: "+e.message)}}
  }
  state.scanning=false;state.scanStop=false;try{await flushOutbox()}catch{}logQueue("Fila finalizada/pausada.");renderScanner();
}

function renderConfig(){
  const c=cfg();
  $("#content").innerHTML='<div class="config-grid"><div class="config-item"><h3>Google Sheets</h3><p>O app trabalha com IndexedDB local e sincroniza com a planilha por um Apps Script bridge. O offline continua funcionando mesmo sem a ponte.</p><div class="row"><button class="btn primary" id="cfgBridge">Configurar bridge</button><a class="btn" target="_blank" rel="noopener" href="'+esc(c.sheetUrl||SHEET_DEFAULT)+'">Abrir planilha</a></div></div>'+
  '<div class="config-item"><h3>Cache offline</h3><p>'+state.rows.length+' processos salvos neste navegador. Alterações offline entram na outbox e são enviadas na próxima sincronização.</p><div class="row"><button class="btn" id="exportBtn">Exportar JSON</button><label class="btn">Importar CSV<input id="csvFile" type="file" accept=".csv,text/csv" hidden></label></div></div>'+
  '<div class="config-item"><h3>DJEN</h3><p>Consulta server-side no endpoint público do CNJ, preservando rate limit e cache. A rota compatível com o scanner da planilha é <code>/api/v1/comunicacao</code>.</p><button class="btn" data-goto="scanner">Abrir scanner</button></div>'+
  '<div class="config-item"><h3>Diagnóstico</h3><p>Última sincronização: '+esc(state.lastSync||"nunca")+'<br>Online: '+(navigator.onLine?"sim":"não")+'<br>Bridge: '+(c.bridgeUrl?"configurado":"não configurado")+'</p><button class="btn danger" id="clearCacheBtn">Limpar cache local</button></div></div>';
  $("#cfgBridge").onclick=openSetup;$("#exportBtn").onclick=exportJson;$("#csvFile").onchange=importCsv;$("#clearCacheBtn").onclick=async()=>{if(confirm("Apagar dados locais deste navegador?")){await idbClear("rows");await idbClear("outbox");state.rows=[];render()}};bindGotos();
}
function bindGotos(){$$("[data-goto]").forEach(b=>b.onclick=()=>setView(b.dataset.goto))}
function openSetup(){const c=cfg();$("#bridgeUrl").value=c.bridgeUrl||"";$("#sheetUrl").value=c.sheetUrl||SHEET_DEFAULT;$("#setupStatus").textContent="";$("#setupDialog").showModal()}
async function testBridge(){const old=cfg(),tmp={bridgeUrl:$("#bridgeUrl").value.trim(),sheetUrl:$("#sheetUrl").value.trim()||SHEET_DEFAULT};saveCfg(tmp);$("#setupStatus").textContent="Testando…";try{const j=await apiSheets({action:"ping"});$("#setupStatus").textContent=j.pong?"Conexão OK • bridge "+(j.v||""):"Bridge respondeu."}catch(e){$("#setupStatus").textContent="Falha: "+e.message}finally{saveCfg(tmp.bridgeUrl?tmp:old)}}
function openProcess(key){
  const r=state.rows.find(x=>keyOf(x)===key)||{};$("#editKey").value=key||"";$("#processDialogTitle").textContent=key?"Editar processo":"Novo processo";
  $("#fCliente").value=pick(r,"Cliente");$("#fProtocolo").value=pick(r,"Protocolo");$("#fAssistente").value=pick(r,"Assistente");$("#fAdvogado").value=pick(r,"Advogado");$("#fEscritorio").value=pick(r,"Escritório");$("#fTribunal").value=pick(r,"Tribunal");$("#fStatus").value=pick(r,"Status");$("#fTelefone").value=pick(r,"Telefone");$("#fRetorno").value=pick(r,"Último Retorno");$("#fProximo").value=pick(r,"Próximo Retorno");$("#fObs").value=pick(r,"Observações");$("#processStatus").textContent="";$("#processDialog").showModal()
}
async function saveProcess(){
  const key=$("#editKey").value;let r=state.rows.find(x=>keyOf(x)===key);if(!r){r={};state.rows.unshift(r)}
  Object.assign(r,{"Cliente":$("#fCliente").value.trim(),"Protocolo":$("#fProtocolo").value.trim(),"Assistente":$("#fAssistente").value.trim(),"Advogado":$("#fAdvogado").value.trim(),"Escritório":$("#fEscritorio").value.trim(),"Tribunal":$("#fTribunal").value.trim(),"Status":$("#fStatus").value.trim(),"Telefone":$("#fTelefone").value.trim(),"Último Retorno":$("#fRetorno").value.trim(),"Próximo Retorno":$("#fProximo").value.trim(),"Observações":$("#fObs").value.trim()});
  if(digits(r["Protocolo"]).length===20){r["Automação"]="PENDENTE";r["Próxima Sincronização"]=""}
  await saveRows(state.rows);await queueWrite(r);$("#processDialog").close();showBanner("Processo salvo localmente. A sincronização enviará a alteração para a planilha.","good");render()
}
function exportJson(){const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),rows:state.rows},null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="lexispredict-offline-"+new Date().toISOString().slice(0,10)+".json";a.click();URL.revokeObjectURL(a.href)}
function csvSplit(line,sep){const out=[];let cur="",q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==="\""){if(q&&line[i+1]==="\""){cur+="\"";i++}else q=!q}else if(c===sep&&!q){out.push(cur);cur=""}else cur+=c}out.push(cur);return out}
async function importCsv(ev){const f=ev.target.files?.[0];if(!f)return;const text=await f.text(),lines=text.replace(/^\uFEFF/,"").split(/\r?\n/).filter(Boolean);if(lines.length<2)return;const sep=(lines[0].match(/;/g)||[]).length>(lines[0].match(/,/g)||[]).length?";":",";const headers=csvSplit(lines[0],sep).map(x=>x.trim());const rows=lines.slice(1).map(l=>{const a=csvSplit(l,sep),r={};headers.forEach((h,i)=>r[h]=a[i]??"");return r});state.rows=rows;await saveRows(rows);showBanner(rows.length+" processos importados para o cache local.","good");render()}
function setupEvents(){
  $$("#nav .nav-item").forEach(b=>b.onclick=()=>setView(b.dataset.view));$("#syncBtn").onclick=async()=>{try{await syncFromCloud()}catch(e){showBanner(e.message,"bad")}};$("#newProcessBtn").onclick=()=>openProcess("");$("#logoutBtn").onclick=()=>{saveSession(null);setLogged(false)};$("#openSetupBtn").onclick=openSetup;$("#testBridgeBtn").onclick=testBridge;$("#saveProcessBtn").onclick=saveProcess;
  $("#setupForm").addEventListener("submit",e=>{e.preventDefault();const c={bridgeUrl:$("#bridgeUrl").value.trim(),sheetUrl:$("#sheetUrl").value.trim()||SHEET_DEFAULT};saveCfg(c);$("#setupDialog").close();showBanner("Conexão salva neste navegador.","good");updateSyncUi()});
  $("#loginBtn").onclick=async()=>{const u=$("#loginUser").value.trim(),p=$("#loginPass").value;$("#loginStatus").textContent="Entrando…";try{const j=await loginCloud(u,p);saveSession({user:j.user||j.usuario||{usuario:u},sess:j.sess||j.session||j.token||""});await loadLocal();setLogged(true);applyUser();try{await syncFromCloud()}catch(e){showBanner("Entrou com cache local; sync falhou: "+e.message,"bad")}render()}catch(e){$("#loginStatus").textContent=e.message}};
  $("#offlineBtn").onclick=async()=>{await loadLocal();saveSession({user:{nome:"Modo local",perfil:"offline"}});setLogged(true);applyUser();render();if(!state.rows.length)showBanner("Cache vazio. Importe CSV ou configure a conexão com a planilha.","bad")};
  window.addEventListener("online",()=>{updateSyncUi();showBanner("Conexão restaurada. Você pode sincronizar a outbox.","good")});window.addEventListener("offline",()=>{updateSyncUi();showBanner("Sem internet: o LexisPredict continua no cache local.","")});
}
function applyUser(){const u=state.session?.user||{};$("#userName").textContent=u.nome||u.usuario||"Modo local";$("#userRole").textContent=u.perfil||"offline"}

async function boot(){
  setupEvents();restoreSession();
  try{const r=await fetch("/api/config",{cache:"no-store"});if(r.ok)state.serverCfg=await r.json()}catch(_){}
  if(state.serverCfg.sheetUrl){const c=cfg();if(!c.sheetUrl||c.sheetUrl===SHEET_DEFAULT)saveCfg({...c,sheetUrl:state.serverCfg.sheetUrl})}
  await loadLocal();if("serviceWorker"in navigator)navigator.serviceWorker.register("/sw.js").catch(()=>{});
  if(state.session){setLogged(true);applyUser();render()}else setLogged(false);
  updateSyncUi();
}
document.addEventListener("DOMContentLoaded",boot);
})();