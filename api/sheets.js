function safeUrl(raw){
  let u;try{u=new URL(String(raw||""))}catch{throw new Error("URL do Apps Script inválida")}
  const okHost=u.hostname==="script.google.com"||u.hostname.endsWith(".script.google.com")||u.hostname==="script.googleusercontent.com";
  if(!okHost||u.protocol!=="https:")throw new Error("Apenas URLs HTTPS do Google Apps Script são aceitas.");
  if(u.hostname==="script.google.com"&&!/\/macros\/s\/.+\/exec\/?$/.test(u.pathname))throw new Error("Use a URL publicada do Apps Script terminada em /exec.");
  return u.toString();
}
module.exports=async(req,res)=>{
  if(req.method!=="POST")return res.status(405).json({ok:false,error:"Método não permitido"});
  try{
    const body=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{});
    const url=safeUrl(body.url),token=String(body.token||"").trim(),payload=body.payload||{};
    if(!token)return res.status(400).json({ok:false,error:"Token do bridge ausente"});
    const up=await fetch(url,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({...payload,token}),redirect:"follow"});
    const txt=await up.text();let data;try{data=JSON.parse(txt)}catch{return res.status(502).json({ok:false,error:"Apps Script retornou conteúdo não JSON",detail:txt.slice(0,500)})}
    res.setHeader("Cache-Control","no-store");
    return res.status(up.ok?200:up.status).json(data);
  }catch(e){return res.status(400).json({ok:false,error:e?.message||String(e)})}
};