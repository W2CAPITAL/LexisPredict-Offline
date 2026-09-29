const assert=require("node:assert/strict");
const {detectExecution,commercialDecision}=require("../lib/judicial-intelligence");

function dj({movimentos=[],classeCodigo=null,classe="Procedimento Comum Cível",poloAtivo=["Cliente Teste"],poloPassivo=["Banco Exemplo S.A."]}={}){
  return {error:false,movimentos,classeCodigo,classe,poloAtivo,poloPassivo};
}
function djen(items=[]){return {success:true,items};}

{
  const data=dj({movimentos:[{nome:"Citação expedida",complemento:"Cite-se o réu para contestar"}]});
  const e=detectExecution(data,djen());
  assert.equal(e.status,"CITACAO_APENAS","citação simples não pode virar cumprimento");
  const c=commercialDecision({datajud:data,djen:djen(),cliente:"Cliente Teste"});
  assert.equal(c.decision,"REVISAR");
  assert.match(c.product,/CITAÇÃO|CITACAO|SEM OFERTA/i);
}

{
  const data=dj({classeCodigo:156,classe:"Cumprimento de sentença",movimentos:[
    {nome:"Cumprimento de sentença",complemento:"Intime-se o executado para pagamento voluntário, art. 523"},
    {nome:"Sentença",complemento:"Julgo procedentes os pedidos e condeno o Banco Exemplo S.A. a pagar R$ 10.000,00 ao autor"}
  ]});
  const e=detectExecution(data,djen());
  assert.equal(e.status,"ATIVO","classe 156/atos executivos devem confirmar cumprimento");
  const c=commercialDecision({datajud:data,djen:djen(),cliente:"Cliente Teste"});
  assert.equal(c.side.favorecido,"CLIENTE");
  assert.equal(c.decision,"POTENCIAL");
}

{
  const data=dj({movimentos:[
    {nome:"Sentença",complemento:"Julgo improcedentes os pedidos formulados pelo autor. Honorários a cargo do autor."}
  ]});
  const c=commercialDecision({datajud:data,djen:djen(),cliente:"Cliente Teste"});
  assert.equal(c.side.favorecido,"BANCO","improcedência do autor deve favorecer o polo passivo bancário");
  assert.equal(c.decision,"NÃO VENDER");
}

{
  const data=dj({
    classe:"Busca e Apreensão em Alienação Fiduciária",
    poloAtivo:["Banco Exemplo S.A."],
    poloPassivo:["Cliente Teste"],
    movimentos:[{nome:"Decisão",complemento:"Busca e apreensão: deferida a liminar em favor do credor fiduciário"}]
  });
  const c=commercialDecision({datajud:data,djen:djen(),cliente:"Cliente Teste"});
  assert.equal(c.side.favorecido,"BANCO");
  assert.equal(c.decision,"NÃO VENDER");
}

{
  const data=dj({classeCodigo:156,movimentos:[
    {nome:"Extinção do cumprimento",complemento:"Satisfação da obrigação e arquivamento do cumprimento"}
  ]});
  const e=detectExecution(data,djen());
  assert.equal(e.status,"ENCERRADO");
  const c=commercialDecision({datajud:data,djen:djen(),cliente:"Cliente Teste"});
  assert.equal(c.decision,"NÃO VENDER");
}

console.log("judicial-intelligence: ok");
