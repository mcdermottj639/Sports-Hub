// Thin client for the API-Sports family of APIs. Each sport lives on its own
// host but shares ONE api key. Responses differ per sport, so we normalize
// games and standings into a single shape the frontend can render uniformly.

const API_KEY = process.env.API_SPORTS_KEY || '';

const HOSTS = {
  nfl: 'https://v1.american-football.api-sports.io',
  nba: 'https://v2.nba.api-sports.io',
  mlb: 'https://v1.baseball.api-sports.io',
  soccer: 'https://v3.football.api-sports.io',
};

const isLive = () => Boolean(API_KEY);

async function request(sport, path, params = {}) {
  if (!API_KEY) {
    const err = new Error('No API_SPORTS_KEY configured (running in demo mode)');
    err.code = 'NO_KEY';
    throw err;
  }
  const host = HOSTS[sport];
  if (!host) throw new Error(`Unknown sport: ${sport}`);

  const url = new URL(host + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }

  const res = await fetch(url, {
    headers: { 'x-apisports-key': API_KEY },
  });
  if (!res.ok) {
    throw new Error(`API-Sports ${sport} ${path} -> HTTP ${res.status}`);
  }
  const body = await res.json();
  // API-Sports puts soft errors (e.g. rate limit, bad params) in `errors`.
  if (body.errors && (Array.isArray(body.errors) ? body.errors.length : Object.keys(body.errors).length)) {
    const msg = JSON.stringify(body.errors);
    throw new Error(`API-Sports ${sport} error: ${msg}`);
  }
  return body.response || [];
}

// ---------------------------------------------------------------------------
// Normalizers: turn each sport's response into a common shape.
// ---------------------------------------------------------------------------

const n = (v) => (v === undefined || v === null ? null : v);

function normalizeGame(sport, raw) {
  switch (sport) {
    case 'soccer':
      return {
        id: raw.fixture?.id,
        date: raw.fixture?.date,
        status: raw.fixture?.status?.short,
        statusLong: raw.fixture?.status?.long,
        home: { name: raw.teams?.home?.name, logo: raw.teams?.home?.logo, score: n(raw.goals?.home) },
        away: { name: raw.teams?.away?.name, logo: raw.teams?.away?.logo, score: n(raw.goals?.away) },
      };
    case 'nba':
      return {
        id: raw.id,
        date: raw.date?.start,
        status: raw.status?.short,
        statusLong: raw.status?.long,
        home: { name: raw.teams?.home?.name, logo: raw.teams?.home?.logo, score: n(raw.scores?.home?.points) },
        away: { name: raw.teams?.visitors?.name, logo: raw.teams?.visitors?.logo, score: n(raw.scores?.visitors?.points) },
      };
    case 'mlb':
      return {
        id: raw.id,
        date: raw.date || raw.timestamp,
        status: raw.status?.short,
        statusLong: raw.status?.long,
        home: { name: raw.teams?.home?.name, logo: raw.teams?.home?.logo, score: n(raw.scores?.home?.total) },
        away: { name: raw.teams?.away?.name, logo: raw.teams?.away?.logo, score: n(raw.scores?.away?.total) },
      };
    case 'nfl':
    default:
      return {
        id: raw.game?.id ?? raw.id,
        date: raw.game?.date?.date || raw.game?.date?.timestamp,
        status: raw.game?.status?.short || raw.status?.short,
        statusLong: raw.game?.status?.long || raw.status?.long,
        week: raw.game?.week,
        home: { name: raw.teams?.home?.name, logo: raw.teams?.home?.logo, score: n(raw.scores?.home?.total) },
        away: { name: raw.teams?.away?.name, logo: raw.teams?.away?.logo, score: n(raw.scores?.away?.total) },
      };
  }
}

function normalizeStandings(sport, response) {
  const rows = [];
  const push = (item, group) => {
    if (!item) return;
    rows.push({
      rank: n(item.rank ?? item.position),
      group: group || item.group?.name || item.division || item.conference?.name || item.conference || '',
      team: item.team?.name,
      logo: item.team?.logo,
      played: n(
        item.all?.played ??
          item.games?.played?.total ??
          (item.won != null && item.lost != null ? item.won + item.lost + (item.ties || 0) : null)
      ),
      wins: n(item.won ?? item.win?.total ?? item.games?.win?.total ?? item.all?.win),
      losses: n(item.lost ?? item.loss?.total ?? item.games?.lose?.total ?? item.all?.lose),
      points: n(item.points ?? item.points?.for),
    });
  };

  switch (sport) {
    case 'soccer': {
      const groups = response[0]?.league?.standings || [];
      groups.forEach((g) => g.forEach((item) => push(item)));
      break;
    }
    case 'nba':
      response.forEach((item) =>
        push(
          {
            rank: item.conference?.rank,
            team: item.team,
            won: item.win?.total,
            lost: item.loss?.total,
          },
          item.conference?.name
        )
      );
      break;
    case 'mlb':
      // Baseball standings come back as an array of groups (arrays).
      response.forEach((group) => {
        if (Array.isArray(group)) group.forEach((item) => push(item, item.group?.name));
        else push(group, group.group?.name);
      });
      break;
    case 'nfl':
    default:
      response.forEach((item) =>
        push(
          { rank: item.position, team: item.team, won: item.won, lost: item.lost, ties: item.ties, points: item.points },
          [item.conference, item.division].filter(Boolean).join(' — ')
        )
      );
  }
  return rows.filter((r) => r.team);
}

module.exports = { isLive, request, normalizeGame, normalizeStandings, HOSTS };
