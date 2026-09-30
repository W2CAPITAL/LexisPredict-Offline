"use strict";
const POST_SPLIT="2025-11-01";
function norm(v){return String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g," ").replace(/\s+/g," ").trim()}
function isBankRevisionalIntent(input){
  const q=norm(input);
  const bank=/(contrato banc|emprest|credito pessoal|consign|financ|cet|bacen|taxa de juros|capitaliza|parcela|mora|indebito)/.test(q);
  const review=/(revis|juros abus|juros alt|reduz.*parcela|taxa media|cobranca indevida|reequilibr)/.test(q);
  return bank&&review;
}
function selectPersonalCreditBcbSeries(opts={}){
  const unit=opts.unit||"monthly",date=String(opts.contractDate||"").slice(0,10);
  if(opts.debtComposition){
    if(unit==="monthly")return{code:25465,unit,label:"Crédito pessoal não consignado vinculado à composição de dívidas",requiresOfficialValidation:true};
    return{code:null,unit,label:"Composição de dívidas",reason:"Localize série anual oficial específica.",requiresOfficialValidation:true};
  }
  if(date&&date>=POST_SPLIT){
    const g=opts.guarantee||"unknown";
    if(g==="unknown")return{code:null,unit,label:"Crédito pessoal pós-11/2025",reason:"Informe se há garantia real.",requiresOfficialValidation:true};
    if(g==="real")return{code:unit==="monthly"?29976:29973,unit,label:"Crédito pessoal com garantias reais",requiresOfficialValidation:true};
    return{code:unit==="monthly"?29977:29974,unit,label:"Crédito pessoal sem garantias reais",requiresOfficialValidation:true};
  }
  return{code:unit==="monthly"?25464:20742,unit,label:"Crédito pessoal não consignado histórico",requiresOfficialValidation:true};
}
function compareRates(contractRate,referenceRate){
  if(!Number.isFinite(contractRate)||!Number.isFinite(referenceRate)||referenceRate<=0)return null;
  return{absolutePoints:contractRate-referenceRate,ratio:contractRate/referenceRate,excessPercent:(contractRate/referenceRate-1)*100};
}
function revisionalBankContext(prompt){
  if(!isBankRevisionalIntent(prompt))return "";
  return [
    "REVISÃO BANCÁRIA v2: classifique modalidade/data/garantia antes do BACEN.",
    "Separe normalidade/mora e taxa nominal/CET.",
    "PF não consignado: histórico 25464 a.m./20742 a.a.; desde 11/2025 sem garantia 29977 a.m./29974 a.a.; com garantia 29976 a.m./29973 a.a.; valide metadados oficiais.",
    "Média BACEN é referencial, não teto; não conclua abusividade só pela diferença.",
    "Use jurisprudência oficial atual e diferencie fatos, cálculos, inferências e lacunas.",
    "Converta taxas de modo composto e respeite o sistema de amortização."
  ].join(" ");
}
module.exports={isBankRevisionalIntent,selectPersonalCreditBcbSeries,compareRates,revisionalBankContext};
