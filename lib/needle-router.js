(function(root,factory){
  const api=factory();
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  else root.SheetsNeedle=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";

  const ACTIONS=new Map([
    ["session",{tool:"session",upstream:null,confidence:1}],
    ["login",{tool:"authenticate",upstream:"login",confidence:1}],
    ["auth",{tool:"authenticate",upstream:"auth",confidence:1}],
    ["logout",{tool:"logout",upstream:null,confidence:1}],
    ["ping",{tool:"health",upstream:"ping",confidence:1}],
    ["auto",{tool:"session_refresh",upstream:"auto",confidence:1}],
    ["list",{tool:"list_processes",upstream:"list_compact",confidence:.99}],
    ["get",{tool:"get_process",upstream:"get",confidence:1}],
    ["search",{tool:"search_processes",upstream:"search",confidence:.98}],
    ["write",{tool:"write_processes",upstream:"write",confidence:1}],
    ["upsert_batch",{tool:"write_processes",upstream:"upsert_batch",confidence:1}],
    ["crm_list",{tool:"crm_list",upstream:"crm_list",confidence:.98,capability:"crm_list",optional:true}],
    ["crm_write",{tool:"crm_write",upstream:"crm_write",confidence:.98,capability:"crm_write",optional:true}],
    ["crm_seed_clients",{tool:"crm_seed_clients",upstream:"crm_seed_clients",confidence:.98,capability:"crm_seed_clients",optional:true}],
    ["judicial_history",{tool:"judicial_history",upstream:"judicial_history",confidence:.99,capability:"judicial_history"}],
    ["djen_fetch",{tool:"djen_fetch",upstream:"djen_fetch",confidence:.99,capability:"djen_fetch"}],
    ["users",{tool:"users",upstream:"users",confidence:.96}],
    ["list_users",{tool:"users",upstream:"list_users",confidence:.96}],
    ["create_user",{tool:"user_write",upstream:"create_user",confidence:.96}],
    ["user_create",{tool:"user_write",upstream:"user_create",confidence:.96}],
    ["user_set",{tool:"user_write",upstream:"user_set",confidence:.96}],
    ["hash",{tool:"password_hash",upstream:"hash",confidence:1}]
  ]);

  function digits(v){return String(v??"").replace(/\D/g,"")}
  function cleanAction(v){return String(v??"").trim().toLowerCase()}

  function routeSheetsAction(payload){
    payload=payload&&typeof payload==="object"?payload:{};
    const action=cleanAction(payload.action);
    const base=ACTIONS.get(action);
    if(!base)return {supported:false,action,tool:null,upstream:null,confidence:0,args:{},reason:"unsupported_action"};
    const args={...payload,action:base.upstream||action};
    let tool=base.tool,upstream=base.upstream,confidence=base.confidence,reason="explicit_action";
    if(action==="search"){
      const q=String(payload.query||payload.q||"").trim();
      const cnj=digits(q);
      if(cnj.length===20){
        tool="get_process";
        upstream="get";
        args.action="get";
        args.protocolo=cnj;
        confidence=1;
        reason="exact_cnj";
      }else{
        upstream="search";
        args.action="search";
        confidence=q.length>=3?.98:.72;
        reason=q.length>=3?"free_text_search":"short_query";
      }
    }
    return {
      supported:true,
      action,
      tool,
      upstream,
      confidence,
      reason,
      optional:!!base.optional,
      capability:base.capability||null,
      args
    };
  }

  function bridgeCapabilityFor(action){
    return ACTIONS.get(cleanAction(action))?.capability||null;
  }

  function bridgeConfirmedWrite(response,rows){
    const list=Array.isArray(rows)?rows:[];
    if(!list.length||!response||response.ok===false||response.conflict)return false;
    const rejected=Number(response.rejected_count||0);
    const written=Number(response.written??response.updated??response.added??0);
    return rejected===0&&Number.isFinite(written)&&written>=list.length;
  }

  function shouldRemoteSearch(query,localRows,{cacheFresh=true,syncing=false}={}){
    const q=String(query||"").trim(),local=Array.isArray(localRows)?localRows:[];
    if(q.length<2)return false;
    const cnj=digits(q);
    if(cnj.length===20&&local.some(row=>digits(row?.Protocolo||row?.protocolo||row?.CNJ||row?.cnj||"")===cnj))return false;
    if(!local.length)return true;
    return !cacheFresh||!!syncing;
  }

  return {ACTIONS,routeSheetsAction,bridgeCapabilityFor,bridgeConfirmedWrite,shouldRemoteSearch,digits};
});
