// Sports-Hub service worker — network-first so you always get the newest
// version when online, with a cached copy as an offline fallback. Only the
// app's own files pass through here; ESPN/X requests go straight to the network.
// CACHE is versioned (bump it with APP_VERSION) so each deploy starts clean and
// the activate handler can purge stale caches instead of letting them pile up.
const CACHE = 'sportshub-v115';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(
  // Drop any older sportshub-* caches, then take control of open pages.
  caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim())
));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // let ESPN/X/etc. hit the network directly

  e.respondWith(
    // `no-store` bypasses GitHub's 10-min HTTP cache so we always get the
    // newest deploy when online; the Cache API copy is the offline fallback.
    fetch(req, { cache: 'no-store' })
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch((err) => console.warn('[sw] cache put failed', err));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) =>
        hit || caches.match('./', { ignoreSearch: true }) // fall back to the app shell offline
      ))
  );
});
