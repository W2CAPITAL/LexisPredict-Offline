const PROD="https://comunicacaoapi.cnj.jus.br/api/v1/comunicacao";
const HOM="https://hcomunicaapi.cnj.jus.br/api/v1/comunicacao";
function one(v){return Array.isArray(v)?v[0]:v}
module.exports=async(req,res)=>{
  if(req.method!=="GET")return res.status(405).json({status:"error",message:"Método não permitido",items:[]});
  const q=new URLSearchParams();
  for(const [k,v] of Object.entries(req.query||{})){if(v!==undefined&&v!==null&&String(one(v)).trim()!=="")q.set(k,String(one(v)))}
  if(!q.get("numeroProcesso")&&!q.get("siglaTribunal")&&!q.get("texto")&&!q.get("nomeParte")&&!q.get("nomeAdvogado")&&!q.get("numeroOab")){
    return res.status(400).json({status:"error",message:"Informe um filtro do DJEN.",items:[]});
  }
  if(!q.get("pagina"))q.set("pagina","1");if(!q.get("itensPorPagina"))q.set("itensPorPagina","100");
  async function call(base){return fetch(base+"?"+q.toString(),{headers:{Accept:"application/json","User-Agent":"LexisPredict-Sheets-Proxy/1.0"},redirect:"follow"})}
  try{
    let up=await call(PROD);
    // Somente 5xx pode usar o host público alternativo. Nunca contornamos 429/403.
    if(up.status>=500)up=await call(HOM);
    const txt=await up.text();
    const rem=up.headers.get("x-ratelimit-remaining"),lim=up.headers.get("x-ratelimit-limit");
    if(rem)res.setHeader("x-ratelimit-remaining",rem);if(lim)res.setHeader("x-ratelimit-limit",lim);
    res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=1800");
    res.setHeader("Content-Type","application/json; charset=utf-8");
    return res.status(up.status).send(txt);
  }catch(e){return res.status(502).json({status:"error",message:"Proxy DJEN indisponível: "+(e?.message||String(e)),items:[]})}
};