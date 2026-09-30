const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
const css=fs.readFileSync(path.join(__dirname,"..","styles.css"),"utf8");

assert.match(html,/class="workspace-card"/,"sidebar deve expor contexto do workspace");
assert.match(html,/id="mobileMenuBtn"/,"mobile deve ter botão de navegação");
assert.match(html,/id="mobileNavBackdrop"/,"mobile deve ter backdrop do drawer");
assert.match(html,/sheetspredict-mark\.svg/,"shell deve usar o logo real");
for(const group of ["Visão","Operação","Gestão","Sistema"])assert.ok(html.includes('class="nav-section-label">'+group),"grupo de navegação ausente: "+group);
for(const route of ["dashboard","hub","studio","waauto","processos","empresa","clientes","pipeline","agenda","financeiro","tarefas","analise","report","scanner","settings"])assert.ok(html.includes('data-view="'+route+'"'),"rota visual ausente: "+route);

assert.match(css,/SheetsPredict 4\.2 — Enterprise SaaS Shell/);
assert.match(css,/SheetsPredict mobile usability v5/);
assert.match(css,/body\.mobile-nav-open \.sidebar/);
assert.match(css,/\.mobile-menu-btn/);
assert.match(css,/\.table-wrap,\.wa-table-scroll[\s\S]*overflow-x:auto!important/);
for(const selector of [".workspace-card",".nav-section-label",".kpi:hover",".record-toolbar",".dialog-card",".pipeline-col",".global-x-scroll"])assert.ok(css.includes(selector),"polish SaaS ausente: "+selector);
for(const token of ["--saas-sidebar","--saas-topbar","--saas-radius","--saas-shadow"])assert.ok(css.includes(token),"token SaaS ausente: "+token);

assert.match(css,/background:var\(--surface\)/,"componentes precisam respeitar temas");
assert.match(css,/color:var\(--ink\)/,"texto precisa respeitar temas");
assert.match(css,/border-color:var\(--line\)/,"bordas precisam respeitar temas");
assert.doesNotMatch(css,/Enterprise SaaS Shell[\s\S]*\.content\{[^}]*overflow:hidden/,"shell SaaS não pode matar a rolagem do conteúdo");

console.log("saas-shell: ok");
