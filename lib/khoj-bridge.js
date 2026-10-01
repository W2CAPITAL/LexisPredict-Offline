"use strict";

function privateHost(host){
  const h=String(host||"").toLowerCase();
  if(!h||h==="localhost"||h.endsWith(".local")||h==="0.0.0.0"||h==="::1")return true;
  if(/^127\./.test(h)||/^10\./.test(h)||/^192\.168\./.test(h)||/^169\.254\./.test(h))return true;
  const m=h.match(/^172\.(\d+)\./);if(m&&Number(m[1])>=16&&Number(m[1])<=31)return true;
  return /^\d+\.\d+\.\d+\.\d+$/.test(h)||/^\[?[0-9a-f:]+\]?$/i.test(h);
}
function config(){
  const raw=String(process.env.KHOJ_URL||"").trim();
  const token=String(process.env.KHOJ_TOKEN||process.env.KHOJ_API_TOKEN||"").trim();
  if(!raw||!token)return null;
  let base;try{base=new URL(raw)}catch{return null}
  if(base.protocol!=="https:"||privateHost(base.hostname))return null;
  base.pathname=base.pathname.replace(/\/$/,"");base.search="";base.hash="";
  return {base,token,agent:String(process.env.KHOJ_AGENT_SLUG||"").trim()};
}
function configured(){return !!config()}
function urlAt(base,path,query){
  const u=new URL(base.toString());const prefix=u.pathname.replace(/\/$/,"");
  u.pathname=(prefix&&prefix!=="/"?prefix:"")+path;u.search="";u.hash="";
  if(query)for(const [k,v] of Object.entries(query))if(v!=null&&String(v)!=="")u.searchParams.set(k,String(v));
  return u.toString();
}
async function json(url,init,timeoutMs=9000){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeoutMs);
  try{
    const r=await fetch(url,{...init,signal:ctrl.signal,cache:"no-store",redirect:"follow"});
    const raw=await r.text();let data={};try{data=raw?JSON.parse(raw):{}}catch{data={raw}}
    if(!r.ok)throw Object.assign(new Error("Khoj HTTP "+r.status+": "+String(data?.detail||data?.message||raw).slice(0,300)),{status:r.status});
    return data;
  }finally{clearTimeout(timer)}
}
async function ask(query,{client="sheetspredict",timeoutMs=10000}={}){
  const cfg=config();if(!cfg)throw Object.assign(new Error("Khoj não configurado."),{status:503,code:"KHOJ_NOT_CONFIGURED"});
  const headers={Authorization:"Bearer "+cfg.token,"Content-Type":"application/json",Accept:"application/json"};
  const session=await json(urlAt(cfg.base,"/api/chat/sessions",{client,agent_slug:cfg.agent||undefined}),{method:"POST",headers},Math.min(timeoutMs,6500));
  const conversationId=String(session?.conversation_id||"").trim();
  if(!conversationId)throw Object.assign(new Error("Khoj não retornou conversation_id."),{status:502,code:"KHOJ_SESSION_FAILED"});
  const data=await json(urlAt(cfg.base,"/api/chat",{client}),{
    method:"POST",headers,
    body:JSON.stringify({q:String(query||"").trim().slice(0,12000),conversation_id:conversationId,stream:false,n:7})
  },timeoutMs);
  const content=String(data?.response||"").trim();
  if(!content)throw Object.assign(new Error("Khoj retornou resposta vazia."),{status:502,code:"KHOJ_EMPTY"});
  return {content,references:Array.isArray(data?.references)?data.references.slice(0,12):[],conversationId};
}
module.exports={configured,ask};
