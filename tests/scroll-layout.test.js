const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const app=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const css=fs.readFileSync(path.join(__dirname,"..","styles.css"),"utf8");

assert.match(css,/SheetsPredict 3\.1\.2 — uma barra vertical \+ uma barra horizontal útil/);
assert.match(css,/\.content\{[\s\S]*?overflow-y:auto!important;[\s\S]*?overflow-x:hidden!important;/);
assert.match(css,/\.crm-table,[\s\S]*?\.dashboard-table,[\s\S]*?\.report-table[\s\S]*?max-height:none!important;[\s\S]*?overflow-y:hidden!important;/);
assert.match(css,/\.global-scroll-target[\s\S]*?scrollbar-width:none!important/);
assert.match(css,/#nav[\s\S]*?scrollbar-width:none!important/);

assert.match(app,/querySelectorAll\("\.table-wrap:not\(\.process-table-wrap\),\.pipeline-board"\)/);
assert.doesNotMatch(app,/querySelectorAll\("\.table-wrap,\.pipeline-board,\.lexis-tabbar"\)/);
assert.match(app,/const dockRange=Math\.max\(0,dock\.scrollWidth-dock\.clientWidth\)/);
assert.match(app,/const targetRange=Math\.max\(0,globalXTarget\.scrollWidth-globalXTarget\.clientWidth\)/);
assert.match(app,/globalXTarget\.scrollLeft=ratio\*targetRange/);
assert.match(app,/inner\.style\.width=\(dock\.clientWidth\+targetRange\)\+"px"/);
assert.match(app,/classList\.add\("global-scroll-target"\)/);
assert.match(app,/classList\.remove\("global-scroll-target"\)/);
assert.match(app,/function bindProcessTableScroll\(/);
assert.match(app,/data-process-x/);
assert.match(css,/\.process-x-scroll/);
assert.match(css,/\.process-table-wrap/);

console.log("scroll-layout: ok");
