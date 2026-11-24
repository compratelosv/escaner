/* sw.js — service worker: app shell servible sin conexión.
 * Estrategia: stale-while-revalidate para recursos propios: se sirve la copia
 * en caché al instante y se descarga la nueva en segundo plano.
 *
 * IMPORTANTE al desplegar: subir el número de CACHE en cada release. El nombre
 * es lo que dispara la reinstalación; si no cambia, el navegador conserva el
 * service worker anterior. Los recursos se piden con `cache: 'reload'` para
 * ignorar la caché HTTP de GitHub Pages (max-age=600) y no congelar una
 * versión vieja del código.
 */
const CACHE = 'ctl-escaner-v3';
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
    caches.open(CACHE)
      // cache:'reload' ignora la caché HTTP del navegador y del CDN.
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
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
  // 'no-cache' revalida con el servidor: si el archivo cambió, se actualiza ya.
  const network = fetch(request, { cache: 'no-cache' })
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
