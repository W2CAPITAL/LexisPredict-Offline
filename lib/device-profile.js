(function(global){
"use strict";

function positiveNumber(value,fallback){
  var n=Number(value);
  return Number.isFinite(n)&&n>0?n:fallback;
}

function detect(env){
  env=env||{};
  var nav=env.navigator||((typeof navigator!=="undefined")?navigator:{});
  var memory=positiveNumber(nav.deviceMemory,4);
  var cores=positiveNumber(nav.hardwareConcurrency,4);
  var saveData=!!(nav.connection&&nav.connection.saveData);
  var lowMemory=memory<=4||cores<=4||saveData;
  var constrained=memory<=2||cores<=2;
  return {
    memoryGB:memory,
    cores:cores,
    saveData:saveData,
    lowMemory:lowMemory,
    constrained:constrained,
    renderPageSize:constrained?60:(lowMemory?100:200),
    syncPageSize:constrained?180:(lowMemory?300:600),
    idbChunkSize:constrained?80:(lowMemory?160:320),
    yieldMs:constrained?18:(lowMemory?8:0),
    maxImmediateRenders:constrained?1:2
  };
}

var api={detect:detect};
if(typeof module!=="undefined"&&module.exports)module.exports=api;
global.SheetsDeviceProfile=api;
})(typeof window!=="undefined"?window:globalThis);
