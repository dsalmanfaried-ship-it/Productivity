const CACHE='ghabaty-v4';
const FILES=['./','./index.html','./manifest.json','./icon-192.png','./icon-512.png','./icon-maskable-512.png','./icon-180.png'];

self.addEventListener('install',e=>{
 e.waitUntil(caches.open(CACHE).then(c=>Promise.all(FILES.map(f=>c.add(new Request(f,{cache:'reload'})).catch(()=>{})))).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',e=>{
 e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',e=>{
 const req=e.request;
 if(req.method!=='GET')return;
 const u=new URL(req.url);
 if(u.protocol.indexOf('http')!==0)return;
 if(req.destination==='audio'||req.destination==='video'||req.headers.has('range'))return;

 // الصفحة نفسها: كاش أولاً، وتتحدّث في الخلفية لما يكون فيه نت
 if(req.mode==='navigate'){
  e.respondWith(
   caches.match('./index.html').then(hit=>{
    const net=fetch(req).then(r=>{if(r&&r.ok){const c=r.clone();caches.open(CACHE).then(x=>x.put('./index.html',c))}return r}).catch(()=>null);
    return hit||net.then(r=>r||caches.match('./'));
   })
  );
  return;
 }

 // باقي الملفات (أيقونات، خطوط جوجل، ...): كاش أولاً ثم الشبكة، وتتخزن للمرة الجاية
 e.respondWith(
  caches.match(req,{ignoreSearch:true}).then(hit=>{
   const net=fetch(req).then(r=>{if(r&&(r.ok||r.type==='opaque')){const c=r.clone();caches.open(CACHE).then(x=>x.put(req,c))}return r}).catch(()=>hit);
   return hit||net;
  })
 );
});
