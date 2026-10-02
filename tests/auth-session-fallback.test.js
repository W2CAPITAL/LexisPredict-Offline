const assert=require("node:assert/strict");

process.env.LEXIS_SHEETS_TOKEN="test-session-secret";
const auth=require("../lib/bridge-auth");

(async()=>{
  const user={usuario:"teste",nome:"Teste",perfil:"operador"};
  const opaque=auth.createSessionValue("apps-script-session",user);
  assert.match(opaque,/^v1\./,"fallback deve ser uma credencial opaca assinada");

  const viaHeader=await auth.validateSession({headers:{"x-lexis-session":opaque}});
  assert.equal(viaHeader.ok,true,"header assinado deve autenticar sem cookie");
  assert.equal(viaHeader.local,true);
  assert.equal(viaHeader.sess,"apps-script-session");
  assert.equal(viaHeader.user.nome,"Teste");

  const tampered=opaque.slice(0,-1)+(opaque.endsWith("a")?"b":"a");
  const invalid=await auth.validateSession({headers:{"x-lexis-session":tampered}});
  assert.equal(invalid.ok,false);
  assert.equal(invalid.status,401);
  assert.equal(invalid.reason,"invalid_signature");

  const noSession=await auth.validateSession({headers:{}});
  assert.equal(noSession.ok,false);
  assert.equal(noSession.reason,"missing_session");

  const headers={};
  const res={setHeader(k,v){headers[k]=v}};
  const returned=auth.setSessionCookie(res,"apps-script-session",user);
  assert.match(returned,/^v1\./);
  assert.match(headers["Set-Cookie"],/HttpOnly/);
  assert.match(headers["Set-Cookie"],/Secure/);
  assert.match(headers["Set-Cookie"],/SameSite=Lax/);

  console.log("auth-session-fallback: ok");
})().catch(err=>{console.error(err);process.exit(1)});
