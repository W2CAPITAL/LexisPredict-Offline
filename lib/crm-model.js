(function(root,factory){
  const api=factory();
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  else root.LexisCRM=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";

  const SHEETS={
    clientes:{
      name:"Clientes",
      headers:["ClienteId","Tipo","Nome","CPF_CNPJ","Telefone_Principal","Telefone_2","Email","Cidade","UF","Origem","Status","Responsavel","OptOutWhatsApp","Observacao","CriadoEm","AtualizadoEm"]
    },
    interacoes:{
      name:"Interacoes",
      headers:["InteracaoId","ClienteId","Protocolo","Canal","Tipo","Assunto","Conteudo","Usuario","DataHora","Resultado","ProximoPasso","DataProximoPasso","OptOut"]
    },
    pipeline:{
      name:"PipelineCRM",
      headers:["OportunidadeId","ClienteId","Protocolo","Etapa","Origem","Servico","ValorEstimado","Responsavel","MotivoPerda","CriadoEm","AtualizadoEm"]
    },
    agenda:{
      name:"AgendaCRM",
      headers:["EventoId","ClienteId","Protocolo","Tipo","Titulo","Inicio","Fim","Responsavel","Status","LembreteMin","Observacao","CriadoEm","AtualizadoEm"]
    },
    honorarios:{
      name:"Honorarios",
      headers:["id","cliente_id","protocolo","cliente","tipo","valor","status","vencimento","pago_em","responsavel","obs","empresa_id","created_at","updated_at"]
    },
    auditoria:{
      name:"AuditoriaLogsApp",
      headers:["id","acao","entidade","entidade_id","protocolo","usuario","campo","valor_anterior","valor_novo","detalhe","created_at","empresa_id"]
    }
  };

  function norm(v){
    return String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/\s+/g," ").trim();
  }
  function digits(v){return String(v??"").replace(/\D/g,"")}
  function slug(v){return norm(v).replace(/[^A-Z0-9]+/g,"-").replace(/^-|-$/g,"").toLowerCase()}
  function hash(v){
    let h=2166136261,s=String(v??"");
    for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}
    return (h>>>0).toString(36);
  }
  function clientFingerprint(row){
    const name=norm(row?.Nome??row?.Cliente??row?.nome??"");
    // O ID não muda quando telefone/documento forem corrigidos. A migração inicial
    // usa o nome normalizado como chave estável; CPF/CNPJ vira dado de validação.
    return name;
  }
  function stableClientId(row){
    const fp=clientFingerprint(row);
    if(!fp)return "";
    return "cli_"+hash(fp);
  }
  function stableId(prefix,...parts){
    const body=parts.map(x=>norm(x)).filter(Boolean).join("|");
    return body?prefix+"_"+hash(body):prefix+"_"+Date.now().toString(36);
  }

  function normalizePhone(value,country="55"){
    let d=digits(value);
    if(!d)return "";
    if(d.startsWith("00"))d=d.slice(2);
    if(d.startsWith(country)&&d.length>=12)return "+"+d;
    if((d.length===10||d.length===11)&&country==="55")return "+55"+d;
    if(d.length>=10&&d.length<=15)return "+"+d;
    return d;
  }
  function isValidE164(v){return /^\+[1-9]\d{9,14}$/.test(String(v||""))}

  function calcCnjDv(v){
    const d=digits(v);
    if(d.length!==20)return null;
    const seq=d.slice(0,7),rest=d.slice(9);
    const check=98-(BigInt(seq+rest+"00")%97n);
    return Number(check);
  }
  function isValidCNJ(v){
    const d=digits(v);
    return d.length===20&&calcCnjDv(d)===Number(d.slice(7,9));
  }
  function formatCNJ(v){
    const d=digits(v);if(d.length!==20)return String(v||"");
    return d.slice(0,7)+"-"+d.slice(7,9)+"."+d.slice(9,13)+"."+d.slice(13,14)+"."+d.slice(14,16)+"."+d.slice(16);
  }

  function cpfOk(v){
    const d=digits(v);if(d.length!==11||/^(\d)\1{10}$/.test(d))return false;
    const digit=(len)=>{
      let sum=0;for(let i=0;i<len;i++)sum+=Number(d[i])*(len+1-i);
      const r=(sum*10)%11;return r===10?0:r;
    };
    return digit(9)===Number(d[9])&&digit(10)===Number(d[10]);
  }
  function cnpjOk(v){
    const d=digits(v);if(d.length!==14||/^(\d)\1{13}$/.test(d))return false;
    const calc=(base,weights)=>{
      const sum=base.split("").reduce((a,n,i)=>a+Number(n)*weights[i],0),r=sum%11;
      return r<2?0:11-r;
    };
    const d1=calc(d.slice(0,12),[5,4,3,2,9,8,7,6,5,4,3,2]);
    const d2=calc(d.slice(0,12)+d1,[6,5,4,3,2,9,8,7,6,5,4,3,2]);
    return d1===Number(d[12])&&d2===Number(d[13]);
  }
  function isValidDocument(v){
    const d=digits(v);return d.length===11?cpfOk(d):d.length===14?cnpjOk(d):false;
  }

  function parseDate(v){
    const s=String(v??"").trim();if(!s)return null;
    let m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if(m)return new Date(+m[3],+m[2]-1,+m[1],12);
    m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if(m)return new Date(+m[1],+m[2]-1,+m[3],12);
    const d=new Date(s);return Number.isNaN(d.getTime())?null:d;
  }
  function isValidDate(v){return !!parseDate(v)}

  function groupProcessesByClient(rows){
    const map=new Map();
    for(const row of rows||[]){
      const name=String(row?.Cliente??row?.Nome??"").trim();
      if(!name)continue;
      const id=String(row?.ClienteId||stableClientId({Cliente:name,Telefone:row?.Telefone||""}));
      if(!id)continue;
      if(!map.has(id))map.set(id,{
        ClienteId:id,Nome:name,Telefone_Principal:normalizePhone(row?.Telefone||""),
        Email:String(row?.Email||""),Responsavel:String(row?.Assistente||""),
        processos:[],protocolos:[],ultimoRetorno:"",proximoRetorno:""
      });
      const c=map.get(id);c.processos.push(row);
      if(row?.Protocolo)c.protocolos.push(String(row.Protocolo));
      if(!c.Telefone_Principal&&row?.Telefone)c.Telefone_Principal=normalizePhone(row.Telefone);
      if(!c.Responsavel&&row?.Assistente)c.Responsavel=String(row.Assistente);
      const ur=parseDate(row?.["Último Retorno"]||row?.UltimoRetorno);
      const current=parseDate(c.ultimoRetorno);
      if(ur&&(!current||ur>current))c.ultimoRetorno=row?.["Último Retorno"]||row?.UltimoRetorno;
      const pr=parseDate(row?.["Próximo Retorno"]||row?.ProximoRetorno);
      const curp=parseDate(c.proximoRetorno);
      if(pr&&(!curp||pr<curp))c.proximoRetorno=row?.["Próximo Retorno"]||row?.ProximoRetorno;
    }
    return [...map.values()].sort((a,b)=>a.Nome.localeCompare(b.Nome,"pt-BR"));
  }

  function validateProcess(row){
    const errors=[],warnings=[];
    if(!String(row?.Cliente||"").trim())warnings.push("Cliente vazio");
    const cnj=row?.Protocolo||row?.CNJ;
    if(cnj&&digits(cnj).length===20&&!isValidCNJ(cnj))errors.push("CNJ inválido");
    const phone=row?.Telefone;
    if(phone){
      const n=normalizePhone(phone);
      if(!isValidE164(n))warnings.push("Telefone fora do padrão E.164");
    }
    for(const key of ["Último Retorno","Próximo Retorno"]){
      const v=row?.[key];if(v&&!isValidDate(v))errors.push(key+" inválido");
    }
    return {ok:errors.length===0,errors,warnings};
  }
  function validateClient(row){
    const errors=[],warnings=[];
    if(!String(row?.Nome||row?.Cliente||"").trim())errors.push("Nome obrigatório");
    const doc=row?.CPF_CNPJ;
    if(doc&&!isValidDocument(doc))errors.push("CPF/CNPJ inválido");
    const phone=normalizePhone(row?.Telefone_Principal||row?.Telefone||"");
    if(phone&&!isValidE164(phone))warnings.push("Telefone fora do padrão E.164");
    return {ok:errors.length===0,errors,warnings};
  }

  return {SHEETS,norm,digits,slug,hash,clientFingerprint,stableClientId,stableId,normalizePhone,isValidE164,calcCnjDv,isValidCNJ,formatCNJ,cpfOk,cnpjOk,isValidDocument,parseDate,isValidDate,groupProcessesByClient,validateProcess,validateClient};
});