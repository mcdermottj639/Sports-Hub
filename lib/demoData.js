// Bundled sample data so Sports-Hub is fully viewable WITHOUT an API key.
// The moment you add API_SPORTS_KEY to .env, real data replaces all of this.

const today = new Date();
const iso = (daysFromNow, hour = 19) => {
  const d = new Date(today);
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

const games = {
  nfl: [
    {
      id: 'demo-nfl-1', date: iso(0, 20), status: 'LIVE', statusLong: 'Q3 04:12',
      home: { name: 'Philadelphia Eagles', logo: null, score: 21 },
      away: { name: 'Dallas Cowboys', logo: null, score: 17 },
    },
    {
      id: 'demo-nfl-2', date: iso(0, 13), status: 'FT', statusLong: 'Finished',
      home: { name: 'Kansas City Chiefs', logo: null, score: 31 },
      away: { name: 'Buffalo Bills', logo: null, score: 24 },
    },
  ],
  nba: [
    {
      id: 'demo-nba-1', date: iso(0, 19), status: 'NS', statusLong: 'Not Started',
      home: { name: 'Philadelphia 76ers', logo: null, score: null },
      away: { name: 'Boston Celtics', logo: null, score: null },
    },
  ],
  mlb: [
    {
      id: 'demo-mlb-1', date: iso(0, 18), status: 'IN', statusLong: 'Inning 6',
      home: { name: 'Philadelphia Phillies', logo: null, score: 4 },
      away: { name: 'Atlanta Braves', logo: null, score: 3 },
    },
  ],
  soccer: [
    {
      id: 'demo-soc-1', date: iso(1, 15), status: 'NS', statusLong: 'Not Started',
      home: { name: 'Arsenal', logo: null, score: null },
      away: { name: 'Manchester City', logo: null, score: null },
    },
  ],
};

const standings = {
  nfl: [
    { rank: 1, group: 'NFC — East', team: 'Philadelphia Eagles', logo: null, played: 17, wins: 14, losses: 3, points: null },
    { rank: 2, group: 'NFC — East', team: 'Dallas Cowboys', logo: null, played: 17, wins: 9, losses: 8, points: null },
    { rank: 3, group: 'NFC — East', team: 'New York Giants', logo: null, played: 17, wins: 6, losses: 11, points: null },
    { rank: 4, group: 'NFC — East', team: 'Washington Commanders', logo: null, played: 17, wins: 5, losses: 12, points: null },
  ],
  nba: [
    { rank: 1, group: 'East', team: 'Boston Celtics', logo: null, played: 60, wins: 48, losses: 12, points: null },
    { rank: 2, group: 'East', team: 'Philadelphia 76ers', logo: null, played: 60, wins: 40, losses: 20, points: null },
  ],
  mlb: [
    { rank: 1, group: 'NL East', team: 'Philadelphia Phillies', logo: null, played: 72, wins: 45, losses: 27, points: null },
    { rank: 2, group: 'NL East', team: 'Atlanta Braves', logo: null, played: 72, wins: 42, losses: 30, points: null },
  ],
  soccer: [
    { rank: 1, group: 'Premier League', team: 'Manchester City', logo: null, played: 38, wins: 28, losses: 5, points: 89 },
    { rank: 2, group: 'Premier League', team: 'Arsenal', logo: null, played: 38, wins: 27, losses: 6, points: 87 },
  ],
};

module.exports = { games, standings };
