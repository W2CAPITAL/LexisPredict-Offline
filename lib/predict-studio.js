(function(global){
"use strict";
const S={
  tab:"chat",remote:null,remoteLoading:false,busy:false,
  chats:{chat:[],work:[],tutor:[]},
  legal:null,build:null,research:null,imagine:null,report:null,
  catalogQuery:"",catalogCategory:"",runtimeProgress:"",localProbe:null
};
const TABS=[
  ["chat","Chat"],["legal","Legal"],["build","Build"],["work","Work"],["tutor","Tutor"],
  ["research","Research"],["imagine","Imagine"],["report","Report"],
  ["skills","Skills"],["agents","Agentes"],["plugins","Plugins"],["motors","Motores"]
];
const e=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const qs=(root,s)=>root.querySelector(s),qsa=(root,s)=>[...root.querySelectorAll(s)];
const catalog=()=>global.PredictStudioCatalog||{skills:[],agents:[],surfaces:[],localRuntimes:[],cores:[],providers:[],fusionRepositories:[]};

async function api(payload){
  const r=await fetch("/api/predict-studio",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),cache:"no-store"});
  const j=await r.json().catch(()=>({ok:false,error:"Resposta inválida do Predict Studio."}));
  if(!r.ok||j.ok===false){const err=new Error(j.error||"Falha no Predict Studio.");err.status=r.status;err.code=j.code;throw err}
  return j;
}
function toast(host,msg,type="good"){host?.showBanner?.(msg,type)}
function context(host){try{return host?.context?.()||"{}"}catch{return"{}"}}
function user(host){try{return host?.user?.()||{}}catch{return{}}}
function download(name,content,type="text/plain;charset=utf-8"){
  const blob=content instanceof Blob?content:new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function badge(text,kind="gray"){return '<span class="badge b-'+kind+'">'+e(text)+'</span>'}
function statusPill(){
  if(S.remoteLoading)return badge("verificando","gray");
  if(S.remote?.ok)return badge("PredictLM conectado","good");
  return badge("PredictLM não conectado","warn");
}
function tabs(){
  return '<div class="predict-tabs">'+TABS.map(([id,name])=>'<button type="button" data-ps-tab="'+id+'" class="'+(S.tab===id?"active":"")+'">'+e(name)+'</button>').join("")+'</div>';
}
function shell(body){
  const c=catalog();
  return '<div class="predict-studio-shell"><div class="lexis-page-header"><div><span class="eyebrow">PREDICT STUDIO</span><h2>PredictLM dentro do SheetsPredict</h2><p>Chat, Legal, Build, Work, Tutor, Research, Imagine e Report com skills, agentes, plugins e runtimes federados.</p></div><div class="command-actions">'+statusPill()+'<button class="btn sm" id="psRefresh">Revalidar runtime</button></div></div>'+
    '<div class="predict-summary">'+badge(c.skills?.length+" skills","blue")+badge(c.agents?.length+" agentes","gray")+badge(c.fusionRepositories?.length+" fontes/plugin patterns","gray")+badge(c.localRuntimes?.length+" runtimes locais","gray")+'</div>'+
    tabs()+'<div class="predict-body">'+body+'</div></div>';
}
function remoteNotice(){
  if(S.remote?.ok)return"";
  return '<div class="banner warn"><strong>PredictLM remoto não está conectado.</strong> Configure <code>PREDICTLM_URL</code> e <code>PREDICTLM_ACCESS_TOKEN</code> na Vercel. Catálogos e runtimes locais opt-in continuam disponíveis.</div>';
}
function chatSurface(id,title,subtitle){
  const list=S.chats[id]||[];
  return remoteNotice()+'<section class="card ps-chat-card"><div class="card-head"><div><span class="eyebrow">'+e(id.toUpperCase())+'</span><h3>'+e(title)+'</h3></div><span class="cell-sub">'+e(subtitle)+'</span></div>'+
    '<div class="ps-chat-log">'+(list.length?list.map(m=>'<article class="ps-msg '+e(m.role)+'"><div class="ps-msg-meta">'+e(m.role==="user"?"Você":(m.provider||"PredictLM"))+'</div><div>'+e(m.content).replace(/\n/g,"<br>")+'</div></article>').join(""):'<div class="empty">Nenhuma conversa ainda.</div>')+'</div>'+
    '<div class="ps-compose"><textarea id="psPrompt" placeholder="'+(id==="work"?"Descreva o trabalho, estado atual e resultado esperado…":id==="tutor"?"O que você quer aprender ou praticar?":"Pergunte qualquer coisa ou peça uma análise da carteira…")+'"></textarea>'+
    '<div class="row between"><div class="ps-runtime-select"><label>Motor <select id="psEngine"><option value="remote">Predict Auto</option><option value="webllm">WebLLM local</option><option value="local">Runtime local</option></select></label><label class="hub-check"><input id="psDeep" type="checkbox"/> aprofundar</label></div><button class="btn primary" id="psSend">'+(S.busy?"Executando…":"Enviar")+'</button></div></div></section>';
}
function legalHtml(){
  const r=S.legal;
  return remoteNotice()+'<div class="ps-grid two"><section class="card"><div class="card-head"><div><span class="eyebrow">LEGAL</span><h3>Consulta processual PredictLM</h3></div></div><div class="hub-form"><label>CNJ<input id="psLegalCnj" placeholder="0000000-00.0000.0.00.0000"/></label><div class="row end"><button class="btn" id="psLegalDossier">Gerar dossiê HTML</button><button class="btn primary" id="psLegalRun">'+(S.busy?"Consultando…":"Consultar")+'</button></div></div></section>'+
  '<section class="card"><div class="card-head"><div><span class="eyebrow">RESULTADO</span><h3>Evidência e timeline</h3></div></div><div class="card-body ps-result">'+(r?renderLegalResult(r):'<div class="empty">Informe um CNJ para consultar o pipeline Legal do PredictLM.</div>')+'</div></section></div>';
}
function renderLegalResult(r){
  const data=r.result||r;
  const timeline=Array.isArray(data.timeline)?data.timeline:Array.isArray(data.events)?data.events:[];
  const summary=data.summary||data.explanation||data.presentation||"";
  return (summary?'<p class="ps-lead">'+e(typeof summary==="string"?summary:JSON.stringify(summary))+'</p>':'')+
    (timeline.length?'<div class="ps-timeline">'+timeline.slice(0,80).map((x,i)=>'<div class="ps-timeline-row"><span>'+e(String(i+1))+'</span><div><strong>'+e(x.title||x.name||x.tipo||x.event||"Evento")+'</strong><small>'+e(x.date||x.data||x.dataHora||"")+'</small><p>'+e(x.description||x.text||x.descricao||"")+'</p></div></div>').join("")+'</div>':
    '<pre class="ps-json">'+e(JSON.stringify(data,null,2).slice(0,24000))+'</pre>');
}
function buildHtml(){
  const r=S.build;
  return remoteNotice()+'<div class="ps-grid two"><section class="card"><div class="card-head"><div><span class="eyebrow">BUILD</span><h3>Agentic Build</h3></div></div><div class="hub-form"><label>Objetivo<textarea id="psBuildPrompt" placeholder="Crie um novo projeto ou descreva uma alteração completa…"></textarea></label><label class="hub-check"><input id="psBuildDeep" type="checkbox" checked/> explorer → architect → implementer → review → verify</label><button class="btn primary" id="psBuildRun">'+(S.busy?"Construindo…":"Executar Build")+'</button><p class="field-hint">O Build usa o pipeline real do PredictLM. Nesta superfície ele gera/edita um workspace de saída; não altera o repositório do SheetsPredict automaticamente.</p></div></section>'+
  '<section class="card"><div class="card-head"><div><span class="eyebrow">OUTPUT</span><h3>Plano, revisão e arquivos</h3></div>'+(r?'<button class="btn sm" id="psBuildDownload">Baixar JSON</button>':'')+'</div><div class="card-body ps-result">'+(r?renderBuildResult(r):'<div class="empty">O resultado do Agent Fabric aparecerá aqui.</div>')+'</div></section></div>';
}
function renderBuildResult(r){
  const plan=Array.isArray(r.plan)?r.plan:[],files=Array.isArray(r.files)?r.files:[],a=r.agentic||{};
  return '<div class="ps-result-kpis">'+badge(files.length+" arquivos","blue")+badge((a.roles||[]).length+" agentes","gray")+badge(a.review?.approved===true?"review aprovado":a.review?.approved===false?"review reprovado":"review pendente",a.review?.approved===true?"good":a.review?.approved===false?"bad":"gray")+'</div>'+
    (r.explanation?'<p class="ps-lead">'+e(r.explanation)+'</p>':'')+
    (plan.length?'<ol class="ps-plan">'+plan.map(x=>'<li>'+e(x)+'</li>').join("")+'</ol>':'')+
    (files.length?'<div class="ps-file-list">'+files.map(f=>'<details><summary>'+e(f.path)+'</summary><pre>'+e(String(f.content||"").slice(0,16000))+'</pre></details>').join("")+'</div>':'')+
    (a.review?.issues?.length?'<div class="banner warn">'+a.review.issues.map(x=>'<div><strong>'+e(x.severity||"issue")+'</strong> · '+e(x.file||"")+' · '+e(x.issue||"")+'</div>').join("")+'</div>':'');
}
function researchHtml(){
  const r=S.research,items=r?.web||[];
  return remoteNotice()+'<div class="ps-grid two"><section class="card"><div class="card-head"><div><span class="eyebrow">RESEARCH</span><h3>Deep Research Tree</h3></div></div><div class="hub-form"><label>Pergunta<textarea id="psResearchQuery" placeholder="Pesquise e compare usando fontes confiáveis…"></textarea></label><label>Profundidade<select id="psResearchDepth"><option value="fast">Fast</option><option value="balanced" selected>Balanced</option><option value="comprehensive">Comprehensive</option></select></label><button class="btn primary" id="psResearchRun">'+(S.busy?"Pesquisando…":"Pesquisar")+'</button></div></section>'+
    '<section class="card"><div class="card-head"><div><span class="eyebrow">EVIDÊNCIA</span><h3>Fontes recuperadas</h3></div></div><div class="card-body ps-result">'+(r?'<div class="ps-result-kpis">'+badge(r.provider||"provider","gray")+badge(items.length+" fontes","blue")+badge(r.researchDepth||"","gray")+'</div>'+items.slice(0,16).map(x=>'<article class="ps-source"><strong>'+e(x.title||x.name||x.url||"Fonte")+'</strong><small>'+e(x.site||x.source||x.url||"")+'</small><p>'+e(x.summary||x.description||"")+'</p></article>').join(""):'<div class="empty">Resultados e cobertura aparecem aqui.</div>')+'</div></section></div>';
}
function imagineHtml(){
  const r=S.imagine;
  return remoteNotice()+'<div class="ps-grid two"><section class="card"><div class="card-head"><div><span class="eyebrow">IMAGINE</span><h3>Imagem com grounding</h3></div></div><div class="hub-form"><label>Descrição<textarea id="psImaginePrompt" placeholder="Descreva literalmente a imagem desejada…"></textarea></label><div class="grid-2"><label>Modo<select id="psImagineMode"><option value="auto">Auto</option><option value="literal">Literal</option><option value="imagine">Imagine</option></select></label><label>Estilo<input id="psImagineStyle" value="Cinematic"/></label></div><button class="btn primary" id="psImagineRun">'+(S.busy?"Gerando…":"Gerar imagem")+'</button></div></section>'+
  '<section class="card"><div class="card-head"><div><span class="eyebrow">RESULTADO</span><h3>Imagem validada</h3></div></div><div class="card-body ps-media-result">'+(r?.url?'<img src="'+e(r.url)+'" alt="'+e(r.displayTitle||"Imagem gerada")+'"/><div class="ps-result-kpis">'+badge(r.provider||"provider","gray")+badge(r.model||"model","gray")+badge(r.promptMode||"auto","blue")+'</div><p>'+e(r.caption||"")+'</p>':r?'<pre class="ps-json">'+e(JSON.stringify(r,null,2))+'</pre>':'<div class="empty">Nenhuma imagem gerada.</div>')+'</div></section></div>';
}
function reportHtml(){
  const r=S.report;
  return remoteNotice()+'<div class="ps-grid report"><section class="card"><div class="card-head"><div><span class="eyebrow">REPORT ARCHITECT</span><h3>Relatório universal</h3></div></div><div class="hub-form"><label>Objetivo<textarea id="psReportRequest" placeholder="Crie um relatório executivo sobre…"></textarea></label><label>Material / contexto<textarea id="psReportSource" placeholder="Cole dados, fatos, observações ou deixe o contexto da carteira complementar a análise."></textarea></label><div class="grid-2"><label>Classificação<select id="psReportClass"><option value="confidencial">Confidencial</option><option value="interno">Interno</option><option value="restrito">Restrito</option><option value="publico">Público</option></select></label><label class="hub-check"><input id="psReportCouncil" type="checkbox"/> Council X10</label></div><button class="btn primary" id="psReportRun">'+(S.busy?"Gerando…":"Gerar Report")+'</button></div></section>'+
  '<section class="card ps-report-output"><div class="card-head"><div><span class="eyebrow">ARTEFATO</span><h3>Preview</h3></div>'+(r?.html?'<button class="btn sm" id="psReportDownload">Baixar HTML</button>':'')+'</div><div class="card-body">'+(r?.html?'<div class="ps-result-kpis">'+badge("qualidade "+(r.quality?.score??"—"),(r.quality?.score||0)>=85?"good":"warn")+badge(r.blueprint?.label||r.blueprint?.kind||"report","gray")+badge(r.brains?.councilX10?"Council X10":"Chair","blue")+'</div><iframe class="ps-report-frame" sandbox="" title="Preview do relatório"></iframe>':r?'<pre class="ps-json">'+e(JSON.stringify(r,null,2))+'</pre>':'<div class="empty">O Report Architect gera HTML + Markdown com quality gate.</div>')+'</div></section></div>';
}
function catalogToolbar(kind){
  const c=catalog(),skills=c.skills||[],cats=[...new Set(skills.map(x=>x.category).filter(Boolean))].sort();
  return '<div class="ps-catalog-toolbar"><label class="search-field"><input id="psCatalogSearch" type="search" placeholder="Buscar '+kind+'…" value="'+e(S.catalogQuery)+'"/></label>'+(kind==="skills"?'<select id="psCatalogCategory"><option value="">Todas as categorias</option>'+cats.map(x=>'<option '+(S.catalogCategory===x?"selected":"")+'>'+e(x)+'</option>').join("")+'</select>':'')+'</div>';
}
function skillsHtml(){
  const c=catalog(),q=S.catalogQuery.toLowerCase(),cat=S.catalogCategory;
  const list=(c.skills||[]).filter(x=>(!cat||x.category===cat)&&(!q||[x.id,x.name,x.category,x.description,x.source,x.runtime].join(" ").toLowerCase().includes(q)));
  return '<section class="card"><div class="card-head"><div><span class="eyebrow">SKILL FEDERATION</span><h3>'+list.length+' / '+(c.skills||[]).length+' skills do PredictLM</h3></div><span class="cell-sub">Snapshot '+e(c.source?.commit?.slice(0,8)||"")+'</span></div>'+catalogToolbar("skills")+'<div class="ps-catalog-grid">'+list.map(x=>'<article class="ps-cap-card"><div><strong>'+e(x.name)+'</strong>'+badge(x.runtime,x.runtime==="built-in"?"good":x.runtime==="bridge"?"warn":"gray")+'</div><small>'+e(x.category)+' · '+e(x.id)+'</small><p>'+e(x.description||"")+'</p><code>'+e(x.source||"")+'</code></article>').join("")+'</div></section>';
}
function agentsHtml(){
  const c=catalog(),roles=c.agents||[];
  const descriptions={
    explorer:"inspeciona código/contexto antes da mudança",architect:"define arquitetura e plano executável",implementer:"produz alterações",researcher:"busca evidência",reviewer:"revisa aderência e regressões","test-analyst":"testes e estados","security-reviewer":"segurança e segredos","visual-director":"composição visual","identity-reviewer":"fidelidade de identidade","game-producer":"escopo e produção","game-designer":"sistemas de jogo","game-technical-director":"arquitetura técnica","game-art-director":"direção visual","gameplay-specialist":"mecânicas","playtest-reviewer":"evidência de playtest",verifier:"gate final verificável"
  };
  return '<div class="ps-grid two"><section class="card"><div class="card-head"><div><span class="eyebrow">AGENT FABRIC</span><h3>'+roles.length+' papéis orquestrados</h3></div></div><div class="ps-catalog-grid agents">'+roles.map(r=>'<article class="ps-cap-card"><strong>'+e(r)+'</strong><p>'+e(descriptions[r]||"papel especializado do Agent Fabric")+'</p></article>').join("")+'</div></section>'+
  '<section class="card"><div class="card-head"><div><span class="eyebrow">FOUR-CORE CONTROL</span><h3>Controladores neurais</h3></div></div><div class="ps-core-list">'+(c.cores||[]).map(x=>'<div><strong>'+e(x.name||x.id)+'</strong><span>'+e(x.reference||"")+'</span></div>').join("")+'</div><div class="card-body"><p class="hub-note">São controladores de software informados por referências neurocientíficas; não são mentes biológicas simuladas.</p></div></section></div>';
}
function pluginsHtml(){
  const c=catalog(),q=S.catalogQuery.toLowerCase();
  const connectors=(c.skills||[]).filter(x=>x.runtime==="bridge"||x.runtime==="external").filter(x=>!q||[x.id,x.name,x.source].join(" ").toLowerCase().includes(q));
  const repos=(c.fusionRepositories||[]).filter(x=>!q||x.toLowerCase().includes(q));
  return '<section class="card"><div class="card-head"><div><span class="eyebrow">PLUGIN / CAPABILITY FABRIC</span><h3>Adapters e fontes de capacidade</h3></div><span class="cell-sub">Ativo ≠ instalado; status depende do runtime/configuração.</span></div>'+catalogToolbar("plugins")+
  '<div class="ps-plugin-columns"><div><h4>Adapters declarados</h4>'+connectors.map(x=>'<article class="ps-plugin-row"><strong>'+e(x.name)+'</strong><span>'+e(x.runtime)+' · '+e(x.id)+'</span></article>').join("")+'</div><div><h4>Fusion registry · '+repos.length+' repositórios</h4>'+repos.map(x=>'<article class="ps-plugin-row"><strong>'+e(x)+'</strong><span>arquitetura/referência/adaptação governada por licença</span></article>').join("")+'</div></div></section>';
}
function motorsHtml(){
  const c=catalog(),rt=global.PredictRuntime?.status?.()||{},local=rt.local||{};
  return '<div class="ps-grid two"><section class="card"><div class="card-head"><div><span class="eyebrow">PROVIDER MESH</span><h3>Motores remotos</h3></div><button class="btn sm" id="psMotorRefresh">Revalidar</button></div><div class="ps-chip-cloud">'+(c.providers||[]).map(x=>badge(x,"gray")).join("")+'</div><div class="card-body"><p class="hub-note">A ordem é task-aware e health-aware no PredictLM. O SheetsPredict não recebe as chaves dos providers.</p></div></section>'+
  '<section class="card"><div class="card-head"><div><span class="eyebrow">WEBLLM / WEBGPU</span><h3>Neural local no navegador</h3></div>'+badge(rt.webllm?.loaded?(rt.webllm.model||"carregado"):"descarregado",rt.webllm?.loaded?"good":"gray")+'</div><div class="hub-form"><label>Tier<select id="psWebllmTier"><option value="auto">Auto pelo hardware</option><option value="lite">Lite · Qwen3 1.7B</option><option value="smart">Smart · Qwen3.5 4B</option><option value="power">Power · Qwen3.5 9B</option></select></label><div class="row end"><button class="btn" id="psWebllmDetect">Detectar hardware</button><button class="btn" id="psWebllmUnload">Descarregar</button><button class="btn primary" id="psWebllmLoad">Carregar</button></div><p class="field-hint">'+e(S.runtimeProgress||"Nada é baixado automaticamente. Carregamento é opt-in e pode consumir vários GB.")+'</p></div></section>'+
  '<section class="card"><div class="card-head"><div><span class="eyebrow">LOCAL RUNTIME ROUTER</span><h3>FreeLLMAPI / Ollama / OpenAI-compatible</h3></div>'+badge(S.localProbe?.available?"online":local.baseUrl?"configurado":"não configurado",S.localProbe?.available?"good":local.baseUrl?"warn":"gray")+'</div><div class="hub-form"><div class="grid-2"><label>Tipo<select id="psLocalKind"><option value="openai" '+(local.kind!=="ollama"?"selected":"")+'>OpenAI-compatible</option><option value="ollama" '+(local.kind==="ollama"?"selected":"")+'>Ollama</option></select></label><label>Modelo<input id="psLocalModel" value="'+e(local.model||"")+'" placeholder="auto / nome do modelo"/></label></div><label>Base URL<input id="psLocalBase" value="'+e(local.baseUrl||"")+'" placeholder="http://127.0.0.1:3001"/></label><label>Token local (opcional)<input id="psLocalToken" type="password" value="'+e(local.token||"")+'" autocomplete="off"/></label><div class="row end"><button class="btn" id="psLocalProbe">Salvar e testar</button></div><p class="field-hint">Não há varredura automática de portas. Loopback ou HTTPS apenas.</p></div></section>'+
  '<section class="card"><div class="card-head"><div><span class="eyebrow">RUNTIME FEDERATION</span><h3>Catálogo local</h3></div></div><div class="ps-runtime-list">'+(c.localRuntimes||[]).map(x=>'<div><strong>'+e(x.name)+'</strong><span>'+e(x.model||"")+' · '+e(x.kind||"")+(x.vramMB?" · ~"+Math.round(x.vramMB/1024*10)/10+" GB":"")+'</span></div>').join("")+'</div></section></div>';
}
function body(){
  if(S.tab==="chat")return chatSurface("chat","Chat","IA geral + carteira + skills");
  if(S.tab==="work")return chatSurface("work","Work","continuidade, execução e critérios de conclusão");
  if(S.tab==="tutor")return chatSurface("tutor","Tutor","mastery learning e prática ativa");
  if(S.tab==="legal")return legalHtml();
  if(S.tab==="build")return buildHtml();
  if(S.tab==="research")return researchHtml();
  if(S.tab==="imagine")return imagineHtml();
  if(S.tab==="report")return reportHtml();
  if(S.tab==="skills")return skillsHtml();
  if(S.tab==="agents")return agentsHtml();
  if(S.tab==="plugins")return pluginsHtml();
  if(S.tab==="motors")return motorsHtml();
  return chatSurface("chat","Chat","");
}
function render(container,host={}){
  if(!container)return;
  container.innerHTML=shell(body());
  qsa(container,"[data-ps-tab]").forEach(b=>b.onclick=()=>{S.tab=b.dataset.psTab;render(container,host)});
  qs(container,"#psRefresh")?.addEventListener("click",()=>loadRemote(container,host,true));
  bind(container,host);
  if(!S.remote&&!S.remoteLoading)void loadRemote(container,host);
  if(S.tab==="report"&&S.report?.html){
    const frame=qs(container,".ps-report-frame");if(frame)frame.srcdoc=S.report.html;
  }
}
async function loadRemote(container,host,force=false){
  if(S.remoteLoading&&!force)return;S.remoteLoading=true;render(container,host);
  try{S.remote=await api({action:"status",surface:S.tab==="build"?"build":S.tab==="research"?"research":S.tab==="imagine"?"media":"chat"})}
  catch(err){S.remote={ok:false,error:err.message,code:err.code}}
  finally{S.remoteLoading=false;render(container,host)}
}
async function sendChat(container,host,id){
  if(S.busy)return;const prompt=String(qs(container,"#psPrompt")?.value||"").trim();if(!prompt)return;
  const deep=!!qs(container,"#psDeep")?.checked,engine=qs(container,"#psEngine")?.value||"remote";
  S.chats[id].push({role:"user",content:prompt});S.busy=true;render(container,host);
  try{
    let result;
    const msgs=S.chats[id].slice(-10).map(x=>({role:x.role,content:x.content}));
    if(engine==="webllm"){
      const sys=id==="work"?"WORK MODE: preserve continuidade e critérios de conclusão.":id==="tutor"?"TUTOR MODE: probe, teach/practice, assess, review.":"Você é o Predict Studio local dentro do SheetsPredict.";
      result=await global.PredictRuntime.webllmGenerate([{role:"system",content:sys},{role:"user",content:prompt}],{maxTokens:deep?1200:800,temperature:deep?.28:.4});
    }else if(engine==="local"){
      const sys=id==="work"?"WORK MODE: preserve continuidade e critérios de conclusão.":id==="tutor"?"TUTOR MODE: probe, teach/practice, assess, review.":"Você é o Predict Studio local dentro do SheetsPredict.";
      result=await global.PredictRuntime.localGenerate([{role:"system",content:sys},...msgs],{deep});
    }else{
      result=await api({action:id,prompt,deep,messages:msgs,context:context(host),sessionId:String(user(host)?.usuario||user(host)?.nome||"sheetspredict")});
    }
    S.chats[id].push({role:"assistant",content:result.content||result.answer||"Sem conteúdo.",provider:result.provider||result.model||result.engine||"PredictLM"});
  }catch(err){S.chats[id].push({role:"assistant",content:"Falha: "+err.message,provider:"Predict Studio"})}
  finally{S.busy=false;render(container,host)}
}
async function run(container,host,fn){
  if(S.busy)return;S.busy=true;render(container,host);
  try{await fn()}catch(err){toast(host,err.message||String(err),"bad")}
  finally{S.busy=false;render(container,host)}
}
function bind(container,host){
  qs(container,"#psSend")?.addEventListener("click",()=>sendChat(container,host,S.tab));
  qs(container,"#psLegalRun")?.addEventListener("click",()=>run(container,host,async()=>{S.legal=await api({action:"legal",cnj:qs(container,"#psLegalCnj")?.value})}));
  qs(container,"#psLegalDossier")?.addEventListener("click",()=>run(container,host,async()=>{const j=await api({action:"legal_dossier",cnj:qs(container,"#psLegalCnj")?.value});if(j.html)download("dossie-predictlm.html",j.html,"text/html;charset=utf-8")}));
  qs(container,"#psBuildRun")?.addEventListener("click",()=>run(container,host,async()=>{S.build=await api({action:"build",prompt:qs(container,"#psBuildPrompt")?.value,deep:!!qs(container,"#psBuildDeep")?.checked})}));
  qs(container,"#psBuildDownload")?.addEventListener("click",()=>download("predict-build.json",JSON.stringify(S.build,null,2),"application/json"));
  qs(container,"#psResearchRun")?.addEventListener("click",()=>run(container,host,async()=>{S.research=await api({action:"research",query:qs(container,"#psResearchQuery")?.value,depth:qs(container,"#psResearchDepth")?.value})}));
  qs(container,"#psImagineRun")?.addEventListener("click",()=>run(container,host,async()=>{S.imagine=await api({action:"imagine",prompt:qs(container,"#psImaginePrompt")?.value,promptMode:qs(container,"#psImagineMode")?.value,style:qs(container,"#psImagineStyle")?.value})}));
  qs(container,"#psReportRun")?.addEventListener("click",()=>run(container,host,async()=>{S.report=await api({action:"report",request:qs(container,"#psReportRequest")?.value,sourceText:[qs(container,"#psReportSource")?.value,context(host)].filter(Boolean).join("\n\n"),council:!!qs(container,"#psReportCouncil")?.checked,classification:qs(container,"#psReportClass")?.value,author:String(user(host)?.nome||user(host)?.usuario||"SheetsPredict")})}));
  qs(container,"#psReportDownload")?.addEventListener("click",()=>download("sheetspredict-report.html",S.report?.html||"","text/html;charset=utf-8"));
  const search=qs(container,"#psCatalogSearch");if(search)search.oninput=ev=>{S.catalogQuery=ev.target.value;render(container,host);const n=qs(container,"#psCatalogSearch");if(n){n.focus();n.setSelectionRange(S.catalogQuery.length,S.catalogQuery.length)}};
  const cat=qs(container,"#psCatalogCategory");if(cat)cat.onchange=ev=>{S.catalogCategory=ev.target.value;render(container,host)};
  qs(container,"#psMotorRefresh")?.addEventListener("click",()=>loadRemote(container,host,true));
  qs(container,"#psWebllmDetect")?.addEventListener("click",()=>run(container,host,async()=>{const h=await global.PredictRuntime.detectHardware();S.runtimeProgress=h.webgpu?"WebGPU · "+h.cores+" cores · RAM hint "+h.memoryGB+" GB · "+h.reason:h.reason}));
  qs(container,"#psWebllmLoad")?.addEventListener("click",()=>run(container,host,async()=>{const tier=qs(container,"#psWebllmTier")?.value||"auto";await global.PredictRuntime.loadWebLLM(tier,p=>{S.runtimeProgress=p.status+(p.progress!=null?" · "+Math.round(p.progress)+"%":"");const hint=qs(container,".field-hint");if(hint)hint.textContent=S.runtimeProgress});S.runtimeProgress="WebLLM pronto."}));
  qs(container,"#psWebllmUnload")?.addEventListener("click",()=>run(container,host,async()=>{await global.PredictRuntime.unloadWebLLM();S.runtimeProgress="WebLLM descarregado."}));
  qs(container,"#psLocalProbe")?.addEventListener("click",()=>run(container,host,async()=>{global.PredictRuntime.saveLocalConfig({kind:qs(container,"#psLocalKind")?.value,baseUrl:qs(container,"#psLocalBase")?.value,model:qs(container,"#psLocalModel")?.value,token:qs(container,"#psLocalToken")?.value});S.localProbe=await global.PredictRuntime.probeLocal();if(!S.localProbe.available)throw new Error(S.localProbe.error||"Runtime local não respondeu.");toast(host,"Runtime local conectado.","good")}));
}
global.PredictStudio={render,state:S,api};
})(window);
