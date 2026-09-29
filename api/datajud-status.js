const {requireSession}=require("../lib/bridge-auth");
const {probeDataJudHost,resolveDataJudAlias,digits}=require("../lib/datajud");
module.exports=async(req,res)=>{
  const auth=await requireSession(req,res);if(!auth)return;
  if(req.method!=="GET")return res.status(405).json({ok:false,error:"Método não permitido"});
  const cnj=String(req.query?.cnj||"").trim();
  const configured=!!String(process.env.DATAJUD_API_KEY||process.env.DATAJUD_PUBLIC_KEY||"").trim();
  if(!cnj)return res.status(200).json({ok:true,configured,source:"CNJ • DataJud API Pública"});
  const d=digits(cnj);if(d.length!==20)return res.status(400).json({ok:false,configured,error:"CNJ inválido"});
  const probe=await probeDataJudHost(d);
  return res.status(probe.ok?200:probe.rateLimited?429:502).json({ok:probe.ok,configured,alias:resolveDataJudAlias(d),probe});
};