// Installation support only. Product, stock, checkout and page requests stay
// network-backed; the service worker deliberately does not proxy normal GETs.
// A no-op fetch listener preserves installability without adding a fetch()
// promise hop to every same-origin request.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('dsb-shell-')).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', () => {});
