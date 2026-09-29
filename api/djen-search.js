const {requireSession}=require("../lib/bridge-auth");
const {fetchDjenByCnj,fetchDjenByName,fetchDjenByText,fetchDjenByDate}=require("../lib/djen");
module.exports=async(req,res)=>{
  const auth=await requireSession(req,res);if(!auth)return;
  if(req.method!=="POST")return res.status(405).json({success:false,error:"Método não permitido",items:[]});
  const body=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{});
  const mode=String(body.mode||"cnj").toLowerCase();
  const opts={dataInicio:body.dataInicio||undefined,dataFim:body.dataFim||undefined,siglaTribunal:body.siglaTribunal||body.tribunal||undefined,pagina:body.pagina||1,itensPorPagina:body.itensPorPagina||50};
  try{
    let out;
    if(mode==="cnj")out=await fetchDjenByCnj(body.query||body.cnj||body.protocolo,opts);
    else if(mode==="nome")out=await fetchDjenByName(body.query||body.nome,{...opts,texto:body.texto||undefined});
    else if(mode==="texto")out=await fetchDjenByText(body.query||body.texto,{...opts,nomeParte:body.nomeParte||undefined});
    else if(mode==="data")out=await fetchDjenByDate(opts);
    else return res.status(400).json({success:false,error:"mode inválido: use cnj, nome, texto ou data",items:[]});
    const status=out?.isRateLimited?429:out?.isGeoBlocked?403:out?.success?200:502;
    if(out?.retryAfterMs)res.setHeader("Retry-After",String(Math.ceil(out.retryAfterMs/1000)));
    return res.status(status).json(out);
  }catch(e){return res.status(500).json({success:false,error:e?.message||String(e),items:[]})}
};