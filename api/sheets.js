const {validateSession,requireSameOrigin,setSessionCookie,clearSessionCookie}=require("../lib/bridge-auth");
const {scopeRows,isElevated}=require("../lib/sheet-scope");
const {routeSheetsAction,bridgeCapabilityFor}=require("../lib/needle-router");
function safeUrl(raw){
  let u;try{u=new URL(String(raw||""))}catch{throw new Error("LEXIS_APPS_SCRIPT_URL inválida ou ausente na Vercel.")}
  const okHost=u.hostname==="script.google.com"||u.hostname.endsWith(".script.google.com")||u.hostname==="script.googleusercontent.com";
  if(!okHost||u.protocol!=="https:")throw new Error("LEXIS_APPS_SCRIPT_URL deve ser uma URL HTTPS do Google Apps Script.");
  if(u.hostname==="script.google.com"&&!/\/macros\/s\/.+\/exec\/?$/.test(u.pathname))throw new Error("LEXIS_APPS_SCRIPT_URL deve terminar em /exec.");
  return u.toString();
}
const READ_ACTIONS=new Set(["session","auto","list","get","search","crm_list","judicial_history","shard_status","ping","users","list_users"]);
const REQUIRED_BRIDGE_VERSION="8.3";
const REQUIRED_BRIDGE_CAPABILITIES=new Set(["list_compact","crm_list","crm_write","process_shards"]);
const TRANSIENT_STATUSES=new Set([408,425,429,500,502,503,504]);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function searchNorm(v){
  return String(v??"")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9]/g,"");
}
function searchDigits(v){return String(v??"").replace(/\D/g,"")}
function searchRows(rows,query,limit=100){
  const q=String(query||"").trim(),qn=searchNorm(q),qd=searchDigits(q);
  if(!qn&&!qd)return[];
  const out=[];
  for(const row of Array.isArray(rows)?rows:[]){
    const values=Object.values(row||{});
    const text=searchNorm(values.join(" "));
    const numeric=qd.length>=5?searchDigits(values.join(" ")): "";
    if((qn&&text.includes(qn))||(qd.length>=5&&numeric.includes(qd))){
      out.push(row);
      if(out.length>=Math.max(1,Math.min(250,Number(limit)||100)))break;
    }
  }
  return out;
}
async function fetchBridge(url,body,action){
  const safeRead=READ_ACTIONS.has(action);
  // Não bloqueia a UI por quase um minuto em cold-start/update do Apps Script.
  // Uma tentativa curta é suficiente; o cliente mantém cache e agenda nova tentativa.
  const attempts=1;
  let lastError=null,lastStatus=0,lastText="";
  for(let attempt=0;attempt<attempts;attempt++){
    const timeoutMs=action==="legacy_list"?25000:action==="list"?12000:action==="auto"?7000:10000;
    const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeoutMs);
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
let bridgeMetaCache={url:"",at:0,data:null};
async function probeBridgeVersion(url,token){
  try{
    const probe=await fetchBridge(url,{action:"ping",token},"ping");
    const data=probe?.data||null;
    return {
      ok:!!(data&&data.ok),
      version:String(data?.v||"").trim(),
      pong:!!data?.pong,
      capabilities:Array.isArray(data?.capabilities)?data.capabilities.map(x=>String(x)) : [],
      httpStatus:Number(probe?.up?.status)||0,
      error:String(data?.error||"").trim()
    };
  }catch(e){
    return {ok:false,version:"",pong:false,capabilities:[],httpStatus:0,error:e?.message||String(e)};
  }
}
async function bridgeMeta(url,token){
  const now=Date.now();
  if(bridgeMetaCache.data&&bridgeMetaCache.url===url&&now-bridgeMetaCache.at<45000)return bridgeMetaCache.data;
  const data=await probeBridgeVersion(url,token);
  if(data?.ok)bridgeMetaCache={url,at:now,data};
  return data;
}

module.exports=async(req,res)=>{
  if(req.method!=="POST")return res.status(405).json({ok:false,error:"Método não permitido"});
  if(!requireSameOrigin(req,res))return;
  try{
    const body=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{});
    const payload={...(body.payload||{})};
    const action=String(payload.action||"").trim().toLowerCase();
    const route=routeSheetsAction(payload);
    if(!route.supported){
      return res.status(400).json({ok:false,error:"Ação não suportada pelo bridge do SheetsPredict.",action,reason:route.reason,confidence:route.confidence});
    }

    if(action==="logout"){
      clearSessionCookie(res);
      res.setHeader("Cache-Control","no-store");
      return res.status(200).json({ok:true});
    }

    const url=safeUrl(process.env.LEXIS_APPS_SCRIPT_URL);
    const fixedToken=String(process.env.LEXIS_SHEETS_TOKEN||"").trim();
    if(!fixedToken)return res.status(500).json({ok:false,error:"LEXIS_SHEETS_TOKEN não está configurado na Vercel."});

    let auth=null;
    if(!["login","auth","ping","logout"].includes(action)){
      auth=await validateSession(req);
      if(!auth.ok){
        if(auth.transient||Number(auth.status)>=500){
          return transientRead(res,action,auth.error||"Google Apps Script está temporariamente indisponível durante a validação da sessão.",auth.status||503);
        }
        // "session" é uma sondagem de estado usada no boot. Não deve gerar
        // ruído de HTTP 401 quando o usuário simplesmente ainda não entrou ou
        // quando existe um cookie antigo. Limpamos o cookie inválido e
        // devolvemos um estado autenticado=false em HTTP 200.
        if(action==="session"){
          clearSessionCookie(res);
          res.setHeader("Cache-Control","no-store");
          return res.status(200).json({
            ok:false,
            authenticated:false,
            error:auth.error||"Não autenticado",
            reason:auth.reason||"auth_failed"
          });
        }
        return res.status(auth.status||401).json({ok:false,error:auth.error||"Não autenticado",reason:auth.reason||"auth_failed"});
      }
      if(auth.legacy)setSessionCookie(res,auth.sess,auth.user||null);
      if(action==="session"){
        res.setHeader("Cache-Control","no-store");
        return res.status(200).json({ok:true,user:auth.user||null,local:!!auth.local,upgraded:!!auth.legacy});
      }
      payload.sess=auth.sess;
    }

    if(action==="search"){
      const query=String(payload.query||payload.q||"").trim();
      if(query.length<2)return res.status(200).json({ok:true,rows:[],count:0,query});
      const qDigits=searchDigits(query);
      let source=[];
      let upstream=null;
      if(route.tool==="get_process"&&qDigits.length===20){
        upstream=await fetchBridge(url,{action:"get",protocolo:qDigits,sess:auth.sess,token:fixedToken},"get");
        if(upstream?.parseError)return transientRead(res,action,"A planilha não respondeu corretamente à busca direta.",upstream?.up?.status||503);
        if(upstream?.data?.error==="token invalido")return res.status(401).json({ok:false,error:"LEXIS_SHEETS_TOKEN da Vercel não corresponde ao Apps Script publicado.",reason:"token_mismatch"});
        const row=upstream?.data?.row||(Array.isArray(upstream?.data?.data)?upstream.data.data[0]:null);
        source=row?[row]:[];
      }else{
        upstream=await fetchBridge(url,{action:"list",limit:8000,sess:auth.sess,token:fixedToken},"legacy_list");
        if(upstream?.parseError)return transientRead(res,action,"A planilha não respondeu corretamente à busca.",upstream?.up?.status||503);
        if(upstream?.data?.error==="token invalido")return res.status(401).json({ok:false,error:"LEXIS_SHEETS_TOKEN da Vercel não corresponde ao Apps Script publicado."});
        source=Array.isArray(upstream?.data?.rows)?upstream.data.rows:
          (Array.isArray(upstream?.data?.todas)?upstream.data.todas:
          (Array.isArray(upstream?.data?.data)?upstream.data.data:[]));
      }
      const requestedScope=String(payload.scope||"mine").toLowerCase()==="company"?"company":"mine";
      const scoped=scopeRows(source,auth?.user||null,requestedScope);
      const rows=searchRows(scoped,query,payload.limit||100);
      res.setHeader("Cache-Control","no-store");
      return res.status(200).json({ok:true,query,scope:requestedScope,rows,count:rows.length,direct:qDigits.length===20});
    }

    const capability=bridgeCapabilityFor(action);
    if(capability){
      const meta=await bridgeMeta(url,fixedToken);
      const caps=Array.isArray(meta?.capabilities)?meta.capabilities:[];
      const metadataAuthoritative=!!(meta?.ok&&(caps.length||meta.version));
      if(metadataAuthoritative&&!caps.includes(capability)){
        const optional=route.optional===true;
        return res.status(200).json({
          ok:false,
          degraded:optional,
          optional,
          bridgeMismatch:true,
          code:optional?"OPTIONAL_BRIDGE_CAPABILITY_MISSING":"APPS_SCRIPT_CAPABILITY_MISSING",
          action,
          detectedVersion:meta.version||"legacy",
          detectedCapabilities:caps,
          requiredVersion:REQUIRED_BRIDGE_VERSION,
          requiredCapability:capability,
          error:optional
            ?"O recurso opcional "+action+" não existe na implantação ativa do Apps Script. A operação principal em Processos continua disponível; este recurso ficará na fila local."
            :"O Apps Script publicado não expõe a capacidade "+capability+". Publique a versão atual do installer na implantação /exec ativa."
        });
      }
    }

    const bridgePayload={...route.args,...payload,action:route.upstream||action,token:fixedToken};
    let bridged=await fetchBridge(url,bridgePayload,action);
    let up=bridged.up,txt=bridged.txt,data=bridged.data;
    if(action==="list"&&data&&data.ok===false&&/acao desconhecida:\s*list_compact/i.test(String(data.error||""))){
      const probe=await probeBridgeVersion(url,fixedToken);
      // Compatibilidade: instalações antigas (ex.: bridge 7.0) continuam
      // funcionais enquanto o projeto Apps Script é saneado. Isso evita zerar
      // a carteira apenas porque list_compact ainda não está no handler ativo.
      if(probe.ok&&probe.version!==REQUIRED_BRIDGE_VERSION){
        const legacy=await fetchBridge(url,{...payload,action:"list",limit:8000,token:fixedToken},"legacy_list");
        if(legacy?.data?.ok){
          data={...legacy.data,legacyBridge:true,detectedVersion:probe.version||String(legacy.data?.v||"legacy"),compatibilityMode:true};
          up=legacy.up;txt=legacy.txt;bridged=legacy;
        }else if(legacy?.parseError||TRANSIENT_STATUSES.has(Number(legacy?.up?.status))){
          return transientRead(res,action,"Bridge legado "+(probe.version||"detectado")+" respondeu lentamente. A carteira local foi preservada.",legacy?.up?.status||503);
        }else{
          return res.status(200).json({
            ok:false,bridgeMismatch:true,code:"APPS_SCRIPT_LEGACY_FAILED",
            detectedVersion:probe.version||"legacy",
            error:legacy?.data?.error||"O bridge legado foi detectado, mas não conseguiu devolver a carteira."
          });
        }
      }else if(probe.ok){
        return res.status(200).json({
          ok:false,
          bridgeMismatch:true,
          code:"APPS_SCRIPT_ROUTE_MISMATCH",
          detectedVersion:probe.version,
          requiredVersion:REQUIRED_BRIDGE_VERSION,
          requiredCapabilities:[...REQUIRED_BRIDGE_CAPABILITIES],
          detectedCapabilities:probe.capabilities,
          error:"O endpoint /exec responde como bridge "+(probe.version||"desconhecido")+", mas não expõe list_compact. Publique o installer "+REQUIRED_BRIDGE_VERSION+" como NOVA VERSÃO na implantação /exec ativa."
        });
      }else{
        return transientRead(res,action,"Não foi possível confirmar a versão publicada do Google Apps Script. O cache local foi preservado.",probe.httpStatus||503);
      }
    }
    if((action==="crm_write"||action==="crm_list")&&data&&data.ok===false&&/acao desconhecida:\s*crm_(?:write|list)/i.test(String(data.error||""))){
      const probe=await probeBridgeVersion(url,fixedToken);
      return res.status(200).json({
        ok:false,
        bridgeMismatch:true,
        degraded:true,
        code:"APPS_SCRIPT_CRM_ROUTE_MISSING",
        action,
        detectedVersion:probe.version||"legacy",
        requiredVersion:REQUIRED_BRIDGE_VERSION,
        detectedCapabilities:probe.capabilities||[],
        requiredCapabilities:[...REQUIRED_BRIDGE_CAPABILITIES],
        error:"O Apps Script publicado não possui a rota "+action+". Publique o installer "+REQUIRED_BRIDGE_VERSION+" em Gerenciar implantações > Editar > Nova versão. Alterações do CRM devem permanecer no cache/fila local até a atualização."
      });
    }
    if(bridged.parseError){
      if(READ_ACTIONS.has(action))return transientRead(res,action,"Google Apps Script está trocando de versão ou respondeu temporariamente fora do formato esperado.",up.status);
      res.setHeader("Cache-Control","no-store");
      res.setHeader("X-Sheets-Degraded","1");
      return res.status(202).json({ok:false,transient:true,degraded:true,error:"Apps Script temporariamente indisponível durante a gravação. A alteração permanece na fila local.",detail:String(txt||"").slice(0,300),retryAfterMs:5000});
    }
    if(READ_ACTIONS.has(action)&&TRANSIENT_STATUSES.has(Number(up.status))){
      return transientRead(res,action,data?.error||("Google Apps Script respondeu HTTP "+up.status+" durante a atualização."),up.status);
    }

    res.setHeader("Cache-Control","no-store");

    if(data&&data.error==="token invalido"){
      const payload={
        ok:false,
        authenticated:false,
        error:"LEXIS_SHEETS_TOKEN da Vercel não corresponde à Script Property LEXIS_SHEETS_TOKEN do Apps Script publicado.",
        reason:"token_mismatch"
      };
      // Ping é diagnóstico/configuração, então responde 200 para que a UI
      // consiga mostrar a causa sem produzir um erro de recurso no console.
      if(action==="ping")return res.status(200).json(payload);
      return res.status(401).json(payload);
    }

    if((action==="login"||action==="auth")&&data&&data.ok){
      const sessionToken=String(data.token||data.sess||data.session||"").trim();
      if(!sessionToken)return res.status(502).json({ok:false,error:"Apps Script autenticou, mas não retornou uma sessão."});
      const sessionFallback=setSessionCookie(res,sessionToken,data.user||null);
      const clean={...data,sessionFallback};delete clean.token;delete clean.sess;delete clean.session;
      return res.status(up.ok?200:up.status).json(clean);
    }

    if(data&&/sessao invalida|sessão inválida|sessao expirada|sessão expirada/i.test(String(data.error||""))){
      clearSessionCookie(res);
      return res.status(401).json({ok:false,error:data.error,reason:"expired_session"});
    }

    if(action==="list"&&data&&data.ok){
      const user=data.user||auth?.user||null;
      if(!user)return res.status(502).json({ok:false,error:"O bridge não retornou o usuário da sessão para aplicar o escopo da carteira."});
      let source=[];
      if(data.compact&&Array.isArray(data.headers)&&Array.isArray(data.matrix)){
        const headers=data.headers;
        source=data.matrix.map(values=>{
          const row={};headers.forEach((h,i)=>{row[h]=values?.[i]??""});return row;
        });
      }else{
        source=Array.isArray(data.rows)?data.rows:(Array.isArray(data.todas)?data.todas:[]);
      }
      const requestedScope=String(payload.scope||"mine").toLowerCase()==="company"?"company":"mine";
      const scoped=scopeRows(source,user,requestedScope);
      data.rows=scoped;
      data.minhas=scopeRows(source,user,"mine");
      data.count=scoped.length;
      data.scope=requestedScope==="company"
        ?{field:"ALL",value:"*",mode:"company",sourceCount:source.length}
        :{field:isElevated(user.perfil)?"ALL":"Assistente",value:isElevated(user.perfil)?"*":(user.nome||user.usuario||""),mode:"mine",sourceCount:source.length};
      delete data.matrix;delete data.todas;
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
    res.setHeader("Cache-Control","no-store");
    res.setHeader("X-Sheets-Degraded","1");
    return res.status(202).json({ok:false,transient:true,degraded:true,error:msg,retryAfterMs:5000});
  }
};