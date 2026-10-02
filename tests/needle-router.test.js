const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const needle=require("../lib/needle-router");

const exact=needle.routeSheetsAction({action:"search",query:"0000001-00.2026.8.26.0001"});
assert.equal(exact.supported,true);
assert.equal(exact.tool,"get_process");
assert.equal(exact.upstream,"get");
assert.equal(exact.args.protocolo,"00000010020268260001");
assert.equal(exact.confidence,1);

const textSearch=needle.routeSheetsAction({action:"search",query:"Maria Silva"});
assert.equal(textSearch.tool,"search_processes");
assert.equal(textSearch.upstream,"search");
assert.ok(textSearch.confidence>=0.9);

const list=needle.routeSheetsAction({action:"list",offset:600});
assert.equal(list.upstream,"list_compact");
assert.equal(list.args.offset,600);

const crm=needle.routeSheetsAction({action:"crm_write",table:"Interacoes",rows:[{InteracaoId:"1"}]});
assert.equal(crm.optional,true);
assert.equal(crm.capability,"crm_write");

const shards=needle.routeSheetsAction({action:"shard_status"});
assert.equal(shards.optional,true);
assert.equal(shards.capability,"process_shards");
assert.equal(shards.upstream,"shard_status");

const unknown=needle.routeSheetsAction({action:"inventar_rota"});
assert.equal(unknown.supported,false);
assert.equal(unknown.confidence,0);

assert.equal(needle.bridgeConfirmedWrite({ok:true,written:1,rejected_count:0},[{Protocolo:"1"}]),true);
assert.equal(needle.bridgeConfirmedWrite({ok:true,written:0,rejected_count:0},[{Protocolo:"1"}]),false);
assert.equal(needle.bridgeConfirmedWrite({ok:true,written:1,rejected_count:1},[{Protocolo:"1"}]),false);
assert.equal(needle.bridgeConfirmedWrite({ok:false,written:1},[{Protocolo:"1"}]),false);

const local=[{Protocolo:"0000001-00.2026.8.26.0001",Cliente:"Maria"}];
assert.equal(needle.shouldRemoteSearch("0000001-00.2026.8.26.0001",local,{cacheFresh:false}),false);
assert.equal(needle.shouldRemoteSearch("Maria",local,{cacheFresh:true,syncing:false}),false);
assert.equal(needle.shouldRemoteSearch("Maria",local,{cacheFresh:false,syncing:false}),true);
assert.equal(needle.shouldRemoteSearch("Maria",[],{cacheFresh:true}),true);

const index=fs.readFileSync(path.join(__dirname,"..","index.html"),"utf8");
assert.ok(index.indexOf("/lib/needle-router.js")<index.indexOf("/app.js"),"needle-router deve carregar antes de app.js");

console.log("needle-router: ok");
