const CACHE_VERSION = 'dsb-shell-v9-seo';
const SHELL = ['./','./index.html','./catalog.html','./style.css?v=20260907e','./manifest.json','./favicon.ico?v=20260907f','./favicon-48.png?v=20260907f','./favicon-96.png?v=20260907f','./apple-touch-icon.png?v=20260907f','./icon-192.png','./icon-512.png','./i18n.js?v=20260907d'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(SHELL)).catch(()=>{}));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))));
  self.clients.claim();
});
// Network-only same-origin fetch handling keeps live product/stock/order data fresh
// while still giving Chromium a fully active service-worker fetch lifecycle.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(fetch(event.request));
});
