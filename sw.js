// Installation support only. Product, stock, checkout and page requests stay
// network-backed; do not download an unused precache or imply offline checkout.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('dsb-shell-')).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (new URL(event.request.url).origin === self.location.origin) event.respondWith(fetch(event.request));
});
