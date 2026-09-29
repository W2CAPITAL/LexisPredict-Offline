const {requireSession}=require("../lib/bridge-auth");
const {fetchDataJud,analyzeDataJud}=require("../lib/datajud");
module.exports=async(req,res)=>{
  const auth=await requireSession(req,res);if(!auth)return;
  if(req.method!=="GET")return res.status(405).json({ok:false,error:"Método não permitido"});
  const cnj=String(req.query?.cnj||"").trim(),ultimoRetorno=String(req.query?.ultimoRetorno||"").trim();
  const data=await fetchDataJud(cnj,{fast:false});
  return res.status(data.error?502:200).json({ok:!data.error,data,analysis:data.error?null:analyzeDataJud(data,ultimoRetorno),source:"CNJ • DataJud API Pública"});
};