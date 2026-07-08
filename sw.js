// ═══════════════════════════════════════════════════════════
// Service Worker — offline support for The Dhikr Garden
// Strategy:
//  - Navigation (the app page itself): network-first, falls back to
//    the last cached copy when offline, so users always get the
//    newest version when online, and still get *something* offline.
//  - Everything else (fonts, Chart.js): cache-first, since these
//    rarely change and loading them from cache is faster anyway.
// ═══════════════════════════════════════════════════════════
const CACHE_NAME = 'dhikr-garden-v1';
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400&family=Inter:wght@300;400;500;600&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache each URL individually so one failure (e.g. a CDN hiccup)
      // doesn't block the whole install.
      return Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => console.warn('[sw] precache failed:', url, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // don't try to cache POST/PUT etc.

  const isNavigation = req.mode === 'navigate';

  if (isNavigation) {
    // Network-first for the app page itself, so online users always get updates.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first for static assets (fonts, Chart.js, icons).
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          // Only cache successful, basic/cors responses (skip opaque errors).
          if (res && res.status === 200) {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return res;
        })
        .catch(() => {
          // No network and not cached — nothing more we can do for this asset.
          return new Response('', { status: 504, statusText: 'Offline and not cached' });
        });
    })
  );
});
