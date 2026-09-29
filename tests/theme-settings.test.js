const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const app=fs.readFileSync(path.join(__dirname,"..","app.js"),"utf8");
const css=fs.readFileSync(path.join(__dirname,"..","styles.css"),"utf8");
const html=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");

assert.match(html,/data-view="settings"/,"Configurações deve aparecer no menu");
assert.match(app,/settings:\["PREFERÊNCIAS","Configurações"\]/);
assert.match(app,/settings:"\/configuracoes"/);
assert.match(app,/function renderSettings\(/);
assert.match(app,/const THEME_KEY="sheetspredict_theme_v1"/);

const ids=["default","clean","dark","midnight","graphite","emerald","wine","violet","gold","contrast"];
for(const id of ids){
  assert.ok(app.includes('id:"'+id+'"'),"tema ausente no JS: "+id);
  if(id!=="default")assert.ok(css.includes('data-theme="'+id+'"'),"tema ausente no CSS: "+id);
}
assert.match(app,/localStorage\.setItem\(THEME_KEY/,"tema deve persistir no navegador");
assert.match(app,/applyTheme\(savedTheme\(\),\{persist:false\}\)/,"tema salvo deve ser aplicado no boot");
assert.match(css,/\.theme-grid/);
assert.match(css,/\.theme-card\.selected/);
console.log("theme-settings: ok");
