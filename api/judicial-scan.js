const {requireSession}=require("../lib/bridge-auth");
const {scanJudicial}=require("../lib/judicial-intelligence");
module.exports=async(req,res)=>{
  const auth=await requireSession(req,res);if(!auth)return;
  if(req.method!=="POST")return res.status(405).json({ok:false,error:"Método não permitido"});
  const body=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{});
  try{
    const result=await scanJudicial({
      cnj:body.cnj||body.protocolo,
      tribunal:body.tribunal||body.siglaTribunal||"",
      ultimoRetorno:body.ultimoRetorno||"",
      lastDjenId:body.lastDjenId||"",
      lastDjenDate:body.lastDjenDate||"",
      dataInicio:body.dataInicio||undefined,
      dataFim:body.dataFim||undefined,
      mode:["datajud","djen","both"].includes(body.mode)?body.mode:"both",
      cliente:body.cliente||""
    });
    const rateLimited=!!result?.djen?.isRateLimited;
    const dataJudOk=!!result?.datajud&&!result.datajud.error;
    if(rateLimited&&result.djen.retryAfterMs)res.setHeader("Retry-After",String(Math.ceil(result.djen.retryAfterMs/1000)));
    // Se o DataJud respondeu, DJEN 429 é degradação parcial e não falha da requisição.
    // Isso mantém o scanner funcional e evita o navegador tratar o turno inteiro como erro.
    const status=rateLimited?(dataJudOk?207:429):(result.ok?200:result.partial?207:502);
    return res.status(status).json(rateLimited&&dataJudOk?{...result,partial:true,djenDeferred:true}:result);
  }catch(e){return res.status(500).json({ok:false,error:e?.message||String(e)})}
};