const {requireSession,requireSameOrigin}=require("../lib/bridge-auth");

const MAX_BODY=900_000;
function privateHost(host){
  const h=String(host||"").toLowerCase();
  if(!h||h==="localhost"||h.endsWith(".local")||h==="0.0.0.0"||h==="::1")return true;
  if(/^127\./.test(h)||/^10\./.test(h)||/^192\.168\./.test(h)||/^169\.254\./.test(h))return true;
  const m=h.match(/^172\.(\d+)\./);if(m&&Number(m[1])>=16&&Number(m[1])<=31)return true;
  return /^\d+\.\d+\.\d+\.\d+$/.test(h)||/^\[?[0-9a-f:]+\]?$/i.test(h);
}
function baseUrl(){
  const raw=String(process.env.WA_AUTO_URL||"").trim();
  if(!raw)return null;
  let u;try{u=new URL(raw)}catch{return null}
  if(u.protocol!=="https:"||privateHost(u.hostname))return null;
  u.pathname=u.pathname.replace(/\/$/,"");u.search="";u.hash="";
  return u;
}
function urlAt(base,path){
  const u=new URL(base.toString()),prefix=u.pathname.replace(/\/$/,"");
  u.pathname=(prefix&&prefix!=="/"?prefix:"")+path;u.search="";u.hash="";return u.toString();
}
async function request(base,path,{method="GET",body,timeoutMs=16000,csrf=""}={}){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeoutMs);
  try{
    const r=await fetch(urlAt(base,path),{
      method,cache:"no-store",redirect:"follow",signal:ctrl.signal,
      headers:{Accept:"application/json",...(body?{"Content-Type":"application/json"}:{}),...(csrf?{"x-wa-csrf":csrf}:{})},
      body:body?JSON.stringify(body):undefined
    });
    const text=await r.text();let data={};
    try{data=text?JSON.parse(text):{}}catch{data={raw:text.slice(0,1500)}}
    if(!r.ok){
      const err=new Error(String(data?.error||("WA.Auto HTTP "+r.status)).slice(0,900));
      err.status=r.status;throw err;
    }
    return data;
  }finally{clearTimeout(timer)}
}
async function csrf(base){
  const boot=await request(base,"/api/bootstrap",{timeoutMs:10000});
  const token=String(boot?.csrfToken||"");
  if(!token)throw new Error("WA.Auto não retornou token de sessão.");
  return {token,boot};
}
function clean(v,max=8000){return String(v??"").replace(/\u0000/g,"").trim().slice(0,max)}
function id(v){
  const s=clean(v,120);
  return /^[A-Za-z0-9_-]{1,120}$/.test(s)?s:"";
}
function rows(input){
  if(!Array.isArray(input))return[];
  return input.slice(0,250).map((x,i)=>({
    cnj:clean(x?.cnj||x?.protocolo,80),
    clientName:clean(x?.clientName||x?.cliente,160),
    phone:clean(x?.phone||x?.telefone,40),
    lastReturnAt:clean(x?.lastReturnAt,80),
    nextReturnAt:clean(x?.nextReturnAt,80),
    movementAt:clean(x?.movementAt,80),
    movementText:clean(x?.movementText,4000),
    djenAt:clean(x?.djenAt,80),
    djenText:clean(x?.djenText,4000),
    lastNotifiedAt:clean(x?.lastNotifiedAt,80),
    sourceRow:Number(x?.sourceRow)||i+2,
    notifyWhatsapp:x?.notifyWhatsapp!==false,
    optOut:x?.optOut===true
  }));
}
module.exports=async(req,res)=>{
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="POST")return res.status(405).json({ok:false,error:"POST only"});
  if(!requireSameOrigin(req,res))return;
  const auth=await requireSession(req,res);if(!auth)return;
  const length=Number(req.headers["content-length"]||0);
  if(length>MAX_BODY)return res.status(413).json({ok:false,error:"Payload grande demais."});
  let body={};try{body=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{})}catch{return res.status(400).json({ok:false,error:"JSON inválido."})}
  const base=baseUrl();
  const action=String(body.action||"status").toLowerCase();
  if(!base){
    const payload={ok:false,configured:false,code:"WA_AUTO_NOT_CONFIGURED",error:"WA_AUTO_URL não configurada."};
    if(action==="status"||action==="state")return res.status(200).json(payload);
    return res.status(503).json(payload);
  }
  try{
    if(action==="status"){
      const [boot,sheet,legal,suppressions]=await Promise.all([
        request(base,"/api/bootstrap",{timeoutMs:10000}),
        request(base,"/api/integrations/sheetspredict/status",{timeoutMs:10000}).catch(e=>({ok:false,error:e.message})),
        request(base,"/api/legal/monitors",{timeoutMs:12000}).catch(e=>({monitors:[],events:[],stats:{},error:e.message})),
        request(base,"/api/suppressions",{timeoutMs:10000}).catch(()=>[])
      ]);
      return res.status(200).json({ok:true,configured:true,connection:boot.connection,campaigns:boot.campaigns||[],latestImport:boot.latestImport||null,nextSendAt:boot.nextSendAt||0,legal:boot.legal||legal.stats||{},sheet,monitors:legal.monitors||[],events:legal.events||[],suppressions:Array.isArray(suppressions)?suppressions:[],resources:boot.resources||null});
    }
    if(action==="state"){
      const data=await request(base,"/api/state",{timeoutMs:10000});
      return res.status(200).json({ok:true,...data});
    }

    const {token}=await csrf(base);
    let data;
    if(action==="connect")data=await request(base,"/api/whatsapp/connect",{method:"POST",body:{},csrf:token,timeoutMs:25000});
    else if(action==="pair"){
      const phone=clean(body.phone,40);if(!phone)throw new Error("Informe o telefone para pareamento.");
      data=await request(base,"/api/whatsapp/pair",{method:"POST",body:{phone},csrf:token,timeoutMs:25000});
    }
    else if(action==="disconnect")data=await request(base,"/api/whatsapp/disconnect",{method:"POST",body:{},csrf:token,timeoutMs:16000});
    else if(action==="logout")data=await request(base,"/api/whatsapp/logout",{method:"POST",body:{},csrf:token,timeoutMs:16000});
    else if(action==="auto_settings")data=await request(base,"/api/integrations/sheetspredict/settings",{method:"POST",body:{autoEnabled:body.autoEnabled===true},csrf:token,timeoutMs:14000});
    else if(action==="portfolio_sync")data=await request(base,"/api/integrations/sheetspredict/sync",{method:"POST",body:{rows:rows(body.rows),mode:["datajud","djen","both"].includes(String(body.mode))?body.mode:"both"},csrf:token,timeoutMs:30000});
    else if(action==="legal_scan")data=await request(base,"/api/legal/scan",{method:"POST",body:{},csrf:token,timeoutMs:70000});
    else if(action==="monitor_scan"){
      const monitor=id(body.id);if(!monitor)throw new Error("Monitor inválido.");
      data=await request(base,"/api/legal/monitors/"+monitor+"/scan",{method:"POST",body:{},csrf:token,timeoutMs:70000});
    }
    else if(action==="monitor_toggle"){
      const monitor=id(body.id);if(!monitor)throw new Error("Monitor inválido.");
      data=await request(base,"/api/legal/monitors/"+monitor+"/toggle",{method:"POST",body:{enabled:body.enabled,notifyWhatsapp:body.notifyWhatsapp},csrf:token,timeoutMs:14000});
    }
    else if(action==="monitor_delete"){
      const monitor=id(body.id);if(!monitor)throw new Error("Monitor inválido.");
      data=await request(base,"/api/legal/monitors/"+monitor,{method:"DELETE",csrf:token,timeoutMs:14000});
    }
    else if(action==="campaign_start"){
      const campaign=id(body.id);if(!campaign)throw new Error("Campanha inválida.");
      data=await request(base,"/api/campaigns/"+campaign+"/start",{method:"POST",body:{reviewed:true},csrf:token,timeoutMs:14000});
    }
    else if(action==="campaign_pause"){
      const campaign=id(body.id);if(!campaign)throw new Error("Campanha inválida.");
      data=await request(base,"/api/campaigns/"+campaign+"/pause",{method:"POST",body:{},csrf:token,timeoutMs:14000});
    }
    else if(action==="campaign_cancel"){
      const campaign=id(body.id);if(!campaign)throw new Error("Campanha inválida.");
      data=await request(base,"/api/campaigns/"+campaign+"/cancel",{method:"POST",body:{},csrf:token,timeoutMs:14000});
    }
    else if(action==="test_message"){
      const phone=clean(body.phone,40),message=clean(body.message,8000);
      if(!phone||!message)throw new Error("Informe telefone e mensagem.");
      data=await request(base,"/api/test-message",{method:"POST",body:{phone,message},csrf:token,timeoutMs:16000});
    }
    else if(action==="suppress"){
      const phone=clean(body.phone,40);if(!phone)throw new Error("Informe o telefone.");
      data=await request(base,"/api/suppressions",{method:"POST",body:{phone,reason:clean(body.reason||"Bloqueado pelo SheetsPredict",250)},csrf:token,timeoutMs:12000});
    }
    else if(action==="unsuppress"){
      const identity=encodeURIComponent(clean(body.identity,120));if(!identity)throw new Error("Bloqueio inválido.");
      data=await request(base,"/api/suppressions/"+identity,{method:"DELETE",csrf:token,timeoutMs:12000});
    }
    else return res.status(400).json({ok:false,error:"Ação WA.Auto desconhecida."});
    return res.status(200).json({ok:true,data});
  }catch(e){
    return res.status(Number(e?.status)||400).json({ok:false,configured:true,error:e?.message||String(e)});
  }
};
