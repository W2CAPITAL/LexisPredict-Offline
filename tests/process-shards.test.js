const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const root=path.join(__dirname,"..");
const installer=fs.readFileSync(path.join(root,"installer-script.txt"),"utf8");
const app=fs.readFileSync(path.join(root,"app.js"),"utf8");
const index=fs.readFileSync(path.join(root,"index.html"),"utf8");
const sw=fs.readFileSync(path.join(root,"sw.js"),"utf8");
const api=fs.readFileSync(path.join(root,"api","sheets.js"),"utf8");

// Syntax-only parse of Apps Script. Google globals are not executed here.
assert.doesNotThrow(()=>new Function(installer),"installer 8.3 deve ser JavaScript válido");
assert.match(installer,/BRIDGE_VERSION\s*=\s*"8\.3"/);
assert.match(installer,/process_shards/);
assert.match(installer,/__LEXIS_PROCESS_SHARDS/);
assert.match(installer,/function createProcessShard_\(/);
assert.match(installer,/SpreadsheetApp\.create\(/);
assert.match(installer,/function activeProcessShard_\(/);
assert.match(installer,/function findProcessByProtocol_\(/);
assert.match(installer,/\["protocolo_key","spreadsheet_id","sheet_name","sheet_row","updated_at"\]/);
assert.match(installer,/function mergeProcessWriteRows_\(/);
assert.match(installer,/function crmSeedClients_\([\s\S]*processShardDescriptors_\(\)/);

assert.match(api,/REQUIRED_BRIDGE_VERSION="8\.3"/);
assert.match(api,/process_shards/);

assert.match(app,/indexedDB\.open\(DB_NAME,3\)/);
assert.match(app,/createObjectStore\("rowChunks"/);
assert.match(app,/activeRowGeneration/);
assert.match(app,/DEVICE_PROFILE\.syncPageSize/);
assert.match(app,/hardPageLimit=5000/);

assert.ok(index.indexOf("/lib/device-profile.js")<index.indexOf("/app.js"),"device profile deve carregar antes do app");
assert.match(sw,/sheetspredict-v56/);
assert.match(sw,/\/lib\/device-profile\.js/);

console.log("process-shards: ok");
