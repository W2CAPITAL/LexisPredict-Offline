const MAX_JSON=700_000;
const TIMEOUTS={status:10000,chat:45000,work:45000,tutor:45000,legal:65000,build:90000,research:70000,imagine:90000,report:100000};

function privateHost(host){
  const h=String(host||"").toLowerCase();
  if(!h||h==="localhost"||h.endsWith(".local")||h==="0.0.0.0"||h==="::1")return true;
  if(/^127\./.test(h)||/^10\./.test(h)||/^192\.168\./.test(h)||/^169\.254\./.test(h))return true;
  const m=h.match(/^172\.(\d+)\./);if(m&&Number(m[1])>=16&&Number(m[1])<=31)return true;
  return /^\d+\.\d+\.\d+\.\d+$/.test(h)||/^\[?[0-9a-f:]+\]?$/i.test(h);
}
function baseUrl(){
  const raw=String(process.env.PREDICTLM_URL||"").trim();
  if(!raw)return null;
  let u;try{u=new URL(raw)}catch{return null}
  if(u.protocol!=="https:"||privateHost(u.hostname))return null;
  u.pathname=u.pathname.replace(/\/$/,"");u.search="";u.hash="";
  return u;
}
function urlAt(base,path,query){
  const u=new URL(base.toString());
  const prefix=u.pathname.replace(/\/$/,"");
  u.pathname=(prefix&&prefix!=="/"?prefix:"")+path;
  u.search="";u.hash="";
  if(query)for(const [k,v] of Object.entries(query))if(v!=null&&String(v)!=="")u.searchParams.set(k,String(v));
  return u.toString();
}
function clean(v,max=12000){return String(v??"").replace(/\u0000/g,"").trim().slice(0,max)}
function bearer(){
  const token=String(process.env.PREDICTLM_ACCESS_TOKEN||"").trim();
  return token?{Authorization:"Bearer "+token}:{};
}
async function call(base,path,{method="POST",body,query,timeoutMs=45000,expect="json"}={}){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeoutMs);
  try{
    const r=await fetch(urlAt(base,path,query),{
      method,
      headers:{Accept:expect==="html"?"text/html,application/json":"application/json",...(body?{"Content-Type":"application/json"}:{}),...bearer()},
      body:body?JSON.stringify(body):undefined,
      cache:"no-store",redirect:"follow",signal:ctrl.signal
    });
    const retry=r.headers.get("retry-after");
    if(expect==="html"){
      const text=await r.text();
      if(!r.ok){
        let msg=text;try{msg=JSON.parse(text)?.error||text}catch{}
        const e=new Error(clean(msg,800)||("PredictLM HTTP "+r.status));e.status=r.status;e.retryAfter=retry;throw e;
      }
      return {ok:true,status:r.status,html:text,retryAfter:retry};
    }
    const text=await r.text();let data={};
    try{data=text?JSON.parse(text):{}}catch{data={raw:clean(text,1200)}}
    if(!r.ok){
      const e=new Error(clean(data?.error||data?.detail||("PredictLM HTTP "+r.status),900));
      e.status=r.status;e.code=data?.code;e.retryAfter=retry;e.data=data;throw e;
    }
    return {ok:true,status:r.status,data,retryAfter:retry};
  }finally{clearTimeout(timer)}
}
function chatPayload(body,surface){
  const prompt=clean(body.prompt,30000);
  const history=Array.isArray(body.messages)?body.messages.slice(-12).map(x=>({
    role:x?.role==="assistant"?"assistant":"user",content:clean(x?.content,6000)
  })).filter(x=>x.content):[];
  const contracts={
    chat:"Responda como PredictLM dentro do SheetsPredict. Preserve fatos da carteira fornecidos no contexto e não invente dados.",
    work:"WORK MODE. Mantenha continuidade, critérios de conclusão e execução ordenada. Separe concluído, pendente, bloqueios e próximo passo. Não marque como concluído algo não verificado.",
    tutor:"TUTOR MODE. Use PROBE → TEACH/PRACTICE → ASSESS → REVIEW. Adapte a dificuldade, use active recall e não invente fontes."
  };
  return {
    prompt,messages:history,useHistory:true,language:"pt-BR",deep:!!body.deep,
    answerAnchor:clean(body.context,16000),
    instructions:contracts[surface]||contracts.chat,
    sessionId:clean(body.sessionId||"sheetspredict",160)
  };
}
function buildFiles(input){
  if(!Array.isArray(input))return[];
  return input.slice(0,60).map(f=>({
    path:clean(f?.path,260).replace(/^\/+|\.\.\//g,""),
    content:clean(f?.content,100000),
    language:clean(f?.language||"text",40)
  })).filter(f=>f.path&&f.content);
}
function legalNumber(body){return clean(body.number||body.cnj||body.processo,80)}
function reportBody(body){
  return {
    request:clean(body.request||body.prompt,4000),
    sourceText:clean(body.sourceText||body.context,80000),
    depth:["auto","deep"].includes(String(body.depth))?body.depth:"auto",
    council:body.council===true,
    theme:["auto","light","dark"].includes(String(body.theme))?body.theme:"auto",
    classification:["publico","interno","confidencial","restrito"].includes(String(body.classification))?body.classification:"confidencial",
    author:clean(body.author||"SheetsPredict",120)
  };
}
function imageBody(body){
  const prompt=clean(body.prompt,1800);
  return {
    prompt,originalPrompt:prompt,
    width:Math.max(256,Math.min(1536,Number(body.width)||1024)),
    height:Math.max(256,Math.min(1536,Number(body.height)||1024)),
    seed:Math.max(1,Math.min(2147483646,Number(body.seed)||1)),
    style:clean(body.style||"Cinematic",80),
    styleLocked:!!body.styleLocked,
    promptMode:["auto","literal","imagine"].includes(String(body.promptMode))?body.promptMode:"auto",
    referenceMode:body.referenceMode==="off"?"off":"auto",
    strictIdentityProvider:body.strictIdentityProvider!==false
  };
}

module.exports=async(req,res)=>{
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST")return res.status(405).json({ok:false,error:"POST only"});
  const len=Number(req.headers["content-length"]||0);
  if(len>MAX_JSON)return res.status(413).json({ok:false,error:"Payload acima do limite do Predict Studio."});
  const base=baseUrl();
  const body=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{});
  const action=String(body.action||"status").toLowerCase();

  if(!base){
    return res.status(503).json({
      ok:false,configured:false,code:"PREDICTLM_NOT_CONFIGURED",
      error:"PredictLM ainda não está conectado a este deployment. Configure PREDICTLM_URL e, se protegido, PREDICTLM_ACCESS_TOKEN."
    });
  }

  try{
    let out;
    if(action==="status"){
      out=await call(base,"/api/capabilities",{method:"GET",query:{surface:clean(body.surface||"chat",30),q:clean(body.q,400)},timeoutMs:TIMEOUTS.status});
      return res.status(200).json({ok:true,configured:true,source:base.origin,capabilities:out.data});
    }
    if(["chat","work","tutor"].includes(action)){
      const payload=chatPayload(body,action);
      if(!payload.prompt)return res.status(400).json({ok:false,error:"Informe uma mensagem."});
      out=await call(base,"/api/chat",{body:payload,timeoutMs:TIMEOUTS[action]});
      return res.status(200).json({ok:true,surface:action,...out.data});
    }
    if(action==="legal"){
      const number=legalNumber(body);if(!number)return res.status(400).json({ok:false,error:"Informe o CNJ."});
      out=await call(base,"/api/legal/process",{body:{number},timeoutMs:TIMEOUTS.legal});
      return res.status(200).json({ok:true,surface:"legal",result:out.data});
    }
    if(action==="legal_dossier"){
      const number=legalNumber(body);if(!number)return res.status(400).json({ok:false,error:"Informe o CNJ."});
      out=await call(base,"/api/legal/dossier",{body:{number,mode:body.mode==="aggressive"?"aggressive":"standard",evidence:body.evidence||undefined},timeoutMs:TIMEOUTS.legal,expect:"html"});
      return res.status(200).json({ok:true,surface:"legal",html:out.html});
    }
    if(action==="build"){
      const prompt=clean(body.prompt,12000);if(!prompt)return res.status(400).json({ok:false,error:"Informe o que deseja construir ou alterar."});
      out=await call(base,"/api/agent",{body:{prompt,mode:body.deep===false?"fast":"deep",files:buildFiles(body.files)},timeoutMs:TIMEOUTS.build});
      return res.status(200).json({ok:true,surface:"build",...out.data});
    }
    if(action==="research"){
      const query=clean(body.query||body.prompt,8000);if(!query)return res.status(400).json({ok:false,error:"Informe o tema da pesquisa."});
      out=await call(base,"/api/research",{body:{query,depth:["fast","balanced","comprehensive"].includes(String(body.depth))?body.depth:"balanced",limit:Math.max(3,Math.min(16,Number(body.limit)||10))},timeoutMs:TIMEOUTS.research});
      return res.status(200).json({ok:true,surface:"research",...out.data});
    }
    if(action==="imagine"){
      const payload=imageBody(body);if(!payload.prompt)return res.status(400).json({ok:false,error:"Descreva a imagem."});
      out=await call(base,"/api/media/generate",{body:payload,timeoutMs:TIMEOUTS.imagine});
      return res.status(200).json({ok:true,surface:"imagine",...out.data});
    }
    if(action==="report"){
      const payload=reportBody(body);if(!payload.request)return res.status(400).json({ok:false,error:"Informe o objetivo do relatório."});
      out=await call(base,"/api/report-dossier/generate",{body:payload,timeoutMs:TIMEOUTS.report});
      return res.status(200).json({ok:true,surface:"report",...out.data});
    }
    return res.status(400).json({ok:false,error:"Ação desconhecida do Predict Studio."});
  }catch(e){
    if(e?.retryAfter)res.setHeader("Retry-After",String(e.retryAfter));
    const status=Number(e?.status)||502;
    return res.status(status).json({ok:false,configured:true,error:e?.message||String(e),code:e?.code||"PREDICTLM_UPSTREAM_ERROR",upstreamStatus:status});
  }
};
