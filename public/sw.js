const CACHE_NAME = 'academy-v2.6.4';
const ASSETS = [
  '/',
  '/index.html',
  '/checkout.html',
  '/css/design-system.css',
  '/css/components.css',
  '/js/api.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
