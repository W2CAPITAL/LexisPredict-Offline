(function(w){
"use strict";
const S={page:"campaigns",data:null,loading:false,busy:false,query:"",progress:""};
let H={rows:()=>[],clients:()=>[],showBanner:()=>{}};
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fold=v=>String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const digits=v=>String(v??"").replace(/\D/g,"");
const pick=(r,...names)=>{for(const n of names)if(r?.[n]!=null&&String(r[n]).trim())return r[n];const m=new Map(Object.keys(r||{}).map(k=>[fold(k),k]));for(const n of names){const k=m.get(fold(n));if(k&&String(r[k]??"").trim())return r[k]}return""};
const opted=v=>/^(1|sim|yes|true|opt.?out|nao falar|não falar|nao contatar|não contatar|sair|stop|parar)$/i.test(String(v??"").trim());
const fmtCnj=v=>{const d=digits(v);return d.length===20?d.slice(0,7)+"-"+d.slice(7,9)+"."+d.slice(9,13)+"."+d.slice(13,14)+"."+d.slice(14,16)+"."+d.slice(16):String(v||"")};
function normPhone(v){let d=digits(v);if(d.length===10||d.length===11)d="55"+d;return d.length>=12&&d.length<=13?d:""}
function fmtDate(v){if(!v)return"—";const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"})}
async function api(action,payload={}){
  const r=await fetch("/api/wa-auto",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...payload}),cache:"no-store"});
  const j=await r.json().catch(()=>({ok:false,error:"Resposta inválida do WA.Auto."}));
  if(!r.ok||j.ok===false)throw new Error(j.error||"Falha no WA.Auto.");
  return j.data!==undefined?j.data:j;
}
function indexes(clients){const byId=new Map(),byName=new Map();for(const c of clients||[]){if(c.ClienteId)byId.set(String(c.ClienteId),c);const n=fold(c.Nome||c.Cliente);if(n&&!byName.has(n))byName.set(n,c)}return{byId,byName}}
function portfolio(rows,clients){
  const idx=indexes(clients),seen=new Set(),out=[];let invalid=0,optOut=0;
  (rows||[]).forEach((r,i)=>{
    const cid=String(pick(r,"ClienteId")||""),name=String(pick(r,"Cliente","Nome")||""),c=idx.byId.get(cid)||idx.byName.get(fold(name))||{};
    const phone=normPhone(pick(r,"Telefone","Celular","WhatsApp")||pick(c,"Telefone_Principal","Telefone","Celular","WhatsApp"));
    const cnj=digits(pick(r,"Protocolo","CNJ","Processo"));
    if(cnj.length!==20||!phone){invalid++;return}
    const key=cnj+":"+phone;if(seen.has(key))return;seen.add(key);
    const blocked=opted(pick(r,"OptOutWhatsApp","OptOut","Não Contatar","Nao Contatar"))||opted(pick(c,"OptOutWhatsApp","OptOut","NaoContatar"));
    if(blocked)optOut++;
    out.push({
      cnj,clientName:name||pick(c,"Nome")||"Cliente",phone,optOut:blocked,sourceRow:i+2,notifyWhatsapp:true,
      lastReturnAt:pick(r,"Último Retorno","Ultimo Retorno","ultimo_retorno","Retorno"),
      nextReturnAt:pick(r,"Próximo Retorno","Proximo Retorno","proximo_retorno"),
      movementAt:pick(r,"DataJud • Data","Data da Movimentação","Data_Movimentacao"),
      movementText:pick(r,"DataJud • Último Movimento","Último Andamento","Andamento","ultima_movimentacao"),
      djenAt:pick(r,"DJEN • Data","_DJENDate","Data DJEN"),
      djenText:pick(r,"DJEN • Última Publicação","DJEN_Resumo","Resumo DJEN"),
      lastNotifiedAt:pick(r,"Último Aviso","Ultimo Aviso","Alert Delivered","ultima_notificacao")
    });
  });
  return{rows:out,invalid,optOut};
}
function badge(t,k="gray"){return'<span class="wa-badge '+k+'">'+esc(t)+'</span>'}
function conn(){return S.data?.connection||{}}
function connLabel(){const s=String(conn().status||"disconnected");return s==="ready"?"Conectado":s==="qr"?"Aguardando QR":s==="pairing"?"Pareando":"Desconectado"}
function nav(){
  const items=[["campaigns","✈","Campanhas"],["whatsapp","◉","WhatsApp"],["clients","♙","Clientes"],["history","◷","Histórico"],["processes","⚖","Processos"],["settings","⚙","Configurações"]];
  return'<div class="wa-tabs">'+items.map(([id,ic,n])=>'<button data-wa-page="'+id+'" class="'+(S.page===id?"active":"")+'"><span>'+ic+'</span>'+n+(id==="processes"&&S.data?.sheet?.waiting?'<i>'+S.data.sheet.waiting+'</i>':'')+'</button>').join("")+'</div>';
}
function top(){
  return'<div class="wa-topbar"><label class="wa-search"><span>⌕</span><input id="waSearch" value="'+esc(S.query)+'" placeholder="Buscar campanhas, clientes ou processos..."/></label><div class="wa-account"><span class="wa-account-avatar">WA</span><div><strong>WA.Auto</strong><small>'+esc(connLabel())+'</small></div><button id="waRefresh">↻</button></div></div>';
}
function hero(title,sub,actions=""){return'<div class="wa-hero"><div><h2>'+esc(title)+'</h2><p>'+esc(sub)+'</p></div><div class="wa-hero-actions">'+actions+'</div></div>'}
function metric(ic,kind,label,val,sub){return'<article class="wa-metric"><span class="wa-metric-icon '+kind+'">'+ic+'</span><div><small>'+esc(label)+'</small><strong>'+esc(val)+'</strong><p>'+esc(sub)+'</p></div></article>'}
function stats(){
  const p=portfolio(H.rows(),H.clients()),sh=S.data?.sheet||{},campaigns=S.data?.campaigns||[];
  return'<div class="wa-stats">'+metric("♙","green","Contatos válidos",p.rows.length-p.optOut,"Prontos no SheetsPredict")+metric("▣","amber","Alertas pendentes",sh.waiting||0,"Após último retorno")+metric("⊘","red","Opt-out / inválidos",p.optOut+p.invalid,"Não entram no envio")+metric("✈","teal","Campanhas",campaigns.length,"Histórico WA.Auto")+'</div>';
}
function waStatusCard(){const ready=conn().status==="ready";return'<button class="wa-status-card" data-wa-page="whatsapp"><span class="wa-circle">◉</span><span><strong>'+(ready?"WhatsApp conectado":"Conectar WhatsApp")+'</strong><small><i class="'+(ready?"ready":"")+'"></i>'+esc(connLabel())+'</small></span></button>'}
function autoCard(){
  const on=!!S.data?.sheet?.autoEnabled;
  return'<div class="wa-auto-card '+(on?"on":"")+'"><div><span>⚖</span><div><strong>Atualizações processuais automáticas</strong><p>'+(on?"ATIVO · somente novidades depois do último retorno.":"DESLIGADO · nenhum aviso processual automático é enviado.")+'</p></div></div><label class="wa-switch"><input id="waAuto" type="checkbox" '+(on?"checked":"")+'><span></span></label></div>'+
  '<div class="wa-preview"><div><strong>📌 ATUALIZAÇÃO PROCESSUAL</strong><p>Cliente: <b>Cliente</b>\nProcesso: <b>0000000-00.0000.0.00.0000</b>\nFonte: <b>DJEN / DataJud</b>\nNova movimentação: ...\nData/Hora: ...</p><small>Mensagem automática · ✓✓</small></div></div>'+
  '<button class="wa-send-all" id="waSync"><span>↻</span><b>'+esc(S.progress||"Sincronizar carteira com o WA.Auto")+'</b><span>→</span></button><p class="wa-note">O WA.Auto usa o próprio scanner DJEN/DataJud, deduplica eventos e respeita opt-out e lista de não contatar.</p>';
}
function campaigns(){
  const cs=S.data?.campaigns||[];
  return hero("Do SheetsPredict para o WhatsApp","A interface do WA.Auto usando diretamente a carteira do SheetsPredict.",waStatusCard())+stats()+
  '<div class="wa-grid"><section class="wa-panel"><div class="wa-panel-head"><span class="wa-heading-icon">S</span><div><h3>Contatos da planilha</h3><p>Google Sheets já conectado; não precisa importar Excel novamente.</p></div></div><div class="wa-drop static"><span>S</span><div><strong>Carteira do SheetsPredict</strong><small>'+H.rows().length+' processos carregados</small></div><b>Sincronização direta</b></div>'+clientPreview(7)+'</section>'+
  '<section class="wa-panel"><div class="wa-panel-head"><div><h3>Mensagem automática</h3><p>Última movimentação confirmada pelo WA.Auto.</p></div></div>'+autoCard()+'</section></div>'+
  '<div class="wa-section-head"><div><h3>Histórico de campanhas</h3><p>'+cs.length+' campanha(s)</p></div></div>'+(cs.length?cs.slice(0,40).map(campaignRow).join(""):'<div class="wa-empty">Nenhuma campanha registrada.</div>');
}
function clientPreview(n){
  const list=portfolio(H.rows(),H.clients()).rows.filter(x=>!x.optOut).slice(0,n);
  return'<div class="wa-client-list">'+(list.length?list.map(x=>'<div class="wa-client"><span>'+esc((x.clientName||"C").slice(0,2).toUpperCase())+'</span><div><strong>'+esc(x.clientName)+'</strong><small>+'+esc(x.phone)+' · '+esc(fmtCnj(x.cnj))+'</small></div>'+badge(x.djenText?"DJEN + DataJud":"DataJud","valid")+'</div>').join(""):'<div class="wa-empty">Nenhum cliente elegível.</div>')+'</div>';
}
function campaignRow(c){return'<div class="wa-history-row"><span>✈</span><div><strong>'+esc(c.name||"Campanha")+'</strong><small>'+esc(c.status||"")+' · '+esc(c.created_at||"")+'</small></div>'+badge(c.status||"—",/completed|sent/i.test(c.status)?"valid":"gray")+'</div>'}
function clients(){
  const q=fold(S.query),p=portfolio(H.rows(),H.clients()),list=p.rows.filter(x=>!q||fold([x.clientName,x.phone,x.cnj,x.movementText,x.djenText].join(" ")).includes(q)).slice(0,200);
  return hero("Clientes","Processo + WhatsApp formam o vínculo usado pelo monitor jurídico.",waStatusCard())+stats()+'<section class="wa-panel"><div class="wa-panel-head"><span class="wa-heading-icon">S</span><div><h3>Clientes do SheetsPredict</h3><p>Mostrando até 200 por vez.</p></div></div><div class="wa-table-scroll"><table class="wa-table"><thead><tr><th>Cliente</th><th>WhatsApp</th><th>Processo</th><th>Último retorno</th><th>Fontes</th><th>Status</th></tr></thead><tbody>'+list.map(x=>'<tr><td><strong>'+esc(x.clientName)+'</strong></td><td>+'+esc(x.phone)+'</td><td class="mono">'+esc(fmtCnj(x.cnj))+'</td><td>'+esc(x.lastReturnAt||"—")+'</td><td>'+esc(x.djenText?"DJEN + DataJud":x.movementText?"DataJud":"aguardando")+'</td><td>'+badge(x.optOut?"Opt-out":"Válido",x.optOut?"blocked":"valid")+'</td></tr>').join("")+'</tbody></table></div></section>';
}
function whatsapp(){
  const c=conn(),ready=c.status==="ready";
  return hero("WhatsApp","A mesma sessão cloud do WA.Auto; nenhum segundo cliente é criado.",ready?badge("Conectado","valid"):badge(connLabel(),"gray"))+
  '<div class="wa-settings-grid"><section class="wa-panel wa-settings"><div class="wa-connection-title"><span class="wa-circle large">◉</span><div><h3>Conectar WhatsApp</h3><p>QR Code ou código de pareamento.</p></div></div>'+
  (ready?'<div class="wa-connected"><span>✓</span><strong>'+esc(c.account?.name||"WhatsApp conectado")+'</strong><p>'+esc(c.account?.phone||"Sessão pronta")+'</p><div class="row end"><button class="wa-button secondary" id="waDisconnect">Desconectar</button><button class="wa-button danger" id="waLogout">Sair da conta</button></div></div>':
  '<div class="wa-qr"><div>'+(c.qr?'<img src="'+esc(c.qr)+'" alt="QR Code"/>':'<span class="wa-loader"></span>')+'</div><ol><li>Abra o WhatsApp no celular.</li><li>Vá em Aparelhos conectados.</li><li>Leia este QR Code.</li></ol></div><button class="wa-button primary full" id="waConnect">Gerar / atualizar QR</button><div class="wa-divider">ou</div><label>Telefone para pareamento<input id="waPairPhone" placeholder="11999999999"/></label>'+(c.pairingCode?'<div class="wa-pair">'+esc(c.pairingCode)+'</div>':'')+'<button class="wa-button secondary full" id="waPair">Gerar código de pareamento</button>')+'</section>'+
  '<section class="wa-panel wa-settings"><h3>Mensagem de teste</h3><p class="wa-note">Passa pela fila segura e pela lista de não contatar do WA.Auto.</p><label>Telefone<input id="waTestPhone" placeholder="11999999999"/></label><label>Mensagem<textarea id="waTestMessage">Olá! Esta é uma mensagem de teste do SheetsPredict via WA.Auto.</textarea></label><button class="wa-button primary full" id="waTest">Enviar teste</button></section></div>';
}
function eventRow(x){const lab={waiting:"Após último retorno",sending:"Enviando",sent:"Enviado",failed:"Falhou",uncertain:"Sem confirmação",blocked:"Não contatar",baseline:"Linha de base",covered_by_return:"Já coberto no retorno"};return'<div class="wa-history-row"><span>⚖</span><div><strong>'+esc(x.title||"Movimentação")+'</strong><small>'+esc(x.source||"")+' · '+esc(fmtDate(x.event_at))+'</small>'+(x.details?'<p>'+esc(String(x.details).slice(0,360))+'</p>':'')+'</div>'+badge(lab[x.send_status]||x.send_status||"—",x.send_status==="sent"?"valid":x.send_status==="waiting"?"pending":x.send_status==="blocked"?"blocked":"gray")+'</div>'}
function processes(){
  const d=S.data||{},sh=d.sheet||{},st=d.legal||{},ms=(d.monitors||[]).filter(m=>m.source_import_id==="sheetspredict"),ev=d.events||[];
  return hero("Acompanhamento processual","DataJud + DJEN do WA.Auto monitorando a carteira do SheetsPredict.",'<button class="wa-button secondary" id="waScan">↻ Verificar agora</button>')+
  '<div class="wa-stats">'+metric("⚖","teal","Monitorados",sh.monitored||ms.length,"SheetsPredict")+metric("↻","green","Última varredura",st.lastScan?fmtDate(st.lastScan):"—","DataJud e DJEN")+metric("!","amber","Pendentes",sh.waiting||0,"Depois do último retorno")+metric("✓","green","Enviados",st.sent||0,"WhatsApp")+'</div>'+
  '<div class="wa-legal-grid"><section class="wa-panel"><div class="wa-rule"><span>✓</span><div><strong>Regra de atualização</strong><p>Primeiro scan cria linha de base. Depois, somente evento DataJud/DJEN posterior ao último retorno entra na fila.</p></div></div>'+autoCard()+'</section><section class="wa-panel"><div class="wa-section-head"><div><h3>Processos monitorados</h3><p>'+ms.length+' vinculados</p></div></div><div class="wa-monitor-list">'+(ms.length?ms.slice(0,120).map(monitorRow).join(""):'<div class="wa-empty">Sincronize a carteira para criar os monitores.</div>')+'</div></section></div>'+
  '<div class="wa-section-head"><div><h3>Últimos eventos</h3><p>'+ev.length+' evento(s)</p></div></div>'+ev.slice(0,100).map(eventRow).join("");
}
function monitorRow(m){return'<div class="wa-monitor"><div><strong>'+esc(m.client_name||"Cliente")+'</strong><span class="mono">'+esc(fmtCnj(m.cnj))+'</span><small>+'+esc(m.phone)+' · '+(m.enabled?"ativo":"pausado")+' · último check '+esc(fmtDate(m.last_checked_at))+'</small><small>Último retorno: '+esc(fmtDate(m.last_return_at))+'</small>'+(m.last_event_text?'<p><b>'+esc(m.last_event_source||"")+'</b> · '+esc(m.last_event_text)+'</p>':'')+(m.error?'<em>'+esc(m.error)+'</em>':'')+'</div><div><button class="wa-button small secondary" data-wa-mscan="'+esc(m.id)+'">↻ Consultar</button><button class="wa-button small secondary" data-wa-mtoggle="'+esc(m.id)+'" data-on="'+(m.enabled?"1":"0")+'">'+(m.enabled?"Pausar":"Ativar")+'</button></div></div>'}
function history(){const ev=S.data?.events||[],cs=S.data?.campaigns||[];return hero("Histórico","Campanhas e atualizações processuais registradas no WA.Auto.")+'<div class="wa-grid"><section><div class="wa-section-head"><h3>Processos</h3></div>'+ev.slice(0,150).map(eventRow).join("")+'</section><section><div class="wa-section-head"><h3>Campanhas</h3></div>'+cs.slice(0,80).map(campaignRow).join("")+'</section></div>'}
function settings(){
  const sup=S.data?.suppressions||[];
  return hero("Configurações","Automação e lista de não contatar.",S.data?.sheet?.autoEnabled?badge("Automação ativa","valid"):badge("Automação desligada","gray"))+
  '<div class="wa-settings-grid"><section class="wa-panel wa-settings"><h3>Automação SheetsPredict → WA.Auto</h3>'+autoCard()+'</section><section class="wa-panel wa-settings"><h3>Lista de não contatar</h3><label>Telefone<input id="waBlockPhone" placeholder="11999999999"/></label><label>Motivo<input id="waBlockReason" placeholder="Solicitação do cliente"/></label><button class="wa-button danger full" id="waBlock">Bloquear contato</button><div class="wa-block-list">'+sup.map(x=>'<div><span><strong>'+esc(x.identity)+'</strong><small>'+esc(x.reason||"")+'</small></span><button class="wa-button small secondary" data-wa-unblock="'+esc(x.identity)+'">Remover</button></div>').join("")+'</div></section></div>';
}
function body(){return S.page==="whatsapp"?whatsapp():S.page==="clients"?clients():S.page==="history"?history():S.page==="processes"?processes():S.page==="settings"?settings():campaigns()}
function shell(){return'<div class="wa-shell"><div class="wa-brandbar"><div class="wa-brand"><span>W</span><div><strong>WA.Auto</strong><small>dentro do SheetsPredict</small></div></div>'+nav()+'</div>'+top()+'<div class="wa-page">'+(S.loading?'<div class="wa-loading"></div>':"")+body()+'</div></div>'}
function render(root,host={}){H={...H,...host};root.innerHTML=shell();bind(root);if(!S.data&&!S.loading)void refresh(root)}
async function refresh(root,quiet=false){if(S.loading)return;S.loading=true;render(root,H);try{S.data=await api("status")}catch(e){S.data={connection:{status:"disconnected"},campaigns:[],events:[],monitors:[],suppressions:[],sheet:{autoEnabled:false},legal:{}};if(!quiet)H.showBanner(e.message,"bad")}finally{S.loading=false;render(root,H)}}
async function busy(root,fn){if(S.busy)return;S.busy=true;try{await fn()}catch(e){H.showBanner(e.message,"bad")}finally{S.busy=false;await refresh(root,true)}}
async function syncRows(rows,clients,{root=null,quiet=false}={}){
  const p=portfolio(rows,clients),list=p.rows.filter(x=>!x.optOut),total={created:0,queued:0,covered:0,sentNow:0};if(!list.length)return total;
  for(let i=0;i<list.length;i+=200){S.progress="Sincronizando "+Math.min(i+200,list.length)+" / "+list.length;if(root)render(root,H);const r=await api("portfolio_sync",{rows:list.slice(i,i+200),mode:"both"});for(const k of Object.keys(total))total[k]+=Number(r[k]||0)}
  S.progress="";try{localStorage.setItem("wa_auto_sheet_sync",String(Date.now()))}catch{}
  if(!quiet)H.showBanner("WA.Auto: "+total.created+" processos sincronizados · "+total.queued+" novidade(s) · "+total.sentNow+" envio(s) imediato(s).","good");
  if(root)await refresh(root,true);return total;
}
async function backgroundSync(rows,clients){
  if(!navigator.onLine)return;const last=Number(localStorage.getItem("wa_auto_sheet_sync")||0);if(last&&Date.now()-last<20*60*1000)return;
  try{const d=await api("status");if(!d?.sheet?.autoEnabled)return;S.data=d;await syncRows(rows,clients,{quiet:true})}catch{}
}
function bind(root){
  root.querySelectorAll("[data-wa-page]").forEach(b=>b.onclick=()=>{S.page=b.dataset.waPage;render(root,H)});
  root.querySelector("#waRefresh")?.addEventListener("click",()=>refresh(root));
  root.querySelector("#waSearch")?.addEventListener("change",e=>{S.query=e.target.value;render(root,H)});
  root.querySelector("#waAuto")?.addEventListener("change",e=>busy(root,async()=>{await api("auto_settings",{autoEnabled:e.target.checked});if(e.target.checked)await syncRows(H.rows(),H.clients(),{root,quiet:true});H.showBanner(e.target.checked?"Automação do WA.Auto ativada.":"Automação do WA.Auto desligada.","good")}));
  root.querySelector("#waSync")?.addEventListener("click",()=>busy(root,()=>syncRows(H.rows(),H.clients(),{root})));
  root.querySelector("#waConnect")?.addEventListener("click",()=>busy(root,()=>api("connect")));
  root.querySelector("#waPair")?.addEventListener("click",()=>busy(root,()=>api("pair",{phone:root.querySelector("#waPairPhone")?.value})));
  root.querySelector("#waDisconnect")?.addEventListener("click",()=>busy(root,()=>api("disconnect")));
  root.querySelector("#waLogout")?.addEventListener("click",()=>busy(root,()=>api("logout")));
  root.querySelector("#waTest")?.addEventListener("click",()=>busy(root,()=>api("test_message",{phone:root.querySelector("#waTestPhone")?.value,message:root.querySelector("#waTestMessage")?.value})));
  root.querySelector("#waScan")?.addEventListener("click",()=>busy(root,()=>api("legal_scan")));
  root.querySelectorAll("[data-wa-mscan]").forEach(b=>b.onclick=()=>busy(root,()=>api("monitor_scan",{id:b.dataset.waMscan})));
  root.querySelectorAll("[data-wa-mtoggle]").forEach(b=>b.onclick=()=>busy(root,()=>api("monitor_toggle",{id:b.dataset.waMtoggle,enabled:b.dataset.on!=="1"})));
  root.querySelector("#waBlock")?.addEventListener("click",()=>busy(root,()=>api("suppress",{phone:root.querySelector("#waBlockPhone")?.value,reason:root.querySelector("#waBlockReason")?.value})));
  root.querySelectorAll("[data-wa-unblock]").forEach(b=>b.onclick=()=>busy(root,()=>api("unsuppress",{identity:b.dataset.waUnblock})));
}
w.WAAutoModule={render,refresh,syncRows,backgroundSync,buildPortfolio:portfolio,state:S};
})(window);
