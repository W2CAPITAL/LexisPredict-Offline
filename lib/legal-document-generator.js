(function(root,factory){
  const api=factory();
  if(typeof module==="object"&&module.exports)module.exports=api;
  if(root)root.SheetsLegalDocuments=api;
})(typeof window!=="undefined"?window:null,function(){
  "use strict";

  const STORAGE_KEY="sheetspredict_legal_document_draft_v1";
  const SPECIAL_POWERS=[
    "receber citação",
    "confessar",
    "reconhecer a procedência do pedido",
    "transigir",
    "desistir",
    "renunciar ao direito sobre o qual se funda a ação",
    "receber",
    "dar quitação",
    "firmar compromisso",
    "assinar declaração de hipossuficiência econômica"
  ];
  const TEMPLATES=[
    ["peticao-inicial","Petição inicial","Petições","CPC, arts. 319 e 320"],
    ["peticao-generica","Petição / manifestação genérica","Petições","Adequar ao ato processual"],
    ["procuracao","Procuração ad judicia","Mandatos","CPC, art. 105"],
    ["substabelecimento-com-reserva","Substabelecimento com reserva","Mandatos","Código de Ética da OAB, art. 26"],
    ["substabelecimento-sem-reserva","Substabelecimento sem reserva","Mandatos","Código de Ética da OAB, art. 26, §1º"],
    ["revogacao-mandato","Revogação de mandato / poderes","Mandatos","CPC, art. 111"],
    ["replica","Réplica à contestação","Petições","CPC, arts. 350 e 351"],
    ["impugnacao","Impugnação / manifestação","Petições","Adequar ao objeto impugnado"],
    ["impugnacao-cumprimento","Impugnação ao cumprimento de sentença","Execução","CPC, art. 525"],
    ["pugnacao","Pugnação / manifestação","Petições","Adequar ao despacho/intimação"],
    ["declaracao-hipossuficiencia","Declaração de hipossuficiência","Mandatos","CPC, arts. 98 e 99"],
    ["mle-tjsp","Formulário MLE — TJSP","Formulários","Formulário MLE oficial do TJSP"],
    ["notificacao-extrajudicial","Notificação extrajudicial","Extrajudicial","Fundamento material depende do caso"],
    ["apelacao","Apelação","Recursos","CPC, art. 1.009 e seguintes"],
    ["recurso-inominado","Recurso Inominado — JEC","Recursos","Lei 9.099/1995, arts. 41 e 42"],
    ["embargos-declaracao","Embargos de declaração","Recursos","CPC, arts. 1.022 e 1.023"],
    ["cumprimento-sentenca","Instaurar cumprimento de sentença","Execução","CPC, arts. 513, 523 e 524"]
  ].map(([id,label,category,basis])=>({id,label,category,basis}));

  const DEFAULTS={
    kind:"peticao-inicial",juizo:"",processo:"",autor:"",reu:"",clienteNome:"",cpf:"",rg:"",
    endereco:"",email:"",advogadoNome:"",oab:"",advogadoAnteriorNome:"",oabAnterior:"",
    advogadoNovoNome:"",oabNovo:"",tituloAcao:"",fatos:"",fundamentos:"",pedidos:"",decisao:"",
    prazoOuIntimacao:"",valorCausa:"",cidade:"",dataExtenso:"",notificante:"",notificado:"",
    enderecoNotificado:"",objetoNotificacao:"",prazoNotificacao:"",beneficiario:"",cpfBeneficiario:"",
    formaRecebimento:"",banco:"",agencia:"",conta:"",tipoConta:"",titularConta:"",cpfTitularConta:"",
    chavePix:"",valorExecucao:"",indiceCorrecao:"",juros:"",termoInicial:"",termoFinal:"",
    descontos:"",memoriaCalculo:"",observacoes:"",specialPowers:[],permiteSubstabelecer:true,
    clienteCienteSemReserva:false,revisouPrazo:false,dadosBancariosConferidos:false,draft:"",
    officeName:"",officeSubtitle:"Advocacia e Consultoria Jurídica",officeOab:"",officeEmail:"",officePhone:"",officeAddress:"",
    footerText:"",logoDataUrl:"",logoName:"",showLogo:true
  };

  const clean=v=>String(v??"").trim();
  const p=(v,label)=>clean(v)||"[PREENCHER "+String(label||"campo").toUpperCase()+"]";
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
  const digits=s=>String(s??"").replace(/\D/g,"");
  const todayExtenso=()=>new Date().toLocaleDateString("pt-BR",{day:"numeric",month:"long",year:"numeric"});
  const field=(d,k)=>p(d[k],k.replace(/([A-Z])/g," $1"));
  const parties=d=>"PROCESSO Nº: "+p(d.processo,"processo")+"\nAUTOR/REQUERENTE: "+p(d.autor||d.clienteNome,"autor")+"\nRÉU/REQUERIDO: "+p(d.reu,"réu");
  const sig=(d,role="Advogado(a)")=>p(d.cidade,"cidade")+", "+p(d.dataExtenso,"data")+".\n\n________________________________________\n"+p(d.advogadoNome||d.clienteNome,"assinante")+"\n"+(d.oab?"OAB "+d.oab:role);
  const body=(v,label)=>clean(v)||"[DESCREVER "+String(label).toUpperCase()+" COM BASE NOS AUTOS/DOCUMENTOS. NÃO INVENTAR FATOS.]";
  const qualification=d=>[
    p(d.clienteNome||d.autor,"nome"),
    d.cpf?"CPF nº "+d.cpf:"",
    d.rg?"RG nº "+d.rg:"",
    d.endereco?"residente e domiciliado(a) em "+d.endereco:"",
    d.email?"e-mail "+d.email:""
  ].filter(Boolean).join(", ");

  function warnings(kind,d){
    const w=[];
    if(["replica","impugnacao","impugnacao-cumprimento","apelacao","recurso-inominado","embargos-declaracao","cumprimento-sentenca"].includes(kind)&&!clean(d.processo))w.push("Informe e confira o número do processo.");
    if(["apelacao","recurso-inominado","embargos-declaracao","replica","impugnacao-cumprimento"].includes(kind)&&!d.revisouPrazo)w.push("Prazo/cabimento ainda não foram marcados como conferidos nos autos.");
    if(kind==="substabelecimento-sem-reserva"&&!d.clienteCienteSemReserva)w.push("Confirme o prévio e inequívoco conhecimento do cliente.");
    if(kind==="procuracao"&&!(d.specialPowers||[]).length)w.push("Nenhum poder especial foi selecionado; atos excepcionais não devem ser presumidos.");
    if(kind==="mle-tjsp"&&!d.dadosBancariosConferidos)w.push("Confira beneficiário, titularidade, conta/PIX e poderes antes de usar o MLE.");
    if(kind==="cumprimento-sentenca"&&!clean(d.memoriaCalculo))w.push("Inclua demonstrativo discriminado e atualizado do crédito.");
    if(kind==="impugnacao-cumprimento"&&/excesso/i.test(clean(d.fundamentos))&&!clean(d.memoriaCalculo))w.push("Se alegar excesso, informe o valor correto e o demonstrativo.");
    return w;
  }

  function build(kind,d){
    let title=(TEMPLATES.find(x=>x.id===kind)||TEMPLATES[0]).label.toUpperCase(),text="";
    const H=p(d.juizo,"juízo competente");
    if(kind==="peticao-inicial")text=`${H}

${p(d.autor||d.clienteNome,"autor")}, já qualificado(a), por seu advogado, vem respeitosamente propor

${p(d.tituloAcao,"nome da ação")}

em face de ${p(d.reu,"réu/requerido")}, pelos fatos e fundamentos a seguir.

I. DOS FATOS

${body(d.fatos,"fatos relevantes em ordem cronológica")}

II. DO DIREITO

${body(d.fundamentos,"fundamentos jurídicos e relação com os fatos")}

III. DOS PEDIDOS

${body(d.pedidos,"pedidos certos, determinados e individualizados")}

IV. DAS PROVAS

Requer a produção das provas pertinentes e a juntada dos documentos indispensáveis.

VALOR DA CAUSA: ${p(d.valorCausa,"valor da causa")}

Termos em que,
Pede deferimento.

${sig(d)}`;
    else if(kind==="peticao-generica")text=`${H}

${parties(d)}

${p(d.autor||d.clienteNome,"parte")}, já qualificado(a), vem apresentar

${p(d.tituloAcao||"PETIÇÃO / MANIFESTAÇÃO","título")}

${body(d.fatos,"objeto e fatos")}

FUNDAMENTAÇÃO

${body(d.fundamentos,"fundamentação")}

REQUERIMENTOS

${body(d.pedidos,"requerimentos")}

${sig(d)}`;
    else if(kind==="procuracao"){
      const sp=(d.specialPowers||[]).filter(Boolean);
      text=`PROCURAÇÃO AD JUDICIA

OUTORGANTE: ${qualification(d)}.

OUTORGADO(A): ${p(d.advogadoNome,"advogado")}${d.oab?", OAB "+d.oab:""}.

PODERES: poderes para o foro em geral, com cláusula ad judicia, em qualquer juízo, instância ou tribunal, podendo praticar os atos processuais ordinários necessários à defesa dos interesses do(a) outorgante${sp.length?"; e, de forma expressa, poderes para "+sp.join(", "):""}${d.permiteSubstabelecer?"; podendo substabelecer, com ou sem reserva":""}.

OBJETO: ${p(d.tituloAcao||"atuação judicial e extrajudicial","objeto")}${d.processo?", inclusive no processo nº "+d.processo:""}.

${p(d.cidade,"cidade")}, ${p(d.dataExtenso,"data")}.

________________________________________
${p(d.clienteNome||d.autor,"outorgante")}
Outorgante`;
    } else if(kind==="substabelecimento-com-reserva"||kind==="substabelecimento-sem-reserva"){
      const sem=kind==="substabelecimento-sem-reserva";
      text=`SUBSTABELECIMENTO ${sem?"SEM":"COM"} RESERVA DE PODERES

Pelo presente instrumento, ${p(d.advogadoAnteriorNome||d.advogadoNome,"advogado substabelecente")}${d.oabAnterior||d.oab?", OAB "+(d.oabAnterior||d.oab):""}, SUBSTABELECE, ${sem?"SEM":"COM"} RESERVA DE PODERES, a ${p(d.advogadoNovoNome,"advogado substabelecido")}${d.oabNovo?", OAB "+d.oabNovo:""}, os poderes recebidos de ${p(d.clienteNome||d.autor,"cliente/outorgante")}${d.processo?", nos autos do processo nº "+d.processo:""}.

${sem?"O substabelecimento sem reserva pressupõe o prévio e inequívoco conhecimento do cliente, cuja comprovação deve ser preservada.":"O substabelecente permanece habilitado no mandato, sem prejuízo dos poderes compartilhados."}

${p(d.cidade,"cidade")}, ${p(d.dataExtenso,"data")}.

________________________________________
${p(d.advogadoAnteriorNome||d.advogadoNome,"substabelecente")}
${d.oabAnterior||d.oab?"OAB "+(d.oabAnterior||d.oab):""}`;
    } else if(kind==="revogacao-mandato")text=`REVOGAÇÃO DE MANDATO E PODERES

REVOGANTE: ${qualification(d)}.

O(A) REVOGANTE declara revogados, a partir da comunicação deste ato, os poderes anteriormente conferidos a ${p(d.advogadoAnteriorNome,"advogado anterior")}${d.oabAnterior?", OAB "+d.oabAnterior:""}${d.processo?", relativamente ao processo nº "+d.processo:""}.

NOVO PATRONO: ${p(d.advogadoNovoNome,"novo advogado")}${d.oabNovo?", OAB "+d.oabNovo:""}, mediante procuração própria a ser juntada aos autos.

Requer-se, quando aplicável, a atualização da representação processual e das futuras intimações.

${p(d.cidade,"cidade")}, ${p(d.dataExtenso,"data")}.

________________________________________
${p(d.clienteNome||d.autor,"revogante")}
Revogante`;
    else if(kind==="replica")text=`${H}

${parties(d)}

${p(d.autor||d.clienteNome,"autor")}, já qualificado(a), vem apresentar RÉPLICA À CONTESTAÇÃO.

I. SÍNTESE DA DEFESA

${body(d.decisao,"teses, preliminares e documentos da contestação")}

II. IMPUGNAÇÃO ÀS PRELIMINARES E AOS FATOS ALEGADOS

${body(d.fatos,"resposta aos fatos impeditivos, modificativos ou extintivos")}

III. MÉRITO

${body(d.fundamentos,"fundamentos jurídicos e prova correspondente")}

IV. PEDIDOS

${body(d.pedidos,"pedidos e provas")}

${sig(d)}`;
    else if(kind==="impugnacao"||kind==="pugnacao"){
      title=kind==="pugnacao"?"MANIFESTAÇÃO / PUGNAÇÃO":"IMPUGNAÇÃO";
      text=`${H}

${parties(d)}

${p(d.autor||d.clienteNome,"parte")}, já qualificado(a), vem apresentar ${title} quanto a ${p(d.tituloAcao,"objeto")}.

I. DO OBJETO

${body(d.fatos,"ato, documento, cálculo ou alegação")}

II. DAS RAZÕES

${body(d.fundamentos,"razões fáticas, jurídicas e probatórias")}

III. DOS REQUERIMENTOS

${body(d.pedidos,"providências requeridas")}

${sig(d)}`;
    } else if(kind==="impugnacao-cumprimento")text=`${H}

${parties(d)}

${p(d.reu||d.clienteNome,"executado")}, já qualificado(a), vem apresentar IMPUGNAÇÃO AO CUMPRIMENTO DE SENTENÇA.

I. TEMPESTIVIDADE E DELIMITAÇÃO

INTIMAÇÃO / TERMO INICIAL: ${p(d.prazoOuIntimacao,"intimação ou termo inicial")}

II. FUNDAMENTOS

${body(d.fundamentos,"matérias efetivamente aplicáveis")}

III. EXCESSO DE EXECUÇÃO, SE ALEGADO

VALOR COBRADO: ${p(d.valorExecucao,"valor cobrado")}
VALOR ENTENDIDO COMO CORRETO: ${p(d.valorCausa,"valor correto")}
DEMONSTRATIVO: ${body(d.memoriaCalculo,"memória discriminada")}

IV. PEDIDOS

${body(d.pedidos,"pedidos")}

${sig(d)}`;
    else if(kind==="declaracao-hipossuficiencia")text=`DECLARAÇÃO DE HIPOSSUFICIÊNCIA ECONÔMICA

Eu, ${qualification(d)}, DECLARO, para fins de requerimento de gratuidade da justiça, que não disponho de recursos suficientes para arcar com custas, despesas processuais e honorários sem prejuízo do meu sustento e/ou de minha família, comprometendo-me a informar alteração relevante da situação econômica e a apresentar documentos quando exigidos.

${p(d.cidade,"cidade")}, ${p(d.dataExtenso,"data")}.

________________________________________
${p(d.clienteNome||d.autor,"declarante")}
Declarante`;
    else if(kind==="mle-tjsp")text=`FORMULÁRIO MLE — MANDADO DE LEVANTAMENTO ELETRÔNICO
MINUTA EDITÁVEL PARA CONFERÊNCIA — TJSP

Número do processo: ${p(d.processo,"processo")}
Credor / Beneficiário: ${p(d.beneficiario||d.clienteNome,"beneficiário")}
CPF/CNPJ do Beneficiário: ${p(d.cpfBeneficiario||d.cpf,"CPF/CNPJ")}

FORMA DE RECEBIMENTO: ${p(d.formaRecebimento,"forma de recebimento")}

Titular da conta: ${p(d.titularConta||d.beneficiario,"titular")}
CPF/CNPJ do titular: ${p(d.cpfTitularConta||d.cpfBeneficiario,"CPF/CNPJ do titular")}
Banco: ${p(d.banco,"banco")}
Agência: ${p(d.agencia,"agência")}
Conta: ${p(d.conta,"conta")}
Tipo de conta: ${p(d.tipoConta,"tipo de conta")}
Chave PIX: ${p(d.chavePix,"chave PIX")}

Advogado(a): ${p(d.advogadoNome,"advogado")}
OAB: ${p(d.oab,"OAB")}

OBSERVAÇÕES:
${clean(d.observacoes)||"[CONFERIR TITULARIDADE, PODERES PARA RECEBER/DAR QUITAÇÃO E O FORMULÁRIO OFICIAL VIGENTE ANTES DO PROTOCOLO.]"}`;
    else if(kind==="notificacao-extrajudicial")text=`NOTIFICAÇÃO EXTRAJUDICIAL

NOTIFICANTE: ${p(d.notificante||d.clienteNome,"notificante")}
NOTIFICADO(A): ${p(d.notificado||d.reu,"notificado")}
ENDEREÇO: ${p(d.enderecoNotificado,"endereço do notificado")}
ASSUNTO: ${p(d.objetoNotificacao||d.tituloAcao,"objeto")}

O(A) NOTIFICANTE comunica formalmente:

${body(d.fatos,"fatos, datas e documentos")}

FUNDAMENTO / POSIÇÃO DO NOTIFICANTE

${body(d.fundamentos,"fundamento contratual ou legal")}

Diante disso, fica o(a) NOTIFICADO(A) instado(a) a:

${body(d.pedidos,"providência ou solução")}

PRAZO PARA RESPOSTA/CUMPRIMENTO: ${p(d.prazoNotificacao,"prazo")}

Esta notificação registra a comunicação e oportuniza solução documentada, sem renúncia a direitos não expressamente renunciados.

${p(d.cidade,"cidade")}, ${p(d.dataExtenso,"data")}.

________________________________________
${p(d.notificante||d.clienteNome,"notificante")}
Notificante`;
    else if(kind==="apelacao")text=`${H}

${parties(d)}

${p(d.autor||d.clienteNome,"apelante")}, já qualificado(a), vem interpor RECURSO DE APELAÇÃO, requerendo seu recebimento e remessa ao Tribunal competente.

${p(d.cidade,"cidade")}, ${p(d.dataExtenso,"data")}.

${p(d.advogadoNome,"advogado")}
${d.oab?"OAB "+d.oab:"[PREENCHER OAB]"}

RAZÕES DE APELAÇÃO

I. TEMPESTIVIDADE / PREPARO

${body(d.prazoOuIntimacao,"intimação, contagem e preparo/gratuidade")}

II. SÍNTESE DA SENTENÇA

${body(d.decisao,"capítulos impugnados")}

III. RAZÕES PARA REFORMA OU ANULAÇÃO

${body(d.fundamentos,"fundamentos recursais")}

IV. PEDIDOS

${body(d.pedidos,"conhecimento e provimento")}`;
    else if(kind==="recurso-inominado")text=`${H}

${parties(d)}

${p(d.autor||d.clienteNome,"recorrente")}, por seu advogado, vem interpor RECURSO INOMINADO contra a sentença, requerendo o regular processamento e remessa à Turma Recursal.

I. TEMPESTIVIDADE E PREPARO

${body(d.prazoOuIntimacao,"ciência, contagem e preparo/gratuidade")}

II. SÍNTESE DA SENTENÇA

${body(d.decisao,"pontos recorridos")}

III. RAZÕES RECURSAIS

${body(d.fundamentos,"fundamentos de reforma")}

IV. PEDIDOS

${body(d.pedidos,"conhecimento e provimento")}

${sig(d)}`;
    else if(kind==="embargos-declaracao")text=`${H}

${parties(d)}

${p(d.autor||d.clienteNome,"embargante")}, já qualificado(a), vem opor EMBARGOS DE DECLARAÇÃO.

I. TEMPESTIVIDADE

${body(d.prazoOuIntimacao,"intimação e contagem")}

II. VÍCIO DA DECISÃO

DECISÃO EMBARGADA:
${body(d.decisao,"trecho ou questão da decisão")}

VÍCIO APONTADO:
${body(d.fundamentos,"obscuridade, contradição, omissão ou erro material")}

III. PEDIDOS

${body(d.pedidos,"saneamento do vício")}

${sig(d)}`;
    else if(kind==="cumprimento-sentenca")text=`${H}

${parties(d)}

${p(d.autor||d.clienteNome,"exequente")}, já qualificado(a), vem requerer a INSTAURAÇÃO DO CUMPRIMENTO DE SENTENÇA.

I. TÍTULO EXECUTIVO JUDICIAL

${body(d.decisao,"sentença/acórdão e situação do trânsito ou cumprimento provisório")}

II. CRÉDITO ATUALIZADO

Valor principal/base: ${p(d.valorCausa,"valor principal")}
Índice de correção: ${p(d.indiceCorrecao,"índice")}
Juros: ${p(d.juros,"juros")}
Termo inicial: ${p(d.termoInicial,"termo inicial")}
Data-base: ${p(d.termoFinal,"data-base")}
Descontos: ${clean(d.descontos)||"Nenhum informado"}
Valor atualizado: ${p(d.valorExecucao,"valor atualizado")}

DEMONSTRATIVO DISCRIMINADO E ATUALIZADO:
${body(d.memoriaCalculo,"memória de cálculo")}

III. PEDIDOS

${body(d.pedidos,"intimação para pagamento e medidas executivas cabíveis")}

${sig(d)}`;
    return {title,text,warnings:warnings(kind,d),template:TEMPLATES.find(x=>x.id===kind)||TEMPLATES[0]};
  }

  function extractFromRow(r){
    const get=(...keys)=>{
      for(const k of keys)if(r&&r[k]!=null&&clean(r[k]))return clean(r[k]);
      const map={};Object.keys(r||{}).forEach(k=>map[k.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"")]=k);
      for(const k of keys){const real=map[k.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"")];if(real&&clean(r[real]))return clean(r[real])}
      return "";
    };
    const cnj=get("Protocolo","CNJ","processo");
    const client=get("Cliente","Nome do Cliente","Nome");
    return {
      processo:cnj,autor:client,clienteNome:client,cpf:get("CPF","CPF Cliente"),email:get("Email","E-mail"),
      reu:get("Banco","Requerido","Réu","Empresa"),tituloAcao:get("Tipo de Ação","Ação","Assunto"),
      advogadoNome:get("Advogado","Advogado Responsável"),cidade:get("Comarca","Cidade"),fatos:[
        get("DataJud • Último Movimento","Último Movimento","Andamento"),
        get("DJEN • Última Publicação","Publicação DJEN"),
        get("Observações","Obs")
      ].filter(Boolean).join("\n\n")
    };
  }

  function download(name,blob){
    const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.style.display="none";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);
  }
  function safeName(s){return String(s||"documento").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9_-]+/g,"_").replace(/^_+|_+$/g,"").slice(0,90)}
  function rtfEscape(text){return String(text||"").replace(/\\/g,"\\\\").replace(/\{/g,"\\{").replace(/\}/g,"\\}").replace(/[^\x00-\x7F]/g,c=>"\\u"+c.charCodeAt(0)+"?").replace(/\r?\n/g,"\\par\n")}
  function officeBrand(d){
    const office=clean(d.officeName)||clean(d.advogadoNome)||"ESCRITÓRIO DE ADVOCACIA";
    const subtitle=clean(d.officeSubtitle)||"Advocacia e Consultoria Jurídica";
    const oab=clean(d.officeOab)||clean(d.oab);
    const contact=[oab?"OAB "+oab:"",clean(d.officePhone),clean(d.officeEmail)].filter(Boolean).join("  •  ");
    return {office,subtitle,contact,address:clean(d.officeAddress),footer:clean(d.footerText),logoDataUrl:clean(d.logoDataUrl),showLogo:d.showLogo!==false};
  }
  function rtfDocument(title,text,d){
    const b=officeBrand(d);
    const header=[b.office,b.subtitle,b.contact,b.address].filter(Boolean).map(rtfEscape).join("\\line ");
    return "{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Times New Roman;}{\\f1 Arial;}}"+
      "\\paperw11907\\paperh16840\\margl1587\\margr1134\\margt1417\\margb1247"+
      "\\qc\\f1\\b\\fs30 "+rtfEscape(b.office)+"\\b0\\fs18\\line "+
      (b.subtitle?rtfEscape(b.subtitle)+"\\line ":"")+
      (b.contact?rtfEscape(b.contact)+"\\line ":"")+
      (b.address?rtfEscape(b.address)+"\\line ":"")+
      "\\brdrb\\brdrs\\brdrw15\\brsp40\\par\\pard\\sa220"+
      "\\qc\\f0\\b\\fs28 "+rtfEscape(title)+"\\b0\\par\\sa220"+
      "\\qj\\fs24 "+rtfEscape(text)+"\\par"+
      (b.footer?"\\pard\\qc\\fs16\\i "+rtfEscape(b.footer)+"\\i0\\par":"")+
      "}";
  }
  async function ensureJsPdf(){
    if(typeof window!=="undefined"&&window.jspdf?.jsPDF)return window.jspdf.jsPDF;
    if(typeof document==="undefined")throw new Error("jsPDF indisponível.");
    const urls=[
      "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js",
      "https://unpkg.com/jspdf@2.5.2/dist/jspdf.umd.min.js"
    ];
    for(const src of urls){
      try{
        await new Promise((resolve,reject)=>{
          const old=[...document.scripts].find(s=>s.src===src);
          if(old){if(window.jspdf?.jsPDF)return resolve();old.addEventListener("load",resolve,{once:true});old.addEventListener("error",reject,{once:true});return}
          const s=document.createElement("script");s.src=src;s.async=true;s.onload=resolve;s.onerror=reject;document.head.appendChild(s);
        });
        if(window.jspdf?.jsPDF)return window.jspdf.jsPDF;
      }catch(_){}
    }
    throw new Error("Não foi possível carregar o gerador de PDF. Verifique a conexão e tente novamente.");
  }
  function isHeadingLine(line){
    const s=clean(line);
    if(!s)return false;
    if(/^([IVXLCDM]+|\d+)[.\-)]\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(s))return true;
    if(s.length<=92&&s===s.toUpperCase()&&/[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(s)&&!s.startsWith("[PREENCHER"))return true;
    return /^(RAZÕES DE|DOS FATOS|DO DIREITO|DOS PEDIDOS|REQUERIMENTOS|FUNDAMENTAÇÃO|OBSERVAÇÕES|DEMONSTRATIVO)/i.test(s);
  }
  function pdfImageFormat(dataUrl){
    if(/^data:image\/jpe?g/i.test(dataUrl))return "JPEG";
    if(/^data:image\/webp/i.test(dataUrl))return "WEBP";
    return "PNG";
  }
  async function downloadPdfDocument(title,text,d){
    const JsPDF=await ensureJsPdf();
    const doc=new JsPDF({orientation:"portrait",unit:"mm",format:"a4",compress:true,putOnlyUsedFonts:true});
    const brand=officeBrand(d);
    const pageW=210,pageH=297,left=28,right=20,bottom=22,width=pageW-left-right;
    const wine=[103,29,43],gold=[184,155,94],ink=[30,27,24],muted=[103,95,87];
    let y=0;

    function header(){
      y=15;
      const hasLogo=brand.showLogo&&brand.logoDataUrl;
      if(hasLogo){
        try{
          const props=doc.getImageProperties(brand.logoDataUrl);
          const maxW=28,maxH=18,ratio=Math.min(maxW/props.width,maxH/props.height);
          const w=props.width*ratio,h=props.height*ratio;
          doc.addImage(brand.logoDataUrl,pdfImageFormat(brand.logoDataUrl),left,y-4,w,h,undefined,"FAST");
        }catch(_){}
      }
      const tx=hasLogo?left+34:left;
      doc.setFont("helvetica","bold");doc.setFontSize(12.5);doc.setTextColor(...wine);
      doc.text(brand.office,tx,y,{maxWidth:pageW-right-tx});
      y+=5;
      doc.setFont("helvetica","normal");doc.setFontSize(8.2);doc.setTextColor(...muted);
      if(brand.subtitle){doc.text(brand.subtitle,tx,y,{maxWidth:pageW-right-tx});y+=4}
      if(brand.contact){doc.text(brand.contact,tx,y,{maxWidth:pageW-right-tx});y+=4}
      if(brand.address){doc.text(brand.address,tx,y,{maxWidth:pageW-right-tx});y+=4}
      y=Math.max(y,33);
      doc.setDrawColor(...gold);doc.setLineWidth(.45);doc.line(left,y,pageW-right,y);
      doc.setDrawColor(...wine);doc.setLineWidth(1.05);doc.line(left,y-1.2,left+34,y-1.2);
      y+=11;
    }
    function newPage(){
      if(doc.getNumberOfPages()>0)doc.addPage();
      header();
    }
    function ensureSpace(mm){
      if(y+mm>pageH-bottom){doc.addPage();header()}
    }
    function drawTitle(){
      ensureSpace(20);
      doc.setFont("times","bold");doc.setFontSize(13.5);doc.setTextColor(...ink);
      const lines=doc.splitTextToSize(String(title||"PEÇA JURÍDICA").toUpperCase(),width-12);
      doc.text(lines,pageW/2,y,{align:"center",lineHeightFactor:1.2});
      y+=lines.length*6.2+8;
    }
    function drawParagraph(paragraph){
      const s=clean(paragraph);
      if(!s){y+=3.2;return}
      if(isHeadingLine(s)){
        ensureSpace(13);
        doc.setFont("times","bold");doc.setFontSize(11.3);doc.setTextColor(...wine);
        const lines=doc.splitTextToSize(s,width);
        doc.text(lines,left,y,{lineHeightFactor:1.25});
        y+=lines.length*5.5+3.5;return;
      }
      if(/^_{5,}$/.test(s)){
        ensureSpace(9);doc.setDrawColor(70,70,70);doc.setLineWidth(.25);doc.line(left,y,pageW-right-65,y);y+=7;return;
      }
      const meta=/^(PROCESSO|AUTOR\/REQUERENTE|RÉU\/REQUERIDO|APELANTE|APELADO|RECORRENTE|RECORRIDO|VALOR|BANCO|AGÊNCIA|CONTA|OAB|CPF|RG|ENDEREÇO|ASSUNTO|NOTIFICANTE|NOTIFICADO)/i.test(s)&&s.length<220;
      doc.setFont("times",meta?"bold":"normal");doc.setFontSize(meta?10.5:11.2);doc.setTextColor(...ink);
      const lines=doc.splitTextToSize(s,width);
      const lineH=5.35,needed=lines.length*lineH+3.4;
      ensureSpace(Math.min(needed,45));
      for(let i=0;i<lines.length;i++){
        if(y>pageH-bottom){doc.addPage();header()}
        const last=i===lines.length-1;
        doc.text(lines[i],left,y,{align:!meta&&!last&&lines[i].length>45?"justify":"left",maxWidth:width});
        y+=lineH;
      }
      y+=3.2;
    }

    header();drawTitle();
    let normalized=String(text||"").replace(/\r/g,"").trim();
    const titleUpper=String(title||"").trim().toUpperCase();
    if(normalized.split("\n")[0]?.trim().toUpperCase()===titleUpper)normalized=normalized.split("\n").slice(1).join("\n").trim();
    const blocks=normalized.split(/\n\s*\n/);
    for(const block of blocks){
      const lines=block.split("\n");
      if(lines.length>1&&lines.every(x=>clean(x).length<180)){
        for(const line of lines)drawParagraph(line);
      }else drawParagraph(block);
    }
    const pages=doc.getNumberOfPages();
    for(let page=1;page<=pages;page++){
      doc.setPage(page);
      doc.setDrawColor(210,201,181);doc.setLineWidth(.25);doc.line(left,pageH-15,pageW-right,pageH-15);
      doc.setFont("helvetica","normal");doc.setFontSize(7.5);doc.setTextColor(...muted);
      const foot=brand.footer||[brand.office,brand.contact].filter(Boolean).join(" • ");
      if(foot)doc.text(foot,left,pageH-10,{maxWidth:width-30});
      doc.text("Página "+page+" de "+pages,pageW-right,pageH-10,{align:"right"});
    }
    doc.save(safeName(title)+(d.processo?"_"+safeName(d.processo):"")+".pdf");
  }
  function normalizeLogo(file){
    return new Promise((resolve,reject)=>{
      if(!file)return resolve({dataUrl:"",name:""});
      if(!/^image\/(png|jpe?g|webp)$/i.test(file.type||""))return reject(new Error("Use logo PNG, JPG ou WebP."));
      if(file.size>4*1024*1024)return reject(new Error("O logo deve ter até 4 MB."));
      const reader=new FileReader();
      reader.onerror=()=>reject(new Error("Não foi possível ler o logo."));
      reader.onload=()=>{
        const img=new Image();
        img.onerror=()=>reject(new Error("Imagem de logo inválida."));
        img.onload=()=>{
          const maxW=900,maxH=320,ratio=Math.min(1,maxW/img.width,maxH/img.height);
          const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(img.width*ratio));canvas.height=Math.max(1,Math.round(img.height*ratio));
          const ctx=canvas.getContext("2d");ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
          resolve({dataUrl:canvas.toDataURL("image/png"),name:file.name||"logo"});
        };
        img.src=String(reader.result||"");
      };
      reader.readAsDataURL(file);
    });
  }

  function render(root,opts={}){
    const rows=typeof opts.rows==="function"?opts.rows():[];
    let state={...DEFAULTS,dataExtenso:todayExtenso()};
    try{
      const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");
      if(saved&&typeof saved==="object")state={...state,...saved,specialPowers:Array.isArray(saved.specialPowers)?saved.specialPowers:[]};
    }catch(_){}
    const options=TEMPLATES.map(t=>'<option value="'+esc(t.id)+'">'+esc(t.label)+' · '+esc(t.category)+'</option>').join("");
    const rowOptions=['<option value="">— selecionar processo da carteira —</option>'].concat((rows||[]).slice(0,1500).map((r,i)=>{
      const x=extractFromRow(r),label=[x.processo,x.clienteNome,x.reu].filter(Boolean).join(" · ")||("Registro "+(i+1));
      return '<option value="'+i+'">'+esc(label)+'</option>';
    })).join("");

    root.innerHTML=`
      <div class="legalgen-shell">
        <div class="legalgen-head">
          <div><span class="eyebrow">DOCUMENTOS JURÍDICOS</span><h2>Central de Peças Jurídicas</h2><p>17 modelos · timbre profissional · logo opcional · PDF direto · RTF editável</p></div>
          <span class="legalgen-badge">Pronto para protocolo</span>
        </div>
        <div class="legalgen-grid">
          <aside class="legalgen-side">
            <section class="card legalgen-card">
              <h3>1. Documento</h3>
              <label>Tipo<select id="lgKind">${options}</select></label>
              <div id="lgTemplateMeta" class="legalgen-meta"></div>
            </section>

            <section class="card legalgen-card">
              <h3>2. Pré-preencher</h3>
              <label>Processo da carteira<select id="lgRow">${rowOptions}</select></label>
              <label>Ou cole texto/processo<textarea id="lgSource" rows="6" placeholder="Cole aqui dados do processo, decisão, contestação ou contrato..."></textarea></label>
              <button class="btn" id="lgExtract">Extrair dados básicos do texto</button>
            </section>

            <section class="card legalgen-card legalgen-brand-card">
              <div class="legalgen-section-title">
                <div><h3>3. Timbre do escritório</h3><p>Aplicado em todas as peças. O logo é opcional.</p></div>
                <span class="legalgen-brand-pill">Timbre ativo</span>
              </div>
              <div class="legalgen-fields">
                <label>Nome do escritório<input data-brand="officeName" value="${esc(state.officeName||"")}" placeholder="Ex.: Scalli & Amorim Advocacia"/></label>
                <label>Subtítulo<input data-brand="officeSubtitle" value="${esc(state.officeSubtitle||"")}" placeholder="Advocacia e Consultoria Jurídica"/></label>
                <label>OAB do escritório / responsável<input data-brand="officeOab" value="${esc(state.officeOab||"")}" placeholder="SP 000000"/></label>
                <label>Telefone<input data-brand="officePhone" value="${esc(state.officePhone||"")}" placeholder="(11) 0000-0000"/></label>
                <label>E-mail<input data-brand="officeEmail" value="${esc(state.officeEmail||"")}" placeholder="contato@escritorio.com.br"/></label>
                <label>Endereço<input data-brand="officeAddress" value="${esc(state.officeAddress||"")}" placeholder="Rua, nº · Cidade/SP"/></label>
              </div>
              <label>Rodapé opcional<input data-brand="footerText" value="${esc(state.footerText||"")}" placeholder="Site · telefone · endereço ou mensagem institucional"/></label>
              <div class="legalgen-logo-upload">
                <div id="lgLogoThumb" class="legalgen-logo-thumb"></div>
                <div class="legalgen-logo-copy">
                  <strong>Logo do escritório</strong>
                  <span id="lgLogoStatus">${state.logoDataUrl?esc(state.logoName||"Logo carregado"):"Sem logo — o timbre textual será usado"}</span>
                  <div class="legalgen-logo-actions">
                    <label class="btn sm legalgen-file-btn">Carregar logo<input id="lgLogoFile" type="file" accept="image/png,image/jpeg,image/webp"/></label>
                    <button class="btn sm" id="lgRemoveLogo" type="button">Remover</button>
                  </div>
                  <label class="legalgen-check"><input id="lgShowLogo" type="checkbox" ${state.showLogo!==false?"checked":""}/> Exibir logo no timbre</label>
                </div>
              </div>
            </section>

            <section class="card legalgen-card"><h3>4. Dados da peça</h3><div class="legalgen-fields" id="lgFields"></div></section>
            <section class="card legalgen-card hidden" id="lgSpecial"></section>

            <section class="card legalgen-card"><h3>5. Conteúdo jurídico</h3>
              <label>Fatos / objeto<textarea id="lgFatos" rows="7"></textarea></label>
              <label>Fundamentos<textarea id="lgFundamentos" rows="7"></textarea></label>
              <label>Pedidos / requerimentos<textarea id="lgPedidos" rows="7"></textarea></label>
              <label>Decisão / contestação / título<textarea id="lgDecisao" rows="6"></textarea></label>
              <label>Memória de cálculo<textarea id="lgMemoria" rows="6"></textarea></label>
              <div class="legalgen-checks"><label><input type="checkbox" id="lgPrazo"/> Conferi cabimento, intimação, prazo e preparo/gratuidade</label></div>
              <button class="btn primary block" id="lgGenerate">Gerar / atualizar minuta</button>
            </section>
          </aside>

          <section class="legalgen-editor">
            <div id="lgWarnings" class="legalgen-warnings hidden"></div>
            <div class="card legalgen-paper-card">
              <div class="legalgen-editor-head">
                <div><span class="eyebrow">EDITOR FINAL</span><h3 id="lgTitle">Minuta</h3></div>
                <span id="lgCount">0 caracteres</span>
              </div>
              <div id="lgLetterheadPreview" class="legalgen-letterhead-preview"></div>
              <textarea id="lgDraft" class="legalgen-paper" placeholder="Selecione o documento e clique em Gerar / atualizar minuta."></textarea>
              <div class="legalgen-paper-foot-preview"><span id="lgFooterPreview"></span><span>SheetsPredict · minuta editável</span></div>
            </div>
            <div class="legalgen-actions">
              <button class="btn" id="lgCopy">Copiar</button>
              <button class="btn" id="lgSave">Salvar rascunho</button>
              <button class="btn" id="lgRtf">Baixar RTF editável</button>
              <button class="btn primary" id="lgPdf">Baixar PDF</button>
              <button class="btn" id="lgNew">Nova minuta</button>
            </div>
            <div class="legalgen-export-note">O PDF é gerado e baixado diretamente nesta página, sem popup e sem depender da janela de impressão do navegador.</div>
          </section>
        </div>
      </div>`;

    const $=s=>root.querySelector(s),kind=$("#lgKind"),draft=$("#lgDraft");
    kind.value=state.kind||"peticao-inicial";

    const names=[
      ["juizo","Juízo / destinatário"],["processo","Processo CNJ"],["autor","Autor / requerente"],["reu","Réu / requerido"],
      ["clienteNome","Cliente / outorgante"],["cpf","CPF/CNPJ"],["rg","RG"],["endereco","Endereço"],["email","E-mail"],
      ["advogadoNome","Advogado responsável"],["oab","OAB"],["tituloAcao","Ação / assunto / objeto"],["valorCausa","Valor da causa / valor correto"],
      ["prazoOuIntimacao","Intimação / prazo / termo inicial"],["cidade","Cidade"],["dataExtenso","Data por extenso"],
      ["advogadoAnteriorNome","Advogado anterior / substabelecente"],["oabAnterior","OAB anterior"],["advogadoNovoNome","Novo advogado / substabelecido"],["oabNovo","OAB novo"],
      ["notificante","Notificante"],["notificado","Notificado"],["enderecoNotificado","Endereço do notificado"],["objetoNotificacao","Objeto da notificação"],["prazoNotificacao","Prazo da notificação"],
      ["beneficiario","Beneficiário MLE"],["cpfBeneficiario","CPF/CNPJ beneficiário"],["formaRecebimento","Forma de recebimento"],["banco","Banco"],["agencia","Agência"],["conta","Conta"],["tipoConta","Tipo de conta"],["titularConta","Titular da conta"],["cpfTitularConta","CPF/CNPJ titular"],["chavePix","Chave PIX"],
      ["valorExecucao","Valor atualizado / cobrado"],["indiceCorrecao","Índice de correção"],["juros","Juros"],["termoInicial","Termo inicial"],["termoFinal","Data-base"],["descontos","Descontos"]
    ];
    $("#lgFields").innerHTML=names.map(([k,l])=>'<label data-lg-field="'+k+'">'+esc(l)+'<input data-key="'+k+'" value="'+esc(state[k]||"")+'"/></label>').join("");
    $("#lgFatos").value=state.fatos||"";
    $("#lgFundamentos").value=state.fundamentos||"";
    $("#lgPedidos").value=state.pedidos||"";
    $("#lgDecisao").value=state.decisao||"";
    $("#lgMemoria").value=state.memoriaCalculo||"";
    $("#lgPrazo").checked=!!state.revisouPrazo;
    draft.value=state.draft||"";

    const read=()=>{
      const d={...state,kind:kind.value};
      root.querySelectorAll("[data-key]").forEach(el=>d[el.dataset.key]=el.value);
      root.querySelectorAll("[data-brand]").forEach(el=>d[el.dataset.brand]=el.value);
      d.fatos=$("#lgFatos").value;
      d.fundamentos=$("#lgFundamentos").value;
      d.pedidos=$("#lgPedidos").value;
      d.decisao=$("#lgDecisao").value;
      d.memoriaCalculo=$("#lgMemoria").value;
      d.revisouPrazo=$("#lgPrazo").checked;
      d.showLogo=$("#lgShowLogo")?.checked!==false;
      d.draft=draft.value;
      if(!Array.isArray(d.specialPowers))d.specialPowers=[];
      root.querySelectorAll("[data-power]").forEach(el=>{
        if(el.checked&&!d.specialPowers.includes(el.value))d.specialPowers.push(el.value);
        if(!el.checked)d.specialPowers=d.specialPowers.filter(x=>x!==el.value);
      });
      const ciente=$("#lgClientAware"),bank=$("#lgBankChecked"),subst=$("#lgCanSubst");
      if(ciente)d.clienteCienteSemReserva=ciente.checked;
      if(bank)d.dadosBancariosConferidos=bank.checked;
      if(subst)d.permiteSubstabelecer=subst.checked;
      state=d;
      return d;
    };

    const write=d=>{
      state={...state,...d};
      root.querySelectorAll("[data-key]").forEach(el=>{if(Object.hasOwn(state,el.dataset.key))el.value=state[el.dataset.key]||""});
      root.querySelectorAll("[data-brand]").forEach(el=>{if(Object.hasOwn(state,el.dataset.brand))el.value=state[el.dataset.brand]||""});
      $("#lgFatos").value=state.fatos||"";
      $("#lgFundamentos").value=state.fundamentos||"";
      $("#lgPedidos").value=state.pedidos||"";
      $("#lgDecisao").value=state.decisao||"";
      $("#lgMemoria").value=state.memoriaCalculo||"";
      renderBrandPreview();
    };

    const renderBrandPreview=()=>{
      const d={...state};
      root.querySelectorAll("[data-brand]").forEach(el=>d[el.dataset.brand]=el.value);
      d.showLogo=$("#lgShowLogo")?.checked!==false;
      const b=officeBrand(d),box=$("#lgLetterheadPreview"),thumb=$("#lgLogoThumb"),status=$("#lgLogoStatus");
      if(thumb){
        thumb.innerHTML=b.showLogo&&b.logoDataUrl?'<img src="'+esc(b.logoDataUrl)+'" alt="Logo do escritório"/>':'<span>§</span>';
      }
      if(status)status.textContent=d.logoDataUrl?(d.logoName||"Logo carregado"):"Sem logo — o timbre textual será usado";
      if(box){
        box.innerHTML='<div class="legalgen-letterhead-mark">'+(b.showLogo&&b.logoDataUrl?'<img src="'+esc(b.logoDataUrl)+'" alt=""/>':'<span>§</span>')+'</div>'+
          '<div class="legalgen-letterhead-copy"><strong>'+esc(b.office)+'</strong>'+
          (b.subtitle?'<span>'+esc(b.subtitle)+'</span>':'')+
          (b.contact?'<small>'+esc(b.contact)+'</small>':'')+
          (b.address?'<small>'+esc(b.address)+'</small>':'')+'</div>';
      }
      const foot=$("#lgFooterPreview");if(foot)foot.textContent=b.footer||[b.office,b.contact].filter(Boolean).join(" · ");
    };

    const meta=()=>{
      const t=TEMPLATES.find(x=>x.id===kind.value)||TEMPLATES[0];
      $("#lgTemplateMeta").innerHTML='<strong>'+esc(t.category)+'</strong><span>'+esc(t.basis)+'</span>';
      renderSpecial();
    };

    const renderSpecial=()=>{
      const box=$("#lgSpecial"),k=kind.value,d=read();
      if(k==="procuracao"){
        box.classList.remove("hidden");
        box.innerHTML='<h3>Poderes especiais</h3><p class="muted">Selecione somente os poderes efetivamente autorizados.</p><div class="legalgen-power-list">'+SPECIAL_POWERS.map(x=>'<label><input type="checkbox" data-power value="'+esc(x)+'" '+((d.specialPowers||[]).includes(x)?"checked":"")+'/> '+esc(x)+'</label>').join("")+'</div><label class="legalgen-check"><input id="lgCanSubst" type="checkbox" '+(d.permiteSubstabelecer?"checked":"")+'/> Autorizar substabelecimento</label>';
      }else if(k==="substabelecimento-sem-reserva"){
        box.classList.remove("hidden");
        box.innerHTML='<h3>Confirmação necessária</h3><label class="legalgen-check warn"><input id="lgClientAware" type="checkbox" '+(d.clienteCienteSemReserva?"checked":"")+'/> Há prévio e inequívoco conhecimento do cliente.</label>';
      }else if(k==="mle-tjsp"){
        box.classList.remove("hidden");
        box.innerHTML='<h3>Conferência MLE</h3><label class="legalgen-check warn"><input id="lgBankChecked" type="checkbox" '+(d.dadosBancariosConferidos?"checked":"")+'/> Beneficiário, titularidade, conta/PIX e poderes foram conferidos.</label>';
      }else{
        box.classList.add("hidden");box.innerHTML="";
      }
    };

    const generate=()=>{
      const d=read(),r=build(kind.value,d);
      draft.value=r.text;
      state.draft=r.text;
      $("#lgTitle").textContent=r.title;
      $("#lgCount").textContent=r.text.length.toLocaleString("pt-BR")+" caracteres";
      const w=$("#lgWarnings");
      w.classList.toggle("hidden",!r.warnings.length);
      w.innerHTML=r.warnings.length?'<strong>Conferir antes de usar</strong><ul>'+r.warnings.map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul>':"";
      renderBrandPreview();
      if(opts.showBanner)opts.showBanner("Minuta gerada. Revise integralmente antes do protocolo.","good");
    };

    kind.onchange=()=>{state.kind=kind.value;meta()};
    $("#lgRow").onchange=e=>{
      const idx=Number(e.target.value);
      if(!Number.isInteger(idx)||idx<0||!rows[idx])return;
      write(extractFromRow(rows[idx]));
      if(opts.showBanner)opts.showBanner("Dados do processo carregados da carteira.","good");
    };
    $("#lgExtract").onclick=()=>{
      const text=clean($("#lgSource").value);if(!text)return;
      const cnj=text.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/)?.[0]||"";
      const cpf=text.match(/\d{3}\.\d{3}\.\d{3}-\d{2}/)?.[0]||"";
      const email=text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]||"";
      const data={processo:cnj||state.processo,cpf:cpf||state.cpf,email:email||state.email};
      const first=text.split(/\r?\n/).map(x=>x.trim()).find(x=>x.length>8&&x.length<90&&!/^(processo|evento|tipo documento)/i.test(x));
      if(first)data.clienteNome=state.clienteNome||first;
      data.fatos=state.fatos||text.slice(0,12000);
      write(data);
      if(opts.showBanner)opts.showBanner("Dados básicos extraídos. Revise antes de gerar.","good");
    };

    root.querySelectorAll("[data-brand]").forEach(el=>{
      el.addEventListener("input",()=>{state[el.dataset.brand]=el.value;renderBrandPreview()});
    });
    $("#lgShowLogo").onchange=()=>{state.showLogo=$("#lgShowLogo").checked;renderBrandPreview()};
    $("#lgLogoFile").onchange=async e=>{
      const file=e.target.files?.[0];
      if(!file)return;
      try{
        const logo=await normalizeLogo(file);
        state.logoDataUrl=logo.dataUrl;state.logoName=logo.name;state.showLogo=true;
        $("#lgShowLogo").checked=true;
        renderBrandPreview();
        const persist=read();persist.draft=draft.value;
        try{localStorage.setItem(STORAGE_KEY,JSON.stringify(persist))}catch(_){}
        if(opts.showBanner)opts.showBanner("Logo carregado e salvo no timbre.","good");
      }catch(err){
        if(opts.showBanner)opts.showBanner(err?.message||String(err),"bad");
      }finally{e.target.value=""}
    };
    $("#lgRemoveLogo").onclick=()=>{
      state.logoDataUrl="";state.logoName="";
      renderBrandPreview();
      const persist=read();persist.logoDataUrl="";persist.logoName="";
      try{localStorage.setItem(STORAGE_KEY,JSON.stringify(persist))}catch(_){}
    };

    $("#lgGenerate").onclick=generate;
    draft.oninput=()=>{$("#lgCount").textContent=draft.value.length.toLocaleString("pt-BR")+" caracteres";state.draft=draft.value};
    $("#lgCopy").onclick=async()=>{
      await navigator.clipboard.writeText(draft.value||build(kind.value,read()).text);
      if(opts.showBanner)opts.showBanner("Texto copiado.","good");
    };
    $("#lgSave").onclick=()=>{
      const d=read();d.draft=draft.value;
      try{
        localStorage.setItem(STORAGE_KEY,JSON.stringify(d));
        if(opts.showBanner)opts.showBanner("Rascunho e timbre salvos neste navegador.","good");
      }catch{
        if(opts.showBanner)opts.showBanner("O navegador não conseguiu salvar o rascunho. Se o logo for muito grande, use uma imagem menor.","bad");
      }
    };
    $("#lgRtf").onclick=()=>{
      const d=read(),r=build(kind.value,d),text=draft.value||r.text,rtf=rtfDocument(r.title,text,d);
      download(safeName(r.title)+(d.processo?"_"+safeName(d.processo):"")+".rtf",new Blob([rtf],{type:"application/rtf;charset=utf-8"}));
    };
    $("#lgPdf").onclick=async()=>{
      const btn=$("#lgPdf"),d=read(),r=build(kind.value,d),text=draft.value||r.text,old=btn.textContent;
      btn.disabled=true;btn.textContent="Gerando PDF...";
      try{
        await downloadPdfDocument(r.title,text,d);
        if(opts.showBanner)opts.showBanner("PDF timbrado baixado com sucesso.","good");
      }catch(err){
        if(opts.showBanner)opts.showBanner(err?.message||"Falha ao gerar o PDF.","bad");
      }finally{btn.disabled=false;btn.textContent=old}
    };
    $("#lgNew").onclick=()=>{
      const keep=read();
      state={...DEFAULTS,dataExtenso:todayExtenso(),
        officeName:keep.officeName,officeSubtitle:keep.officeSubtitle,officeOab:keep.officeOab,officeEmail:keep.officeEmail,
        officePhone:keep.officePhone,officeAddress:keep.officeAddress,footerText:keep.footerText,
        logoDataUrl:keep.logoDataUrl,logoName:keep.logoName,showLogo:keep.showLogo
      };
      try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}catch(_){}
      render(root,opts);
    };

    meta();
    renderBrandPreview();
    if(draft.value){
      const r=build(kind.value,read());
      $("#lgTitle").textContent=r.title;
      $("#lgCount").textContent=draft.value.length.toLocaleString("pt-BR")+" caracteres";
    }
  }
  return {TEMPLATES,SPECIAL_POWERS,DEFAULTS,build,extractFromRow,render};
});
