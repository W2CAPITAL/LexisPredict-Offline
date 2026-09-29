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
function ownerMatches(row,user){
  if(!user)return false;
  if(isElevated(user.perfil))return true;
  const target=norm(user.nome||user.usuario);
  if(!target)return false;
  const primary=assistantSegments(row?.Assistente);
  if(primary.some(x=>x===target))return true;
  // Compatibilidade: se o nome cadastrado é longo e a planilha usa somente o primeiro nome.
  const first=target.split(" ")[0];
  if(first&&primary.some(x=>x===first))return true;
  return false;
}
function scopeRows(rows,user,mode="mine"){
  const list=Array.isArray(rows)?rows:[];
  if(!user)return [];
  if(mode==="company")return list;
  if(isElevated(user?.perfil))return list;
  return list.filter(r=>ownerMatches(r,user));
}
module.exports={norm,isElevated,assistantSegments,ownerMatches,scopeRows};
