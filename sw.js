const CACHE_VERSION = 'dsb-shell-v4';
const SHELL = ['./','./index.html','./style.css','./manifest.json','./icon-192.png','./icon-512.png'];
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
