// Sports-Hub service worker — network-first so you always get the newest
// version when online, with a cached copy as an offline fallback. Only the
// app's own files pass through here; ESPN/X requests go straight to the network.
const CACHE = 'sportshub-cache';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // let ESPN/X/etc. hit the network directly

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) =>
        hit || caches.match('./', { ignoreSearch: true }) // fall back to the app shell offline
      ))
  );
});
