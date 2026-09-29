const CACHE="sheetspredict-v23";
const SHELL=["/index.html","/styles.css","/app.js","/lib/crm-model.js","/lib/task-priority.js","/lib/suggest-response.js","/lib/sheets-hub.js","/manifest.webmanifest"];

self.addEventListener("install",event=>{
  event.waitUntil(
    caches.open(CACHE)
      .then(cache=>cache.addAll(SHELL))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener("fetch",event=>{
  const request=event.request;
  const url=new URL(request.url);

  if(url.origin!==self.location.origin)return;
  if(url.pathname.startsWith("/api/"))return;

  // IMPORTANTE:
  // navegacoes (/tarefas, /processos, /clientes etc.) ficam a cargo da Vercel.
  // Interceptar Request.mode="navigate" pode devolver uma resposta redirect
  // para um request com redirect="manual", causando ERR_FAILED no Chrome.
  if(request.mode==="navigate"||request.destination==="document")return;

  if(request.method!=="GET")return;

  event.respondWith(
    fetch(request)
      .then(response=>{
        if(response.ok&&response.type!=="opaqueredirect"){
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{});
        }
        return response;
      })
      .catch(async()=>{
        const cached=await caches.match(request);
        if(cached)return cached;
        throw new Error("Recurso indisponivel offline");
      })
  );
});
