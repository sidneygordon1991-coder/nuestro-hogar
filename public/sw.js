const CACHE = 'nuestro-hogar-v36';
const BASE = '/nuestro-hogar/';
const SHELL = [
  BASE,
  BASE + 'manifest.webmanifest',
  BASE + 'icon.svg',
  BASE + 'icon-192.png',
  BASE + 'icon-512.png',
  BASE + 'icon-premium.svg',
  BASE + 'icon-premium-192.png',
  BASE + 'icon-premium-512.png',
  BASE + 'icon-premium-maskable-512.png',
  BASE + 'apple-touch-icon-premium.png',
  ...['inter-400', 'inter-500', 'inter-600', 'inter-700', 'lora-600'].map(font => BASE + 'fonts/' + font + '.woff')
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    // Network first, but a weak or captive connection never leaves the installed app hanging: after 3.5 s the cached
    // shell opens and the network answer (if any) still refreshes the cache for next time.
    const network = fetch(request).then(response => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(BASE, copy));
      }
      return response;
    });
    const slow = new Promise(resolve => setTimeout(resolve, 3500))
      .then(() => caches.match(BASE))
      .then(cached => cached || network);
    event.respondWith(Promise.race([network.catch(() => caches.match(BASE)), slow]).then(r => r || caches.match(BASE)));
    event.waitUntil(network.catch(() => null));
    return;
  }
  event.respondWith(
    caches.match(request).then(
      cached =>
        cached ||
        fetch(request).then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then(cache => cache.put(request, copy));
          }
          return response;
        })
    )
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification?.data?.url || BASE, self.location.origin).href;
  const open = () => (clients.openWindow ? clients.openWindow(target) : undefined);
  event.waitUntil(
    clients.matchAll({type: 'window', includeUncontrolled: true}).then(windows => {
      const client = windows.find(c => c.url.startsWith(self.registration.scope) && 'focus' in c);
      if (!client) return open();
      return Promise.resolve(client.navigate ? client.navigate(target) : null)
        .then(navigated => (navigated || client).focus())
        .catch(() => open());
    })
  );
});

self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {title: 'Nuestro Hogar', body: event.data ? event.data.text() : ''};
  }
  const title = data.title || 'Nuestro Hogar';
  const options = {
    body: data.body || '',
    icon: data.icon || BASE + 'icon-premium-192.png',
    badge: data.badge || BASE + 'icon-192.png',
    tag: data.tag || 'nuestro-hogar',
    data: data.data || {url: BASE},
    renotify: true
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
