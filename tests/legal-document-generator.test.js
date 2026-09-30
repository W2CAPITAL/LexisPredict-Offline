const assert=require("node:assert/strict");
const gen=require("../lib/legal-document-generator");

const ids=new Set(gen.TEMPLATES.map(x=>x.id));
for(const id of [
  "peticao-inicial","procuracao","substabelecimento-com-reserva","substabelecimento-sem-reserva",
  "revogacao-mandato","replica","impugnacao","pugnacao","declaracao-hipossuficiencia",
  "mle-tjsp","notificacao-extrajudicial","apelacao","recurso-inominado","cumprimento-sentenca"
]) assert.equal(ids.has(id),true,"modelo ausente: "+id);

const base={juizo:"AO JUÍZO",processo:"1000000-00.2026.8.26.0001",autor:"CLIENTE",reu:"EMPRESA",clienteNome:"CLIENTE",advogadoNome:"ADVOGADO",oab:"SP 000000",cidade:"São Paulo",dataExtenso:"30 de setembro de 2026"};

const proc=gen.build("procuracao",{...base,specialPowers:["transigir","dar quitação"]});
assert.match(proc.text,/transigir/);
assert.match(proc.text,/dar quitação/);
assert.doesNotMatch(proc.text,/confessar,/);

const sem=gen.build("substabelecimento-sem-reserva",{...base,advogadoAnteriorNome:"A",advogadoNovoNome:"B",clienteCienteSemReserva:false});
assert.match(sem.warnings.join(" "),/conhecimento do cliente/i);

const mle=gen.build("mle-tjsp",{...base,beneficiario:"CLIENTE",cpfBeneficiario:"000.000.000-00",formaRecebimento:"PIX",chavePix:"teste@example.com",dadosBancariosConferidos:false});
assert.match(mle.text,/MANDADO DE LEVANTAMENTO ELETRÔNICO/i);
assert.match(mle.text,/Chave PIX/i);
assert.match(mle.warnings.join(" "),/beneficiário|titularidade|conta\/PIX/i);

const cump=gen.build("cumprimento-sentenca",{...base,decisao:"Sentença transitada.",memoriaCalculo:""});
assert.match(cump.text,/DEMONSTRATIVO DISCRIMINADO E ATUALIZADO/i);
assert.match(cump.warnings.join(" "),/demonstrativo/i);

const jec=gen.build("recurso-inominado",{...base,revisouPrazo:true});
const ap=gen.build("apelacao",{...base,revisouPrazo:true});
assert.match(jec.text,/RECURSO INOMINADO/);
assert.match(ap.text,/RECURSO DE APELAÇÃO/);

const row=gen.extractFromRow({Protocolo:"1000000-00.2026.8.26.0001",Cliente:"Cliente Planilha",Banco:"Banco Teste","DataJud • Último Movimento":"Sentença"});
assert.equal(row.processo,"1000000-00.2026.8.26.0001");
assert.equal(row.clienteNome,"Cliente Planilha");
assert.match(row.fatos,/Sentença/);

console.log("legal-document-generator: ok");
