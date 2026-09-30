const {validateSession,requireSameOrigin}=require("../lib/bridge-auth");
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
  res.setHeader("Set-Cookie","lexis_session="+encodeURIComponent(value)+"; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800");
}
function clearSessionCookie(res){
  res.setHeader("Set-Cookie","lexis_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0");
}
const READ_ACTIONS=new Set(["auto","list","get","crm_list","judicial_history","ping","users","list_users"]);
const TRANSIENT_STATUSES=new Set([408,425,429,500,502,503,504]);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function fetchBridge(url,body,action){
  const safeRead=READ_ACTIONS.has(action);
  const attempts=safeRead?3:1;
  let lastError=null,lastStatus=0,lastText="";
  for(let attempt=0;attempt<attempts;attempt++){
    const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),18000);
    try{
      const up=await fetch(url,{
        method:"POST",
        headers:{"Content-Type":"text/plain;charset=utf-8"},
        body:JSON.stringify(body),
        redirect:"follow",
        signal:ctrl.signal
      });
      const txt=await up.text();lastStatus=up.status;lastText=txt;
      let data=null,parseError=false;
      try{data=JSON.parse(txt)}catch{parseError=true}
      const retryable=safeRead&&(parseError||TRANSIENT_STATUSES.has(up.status));
      if(retryable&&attempt<attempts-1){await wait(350*Math.pow(2,attempt));continue}
      return {up,data,txt,parseError};
    }catch(e){
      lastError=e;
      if(safeRead&&attempt<attempts-1){await wait(350*Math.pow(2,attempt));continue}
    }finally{clearTimeout(timer)}
  }
  if(lastError)throw lastError;
  return {up:{ok:false,status:lastStatus||503},data:null,txt:lastText,parseError:true};
}
function transientRead(res,action,message,status){
  res.setHeader("Cache-Control","no-store");
  res.setHeader("X-Sheets-Degraded","1");
  return res.status(200).json({
    ok:false,transient:true,degraded:true,action,
    upstreamStatus:Number(status)||null,
    retryAfterMs:4000,
    error:message||"A planilha está temporariamente indisponível. O cache local foi preservado."
  });
}
module.exports=async(req,res)=>{
  if(req.method!=="POST")return res.status(405).json({ok:false,error:"Método não permitido"});
  if(!requireSameOrigin(req,res))return;
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
    if(!["login","auth","ping","logout"].includes(action)){
      const check=await validateSession(req);
      if(!check.ok)return res.status(check.status||401).json({ok:false,error:check.error||"Não autenticado"});
    }
    if(action!=="login"&&action!=="auth"&&action!=="ping"&&sess)payload.sess=sess;

    const bridged=await fetchBridge(url,{...payload,token:fixedToken},action);
    const up=bridged.up,txt=bridged.txt,data=bridged.data;
    if(bridged.parseError){
      if(READ_ACTIONS.has(action))return transientRead(res,action,"Google Apps Script está trocando de versão ou respondeu temporariamente fora do formato esperado.",up.status);
      return res.status(503).json({ok:false,transient:true,error:"Apps Script temporariamente indisponível durante a gravação. A alteração deve permanecer na fila local.",detail:String(txt||"").slice(0,300)});
    }
    if(READ_ACTIONS.has(action)&&TRANSIENT_STATUSES.has(Number(up.status))){
      return transientRead(res,action,data?.error||("Google Apps Script respondeu HTTP "+up.status+" durante a atualização."),up.status);
    }

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
      const requestedScope=String(payload.scope||"mine").toLowerCase()==="company"?"company":"mine";
      const scoped=scopeRows(source,user,requestedScope);
      data.rows=scoped;
      data.minhas=scopeRows(source,user,"mine");
      data.count=scoped.length;
      data.scope=requestedScope==="company"
        ?{field:"ALL",value:"*",mode:"company",sourceCount:source.length}
        :{field:isElevated(user.perfil)?"ALL":"Assistente",value:isElevated(user.perfil)?"*":(user.nome||user.usuario||""),mode:"mine",sourceCount:source.length};
      delete data.todas;
    }

    if((action==="write"||action==="upsert_batch")&&data){
      const rejected=Number(data.rejected_count||0);
      if(rejected>0){
        const why=(Array.isArray(data.rejected)?data.rejected:[]).map(x=>x?.motivo||x?.reason).filter(Boolean).join("; ");
        const written=Number(data.written??data.updated??data.added??0);
        // Conflito de dados é estado da aplicação, não falha de transporte.
        // Retornar 200 permite ao cliente confirmar individualmente o que foi salvo
        // sem gerar um loop de HTTP 409 no navegador.
        return res.status(200).json({
          ...data,
          ok:written>0,
          conflict:true,
          partial:written>0,
          warning:why||"Uma ou mais alterações precisam de confirmação.",
          error:written>0?undefined:(why||"Uma ou mais alterações foram recusadas pela planilha.")
        });
      }
      if(data.ok!==false&&Number(data.written??data.updated??data.added??0)===0&&Array.isArray(payload.rows)&&payload.rows.length){
        return res.status(200).json({...data,ok:false,conflict:true,error:"A planilha informou 0 gravações; o cliente fará confirmação individual antes de reenviar."});
      }
    }

    return res.status(up.ok?200:up.status).json(data);
  }catch(e){
    const body=typeof req.body==="string"?(()=>{try{return JSON.parse(req.body||"{}")}catch{return{}}})():(req.body||{});
    const action=String(body?.payload?.action||"").trim().toLowerCase();
    const msg=e?.name==="AbortError"?"Tempo esgotado ao acessar o Google Apps Script.":(e?.message||String(e));
    if(READ_ACTIONS.has(action))return transientRead(res,action,msg,503);
    return res.status(503).json({ok:false,transient:true,error:msg});
  }
};