const CACHE='nuestro-hogar-v11';
const BASE='/nuestro-hogar/';
const SHELL=[BASE,BASE+'manifest.webmanifest',BASE+'icon.svg',BASE+'icon-192.png',BASE+'icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
 const request=event.request;if(request.method!=='GET')return;
 const url=new URL(request.url);if(url.origin!==self.location.origin)return;
 if(request.mode==='navigate'){event.respondWith(fetch(request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(BASE,copy));return response}).catch(()=>caches.match(BASE)));return}
 event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy))}return response})));
});

self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const target=new URL(event.notification?.data?.url||BASE,self.location.origin).href;
 event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(windows=>{
  for(const client of windows){if('focus' in client){client.navigate(target);return client.focus()}}
  return clients.openWindow?clients.openWindow(target):undefined;
 }));
});

self.addEventListener('push',event=>{
 let data={};
 try{data=event.data?event.data.json():{}}catch{data={title:'Nuestro Hogar',body:event.data?event.data.text():''}}
 const title=data.title||'Nuestro Hogar';
 const options={
  body:data.body||'',
  icon:data.icon||BASE+'icon-192.png',
  badge:data.badge||BASE+'icon-192.png',
  tag:data.tag||'nuestro-hogar',
  data:data.data||{url:BASE},
  renotify:true
 };
 event.waitUntil(self.registration.showNotification(title,options));
});

self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
