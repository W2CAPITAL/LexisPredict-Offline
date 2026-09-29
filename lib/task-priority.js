(function(root,factory){
  const api=factory();
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  else root.LexisTaskPriority=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  const norm=v=>String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const digits=v=>String(v??"").replace(/\D/g,"");
  function pick(r,...keys){
    for(const k of keys){if(r&&r[k]!==undefined&&r[k]!==null&&String(r[k]).trim()!=="")return r[k]}
    const map={};Object.keys(r||{}).forEach(k=>map[norm(k).replace(/[^a-z0-9]/g,"")]=k);
    for(const k of keys){const real=map[norm(k).replace(/[^a-z0-9]/g,"")];if(real&&String(r[real]??"").trim()!=="")return r[real]}
    return "";
  }
  function boolish(v){return /^(sim|true|1|yes|x)$/i.test(String(v??"").trim())}
  function parseDate(v){
    if(v instanceof Date&&!Number.isNaN(v.getTime()))return v;
    const s=String(v??"").trim();if(!s)return null;
    let m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);if(m)return new Date(+m[3],+m[2]-1,+m[1],12);
    m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return new Date(+m[1],+m[2]-1,+m[3],12);
    const d=new Date(s);return Number.isNaN(d.getTime())?null:d;
  }
  function daysTo(v,ref){
    const d=parseDate(v);if(!d)return null;
    const t=ref?new Date(ref):new Date();t.setHours(12,0,0,0);d.setHours(12,0,0,0);
    return Math.round((d-t)/86400000);
  }
  function daysSince(v,ref){
    const d=parseDate(v);if(!d)return null;
    const t=ref?new Date(ref):new Date();t.setHours(12,0,0,0);d.setHours(12,0,0,0);
    return Math.max(0,Math.floor((t-d)/86400000));
  }
  function latestMove(r){return String(pick(r,"Diagnóstico Processual","DataJud • Último Movimento","Último Andamento","Andamento","ultimo_movimento")||"")}
  function statusReturn(r,ref){
    const raw=String(pick(r,"Situação do Retorno","Status")||"").toUpperCase();
    if(raw.includes("VENC"))return "VENCIDO";
    if(raw.includes("HOJE")||raw.includes("É HOJE"))return "É HOJE";
    if(raw.includes("ATEN"))return "ATENÇÃO";
    if(raw.includes("EM DIA")||raw.includes("NO PRAZO"))return "EM DIA";
    const d=daysTo(pick(r,"Próximo Retorno","ProximoRetorno","proximo_retorno"),ref);
    if(d===null)return "SEM DATA";
    if(d<0)return "VENCIDO";
    if(d===0)return "É HOJE";
    if(d<=3)return "ATENÇÃO";
    return "EM DIA";
  }
  function isClosed(r){
    const blob=norm([pick(r,"Status"),pick(r,"Situacao"),pick(r,"Diagnóstico Processual"),latestMove(r)].join(" "));
    return /encerrad|arquivad|baixa definitiva|cancelamento da distribuicao|transito em julgado/.test(blob);
  }
  function hasCourtClose(r){
    return boolish(pick(r,"Encerrado no Tribunal","DatajudEncerrado","datajud_encerrado_tribunal","isBaixaTribunal"))||
      /baixa definitiva|transito em julgado/.test(norm(latestMove(r)));
  }
  function hasUpdate(r){
    return boolish(pick(r,"Nova Atualização","Novo Andamento","Novo_Andamento","tem_novo_andamento","tem_atualizacao_pos_retorno","djen_nova_comunicacao"));
  }
  function eventType(r){return norm(pick(r,"Tipo de Evento","Evento_Tipo","evento_tipo"))}
  function scoreCase(r,ref){
    if(!r)return {score:0,band:"normal",label:"—"};
    const move=norm(latestMove(r)),event=eventType(r),status=statusReturn(r,ref);
    const closed=isClosed(r),closedCourt=hasCourtClose(r);
    if(closed&&!closedCourt)return {score:0,band:"encerrado",label:"Encerrado"};

    if(/busca e apreensao/.test(move)||event==="ba")return {score:1000,band:"ba",label:"B.A."};
    if(closedCourt&&!closed)return {score:920,band:"baixa",label:"Baixa tribunal"};
    if(/sentenca|procedente|improcedente|merito/.test(event+" "+move))return {score:880,band:"merito",label:"Mérito"};
    if(hasUpdate(r))return {score:820,band:"novidade",label:"Novidade"};
    if(boolish(pick(r,"Cumprimento","em_cumprimento_sentenca"))||/cumprimento|execucao/.test(event+" "+move))return {score:760,band:"cumprimento",label:"Cumprimento"};
    if(/audienc/.test(event+" "+move))return {score:740,band:"audiencia",label:"Audiência"};

    const d=daysTo(pick(r,"Próximo Retorno","ProximoRetorno","proximo_retorno"),ref);
    if(status==="VENCIDO"||(d!==null&&d<0))return {score:700+Math.min(99,Math.abs(d||0)),band:"vencido",label:"Vencido"};
    if(status==="É HOJE"||d===0)return {score:650,band:"hoje",label:"É hoje"};
    if(status==="ATENÇÃO"||(d!==null&&d>0&&d<=3))return {score:600-(d||0),band:"atencao",label:"Atenção"};

    const last=pick(r,"Último Retorno","UltimoRetorno","ultimo_retorno");
    if(!String(last||"").trim())return {score:420,band:"sem_retorno",label:"Sem retorno"};
    const gap=daysSince(last,ref);
    let score=200+Math.min(120,Math.floor((gap||0)/2));
    if(String(pick(r,"Qualidade")).toUpperCase()==="RUIM")score+=25;
    return {score,band:"normal",label:"Rotina"};
  }
  function compare(a,b,ref){
    const sa=scoreCase(a,ref),sb=scoreCase(b,ref);
    if(sb.score!==sa.score)return sb.score-sa.score;
    const ga=daysSince(pick(a,"Último Retorno"),ref)??9999,gb=daysSince(pick(b,"Último Retorno"),ref)??9999;
    if(gb!==ga)return gb-ga;
    return String(pick(a,"Cliente")||"").localeCompare(String(pick(b,"Cliente")||""),"pt-BR");
  }
  function groupByClient(rows,ref){
    const map=new Map();
    for(const r of rows||[]){
      if(isClosed(r)&&!hasCourtClose(r))continue;
      const client=String(pick(r,"Cliente")||"NÃO IDENTIFICADO").trim();
      const key=norm(client).replace(/\s+/g," ").trim()||digits(pick(r,"Protocolo"));
      if(!map.has(key))map.set(key,{cliente:client,cases:[],score:0,priority:null});
      const g=map.get(key);g.cases.push(r);
      const p=scoreCase(r,ref);if(!g.priority||p.score>g.score){g.score=p.score;g.priority=p;g.reference=r}
    }
    return [...map.values()].sort((a,b)=>b.score-a.score||String(a.cliente).localeCompare(String(b.cliente),"pt-BR"));
  }
  return {pick,boolish,parseDate,daysTo,daysSince,latestMove,statusReturn,isClosed,hasCourtClose,hasUpdate,eventType,scoreCase,compare,groupByClient};
});