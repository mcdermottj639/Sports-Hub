// espn-teams — read-only relay for ESPN's team-level endpoints.
//
// Why it exists (v310): since ~Oct 2026 ESPN refuses browser requests to
// site.api.espn.com/.../teams/{id}/... (depth charts, rosters, schedules, team
// info) while /scoreboard, /summary and /injuries still answer. Server-side
// requests are unaffected — the scheduled collector reads the same pages fine —
// so the app routes ONLY those paths through here and falls back to the direct
// request if this relay is down.
//
// Locked down on purpose: GET only, one upstream host, a strict path allowlist,
// a short query-key allowlist, and CORS for the app's own origin. It cannot be
// used to reach any other site or any other ESPN path.

const UPSTREAM = "https://site.api.espn.com";
const PATH_OK =
  /^\/apis\/site\/v2\/sports\/(football\/(nfl|college-football)|baseball\/mlb|basketball\/nba)\/teams(\/[A-Za-z0-9]{1,8}(\/(depthcharts|roster|schedule|statistics))?)?$/;
const QUERY_OK = new Set(["season", "seasontype", "enable", "limit"]);
const ORIGINS = ["https://mcdermottj639.github.io"];
const TTL_MS = 5 * 60 * 1000;
const memo = new Map<string, { at: number; body: string; status: number }>();

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "apikey, authorization, content-type",
    "Vary": "Origin",
  };
}

Deno.serve(async (req: Request) => {
  const headers = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "GET") return new Response("method not allowed", { status: 405, headers });

  const raw = new URL(req.url).searchParams.get("path") || "";
  let target: URL;
  try { target = new URL(raw, UPSTREAM); } catch { return new Response("bad path", { status: 400, headers }); }
  if (target.origin !== UPSTREAM || !PATH_OK.test(target.pathname)) {
    return new Response("path not allowed", { status: 403, headers });
  }
  for (const k of [...target.searchParams.keys()]) if (!QUERY_OK.has(k)) target.searchParams.delete(k);
  const key = target.toString();

  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return new Response(hit.body, { status: hit.status, headers: { ...headers, "Content-Type": "application/json", "Cache-Control": "public, max-age=300", "X-Relay-Cache": "hit" } });
  }
  try {
    const res = await fetch(key, { headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0 SportsHubRelay" }, signal: AbortSignal.timeout(10000) });
    const body = await res.text();
    if (res.ok) {
      if (memo.size > 400) memo.clear();
      memo.set(key, { at: Date.now(), body, status: res.status });
    }
    return new Response(body, { status: res.status, headers: { ...headers, "Content-Type": "application/json", "Cache-Control": res.ok ? "public, max-age=300" : "no-store", "X-Relay-Cache": "miss" } });
  } catch (_) {
    return new Response(JSON.stringify({ error: "upstream unavailable" }), { status: 502, headers: { ...headers, "Content-Type": "application/json" } });
  }
});
