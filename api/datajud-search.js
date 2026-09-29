const {requireSession}=require("../lib/bridge-auth");
const {fetchDataJud,searchDataJudByName,searchDataJudByCpf}=require("../lib/datajud");
module.exports=async(req,res)=>{
  const auth=await requireSession(req,res);if(!auth)return;
  if(req.method!=="POST")return res.status(405).json({success:false,error:"Método não permitido",items:[]});
  const body=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{});
  const mode=String(body.mode||"").trim().toLowerCase(),query=String(body.query||"").trim();
  if(!query)return res.status(400).json({success:false,error:"Consulta vazia",items:[]});
  try{
    if(mode==="cnj"){const data=await fetchDataJud(query,{fast:false});return res.status(data.error?502:200).json({success:!data.error,data,error:data.message||null})}
    if(mode==="nome"){const out=await searchDataJudByName(query,{size:Math.min(12,Number(body.size)||12),classeCodigo:body.classeCodigo||undefined});return res.status(200).json(out)}
    if(mode==="cpf"||mode==="cnpj"||mode==="documento"){const out=await searchDataJudByCpf(query,{size:Math.min(12,Number(body.size)||12),onlyBA:!!body.onlyBA});return res.status(200).json(out)}
    return res.status(400).json({success:false,error:"mode inválido: use cnj, nome ou cpf",items:[]});
  }catch(e){return res.status(500).json({success:false,error:e?.message||String(e),items:[]})}
};