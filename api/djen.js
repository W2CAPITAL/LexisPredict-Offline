const PUBLIC_DJEN = process.env.DJEN_UPSTREAM || "https://comunicaapi.pje.jus.br/api/v1/comunicacao";

function digits(v){return String(v||"").replace(/\D/g,"")}
function masked(d){return d.length===20?d.slice(0,7)+"-"+d.slice(7,9)+"."+d.slice(9,13)+"."+d.slice(13,14)+"."+d.slice(14,16)+"."+d.slice(16):d}
function latest(items){
  return [...items].sort((a,b)=>new Date(b.data_disponibilizacao||b.datadisponibilizacao||0)-new Date(a.data_disponibilizacao||a.datadisponibilizacao||0))[0]||null;
}
async function get(cnj,tribunal){
  const q=new URLSearchParams({numeroProcesso:cnj,pagina:"1",itensPorPagina:"100"});
  if(tribunal)q.set("siglaTribunal",tribunal);
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),18000);
  try{
    const r=await fetch(PUBLIC_DJEN+"?"+q.toString(),{
      headers:{Accept:"application/json","User-Agent":"LexisPredict-Offline/1.1"},
      redirect:"follow",signal:controller.signal
    });
    const txt=await r.text();let data=null;try{data=JSON.parse(txt)}catch{}
    return {r,data,txt};
  }finally{clearTimeout(timer)}
}
module.exports=async(req,res)=>{
  if(req.method!=="GET")return res.status(405).json({ok:false,error:"Método não permitido"});
  const d=digits(req.query.cnj);
  if(d.length!==20)return res.status(400).json({ok:false,error:"CNJ inválido: esperado 20 dígitos"});
  const cnj=masked(d),tribunal=String(req.query.tribunal||"").trim().toUpperCase();
  try{
    const x=await get(cnj,tribunal);
    const remaining=x.r.headers.get("x-ratelimit-remaining"),limit=x.r.headers.get("x-ratelimit-limit");
    res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=1800");
    if(remaining)res.setHeader("X-Lexis-RateLimit-Remaining",remaining);
    if(limit)res.setHeader("X-Lexis-RateLimit-Limit",limit);

    if(x.r.status===429){
      const retry=Math.max(60000,Number(x.r.headers.get("retry-after")||60)*1000);
      return res.status(429).json({ok:false,error:"DJEN HTTP 429: limite oficial atingido; aguarde 1 minuto antes de retomar.",retryAfterMs:retry,rate:{remaining,limit}});
    }
    if(x.r.status===403){
      return res.status(403).json({ok:false,error:"DJEN HTTP 403: origem temporariamente bloqueada pelo CNJ. O último dado válido deve ser preservado.",retryAfterMs:21600000,rate:{remaining,limit}});
    }
    if(!x.r.ok){
      return res.status(x.r.status).json({ok:false,error:"DJEN HTTP "+x.r.status,detail:String(x.txt||"").slice(0,500)});
    }
    const items=Array.isArray(x.data?.items)?x.data.items:[];
    return res.status(200).json({
      ok:true,found:items.length>0,count:Number(x.data?.count||items.length),
      latest:latest(items),items:items.slice(0,20),rate:{remaining,limit},
      source:"CNJ • API pública DJEN"
    });
  }catch(e){
    const timeout=e?.name==="AbortError";
    return res.status(502).json({ok:false,error:timeout?"DJEN excedeu 18s e será tentado novamente depois.":"Falha de rede ao consultar DJEN: "+(e?.message||String(e))});
  }
};