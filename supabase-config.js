// Public, read-only Supabase configuration. This publishable key is safe in a
// browser because Row Level Security grants SELECT only; all writes stay in the
// scheduled Edge Function with its server-only service-role key.
globalThis.SPORTS_HUB_SUPABASE = Object.freeze({
  url: 'https://oqrfdhoyyogjmiqmjhnp.supabase.co',
  key: 'sb_publishable_d5Jshv1Nakib7ROsgHVIVA_xHjp9QQV',
});

/* v310: ESPN refuses BROWSER requests to its team-level pages
   (site.api.espn.com/.../teams/{id}/depthcharts|roster|schedule and /teams/{id})
   while /scoreboard, /summary and /injuries still answer. Those paths go through
   the read-only `espn-teams` Edge Function relay instead; anything else, and any
   relay failure, falls back to the direct request so nothing gets worse than
   before. The relay allowlists these paths only — see
   supabase/functions/espn-teams/index.ts. */
globalThis.SportsHubEspnRelay = Object.freeze((() => {
  const RELAY = 'https://oqrfdhoyyogjmiqmjhnp.supabase.co/functions/v1/espn-teams?path=';
  const MATCH = /^https:\/\/site\.api\.espn\.com(\/apis\/site\/v2\/sports\/(?:football\/(?:nfl|college-football)|baseball\/mlb|basketball\/nba)\/teams(?:\/[A-Za-z0-9]{1,8}(?:\/(?:depthcharts|roster|schedule|statistics))?)?(?:\?.*)?)$/;
  const relayURL = (url) => { const m = MATCH.exec(String(url)); return m ? RELAY + encodeURIComponent(m[1]) : null; };
  async function relayFetch(url, opts = {}) {
    const via = relayURL(url);
    if (via) {
      try { const r = await fetch(via, opts); if (r.ok) return r; } catch (e) { if (opts.signal?.aborted) throw e; }
    }
    return fetch(url, opts);
  }
  return { relayURL, fetch: relayFetch };
})());
