// Tiny in-memory TTL cache. The whole point of this app's backend:
// fetch from API-Sports once, reuse the result, and stay under the
// free tier's ~100 requests/day limit.

const store = new Map();

function get(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expires) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

function set(key, value, ttlSeconds) {
  store.set(key, {
    value,
    expires: Date.now() + ttlSeconds * 1000,
  });
}

// Wrap an async producer with caching. If `producer` throws, we serve a
// stale value when one exists so a hiccup (or hitting the daily limit)
// doesn't blank the UI.
async function wrap(key, ttlSeconds, producer) {
  const cached = get(key);
  if (cached !== undefined) return { value: cached, cached: true };

  try {
    const value = await producer();
    set(key, value, ttlSeconds);
    return { value, cached: false };
  } catch (err) {
    const stale = store.get(key);
    if (stale) return { value: stale.value, cached: true, stale: true };
    throw err;
  }
}

function stats() {
  return { entries: store.size, keys: [...store.keys()] };
}

module.exports = { get, set, wrap, stats };
