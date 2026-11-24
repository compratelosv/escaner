/* sw.js — service worker: app shell servible sin conexión.
 * Estrategia: stale-while-revalidate para recursos propios: se sirve la copia
 * en caché al instante y se descarga la nueva en segundo plano, de modo que un
 * deploy nunca deja al usuario atascado en una versión vieja del código.
 * Navegación: red primero, con respaldo en caché cuando no hay conexión.
 */
const CACHE = 'ctl-escaner-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/store.js',
  './js/scanner.js',
  './js/labels.js',
  './vendor/zxing-library.min.js',
  './vendor/zxing-browser.min.js',
  './vendor/qrcode-generator.js',
  './vendor/jsbarcode.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
      return res;
    })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(async () => (await caches.match(req)) || caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(staleWhileRevalidate(req));
});
