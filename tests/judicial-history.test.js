const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const sheets=new Map();
let failDjen=false;
class Sheet{
  constructor(headers){this.rows=[headers];this.maxRows=1;}
  getLastRow(){return this.rows.length;}
  getLastColumn(){return this.rows[0].length;}
  getMaxRows(){return this.maxRows;}
  insertRowsAfter(_,n){this.maxRows+=n;}
  setFrozenRows(){}
  getRange(r,c,n=1,m=1){
    return {
      getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>this.rows[r+i-1]?.[c+j-1]??'')),
      setNumberFormat(){return this;},
      setValues:values=>{
        if(failDjen&&this===sheets.get('Publicações_DJEN'))throw Error('quota de escrita');
        assert.ok(r+n-1<=this.maxRows,'a aba deve crescer antes da escrita');
        values.forEach((row,i)=>row.forEach((v,j)=>{(this.rows[r+i-1]??=[])[c+j-1]=v;}));
      }
    };
  }
}
const ss={getSheetByName:name=>sheets.get(name),getSpreadsheetTimeZone:()=> 'America/Sao_Paulo'};
const ctx={console,SpreadsheetApp:{getActiveSpreadsheet:()=>ss},Utilities:{parseDate:(s)=>new Date(s.length===10?s+'T00:00:00-03:00':s+'-03:00')}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'..','installer-script.txt'),'utf8'),ctx);
ctx.ensureSheetWithHeaders_=(_,name,headers)=>{if(!sheets.has(name))sheets.set(name,new Sheet(headers));};
const cnj='00000010020268260001';
const record={Protocolo:cnj,_JudicialHistory:{
 datajud:[{codigo:51,nome:'Conclusão',dataHora:'2026-09-28T09:00:00',orgaoJulgador:'Vara de teste'}],
 djen:[{id:12345,texto:'Publicação de teste',data_disponibilizacao:'2026-09-28',destinatarios:[{nome:'Teste'}],link:'https://comunica.pje.jus.br/consulta'}]
}};
failDjen=true;
assert.throws(()=>ctx.appendJudicialHistory_([record]),/quota/);
assert.equal(sheets.get('Movimentações_DataJud').rows.length,2);
failDjen=false;
const result=ctx.appendJudicialHistory_([record]);
assert.equal(result.datajud,0,'retry não duplica o DataJud já salvo');
assert.equal(result.djen,1);
const dj=sheets.get('Movimentações_DataJud').rows[1];
assert.equal(dj[1],cnj,'CNJ preserva zeros');
assert.equal(dj[2].toISOString(),'2026-09-28T12:00:00.000Z');
assert.equal(dj[5],'2026-09-28T09:00:00|51|Conclusão','chave compatível com scanner legado');
assert.equal(sheets.get('Publicações_DJEN').rows[1][7],'12345');
const persisted=ctx.judicialHistoryForCnj_(cnj);
assert.equal(persisted.ok,true);
assert.equal(persisted.datajud.length,1,'histórico completo deve reler DataJud persistido');
assert.equal(persisted.djen.length,1,'histórico completo deve reler DJEN persistido');
assert.equal(persisted.djen[0].texto,'Publicação de teste');
assert.equal(typeof ctx.djenFetchOfficial_,'function');
assert.equal(typeof ctx.djenFetchAndPersist_,'function');
assert.equal(typeof ctx.djenScheduledBatch_,'function');
assert.equal(ctx.appendJudicialHistory_([record,record]).djen,0);
const other={...record,Protocolo:'00000020020268260001'};
assert.equal(ctx.appendJudicialHistory_([other]).datajud,1,'mesmo evento em outro CNJ é independente');
assert.throws(()=>ctx.appendJudicialHistory_([{...record,_JudicialHistory:{djen:[{texto:'x',numero_processo:other.Protocolo}]}}]),/outro CNJ/);
assert.equal(ctx.judicialText_('=1+1'),"'=1+1");
assert.throws(()=>ctx.judicialText_('x'.repeat(49001)),/limite/);
assert.equal(typeof ctx.doPost,'function');
assert.equal(typeof ctx.doGet,'function');
console.log('judicial-history: ok');
