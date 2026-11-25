const CACHE="brillia-shell-v5";self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(["/","/index.html","/manifest.json"]))));self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(a=>Promise.all(a.filter(x=>x!==CACHE).map(x=>caches.delete(x))))));self.addEventListener("fetch",e=>{if(e.request.method!=="GET")return;e.respondWith(caches.match(e.request).then(x=>x||fetch(e.request).then(r=>{let q=r.clone();caches.open(CACHE).then(c=>c.put(e.request,q));return r}).catch(()=>caches.match("/"))))});
self.addEventListener("push",event=>{
 let data={title:"Brillia",body:"Tu hogar te espera. Un pequeño paso cada vez.",url:"/"};
 try{if(event.data)data={...data,...event.data.json()}}catch(_){}
 event.waitUntil(self.registration.showNotification(data.title||"Brillia",{
  body:data.body||"Tienes tareas pendientes para hoy.",
  icon:"/icon-192.png",
  badge:"/icon-192.png",
  data:{url:data.url||"/"},
  tag:"brillia-daily-reminder",
  renotify:false
 }));
});
self.addEventListener("notificationclick",event=>{
 event.notification.close();
 const target=event.notification.data&&event.notification.data.url||"/";
 event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{
  for(const client of list){if("focus"in client)return client.focus().then(c=>c&&"navigate"in c?c.navigate(target):c)}
  return clients.openWindow(target);
 }));
});
