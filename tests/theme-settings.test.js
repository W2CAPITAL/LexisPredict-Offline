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


function parseVars(block){
  const out={};
  for(const m of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g))out[m[1]]=m[2];
  return out;
}
function luminance(hex){
  const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4));
  return 0.2126*rgb[0]+0.7152*rgb[1]+0.0722*rgb[2];
}
function ratio(a,b){
  const x=luminance(a),y=luminance(b),hi=Math.max(x,y),lo=Math.min(x,y);
  return (hi+0.05)/(lo+0.05);
}
function themeVars(id){
  if(id==="default"){
    const m=css.match(/:root\{([\s\S]*?)\n\}/);
    assert.ok(m,"bloco :root ausente");
    return parseVars(m[1]);
  }
  const re=new RegExp('html\\[data-theme="'+id+'"\\]\\{([\\s\\S]*?)\\n\\}');
  const m=css.match(re);assert.ok(m,"bloco CSS ausente: "+id);return parseVars(m[1]);
}
for(const id of ids){
  const v=themeVars(id);
  for(const key of ["surface","ink","muted","primary","primary2","on-primary"])assert.ok(v[key],"token --"+key+" ausente em "+id);
  assert.ok(ratio(v.ink,v.surface)>=4.5,id+" texto principal abaixo de 4.5:1");
  assert.ok(ratio(v.muted,v.surface)>=4.5,id+" texto secundário abaixo de 4.5:1");
  assert.ok(ratio(v.primary,v.surface)>=4.5,id+" link/acento abaixo de 4.5:1");
  assert.ok(ratio(v["on-primary"],v.primary)>=4.5,id+" botão primário abaixo de 4.5:1");
  assert.ok(ratio(v["on-primary"],v.primary2)>=4.5,id+" hover primário abaixo de 4.5:1");
  for(const pair of [["green","greenbg"],["amber","amberbg"],["red","redbg"],["blue","bluebg"]]){
    assert.ok(v[pair[0]]&&v[pair[1]],id+" tokens semânticos ausentes: "+pair.join("/"));
    assert.ok(ratio(v[pair[0]],v[pair[1]])>=4.5,id+" "+pair[0]+" sem contraste suficiente");
  }
}
assert.match(css,/camada universal de contraste/);
assert.match(css,/\.lexis-page-header/);
assert.match(css,/\.task-card/);
assert.match(css,/\.hub-source-card/);

console.log("theme-settings: ok");
