function safeUrl(raw){
  let u;try{u=new URL(String(raw||""))}catch{throw new Error("LEXIS_APPS_SCRIPT_URL inválida ou ausente na Vercel.")}
  const okHost=u.hostname==="script.google.com"||u.hostname.endsWith(".script.google.com")||u.hostname==="script.googleusercontent.com";
  if(!okHost||u.protocol!=="https:")throw new Error("LEXIS_APPS_SCRIPT_URL deve ser uma URL HTTPS do Google Apps Script.");
  if(u.hostname==="script.google.com"&&!/\/macros\/s\/.+\/exec\/?$/.test(u.pathname))throw new Error("LEXIS_APPS_SCRIPT_URL deve terminar em /exec.");
  return u.toString();
}
module.exports=async(req,res)=>{
  if(req.method!=="POST")return res.status(405).json({ok:false,error:"Método não permitido"});
  try{
    const body=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{});
    const payload=body.payload||{};
    const url=safeUrl(process.env.LEXIS_APPS_SCRIPT_URL);
    const fixedToken=String(process.env.LEXIS_SHEETS_TOKEN||"").trim();
    if(!fixedToken)return res.status(500).json({ok:false,error:"LEXIS_SHEETS_TOKEN não está configurado na Vercel."});
    const up=await fetch(url,{
      method:"POST",
      headers:{"Content-Type":"text/plain;charset=utf-8"},
      body:JSON.stringify({...payload,token:fixedToken}),
      redirect:"follow"
    });
    const txt=await up.text();
    let data;
    try{data=JSON.parse(txt)}
    catch{return res.status(502).json({ok:false,error:"Apps Script retornou conteúdo não JSON",detail:txt.slice(0,300)})}
    res.setHeader("Cache-Control","no-store");
    if(data&&data.error==="token invalido"){
      return res.status(401).json({ok:false,error:"LEXIS_SHEETS_TOKEN da Vercel não corresponde à Script Property LEXIS_SHEETS_TOKEN do Apps Script publicado."});
    }
    return res.status(up.ok?200:up.status).json(data);
  }catch(e){
    return res.status(400).json({ok:false,error:e?.message||String(e)});
  }
};