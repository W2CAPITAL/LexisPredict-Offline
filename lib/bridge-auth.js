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
async function validateSession(req){
  const sess=parseCookies(req).lexis_session||"";
  if(!sess)return {ok:false,status:401,error:"Não autenticado"};
  const token=String(process.env.LEXIS_SHEETS_TOKEN||"").trim();
  if(!token)return {ok:false,status:500,error:"LEXIS_SHEETS_TOKEN ausente"};
  try{
    const r=await fetch(appsScriptUrl(),{
      method:"POST",
      headers:{"Content-Type":"text/plain;charset=utf-8"},
      body:JSON.stringify({action:"auto",sess,token}),
      redirect:"follow"
    });
    const txt=await r.text();
    let data={};try{data=JSON.parse(txt)}catch{}
    if(!r.ok||!data.ok)return {ok:false,status:401,error:data.error||"Sessão inválida"};
    return {ok:true,status:200,user:data.user||null,sess};
  }catch(e){
    return {ok:false,status:502,error:"Falha ao validar sessão: "+(e?.message||String(e))};
  }
}
async function requireSession(req,res){
  const auth=await validateSession(req);
  if(!auth.ok){
    res.status(auth.status||401).json({ok:false,error:auth.error});
    return null;
  }
  return auth;
}
module.exports={parseCookies,validateSession,requireSession};
