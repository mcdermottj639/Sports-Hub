/* Family Survivor League — service worker.
   ------------------------------------------------------------------
   The whole point: when the commissioner ships a change, every phone
   picks it up on the next open, with nobody clearing a cache or
   reinstalling anything.

   NETWORK-FIRST. Every same-origin request goes to the network with
   `cache: 'no-store'`, which bypasses both the browser's HTTP cache and
   GitHub Pages' ~10-minute one. The Cache API copy is only ever the
   offline fallback. That is the opposite of the usual cache-first PWA
   advice, and it is deliberate — for this app being CURRENT matters far
   more than being fast, and the files are a few KB.

   ⚠️ This replaces the `?v=N` query-string ritual, which had already
   failed: survivor.js changed 16 times while index.html still asked for
   `?v=1`, so a returning phone could have served a months-old copy. */

/* Bumped with APP_V in survivor.js. Nothing here reads it — its whole job is
   to make this FILE different on a ship, because a browser only looks for a
   new worker when sw.js itself changed byte-wise. Forgetting it costs only
   the weaker of the app's two update signals (the page also fingerprints
   survivor.js directly), but bump it anyway. */
const APP_V = 'v28';

const CACHE = 'survivor-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim())
));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // ESPN and Supabase go straight to the network — never cached, never
  // intercepted. A stale score or a stale pick would be worse than none.
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(req, { cache: 'no-store' })
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then((hit) => hit || caches.match('./', { ignoreSearch: true })))
  );
});
