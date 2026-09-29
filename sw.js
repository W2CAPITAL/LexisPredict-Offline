const CACHE="lexis-secure-v13";
const SHELL=["/","/index.html","/styles.css","/app.js","/lib/crm-model.js","/lib/task-priority.js","/lib/suggest-response.js","/manifest.webmanifest"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(u.origin!==location.origin||u.pathname.startsWith("/api/"))return;
  if(e.request.mode==="navigate"){
    e.respondWith(
      fetch(e.request).then(async r=>{
        if(r.ok){
          const copy=r.clone();
          caches.open(CACHE).then(c=>c.put(e.request,copy));
          return r;
        }
        const shell=await caches.match("/index.html");
        return shell||r;
      }).catch(()=>caches.match("/index.html"))
    );
    return;
  }
  e.respondWith(
    fetch(e.request).then(r=>{
      if(r.ok){
        const copy=r.clone();
        caches.open(CACHE).then(c=>c.put(e.request,copy));
      }
      return r;
    }).catch(()=>caches.match(e.request))
  );
});

