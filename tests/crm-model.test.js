const assert=require("node:assert/strict");
const crm=require("../lib/crm-model");

assert.equal(crm.isValidCNJ("1010023-18.2024.8.26.0302"),true);
assert.equal(crm.isValidCNJ("1010023-19.2024.8.26.0302"),false);
assert.equal(crm.formatCNJ("10100231820248260302"),"1010023-18.2024.8.26.0302");
assert.equal(crm.normalizePhone("(11) 98765-4321"),"+5511987654321");
assert.equal(crm.isValidE164("+5511987654321"),true);
assert.equal(crm.cpfOk("52998224725"),true);
assert.equal(crm.cnpjOk("11222333000181"),true);

const rows=[
 {Cliente:"Maria Silva",Telefone:"11999999999",Protocolo:"1010023-18.2024.8.26.0302",Assistente:"ADRIANA","Último Retorno":"01/09/2026","Próximo Retorno":"05/10/2026"},
 {Cliente:"Maria Silva",Telefone:"11999999999",Protocolo:"1036614-68.2024.8.26.0576",Assistente:"ADRIANA","Último Retorno":"15/09/2026","Próximo Retorno":"01/10/2026"}
];
const clients=crm.groupProcessesByClient(rows);
assert.equal(clients.length,1);
assert.equal(clients[0].processos.length,2);
assert.equal(clients[0].ultimoRetorno,"15/09/2026");
assert.equal(clients[0].proximoRetorno,"01/10/2026");
assert.ok(clients[0].ClienteId.startsWith("cli_"));

const bad=crm.validateProcess({Cliente:"X",Protocolo:"1010023-19.2024.8.26.0302"});
assert.equal(bad.ok,false);
console.log("crm-model: ok");