(function(global){
"use strict";
const WEBLLM_VERSION="0.2.85";
const WEBLLM_URL="https://esm.run/@mlc-ai/web-llm@"+WEBLLM_VERSION;
const PREF_KEY="sheetspredict_predict_runtime_v1";
const WEBLLM_MODELS={
  lite:{id:"Qwen3-1.7B-q4f16_1-MLC",vramMB:2037},
  smart:{id:"Qwen3.5-4B-q4f16_1-MLC",vramMB:3868},
  power:{id:"Qwen3.5-9B-q4f16_1-MLC",vramMB:6433}
};
let engine=null,loadedTier=null,loading=false,lastError="";

function readConfig(){try{return JSON.parse(localStorage.getItem(PREF_KEY)||"{}")||{}}catch{return{}}}
function writeConfig(value){try{localStorage.setItem(PREF_KEY,JSON.stringify(value||{}))}catch{}}
function loopback(host){
  const h=String(host||"").toLowerCase().replace(/^\[|\]$/g,"");
  return h==="localhost"||h==="::1"||/^127\./.test(h);
}
function safeLocalUrl(raw){
  let u;try{u=new URL(String(raw||"").trim())}catch{return null}
  if(!loopback(u.hostname)&&u.protocol!=="https:")return null;
  if(!["http:","https:"].includes(u.protocol))return null;
  u.pathname=u.pathname.replace(/\/$/,"");u.search="";u.hash="";
  return u;
}
function join(base,path){const u=new URL(base.toString());u.pathname=u.pathname.replace(/\/$/,"")+path;u.search="";u.hash="";return u.toString()}
async function fetchTimeout(url,opts={},ms=8000){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),ms);
  try{return await fetch(url,{...opts,signal:ctrl.signal,cache:"no-store"})}finally{clearTimeout(timer)}
}
async function detectHardware(){
  const cores=Number(navigator.hardwareConcurrency||0),memoryGB=Number(navigator.deviceMemory||0);
  if(!navigator.gpu)return{webgpu:false,cores,memoryGB,recommended:null,reason:"WebGPU indisponível"};
  let adapter=null;try{adapter=await navigator.gpu.requestAdapter()}catch{}
  if(!adapter)return{webgpu:false,cores,memoryGB,recommended:null,reason:"Nenhum adaptador WebGPU"};
  const recommended=memoryGB>=16&&cores>=8?"power":memoryGB>=8&&cores>=4?"smart":"lite";
  return{webgpu:true,cores,memoryGB,recommended,reason:recommended==="power"?"9B → 4B → 1.7B":recommended==="smart"?"4B → 1.7B":"1.7B"};
}
async function importWebLLM(){
  if(global.__sheetspredictWebLLM)return global.__sheetspredictWebLLM;
  if(global.__sheetspredictWebLLMLoading)return global.__sheetspredictWebLLMLoading;
  global.__sheetspredictWebLLMLoading=new Promise((resolve,reject)=>{
    const id="sheetspredict-webllm-"+WEBLLM_VERSION.replace(/\W/g,"-");
    const existing=document.getElementById(id);
    const ready=()=>global.__sheetspredictWebLLM?resolve(global.__sheetspredictWebLLM):reject(new Error("WebLLM não inicializou."));
    if(existing){existing.addEventListener("load",ready,{once:true});setTimeout(ready,200);return}
    const script=document.createElement("script");script.id=id;script.type="module";
    script.textContent='import * as WebLLM from '+JSON.stringify(WEBLLM_URL)+';window.__sheetspredictWebLLM=WebLLM;window.dispatchEvent(new Event("sheetspredict:webllm-ready"));';
    const timeout=setTimeout(()=>reject(new Error("Timeout ao carregar WebLLM.")),30000);
    global.addEventListener("sheetspredict:webllm-ready",()=>{clearTimeout(timeout);ready()},{once:true});
    script.onerror=()=>{clearTimeout(timeout);reject(new Error("Falha ao importar WebLLM."))};
    document.head.appendChild(script);
  }).finally(()=>{global.__sheetspredictWebLLMLoading=null});
  return global.__sheetspredictWebLLMLoading;
}
async function loadWebLLM(tier="auto",onProgress){
  if(loading)throw new Error("Já existe um modelo WebLLM carregando.");
  const profile=await detectHardware();
  if(!profile.webgpu)throw new Error(profile.reason);
  const order=tier==="auto"
    ? profile.recommended==="power"?["power","smart","lite"]:profile.recommended==="smart"?["smart","lite"]:["lite"]
    : [tier];
  loading=true;lastError="";
  try{
    const mod=await importWebLLM();let last=null;
    for(const candidate of order){
      const spec=WEBLLM_MODELS[candidate];if(!spec)continue;
      try{
        onProgress?.({status:"Carregando "+spec.id,progress:null});
        const next=await mod.CreateMLCEngine(spec.id,{initProgressCallback:r=>onProgress?.({status:String(r?.text||"Carregando"),progress:Number.isFinite(Number(r?.progress))?Number(r.progress)*100:null})});
        const probe=await next.chat.completions.create({messages:[{role:"user",content:"Responda apenas OK."}],temperature:0,max_tokens:8,stream:false});
        if(!String(probe?.choices?.[0]?.message?.content||"").trim())throw new Error("Self-test vazio.");
        if(engine&&engine!==next)try{await engine.unload?.()}catch{}
        engine=next;loadedTier=candidate;
        const cfg=readConfig();writeConfig({...cfg,webllmTier:candidate});
        onProgress?.({status:"Pronto · "+spec.id,progress:100});
        return{tier:candidate,model:spec.id,profile};
      }catch(e){last=e;try{await engine?.unload?.()}catch{}engine=null;loadedTier=null}
    }
    throw last||new Error("Nenhum tier WebLLM carregou.");
  }catch(e){lastError=e?.message||String(e);throw e}finally{loading=false}
}
async function unloadWebLLM(){
  if(engine)try{await engine.unload?.()}catch{}
  engine=null;loadedTier=null;return true;
}
async function webllmGenerate(messages,{maxTokens=900,temperature=.35}={}){
  if(!engine)throw new Error("WebLLM não está carregado.");
  const result=await engine.chat.completions.create({messages,temperature,max_tokens:maxTokens,stream:false});
  const content=String(result?.choices?.[0]?.message?.content||"").trim();
  if(!content)throw new Error("WebLLM retornou resposta vazia.");
  return{content,provider:"webllm",model:WEBLLM_MODELS[loadedTier]?.id||loadedTier};
}
function localConfig(){
  const c=readConfig().local||{};
  return{kind:["openai","ollama"].includes(c.kind)?c.kind:"openai",baseUrl:String(c.baseUrl||""),model:String(c.model||""),token:String(c.token||"")};
}
function saveLocalConfig(config){
  const kind=config?.kind==="ollama"?"ollama":"openai";
  const base=safeLocalUrl(config?.baseUrl);
  if(!base)throw new Error("Use localhost/127.0.0.1 ou HTTPS para o runtime local.");
  const cfg=readConfig();writeConfig({...cfg,local:{kind,baseUrl:base.toString().replace(/\/$/,""),model:String(config?.model||"").trim(),token:String(config?.token||"").trim()}});
  return localConfig();
}
async function probeLocal(){
  const c=localConfig(),base=safeLocalUrl(c.baseUrl);if(!base)return{configured:false,available:false,error:"Runtime local não configurado."};
  try{
    if(c.kind==="ollama"){
      const r=await fetchTimeout(join(base,"/api/tags"),{},5000),j=await r.json().catch(()=>({}));
      return{configured:true,available:r.ok,kind:c.kind,baseUrl:base.origin,models:(j.models||[]).map(x=>x.name).slice(0,20),status:r.status};
    }
    const r=await fetchTimeout(join(base,"/v1/models"),{headers:c.token?{Authorization:"Bearer "+c.token}:{}},5000),j=await r.json().catch(()=>({}));
    return{configured:true,available:r.ok,kind:c.kind,baseUrl:base.origin,models:(j.data||[]).map(x=>x.id).slice(0,20),status:r.status};
  }catch(e){return{configured:true,available:false,kind:c.kind,baseUrl:base.origin,error:e?.message||String(e)}}
}
async function localGenerate(messages,{deep=false}={}){
  const c=localConfig(),base=safeLocalUrl(c.baseUrl);if(!base)throw new Error("Runtime local não configurado.");
  const clean=(Array.isArray(messages)?messages:[]).filter(x=>x&&["system","user","assistant"].includes(x.role)&&String(x.content||"").trim()).slice(-14);
  if(c.kind==="ollama"){
    const model=c.model||"";
    if(!model)throw new Error("Informe o modelo do Ollama.");
    const r=await fetchTimeout(join(base,"/api/chat"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model,messages:clean,stream:false,options:{temperature:deep?.28:.45,num_predict:deep?900:600}})},35000);
    const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||("Ollama HTTP "+r.status));
    const content=String(j?.message?.content||j?.response||"").trim();if(!content)throw new Error("Ollama retornou vazio.");
    return{content,provider:"ollama-local",model:j.model||model};
  }
  const model=c.model||"auto";
  const r=await fetchTimeout(join(base,"/v1/chat/completions"),{method:"POST",headers:{"Content-Type":"application/json",...(c.token?{Authorization:"Bearer "+c.token}:{})},body:JSON.stringify({model,messages:clean,stream:false,temperature:deep?.28:.45,max_tokens:deep?900:600})},35000);
  const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j?.error?.message||j.error||("Local HTTP "+r.status));
  const content=String(j?.choices?.[0]?.message?.content||j?.response||"").trim();if(!content)throw new Error("Runtime local retornou vazio.");
  return{content,provider:"openai-local",model:j.model||model};
}
function status(){
  return{webllm:{loaded:!!engine,tier:loadedTier,model:loadedTier?WEBLLM_MODELS[loadedTier]?.id:null,loading,lastError},local:localConfig()};
}
global.PredictRuntime={WEBLLM_MODELS,detectHardware,loadWebLLM,unloadWebLLM,webllmGenerate,localConfig,saveLocalConfig,probeLocal,localGenerate,status};
})(window);
