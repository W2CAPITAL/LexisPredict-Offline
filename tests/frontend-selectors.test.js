const assert=require("node:assert/strict");
const fs=require("node:fs");
const app=fs.readFileSync(require("node:path").join(__dirname,"..","app.js"),"utf8");
assert.equal(app.includes("$$$("),false,"app.js contém selector $$$ inexistente");
assert.match(app,/const \$\$=s=>\[\.\.\.document\.querySelectorAll\(s\)\]/,"helper $$ deve existir");
console.log("frontend-selectors: ok");
