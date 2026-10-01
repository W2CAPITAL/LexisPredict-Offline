(function(global){
"use strict";
const SOURCES=[
  {id:"predictlm",name:"PredictLM",repo:"W2CAPITAL/PredictLm",feature:"IA e dossiês"},
  {id:"waauto",name:"WA.Auto",repo:"W2CAPITAL/Wa.Auto",feature:"WhatsApp e monitor"},
  {id:"lexispredict",name:"LexisPredict",repo:"W2CAPITAL/LexisPredict",feature:"regras jurídicas e KPIs"},
  {id:"synccrm",name:"SyncCRM",repo:"W1CAPITAL/SyncCRM",feature:"mapeamento de planilha"},
  {id:"leadcheckin",name:"LEADCHECKIN",repo:"W2CAPITAL/LEADCHECKIN",feature:"scanner público"},
  {id:"offline",name:"OFFLINE-LEXISPREDICT",repo:"W1CAPITAL/OFFLINE-LEXISPREDICT",feature:"offline/outbox"},
  {id:"leadcheck",name:"Leadcheck",repo:"W1CAPITAL/Leadcheck",feature:"Bacen/revisional"},
  {id:"grey",name:"GREY",repo:"W1CAPITAL/GREY",feature:"IA privada e skills"}
];
const fold=s=>String(s??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const digits=s=>String(s??"").replace(/\D/g,"");
function pick(r,...keys){for(const k of keys){if(r&&r[k]!=null&&String(r[k]).trim()!=="")return r[k]}const m={};Object.keys(r||{}).forEach(k=>m[fold(k)]=k);for(const k of keys){const real=m[fold(k)];if(real&&String(r[real]??"").trim()!=="")return r[real]}return""}
const CANON={
  Protocolo:["protocolo","cnj","numero processo","processo"],
  Cliente:["cliente","nome cliente","parte","nome"],
  Assistente:["assistente","responsavel","responsável","operador"],
  Tribunal:["tribunal","orgao julgador","órgão julgador"],
  Telefone:["telefone","celular","whatsapp","fone"],
  "Último Retorno":["ultimo retorno","último retorno","retorno"],
  "Próximo Retorno":["proximo retorno","próximo retorno","data retorno"],
  "DataJud • Último Movimento":["datajud ultimo movimento","último andamento","andamento"],
  "DJEN • Última Publicação":["djen ultima publicacao","publicacao djen","publicação djen"]
};
function mapHeaders(headers){
  return Object.entries(CANON).map(([field,aliases])=>{
    let best="",score=0,reason="";
    for(const h of headers){
      const fh=fold(h);
      for(const a of aliases){
        const fa=fold(a);
        let s=0;
        if(fh===fa)s=100;
        else if(fh.includes(fa)||fa.includes(fh))s=82;
        else{
          const ta=new Set(fa.split(/(?=[A-Z])|\s+/).filter(Boolean));
          const th=new Set(fh.split(/(?=[A-Z])|\s+/).filter(Boolean));
          let hit=0;for(const x of ta)if(th.has(x))hit++;
          s=ta.size?Math.round(hit/ta.size*65):0;
        }
        if(s>score){score=s;best=h;reason=s===100?"correspondência exata":s>=80?"cabeçalho equivalente":"similaridade lexical"}
      }
    }
    return {field,sheetHeader:best||null,confidence:score,reason:best?reason:"não localizado"};
  });
}
function parseDate(v){
  if(v instanceof Date&&!Number.isNaN(v))return v;
  const s=String(v??"").trim();if(!s)return null;
  let m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);if(m)return new Date(+m[3],+m[2]-1,+m[1],12);
  m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return new Date(+m[1],+m[2]-1,+m[3],12);
  const d=new Date(s);return Number.isNaN(d)?null:d;
}
function audit(rows){
  rows=Array.isArray(rows)?rows:[];
  const headers=[...new Set(rows.slice(0,200).flatMap(r=>Object.keys(r||{})))];
  const mapping=mapHeaders(headers);
  const seen=new Map();let invalidCnj=0,duplicates=0,missingClient=0,missingPhone=0,missingAssistant=0,missingReturn=0,stale=0;
  const staleBefore=Date.now()-7*86400000;
  for(const r of rows){
    const rawCnj=String(pick(r,"Protocolo","CNJ","processo")||"").trim();
    const cnj=digits(rawCnj);
    if(rawCnj&&cnj.length!==20)invalidCnj++;
    if(cnj.length===20){const n=(seen.get(cnj)||0)+1;seen.set(cnj,n);if(n===2)duplicates++}
    if(!String(pick(r,"Cliente")).trim())missingClient++;
    if(!digits(pick(r,"Telefone","Celular","WhatsApp")))missingPhone++;
    if(!String(pick(r,"Assistente")).trim())missingAssistant++;
    if(!String(pick(r,"Próximo Retorno")).trim())missingReturn++;
    const sync=parseDate(pick(r,"Última Sincronização","Ultima Sincronizacao"));
    if(sync&&sync.getTime()<staleBefore)stale++;
  }
  const mapped=mapping.filter(x=>x.confidence>=80).length;
  const health=Math.max(0,100-Math.round((invalidCnj+duplicates+missingClient+Math.min(missingAssistant,rows.length*.15))/Math.max(rows.length,1)*100));
  return {rows:rows.length,headers:headers.length,mapping,mapped,required:Object.keys(CANON).length,invalidCnj,duplicates,missingClient,missingPhone,missingAssistant,missingReturn,stale,health};
}
function pmt(principal,monthlyRate,months){
  if(principal<=0||months<=0)return 0;if(monthlyRate===0)return principal/months;
  const f=Math.pow(1+monthlyRate,months);return principal*(monthlyRate*f)/(f-1);
}
function principalFromPmt(installment,monthlyRate,months){
  if(installment<=0||months<=0)return 0;if(monthlyRate===0)return installment*months;
  const f=Math.pow(1+monthlyRate,months);return installment*(f-1)/(monthlyRate*f);
}
function revisionalEstimate({currentInstallment,bacenMonthlyPercent,months=48,assumedSpreadPp=.4}){
  const installment=Number(currentInstallment),rate=Number(bacenMonthlyPercent),n=Math.max(1,Number(months)||48);
  if(!Number.isFinite(installment)||installment<50||!Number.isFinite(rate))return null;
  const assumed=rate+Number(assumedSpreadPp||0),principal=principalFromPmt(installment,assumed/100,n),bacenInstallment=pmt(principal,rate/100,n);
  const monthlySavings=Math.max(0,installment-bacenInstallment),totalSavings=monthlySavings*n;
  return {months:n,assumedContractMonthly:assumed,principalEstimated:principal,currentInstallment:installment,bacenInstallment,monthlySavings,totalSavings,savingsPercent:installment?monthlySavings/installment*100:0};
}
function bacenComparison({bacenMonthlyPercent,bacenAnnualPercent,contractMonthlyPercent=null,contractAnnualPercent=null,multiplier=1.5}={}){
  const numberOrNull=v=>v==null||String(v).trim()===""?null:Number(v);
  const positive=v=>Number.isFinite(v)&&v>=0?v:null;
  const bm=positive(numberOrNull(bacenMonthlyPercent)),ba=positive(numberOrNull(bacenAnnualPercent));
  const cmInput=positive(numberOrNull(contractMonthlyPercent)),caInput=positive(numberOrNull(contractAnnualPercent));
  const m=Number.isFinite(Number(multiplier))&&Number(multiplier)>0?Number(multiplier):1.5;
  const annualFromMonthly=v=>v==null?null:(Math.pow(1+v/100,12)-1)*100;
  const monthlyFromAnnual=v=>v==null?null:(Math.pow(1+v/100,1/12)-1)*100;
  const cm=cmInput!=null?cmInput:monthlyFromAnnual(caInput);
  const ca=caInput!=null?caInput:annualFromMonthly(cmInput);
  const monthlyThreshold=bm==null?null:bm*m,annualThreshold=ba==null?null:ba*m;
  const monthlyMultiple=bm>0&&cm!=null?cm/bm:null,annualMultiple=ba>0&&ca!=null?ca/ba:null;
  return {
    multiplier:m,
    bacenMonthlyPercent:bm,bacenAnnualPercent:ba,
    bacenEffectiveAnnualPercent:annualFromMonthly(bm),
    thresholdMonthlyPercent:monthlyThreshold,thresholdAnnualPercent:annualThreshold,
    contractMonthlyPercent:cm,contractAnnualPercent:ca,
    contractMonthlyDerived:cmInput==null&&cm!=null,
    contractAnnualDerived:caInput==null&&ca!=null,
    monthlyMultiple,annualMultiple,
    monthlyExcessPp:bm!=null&&cm!=null?cm-bm:null,
    annualExcessPp:ba!=null&&ca!=null?ca-ba:null,
    aboveMonthly15x:monthlyThreshold!=null&&cm!=null?cm>monthlyThreshold:null,
    aboveAnnual15x:annualThreshold!=null&&ca!=null?ca>annualThreshold:null
  };
}
function leadScore(input={}){
  let points=0;const reasons=[];
  if(input.quitacao){points+=100;reasons.push("Quitação (+100)")}
  if(input.prestamista){points+=70;reasons.push("Prestamista (+70)")}
  if(input.reduzir){points+=40;reasons.push("Reduzir parcela (+40)")}
  const parcela=Number(input.parcela)||0;
  if(parcela>=1500){points+=25;reasons.push("Parcela alta (+25)")}else if(parcela>=800){points+=10;reasons.push("Parcela média (+10)")}
  if(input.paid){points+=30;reasons.push("Pago (+30)")}
  if(input.fileName){points+=15;reasons.push("Contrato anexado (+15)")}
  if(Number(input.bacenMonthly)>=2){points+=10;reasons.push("Taxa média Bacen elevada (+10)")}
  return {points,tier:points>=130?"quente":points>=70?"morno":"frio",reasons};
}
function portfolio(rows,statusFn){
  rows=Array.isArray(rows)?rows:[];let vencidos=0,atencao=0,semData=0,djen=0,datajud=0,closed=0;
  for(const r of rows){
    const st=statusFn?statusFn(r):"";
    if(st==="VENCIDO")vencidos++;else if(st==="ATENÇÃO")atencao++;else if(st==="SEM DATA")semData++;
    if(pick(r,"DJEN • Última Publicação"))djen++;if(pick(r,"DataJud • Último Movimento"))datajud++;
    if(/encerrad|arquivad|baixa definitiva|transito em julgado/i.test([pick(r,"Status"),pick(r,"DataJud • Último Movimento")].join(" ")))closed++;
  }
  return {total:rows.length,ativos:Math.max(0,rows.length-closed),encerrados:closed,vencidos,atencao,semData,djen,datajud};
}
global.SheetsHub={sources:SOURCES,mapHeaders,audit,revisionalEstimate,bacenComparison,leadScore,portfolio};
})(typeof window!=="undefined"?window:globalThis);
