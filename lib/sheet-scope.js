function norm(v){
  return String(v??"")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toUpperCase().replace(/[^A-Z0-9/]+/g," ").replace(/\s+/g," ").trim();
}
function isElevated(profile){
  return /SUPERADMIN|SUPERVISOR|ADMINISTRADOR|ADMIN\b/.test(norm(profile));
}
function assistantSegments(v){
  return String(v??"").split(/[\/|;,]+/).map(norm).filter(Boolean);
}
function ownerValue(row){
  if(!row||typeof row!=="object")return "";
  const aliases=["Assistente","Responsável","Responsavel","Responsável Atual","Responsavel Atual","Operador","Dono","Owner"];
  for(const key of aliases){
    if(row[key]!=null&&String(row[key]).trim())return row[key];
  }
  const normalized={};
  Object.keys(row).forEach(key=>{normalized[norm(key)]=key});
  for(const key of aliases){
    const real=normalized[norm(key)];
    if(real&&String(row[real]??"").trim())return row[real];
  }
  return "";
}
function personKeys(v){
  const raw=norm(v);
  if(!raw)return[];
  const parts=raw.split(" ").filter(Boolean);
  return [...new Set([raw,parts[0]||""].filter(x=>x.length>=3))];
}
function ownerMatches(row,user){
  if(!user)return false;
  if(isElevated(user.perfil))return true;
  const targets=[...new Set([...personKeys(user.nome),...personKeys(user.usuario)])];
  if(!targets.length)return false;
  return assistantSegments(ownerValue(row)).some(segment=>{
    const keys=personKeys(segment);
    return keys.some(key=>targets.includes(key));
  });
}
function scopeRows(rows,user,mode="mine"){
  const list=Array.isArray(rows)?rows:[];
  if(!user)return [];
  if(mode==="company")return list;
  if(isElevated(user?.perfil))return list;
  return list.filter(r=>ownerMatches(r,user));
}
module.exports={norm,isElevated,assistantSegments,ownerMatches,scopeRows};
