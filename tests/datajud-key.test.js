const assert=require("node:assert/strict");
const {extractPublicApiKey}=require("../lib/datajud");

const key="A".repeat(48)+"==";
assert.equal(extractPublicApiKey("<p>Authorization: APIKey "+key+"</p>"),key);
assert.equal(extractPublicApiKey("<code>APIKey "+key+"</code>"),key);
assert.equal(extractPublicApiKey("<html>sem chave</html>"),"");
console.log("datajud-key: ok");
