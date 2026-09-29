/**
 * LexisPredict Offline Web — Google Sheets Bridge
 * v1.1.0
 *
 * Cole este arquivo no Apps Script VINCULADO à planilha e publique como Aplicativo da Web.
 * A autenticação usa a aba "Usuarios" + sessão temporária. Não usa token estático no navegador.
 *
 * Deploy:
 *   Executar como: Eu
 *   Quem pode acessar: conforme a política da empresa
 */
var LEXIS_BRIDGE_VERSION = "1.1.0";
var LEXIS_USERS_SHEET = "Usuarios";
var LEXIS_PROCESS_SHEET = "Processos";
var LEXIS_SESSION_PREFIX = "lexis_web_";
var LEXIS_SESSION_MS = 8 * 3600 * 1000;

function lexisOut_(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);}
function lexisNorm_(v){return String(v==null?"":v).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[\s._-]+/g,"");}
function lexisDigits_(v){return String(v==null?"":v).replace(/\D/g,"");}
function lexisHash_(s){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(s||""),Utilities.Charset.UTF_8).map(function(b){var v=b<0?b+256:b;return ("0"+v.toString(16)).slice(-2)}).join("");}
function lexisBody_(e){try{return JSON.parse((e&&e.postData&&e.postData.contents)||"{}")}catch(_){return{}}}
function lexisSheet_(name){var sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);if(!sh)throw new Error("Aba "+name+" não encontrada.");return sh;}
function lexisHeaders_(sh){return sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0].map(function(x){return String(x||"").trim()});}
function lexisHeaderMap_(headers){var m={};headers.forEach(function(h,i){m[lexisNorm_(h)]=i});return m;}
function lexisFind_(map,names){for(var i=0;i<names.length;i++){var x=map[lexisNorm_(names[i])];if(x!=null)return x}return-1;}
function lexisPublicUser_(u){return{usuario:u.usuario,nome:u.nome,perfil:u.perfil,escritorio:u.escritorio};}
function lexisRole_(p){p=lexisNorm_(p);return /superadmin/.test(p)?30:/supervisor|administrador/.test(p)?20:10;}

function lexisSessionPut_(u){
  var id=Utilities.getUuid(),payload=JSON.stringify({exp:Date.now()+LEXIS_SESSION_MS,u:u});
  CacheService.getScriptCache().put(LEXIS_SESSION_PREFIX+id,payload,21600);
  PropertiesService.getScriptProperties().setProperty(LEXIS_SESSION_PREFIX+id,payload);
  return id;
}
function lexisSession_(id){
  if(!id)return null;
  var key=LEXIS_SESSION_PREFIX+id,raw=CacheService.getScriptCache().get(key)||PropertiesService.getScriptProperties().getProperty(key);
  if(!raw)return null;
  try{
    var x=JSON.parse(raw);
    if(!x.exp||x.exp<Date.now()){PropertiesService.getScriptProperties().deleteProperty(key);return null}
    CacheService.getScriptCache().put(key,raw,21600);
    return x.u||null;
  }catch(_){return null}
}
function lexisRequireSession_(b){
  var u=lexisSession_(b&&b.sess);
  if(!u)throw new Error("Sessão expirada. Entre novamente.");
  return u;
}
function lexisLoginThrottleKey_(login){return "lexis_login_fail_"+lexisNorm_(login);}
function lexisLoginFail_(login){
  var cache=CacheService.getScriptCache(),key=lexisLoginThrottleKey_(login),n=Number(cache.get(key)||0)+1;
  cache.put(key,String(n),600);
  return n;
}
function lexisLoginReset_(login){CacheService.getScriptCache().remove(lexisLoginThrottleKey_(login));}
function lexisLogin_(b){
  var sh=lexisSheet_(LEXIS_USERS_SHEET),h=lexisHeaders_(sh),m=lexisHeaderMap_(h),data=sh.getDataRange().getDisplayValues();
  var cLogin=lexisFind_(m,["login","usuario","email"]),cNome=lexisFind_(m,["nome"]),cSenha=lexisFind_(m,["senha"]),cPerfil=lexisFind_(m,["perfil"]),cEsc=lexisFind_(m,["escritorio"]),cAtivo=lexisFind_(m,["ativo"]);
  var login=String(b.usuario||b.login||"").trim(),senha=String(b.senha||"");
  if(!login||!senha)return{ok:false,error:"Informe usuário e senha."};
  var attempts=Number(CacheService.getScriptCache().get(lexisLoginThrottleKey_(login))||0);
  if(attempts>=5)return{ok:false,error:"Muitas tentativas. Aguarde 10 minutos e tente novamente."};
  for(var i=1;i<data.length;i++){
    if(lexisNorm_(data[i][cLogin])!==lexisNorm_(login))continue;
    if(cAtivo>=0&&!/^(sim|ativo|true|1)$/i.test(String(data[i][cAtivo]||"")))return{ok:false,error:"Usuário inativo."};
    var stored=String(data[i][cSenha]||"").trim(),candidate=lexisHash_(senha);
    if(stored!==candidate){lexisLoginFail_(login);return{ok:false,error:"Usuário ou senha inválidos."};}
    lexisLoginReset_(login);
    var u={usuario:data[i][cLogin],nome:cNome>=0?data[i][cNome]:data[i][cLogin],perfil:cPerfil>=0?data[i][cPerfil]:"operador",escritorio:cEsc>=0?data[i][cEsc]:""};
    return{ok:true,user:lexisPublicUser_(u),sess:lexisSessionPut_(u),v:LEXIS_BRIDGE_VERSION};
  }
  lexisLoginFail_(login);
  return{ok:false,error:"Usuário ou senha inválidos."};
}
function lexisReadRows_(){
  var sh=lexisSheet_(LEXIS_PROCESS_SHEET),headers=lexisHeaders_(sh),values=sh.getDataRange().getDisplayValues(),rows=[];
  for(var r=1;r<values.length;r++){
    var row={},any=false;
    for(var c=0;c<headers.length;c++){
      if(!headers[c])continue;
      row[headers[c]]=values[r][c];
      if(values[r][c]!==""&&c<12)any=true;
    }
    if(any){row.__sheetRow=r+1;rows.push(row);}
  }
  return{headers:headers,rows:rows};
}
function lexisCanSee_(u,row){
  if(lexisRole_(u.perfil)>=20)return true;
  var owner=row["Assistente"]||row["Responsável"]||row["Responsavel"]||row["CreatedBy"]||row["created_by"]||"";
  return lexisNorm_(owner)===lexisNorm_(u.nome)||lexisNorm_(owner)===lexisNorm_(u.usuario);
}
function lexisList_(b){
  var u=lexisRequireSession_(b),all=lexisReadRows_(),rows=all.rows.filter(function(r){return lexisCanSee_(u,r);});
  return{ok:true,rows:rows,todas:lexisRole_(u.perfil)>=20?all.rows:rows,headers:all.headers,count:rows.length,user:lexisPublicUser_(u),v:LEXIS_BRIDGE_VERSION};
}
function lexisGet_(b){
  var u=lexisRequireSession_(b),d=lexisDigits_(b.protocolo||b.cnj),r=lexisReadRows_().rows.find(function(x){return lexisDigits_(x.Protocolo||x.CNJ)===d})||null;
  if(r&&!lexisCanSee_(u,r))return{ok:false,error:"Sem acesso a este processo."};
  return{ok:true,row:r,data:r?[r]:[]};
}
function lexisWrite_(b){
  var u=lexisRequireSession_(b),sh=lexisSheet_(LEXIS_PROCESS_SHEET),headers=lexisHeaders_(sh),map=lexisHeaderMap_(headers),all=sh.getDataRange().getValues();
  var cProt=lexisFind_(map,["Protocolo","CNJ","processo"]),input=Array.isArray(b.rows)?b.rows:[],updated=0,inserted=0,index={};
  for(var i=1;i<all.length;i++){var d=lexisDigits_(all[i][cProt]);if(d)index[d]=i+1;}
  input.forEach(function(rec){
    if(!lexisCanSee_(u,rec)&&lexisRole_(u.perfil)<20)throw new Error("Sem acesso para alterar um dos processos.");
    var p=lexisDigits_(rec.Protocolo||rec.protocolo||rec.CNJ||""),rowNum=p&&index[p]?index[p]:0;
    if(rowNum){
      var current=sh.getRange(rowNum,1,1,headers.length).getValues()[0];
      headers.forEach(function(h,c){
        if(Object.prototype.hasOwnProperty.call(rec,h)&&rec[h]!==undefined&&rec[h]!==null){
          var v=rec[h];current[c]=String(v).match(/^[=@+]/)?"'"+v:v;
        }
      });
      sh.getRange(rowNum,1,1,headers.length).setValues([current]);updated++;
    }else{
      if(lexisRole_(u.perfil)<20){
        var owner=rec["Assistente"]||rec["Responsável"]||u.nome||u.usuario;
        rec["Assistente"]=owner;
      }
      var row=new Array(headers.length).fill("");
      headers.forEach(function(h,c){if(Object.prototype.hasOwnProperty.call(rec,h))row[c]=rec[h];});
      sh.appendRow(row);inserted++;
    }
  });
  return{ok:true,updated:updated,inserted:inserted,total:input.length,v:LEXIS_BRIDGE_VERSION};
}
function doGet(e){
  var p=(e&&e.parameter)||{};
  if(p.action==="ping")return lexisOut_({ok:true,pong:true,v:LEXIS_BRIDGE_VERSION,auth:"session"});
  return lexisOut_({ok:true,app:"LexisPredict Sheets Bridge",v:LEXIS_BRIDGE_VERSION,auth:"session"});
}
function doPost(e){
  try{
    var b=lexisBody_(e),a=String(b.action||"").trim();
    if(a==="ping")return lexisOut_({ok:true,pong:true,v:LEXIS_BRIDGE_VERSION,auth:"session"});
    if(a==="login"||a==="auth")return lexisOut_(lexisLogin_(b));
    if(a==="list")return lexisOut_(lexisList_(b));
    if(a==="get")return lexisOut_(lexisGet_(b));
    if(a==="write"||a==="upsert_batch")return lexisOut_(lexisWrite_(b));
    return lexisOut_({ok:false,error:"acao desconhecida: "+a});
  }catch(err){return lexisOut_({ok:false,error:String(err.message||err).slice(0,700)});}
}