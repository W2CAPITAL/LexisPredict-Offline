(function(root,factory){
  const api=factory();
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  else root.LexisSuggest=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  const strip=s=>String(s??"").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/\s+/g," ").trim();
  const firstName=s=>{const n=String(s||"Cliente").trim().split(/\s+/)[0]||"Cliente";return n.charAt(0).toUpperCase()+n.slice(1).toLowerCase()};
  const pick=(r,...keys)=>{
    for(const k of keys){if(r&&r[k]!==undefined&&r[k]!==null&&String(r[k]).trim()!=="")return r[k]}
    return "";
  };
  function corpus(input){
    const r=input.row||{},scan=input.scan||{};
    const movs=[...(scan.datajud?.movimentos||scan.movimentos||[])].map(m=>[m.nome,m.complemento,m.descricao,m.dataHora].filter(Boolean).join(" "));
    const pubs=[...(scan.djen?.items||scan.comunicacoes||[])].map(x=>[x.tipoComunicacao,x.texto,x.conteudo,x.inteiroTeor,x.data_disponibilizacao].filter(Boolean).join(" "));
    return strip([
      pick(r,"Diagnóstico Processual","DataJud • Último Movimento","Último Andamento","Andamento"),
      pick(r,"DJEN • Última Publicação","Resumo DJEN","DJEN_Resumo"),
      pick(r,"Tipo de Evento","Evento_Tipo"),
      ...movs,...pubs
    ].filter(Boolean).join("\n")).toUpperCase();
  }
  function base(row){
    const nome=firstName(pick(row,"Cliente"));
    const cnj=pick(row,"Protocolo","CNJ")||"seu processo";
    return {nome,cnj};
  }
  function make(id,titulo,quandoUsar,texto,categoria="atendimento"){return {id,titulo,quandoUsar,texto,categoria}}
  function suggestResponses(input){
    const row=input?.row||{},U=corpus(input||{}),{nome,cnj}=base(row),out=[];
    const lines=a=>a.filter(Boolean).join("\n");

    if(/JUSTI[CÇ]A GRATUITA|GRATUIDADE/.test(U)&&/INDEFER/.test(U)&&/PREPARO|DESER[CÇ][AÃ]O/.test(U)){
      out.push(make("preparo","Urgente: preparo recursal","Gratuidade indeferida e preparo exigido",lines([
        `Olá, ${nome}! Tudo bem?`,"",
        `Temos uma atualização urgente no processo nº ${cnj}.`,"",
        "O Tribunal indeferiu a gratuidade nesta fase e determinou o recolhimento do preparo do recurso. A equipe está conferindo a publicação e a guia para evitar perda de prazo.",
        "Assim que estiver tudo validado, te passamos a orientação por aqui."
      ]),"recurso"));
    }
    if(/IMPROCEDENTE|DECIS[AÃ]O DESFAVOR[AÁ]VEL/.test(U)){
      out.push(make("improcedente","Decisão desfavorável","Sentença/decisão improcedente",lines([
        `Olá, ${nome}! Tudo bem?`,"",
        `Saiu uma decisão no processo nº ${cnj} e o resultado foi desfavorável nesta etapa.`,"",
        "Nossa equipe vai conferir o teor completo e as possibilidades de recurso antes de passar uma conclusão definitiva.",
        "Assim que essa análise terminar, te atualizamos por aqui."
      ]),"mérito"));
    } else if(/PROCEDENTE|DECIS[AÃ]O FAVOR[AÁ]VEL/.test(U)){
      out.push(make("procedente","Decisão favorável","Sentença/decisão procedente",lines([
        `Olá, ${nome}! Tudo bem?`,"",
        `Temos uma atualização positiva no processo nº ${cnj}: foi identificada uma decisão favorável nesta etapa.`,"",
        "Agora a equipe está conferindo o teor completo, eventuais recursos e os próximos passos para te orientar com segurança.",
        "Te aviso assim que essa conferência terminar."
      ]),"mérito"));
    }
    if(/AUDI[EÊ]NCIA/.test(U)){
      out.push(make("audiencia","Audiência identificada","Movimentação/publicação menciona audiência",lines([
        `Olá, ${nome}! Tudo bem?`,"",
        `Identificamos uma movimentação relacionada a audiência no processo nº ${cnj}.`,"",
        "Estamos conferindo data, horário, formato e necessidade de participação. Assim que validarmos esses detalhes, te enviamos a orientação completa."
      ]),"audiência"));
    }
    if(/CUMPRIMENTO DE SENTEN[CÇ]A|EXECU[CÇ][AÃ]O/.test(U)){
      out.push(make("cumprimento","Cumprimento / execução","Processo em fase de cumprimento",lines([
        `Olá, ${nome}! Tudo bem?`,"",
        `O processo nº ${cnj} teve movimentação na fase de cumprimento/execução.`,"",
        "A equipe está conferindo o que foi determinado e se existe alguma providência ou cálculo a ser feito. Te atualizamos assim que concluirmos essa revisão."
      ]),"cumprimento"));
    }
    if(/BAIXA DEFINITIVA|TR[AÂ]NSITO EM JULGADO|ARQUIV/.test(U)){
      out.push(make("baixa","Baixa / encerramento no tribunal","Tribunal sinaliza baixa, trânsito ou arquivamento",lines([
        `Olá, ${nome}! Tudo bem?`,"",
        `Identificamos uma movimentação de encerramento/baixa no processo nº ${cnj}.`,"",
        "Antes de tratar o caso como finalizado, nossa equipe vai conferir se existe valor, obrigação ou providência pendente. Depois dessa conferência, te passamos o fechamento correto."
      ]),"encerramento"));
    }
    if(/CUSTAS|TAXA JUDICI|GUIA|DARE|PREPARO/.test(U)&&!out.some(x=>x.id==="preparo")){
      out.push(make("custas","Custas / guia","Movimentação menciona custas ou guia",lines([
        `Olá, ${nome}! Tudo bem?`,"",
        `Há uma atualização sobre custas/guia no processo nº ${cnj}.`,"",
        "Estamos conferindo quem deve recolher, o valor e o prazo antes de te orientar. Não faça pagamento sem a guia validada pela equipe."
      ]),"custas"));
    }
    if(!out.length){
      const latest=pick(row,"Diagnóstico Processual","DataJud • Último Movimento","Último Andamento","Andamento","DJEN • Última Publicação","Resumo DJEN");
      out.push(make("geral","Atualização processual","Movimentação mais recente registrada",lines([
        `Olá, ${nome}! Tudo bem?`,"",
        `Trazendo uma atualização sobre o processo nº ${cnj}.`,
        latest?`A movimentação mais recente registrada é: ${strip(latest).slice(0,360)}`:"Há uma atualização em análise pela equipe.",
        "Estamos conferindo o impacto dessa movimentação e te avisamos caso exista alguma providência necessária."
      ]),"atendimento"));
    }
    return out.slice(0,4);
  }
  function quickMessage(row){
    return suggestResponses({row})[0]?.texto||"";
  }
  return {suggestResponses,quickMessage,strip};
});