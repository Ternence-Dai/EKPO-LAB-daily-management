// EKPO Lab PWA service worker: precache the app shell, serve cache-first, fall back to index.html for navigations.
const CACHE_NAME = 'ekpo-v1';
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon.svg',
  './icons/maskable.svg',
  './icons/icon.svg',
  './assets/css/legacy-app.css',
  './assets/css/product-system.css',
  './assets/css/workspace-v5.css',
  './assets/css/ekpo-lab-operations-workspace.css',
  './assets/css/reference-interface-v1.css',
  './assets/css/lims-operations-console-v2.css',
  './assets/css/reference-platform-v4.css',
  './assets/css/ekpo-operations-cockpit-v3.css',
  './assets/css/experiment-preflight-v1.css',
  './assets/css/lims-fieldbook-final-v4.css',
  './assets/css/readability-accessibility-v10.css',
  './assets/js/demo-seed-data.js',
  './assets/js/legacy-app.js',
  './assets/js/workspace-v5.js',
  './assets/js/ekpo-operations-cockpit-v3.js',
  './src/domain/index.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => {
        if (request.mode === 'navigate') return caches.match('./index.html', { ignoreSearch: true });
        throw new Error('offline and not cached: ' + request.url);
      });
    })
  );
});
