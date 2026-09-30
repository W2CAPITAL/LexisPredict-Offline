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
    clienteCienteSemReserva:false,revisouPrazo:false,dadosBancariosConferidos:false,draft:""
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
    const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),800);
  }
  function safeName(s){return String(s||"documento").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9_-]+/g,"_").replace(/^_+|_+$/g,"").slice(0,90)}
  function rtfEscape(text){return String(text||"").replace(/\\/g,"\\\\").replace(/\{/g,"\\{").replace(/\}/g,"\\}").replace(/[^\x00-\x7F]/g,c=>"\\u"+c.charCodeAt(0)+"?").replace(/\r?\n/g,"\\par\n")}
  function printDocument(title,text){
    const win=window.open("","_blank","noopener,noreferrer");
    if(!win)return false;
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      @page{size:A4;margin:25mm 20mm 22mm 28mm}body{font-family:"Times New Roman",serif;color:#111;font-size:12pt;line-height:1.55;margin:0}
      h1{text-align:center;font-size:14pt;text-transform:uppercase;margin:0 0 28px}pre{font:inherit;white-space:pre-wrap;text-align:justify;margin:0}
      .head{font:700 8pt Arial,sans-serif;letter-spacing:1px;color:#6f1d2b;border-bottom:1px solid #b89b5e;padding-bottom:6px;margin-bottom:28px}
      .foot{margin-top:40px;font:8pt Arial,sans-serif;color:#777;border-top:1px solid #ddd;padding-top:6px}@media print{.actions{display:none}}
      .actions{position:fixed;right:16px;top:16px}.actions button{padding:9px 14px}
    </style></head><body><div class="actions"><button onclick="window.print()">Imprimir / Salvar PDF</button></div><div class="head">SHEETSPREDICT · CENTRAL DE PEÇAS JURÍDICAS</div><h1>${esc(title)}</h1><pre>${esc(text)}</pre><div class="foot">Minuta gerada no SheetsPredict · confira integralmente antes do protocolo.</div></body></html>`);
    win.document.close();win.focus();return true;
  }

  function render(root,opts={}){
    const rows=typeof opts.rows==="function"?opts.rows():[];
    let state={...DEFAULTS,dataExtenso:todayExtenso()};
    try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||"null");if(saved&&typeof saved==="object")state={...state,...saved,specialPowers:Array.isArray(saved.specialPowers)?saved.specialPowers:[]}}catch(_){}
    const options=TEMPLATES.map(t=>'<option value="'+esc(t.id)+'">'+esc(t.label)+' · '+esc(t.category)+'</option>').join("");
    const rowOptions=['<option value="">— selecionar processo da carteira —</option>'].concat((rows||[]).slice(0,1500).map((r,i)=>{
      const x=extractFromRow(r),label=[x.processo,x.clienteNome,x.reu].filter(Boolean).join(" · ")||("Registro "+(i+1));
      return '<option value="'+i+'">'+esc(label)+'</option>';
    })).join("");
    root.innerHTML=`
      <div class="legalgen-shell">
        <div class="legalgen-head">
          <div><span class="eyebrow">DOCUMENTOS JURÍDICOS</span><h2>Central de Peças Jurídicas</h2><p>17 modelos · carteira Sheets · editor livre · RTF · impressão/PDF</p></div>
          <span class="legalgen-badge">Tudo editável</span>
        </div>
        <div class="legalgen-grid">
          <aside class="legalgen-side">
            <section class="card legalgen-card"><h3>1. Documento</h3><label>Tipo<select id="lgKind">${options}</select></label><div id="lgTemplateMeta" class="legalgen-meta"></div></section>
            <section class="card legalgen-card"><h3>2. Pré-preencher</h3><label>Processo da carteira<select id="lgRow">${rowOptions}</select></label><label>Ou cole texto/processo<textarea id="lgSource" rows="6" placeholder="Cole aqui dados do processo, decisão, contestação ou contrato..."></textarea></label><button class="btn" id="lgExtract">Extrair dados básicos do texto</button></section>
            <section class="card legalgen-card"><h3>3. Dados</h3><div class="legalgen-fields" id="lgFields"></div></section>
            <section class="card legalgen-card hidden" id="lgSpecial"></section>
            <section class="card legalgen-card"><h3>4. Conteúdo jurídico</h3>
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
              <div class="legalgen-editor-head"><div><span class="eyebrow">EDITOR FINAL</span><h3 id="lgTitle">Minuta</h3></div><span id="lgCount">0 caracteres</span></div>
              <textarea id="lgDraft" class="legalgen-paper" placeholder="Selecione o documento e clique em Gerar / atualizar minuta."></textarea>
            </div>
            <div class="legalgen-actions">
              <button class="btn" id="lgCopy">Copiar</button>
              <button class="btn" id="lgSave">Salvar rascunho</button>
              <button class="btn" id="lgRtf">Baixar RTF editável</button>
              <button class="btn primary" id="lgPrint">Imprimir / PDF</button>
              <button class="btn" id="lgNew">Nova minuta</button>
            </div>
          </section>
        </div>
      </div>`;

    const $=s=>root.querySelector(s), kind=$("#lgKind"), draft=$("#lgDraft");
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
    $("#lgFatos").value=state.fatos||"";$("#lgFundamentos").value=state.fundamentos||"";$("#lgPedidos").value=state.pedidos||"";$("#lgDecisao").value=state.decisao||"";$("#lgMemoria").value=state.memoriaCalculo||"";$("#lgPrazo").checked=!!state.revisouPrazo;draft.value=state.draft||"";

    const read=()=>{
      const d={...state,kind:kind.value};
      root.querySelectorAll("[data-key]").forEach(el=>d[el.dataset.key]=el.value);
      d.fatos=$("#lgFatos").value;d.fundamentos=$("#lgFundamentos").value;d.pedidos=$("#lgPedidos").value;d.decisao=$("#lgDecisao").value;d.memoriaCalculo=$("#lgMemoria").value;d.revisouPrazo=$("#lgPrazo").checked;
      d.draft=draft.value;
      root.querySelectorAll("[data-power]").forEach(el=>{if(el.checked&&!d.specialPowers.includes(el.value))d.specialPowers.push(el.value);if(!el.checked)d.specialPowers=d.specialPowers.filter(x=>x!==el.value)});
      const ciente=$("#lgClientAware"),bank=$("#lgBankChecked"),subst=$("#lgCanSubst");if(ciente)d.clienteCienteSemReserva=ciente.checked;if(bank)d.dadosBancariosConferidos=bank.checked;if(subst)d.permiteSubstabelecer=subst.checked;
      state=d;return d;
    };
    const write=d=>{
      state={...state,...d};
      root.querySelectorAll("[data-key]").forEach(el=>{if(Object.hasOwn(state,el.dataset.key))el.value=state[el.dataset.key]||""});
      $("#lgFatos").value=state.fatos||"";$("#lgFundamentos").value=state.fundamentos||"";$("#lgPedidos").value=state.pedidos||"";$("#lgDecisao").value=state.decisao||"";$("#lgMemoria").value=state.memoriaCalculo||"";
    };
    const meta=()=>{
      const t=TEMPLATES.find(x=>x.id===kind.value)||TEMPLATES[0];
      $("#lgTemplateMeta").innerHTML='<strong>'+esc(t.category)+'</strong><span>'+esc(t.basis)+'</span>';
      renderSpecial();
    };
    const renderSpecial=()=>{
      const box=$("#lgSpecial"),k=kind.value,d=read();
      if(k==="procuracao"){
        box.classList.remove("hidden");box.innerHTML='<h3>Poderes especiais</h3><p class="muted">Selecione somente os poderes efetivamente autorizados.</p><div class="legalgen-power-list">'+SPECIAL_POWERS.map(x=>'<label><input type="checkbox" data-power value="'+esc(x)+'" '+((d.specialPowers||[]).includes(x)?"checked":"")+'/> '+esc(x)+'</label>').join("")+'</div><label class="legalgen-check"><input id="lgCanSubst" type="checkbox" '+(d.permiteSubstabelecer?"checked":"")+'/> Autorizar substabelecimento</label>';
      }else if(k==="substabelecimento-sem-reserva"){
        box.classList.remove("hidden");box.innerHTML='<h3>Confirmação necessária</h3><label class="legalgen-check warn"><input id="lgClientAware" type="checkbox" '+(d.clienteCienteSemReserva?"checked":"")+'/> Há prévio e inequívoco conhecimento do cliente.</label>';
      }else if(k==="mle-tjsp"){
        box.classList.remove("hidden");box.innerHTML='<h3>Conferência MLE</h3><label class="legalgen-check warn"><input id="lgBankChecked" type="checkbox" '+(d.dadosBancariosConferidos?"checked":"")+'/> Beneficiário, titularidade, conta/PIX e poderes foram conferidos.</label>';
      }else{box.classList.add("hidden");box.innerHTML=""}
    };
    const generate=()=>{
      const d=read(),r=build(kind.value,d);draft.value=r.text;state.draft=r.text;$("#lgTitle").textContent=r.title;$("#lgCount").textContent=r.text.length.toLocaleString("pt-BR")+" caracteres";
      const w=$("#lgWarnings");w.classList.toggle("hidden",!r.warnings.length);w.innerHTML=r.warnings.length?'<strong>Conferir antes de usar</strong><ul>'+r.warnings.map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul>':"";
      if(opts.showBanner)opts.showBanner("Minuta gerada. Revise integralmente antes do protocolo.","good");
    };
    kind.onchange=()=>{state.kind=kind.value;meta()};
    $("#lgRow").onchange=e=>{const idx=Number(e.target.value);if(!Number.isInteger(idx)||idx<0||!rows[idx])return;write(extractFromRow(rows[idx]));if(opts.showBanner)opts.showBanner("Dados do processo carregados da carteira.","good")};
    $("#lgExtract").onclick=()=>{
      const text=clean($("#lgSource").value);if(!text)return;
      const cnj=text.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/)?.[0]||"";
      const cpf=text.match(/\d{3}\.\d{3}\.\d{3}-\d{2}/)?.[0]||"";
      const email=text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]||"";
      const data={processo:cnj||state.processo,cpf:cpf||state.cpf,email:email||state.email};
      const first=text.split(/\r?\n/).map(x=>x.trim()).find(x=>x.length>8&&x.length<90&&!/^(processo|evento|tipo documento)/i.test(x));
      if(first)data.clienteNome=state.clienteNome||first;
      data.fatos=state.fatos||text.slice(0,12000);write(data);if(opts.showBanner)opts.showBanner("Dados básicos extraídos. Revise antes de gerar.","good");
    };
    $("#lgGenerate").onclick=generate;
    draft.oninput=()=>{$("#lgCount").textContent=draft.value.length.toLocaleString("pt-BR")+" caracteres";state.draft=draft.value};
    $("#lgCopy").onclick=async()=>{await navigator.clipboard.writeText(draft.value||build(kind.value,read()).text);if(opts.showBanner)opts.showBanner("Texto copiado.","good")};
    $("#lgSave").onclick=()=>{const d=read();d.draft=draft.value;localStorage.setItem(STORAGE_KEY,JSON.stringify(d));if(opts.showBanner)opts.showBanner("Rascunho salvo neste navegador.","good")};
    $("#lgRtf").onclick=()=>{const d=read(),r=build(kind.value,d),text=draft.value||r.text,rtf="{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Times New Roman;}}\\fs24 "+rtfEscape(text)+"}";download(safeName(r.title)+".rtf",new Blob([rtf],{type:"application/rtf;charset=utf-8"}))};
    $("#lgPrint").onclick=()=>{const d=read(),r=build(kind.value,d),text=draft.value||r.text;if(!printDocument(r.title,text)&&opts.showBanner)opts.showBanner("O navegador bloqueou a janela de impressão.","bad")};
    $("#lgNew").onclick=()=>{localStorage.removeItem(STORAGE_KEY);state={...DEFAULTS,dataExtenso:todayExtenso()};render(root,opts)};
    meta();if(draft.value){const r=build(kind.value,read());$("#lgTitle").textContent=r.title;$("#lgCount").textContent=draft.value.length.toLocaleString("pt-BR")+" caracteres"}
  }

  return {TEMPLATES,SPECIAL_POWERS,DEFAULTS,build,extractFromRow,render};
});
