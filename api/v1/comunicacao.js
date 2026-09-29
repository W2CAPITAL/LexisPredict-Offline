const PUBLIC_DJEN = process.env.DJEN_UPSTREAM || "https://hcomunicaapi.cnj.jus.br/api/v1/comunicacao";
function one(v){return Array.isArray(v)?v[0]:v}
module.exports=async(req,res)=>{
  if(req.method!=="GET")return res.status(405).json({status:"error",message:"Método não permitido",items:[]});
  const q=new URLSearchParams();
  for(const [k,v] of Object.entries(req.query||{})){
    if(v!==undefined&&v!==null&&String(one(v)).trim()!=="")q.set(k,String(one(v)));
  }
  if(!q.get("numeroProcesso")&&!q.get("siglaTribunal")&&!q.get("texto")&&!q.get("nomeParte")&&!q.get("nomeAdvogado")&&!q.get("numeroOab")){
    return res.status(400).json({status:"error",message:"Informe um filtro do DJEN.",items:[]});
  }
  if(!q.get("pagina"))q.set("pagina","1");
  if(!q.get("itensPorPagina"))q.set("itensPorPagina","100");

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),18000);
  try{
    const up=await fetch(PUBLIC_DJEN+"?"+q.toString(),{
      headers:{Accept:"application/json","User-Agent":"LexisPredict-Sheets-Proxy/1.1"},
      redirect:"follow",signal:controller.signal
    });
    const txt=await up.text();
    const rem=up.headers.get("x-ratelimit-remaining"),lim=up.headers.get("x-ratelimit-limit");
    if(rem)res.setHeader("x-ratelimit-remaining",rem);
    if(lim)res.setHeader("x-ratelimit-limit",lim);
    if(up.status===429)res.setHeader("Retry-After",up.headers.get("retry-after")||"60");
    res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=1800");
    res.setHeader("Content-Type","application/json; charset=utf-8");
    return res.status(up.status).send(txt);
  }catch(e){
    return res.status(502).json({status:"error",message:e?.name==="AbortError"?"DJEN timeout após 18s.":"Proxy DJEN indisponível: "+(e?.message||String(e)),items:[]});
  }finally{clearTimeout(timer)}
};