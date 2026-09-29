const {scopeRows,isElevated}=require("../lib/sheet-scope");
function safeUrl(raw){
  let u;try{u=new URL(String(raw||""))}catch{throw new Error("LEXIS_APPS_SCRIPT_URL inválida ou ausente na Vercel.")}
  const okHost=u.hostname==="script.google.com"||u.hostname.endsWith(".script.google.com")||u.hostname==="script.googleusercontent.com";
  if(!okHost||u.protocol!=="https:")throw new Error("LEXIS_APPS_SCRIPT_URL deve ser uma URL HTTPS do Google Apps Script.");
  if(u.hostname==="script.google.com"&&!/\/macros\/s\/.+\/exec\/?$/.test(u.pathname))throw new Error("LEXIS_APPS_SCRIPT_URL deve terminar em /exec.");
  return u.toString();
}
function cookies(req){
  const out={};String(req.headers.cookie||"").split(";").forEach(p=>{const i=p.indexOf("=");if(i>0)out[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1).trim())});return out;
}
function setSessionCookie(res,value){
  res.setHeader("Set-Cookie","lexis_session="+encodeURIComponent(value)+"; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800");
}
function clearSessionCookie(res){
  res.setHeader("Set-Cookie","lexis_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
}
module.exports=async(req,res)=>{
  if(req.method!=="POST")return res.status(405).json({ok:false,error:"Método não permitido"});
  try{
    const body=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{});
    const payload={...(body.payload||{})};
    const action=String(payload.action||"").trim().toLowerCase();

    if(action==="logout"){
      clearSessionCookie(res);
      res.setHeader("Cache-Control","no-store");
      return res.status(200).json({ok:true});
    }

    const url=safeUrl(process.env.LEXIS_APPS_SCRIPT_URL);
    const fixedToken=String(process.env.LEXIS_SHEETS_TOKEN||"").trim();
    if(!fixedToken)return res.status(500).json({ok:false,error:"LEXIS_SHEETS_TOKEN não está configurado na Vercel."});

    const sess=cookies(req).lexis_session||"";
    if(action!=="login"&&action!=="auth"&&action!=="ping"&&sess)payload.sess=sess;

    const up=await fetch(url,{
      method:"POST",
      headers:{"Content-Type":"text/plain;charset=utf-8"},
      body:JSON.stringify({...payload,token:fixedToken}),
      redirect:"follow"
    });
    const txt=await up.text();
    let data;
    try{data=JSON.parse(txt)}
    catch{return res.status(502).json({ok:false,error:"Apps Script retornou conteúdo não JSON",detail:txt.slice(0,300)})}

    res.setHeader("Cache-Control","no-store");

    if(data&&data.error==="token invalido"){
      return res.status(401).json({ok:false,error:"LEXIS_SHEETS_TOKEN da Vercel não corresponde à Script Property LEXIS_SHEETS_TOKEN do Apps Script publicado."});
    }

    if((action==="login"||action==="auth")&&data&&data.ok){
      const sessionToken=String(data.token||data.sess||data.session||"").trim();
      if(!sessionToken)return res.status(502).json({ok:false,error:"Apps Script autenticou, mas não retornou uma sessão."});
      setSessionCookie(res,sessionToken);
      const clean={...data};delete clean.token;delete clean.sess;delete clean.session;
      return res.status(up.ok?200:up.status).json(clean);
    }

    if(data&&/sessao invalida|sessão inválida|sessao expirada|sessão expirada/i.test(String(data.error||""))){
      clearSessionCookie(res);
      return res.status(401).json({ok:false,error:data.error});
    }

    if(action==="list"&&data&&data.ok){
      const user=data.user||null;
      if(!user)return res.status(502).json({ok:false,error:"O bridge não retornou o usuário da sessão para aplicar o escopo da carteira."});
      const source=Array.isArray(data.rows)?data.rows:(Array.isArray(data.todas)?data.todas:[]);
      const scoped=scopeRows(source,user);
      data.rows=scoped;
      data.minhas=scoped;
      data.count=scoped.length;
      data.scope={field:isElevated(user.perfil)?"ALL":"Assistente",value:isElevated(user.perfil)?"*":(user.nome||user.usuario||""),sourceCount:source.length};
      delete data.todas;
    }

    if((action==="write"||action==="upsert_batch")&&data){
      const rejected=Number(data.rejected_count||0);
      if(rejected>0){
        const why=(Array.isArray(data.rejected)?data.rejected:[]).map(x=>x?.motivo||x?.reason).filter(Boolean).join("; ");
        return res.status(409).json({...data,ok:false,error:why||"Uma ou mais alterações foram recusadas pela planilha."});
      }
      if(data.ok!==false&&Number(data.written??data.updated??data.added??0)===0&&Array.isArray(payload.rows)&&payload.rows.length){
        return res.status(409).json({...data,ok:false,error:"A planilha não confirmou nenhuma linha gravada."});
      }
    }

    return res.status(up.ok?200:up.status).json(data);
  }catch(e){
    return res.status(400).json({ok:false,error:e?.message||String(e)});
  }
};