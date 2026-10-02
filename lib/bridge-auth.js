const crypto=require("node:crypto");

const COOKIE_NAME="lexis_session";
const SESSION_TTL_MS=8*60*60*1000;

function parseCookies(req){
  const out={};
  String(req?.headers?.cookie||"").split(";").forEach(part=>{
    const i=part.indexOf("=");
    if(i<=0)return;
    out[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1).trim());
  });
  return out;
}
function appsScriptUrl(){
  const raw=String(process.env.LEXIS_APPS_SCRIPT_URL||"").trim();
  if(!raw)throw new Error("LEXIS_APPS_SCRIPT_URL ausente");
  const u=new URL(raw);
  if(u.protocol!=="https:"||u.hostname!=="script.google.com"||!/\/macros\/s\/.+\/exec\/?$/.test(u.pathname)){
    throw new Error("LEXIS_APPS_SCRIPT_URL inválida");
  }
  return u.toString();
}
function sessionSecret(){
  const token=String(process.env.LEXIS_SHEETS_TOKEN||"").trim();
  if(!token)throw new Error("LEXIS_SHEETS_TOKEN ausente");
  return token;
}
function b64url(input){
  return Buffer.from(input).toString("base64url");
}
function safeEqual(a,b){
  const aa=Buffer.from(String(a||"")),bb=Buffer.from(String(b||""));
  return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);
}
function signBody(body){
  return crypto.createHmac("sha256",sessionSecret()).update(body).digest("base64url");
}
function createSessionValue(sess,user){
  const payload={
    v:1,
    sess:String(sess||""),
    user:user||null,
    exp:Date.now()+SESSION_TTL_MS
  };
  const body=b64url(JSON.stringify(payload));
  return "v1."+body+"."+signBody(body);
}
function decodeSignedSession(value){
  const raw=String(value||"");
  if(!raw.startsWith("v1."))return null;
  const parts=raw.split(".");
  if(parts.length!==3)return {invalid:true};
  const body=parts[1],sig=parts[2];
  if(!safeEqual(sig,signBody(body)))return {invalid:true};
  try{
    const payload=JSON.parse(Buffer.from(body,"base64url").toString("utf8"));
    if(!payload?.sess||Number(payload.exp||0)<=Date.now())return {invalid:true,expired:true};
    return payload;
  }catch{return {invalid:true}}
}
function setSessionCookie(res,sess,user){
  const value=createSessionValue(sess,user);
  res.setHeader("Set-Cookie",COOKIE_NAME+"="+encodeURIComponent(value)+"; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800");
  return value;
}
function clearSessionCookie(res){
  res.setHeader("Set-Cookie",COOKIE_NAME+"=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
}
function rawCookie(req){
  return parseCookies(req)[COOKIE_NAME]||"";
}
function rawSessionCredential(req){
  const cookie=rawCookie(req);
  if(cookie)return cookie;
  return String(req?.headers?.["x-lexis-session"]||"").trim();
}
function upstreamSession(req){
  const raw=rawSessionCredential(req);
  if(!raw)return "";
  const signed=decodeSignedSession(raw);
  if(signed&&!signed.invalid)return String(signed.sess||"");
  if(raw.startsWith("v1."))return "";
  return raw;
}
async function validateLegacySession(sess){
  const token=sessionSecret();
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),7000);
  try{
    const r=await fetch(appsScriptUrl(),{
      method:"POST",
      headers:{"Content-Type":"text/plain;charset=utf-8"},
      body:JSON.stringify({action:"auto",sess,token}),
      redirect:"follow",
      signal:ctrl.signal
    });
    const txt=await r.text();
    let data=null;
    try{data=JSON.parse(txt)}catch{
      return {ok:false,status:503,transient:true,reason:"invalid_upstream_payload",error:"Apps Script respondeu fora do formato esperado durante a validação da sessão."};
    }
    if(!r.ok){
      const transient=r.status===408||r.status===425||r.status===429||r.status>=500;
      return {ok:false,status:transient?503:r.status,transient,reason:"upstream_http",error:data?.error||("Apps Script respondeu HTTP "+r.status)};
    }
    if(data?.ok)return {ok:true,status:200,user:data.user||null,sess,legacy:true};
    const message=String(data?.error||"").trim();
    if(/sessao invalida|sessão inválida|sessao expirada|sessão expirada|nao autenticado|não autenticado/i.test(message)){
      return {ok:false,status:401,reason:"expired_session",error:message||"Sessão inválida"};
    }
    if(/token invalido|token inválido/i.test(message)){
      return {ok:false,status:401,reason:"token_mismatch",error:"LEXIS_SHEETS_TOKEN da Vercel não corresponde ao token publicado no Apps Script."};
    }
    return {ok:false,status:503,transient:true,reason:"upstream_rejected",error:message||"Apps Script não conseguiu validar a sessão agora."};
  }catch(e){
    return {ok:false,status:503,transient:true,reason:e?.name==="AbortError"?"timeout":"network_error",error:e?.name==="AbortError"?"Tempo esgotado ao validar a sessão no Google Apps Script.":"Falha temporária ao validar sessão: "+(e?.message||String(e))};
  }finally{clearTimeout(timer)}
}
async function validateSession(req){
  const raw=rawSessionCredential(req);
  if(!raw)return {ok:false,status:401,error:"Não autenticado",reason:"missing_session"};
  try{
    const signed=decodeSignedSession(raw);
    if(signed){
      if(signed.invalid)return {ok:false,status:401,error:signed.expired?"Sessão expirada":"Sessão inválida",reason:signed.expired?"expired_session":"invalid_signature"};
      return {ok:true,status:200,user:signed.user||null,sess:String(signed.sess||""),local:true};
    }
  }catch(e){
    return {ok:false,status:500,error:e?.message||String(e),reason:"session_decode_error"};
  }
  return validateLegacySession(raw);
}
async function requireSession(req,res){
  const auth=await validateSession(req);
  if(!auth.ok){
    res.status(auth.status||401).json({ok:false,error:auth.error,transient:!!auth.transient,reason:auth.reason});
    return null;
  }
  return auth;
}
function expectedOrigin(req){
  const proto=String(req?.headers?.["x-forwarded-proto"]||"https").split(",")[0].trim();
  const host=String(req?.headers?.["x-forwarded-host"]||req?.headers?.host||"").split(",")[0].trim();
  return host?proto+"://"+host:"";
}
function requireSameOrigin(req,res){
  const site=String(req?.headers?.["sec-fetch-site"]||"").toLowerCase();
  if(site==="cross-site"){
    res.status(403).json({ok:false,error:"Origem não autorizada"});
    return false;
  }
  const origin=String(req?.headers?.origin||"").trim();
  const expected=expectedOrigin(req);
  if(origin&&expected&&origin!==expected){
    res.status(403).json({ok:false,error:"Origem não autorizada"});
    return false;
  }
  return true;
}
module.exports={parseCookies,validateSession,requireSession,requireSameOrigin,setSessionCookie,clearSessionCookie,upstreamSession,createSessionValue,rawSessionCredential};
