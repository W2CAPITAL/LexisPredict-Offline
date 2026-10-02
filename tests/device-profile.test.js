const assert=require("assert");
const profile=require("../lib/device-profile.js");

const weak=profile.detect({navigator:{deviceMemory:2,hardwareConcurrency:2}});
assert.equal(weak.constrained,true);
assert.equal(weak.renderPageSize,60);
assert(weak.syncPageSize<600);
assert(weak.idbChunkSize<320);

const normal=profile.detect({navigator:{deviceMemory:8,hardwareConcurrency:8}});
assert.equal(normal.lowMemory,false);
assert.equal(normal.renderPageSize,200);
assert.equal(normal.syncPageSize,600);

const saver=profile.detect({navigator:{deviceMemory:8,hardwareConcurrency:8,connection:{saveData:true}}});
assert.equal(saver.lowMemory,true);
assert.equal(saver.renderPageSize,100);

console.log("device-profile.test.js ok");
