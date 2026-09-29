const {requireSession}=require("../lib/bridge-auth");
const {fetchDjenByCnj,sortRecent}=require("../lib/djen");
module.exports=async(req,res)=>{
  const auth=await requireSession(req,res);if(!auth)return;
  if(req.method!=="GET")return res.status(405).json({ok:false,error:"Método não permitido"});
  const cnj=String(req.query?.cnj||"").trim();
  const tribunal=String(req.query?.tribunal||"").trim().toUpperCase();
  const dataInicio=String(req.query?.dataInicio||"").trim()||undefined;
  const dataFim=String(req.query?.dataFim||"").trim()||undefined;
  const out=await fetchDjenByCnj(cnj,{siglaTribunal:tribunal||undefined,dataInicio,dataFim,itensPorPagina:100});
  if(out?.retryAfterMs)res.setHeader("Retry-After",String(Math.ceil(out.retryAfterMs/1000)));
  if(out?.rate?.remaining)res.setHeader("X-Lexis-RateLimit-Remaining",out.rate.remaining);
  if(out?.rate?.limit)res.setHeader("X-Lexis-RateLimit-Limit",out.rate.limit);
  res.setHeader("Cache-Control","no-store");
  if(!out.success){
    const status=out.isRateLimited?429:out.isGeoBlocked?403:502;
    return res.status(status).json({ok:false,error:out.error||"Falha DJEN",retryAfterMs:out.retryAfterMs||0,rate:out.rate||null});
  }
  const items=sortRecent(out.items||[]),latest=items[0]||null;
  return res.status(200).json({ok:true,found:items.length>0,count:out.count??items.length,latest,items:items.slice(0,20),rate:out.rate||null,source:"CNJ • DJEN oficial"});
};