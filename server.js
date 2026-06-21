// Sports-Hub backend: serves the web frontend and acts as a caching proxy in
// front of API-Sports so the free tier (~100 requests/day per sport) goes far.

const path = require('path');
const express = require('express');

const cache = require('./lib/cache');
const api = require('./lib/apiSports');
const demo = require('./lib/demoData');
const config = require('./config/teams');

const PORT = Number(process.env.PORT) || 3000;
const TTL = Number(process.env.CACHE_TTL_SECONDS) || 900;
const GAMES_TTL = Math.min(TTL, 120); // games can be live -> refresh sooner

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const todayStr = () => new Date().toISOString().slice(0, 10);

// Build the per-sport query params for a "games on date" request.
function gamesParams(sport, date) {
  const s = config.sports[sport];
  switch (sport) {
    case 'soccer':
      return { path: '/fixtures', params: { date, league: s.league, season: s.season } };
    case 'nba':
      return { path: '/games', params: { date } };
    case 'mlb':
      return { path: '/games', params: { date, league: s.league, season: s.season } };
    case 'nfl':
    default:
      return { path: '/games', params: { date, league: s.league, season: s.season } };
  }
}

function standingsParams(sport) {
  const s = config.sports[sport];
  return { path: '/standings', params: { league: s.league, season: s.season } };
}

async function getGames(sport, date) {
  const key = `games:${sport}:${date}`;
  return cache.wrap(key, GAMES_TTL, async () => {
    if (!api.isLive()) return demo.games[sport] || [];
    const { path: p, params } = gamesParams(sport, date);
    const raw = await api.request(sport, p, params);
    return raw.map((g) => api.normalizeGame(sport, g));
  });
}

async function getStandings(sport) {
  const key = `standings:${sport}:${config.sports[sport].season}`;
  return cache.wrap(key, TTL, async () => {
    if (!api.isLive()) return demo.standings[sport] || [];
    const { path: p, params } = standingsParams(sport);
    const raw = await api.request(sport, p, params);
    return api.normalizeStandings(sport, raw);
  });
}

// --- API routes -----------------------------------------------------------

app.get('/api/config', (req, res) => {
  const sports = {};
  for (const [k, v] of Object.entries(config.sports)) {
    sports[k] = { label: v.label, emoji: v.emoji, season: v.season, favoriteTeams: v.favoriteTeams };
  }
  res.json({ live: api.isLive(), featuredTeam: config.featuredTeam, sports });
});

app.get('/api/games', async (req, res) => {
  const sport = req.query.sport;
  if (!config.sports[sport]) return res.status(400).json({ error: 'unknown sport' });
  const date = req.query.date || todayStr();
  try {
    const { value, cached } = await getGames(sport, date);
    res.json({ sport, date, cached, games: value });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/api/standings', async (req, res) => {
  const sport = req.query.sport;
  if (!config.sports[sport]) return res.status(400).json({ error: 'unknown sport' });
  try {
    const { value, cached } = await getStandings(sport);
    res.json({ sport, cached, standings: value });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// One aggregated call powers the home screen (keeps API usage predictable).
app.get('/api/dashboard', async (req, res) => {
  const date = req.query.date || todayStr();
  const sports = Object.keys(config.sports);
  const out = { date, live: api.isLive(), featuredTeam: config.featuredTeam, games: {}, featuredStandings: [] };

  try {
    const results = await Promise.allSettled(sports.map((s) => getGames(s, date)));
    results.forEach((r, i) => {
      out.games[sports[i]] = r.status === 'fulfilled' ? r.value.value : [];
    });

    const fs = await getStandings(config.featuredTeam.sport).catch(() => ({ value: [] }));
    out.featuredStandings = fs.value;

    res.json(out);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/api/health', (req, res) => res.json({ ok: true, live: api.isLive(), cache: cache.stats() }));

app.listen(PORT, () => {
  const mode = api.isLive() ? 'LIVE (API-Sports key detected)' : 'DEMO (no API key — using sample data)';
  console.log(`\n  🏟️  Sports-Hub running on http://localhost:${PORT}`);
  console.log(`  Mode: ${mode}\n`);
});
