// ---------------------------------------------------------------------------
// Your favorite teams and league settings.
// Team IDs are resolved automatically by name the first time they're needed
// (and cached), so you usually only need to edit the `name` fields below.
// ---------------------------------------------------------------------------

const env = process.env;

module.exports = {
  // The hero of the whole app.
  featuredTeam: {
    sport: 'nfl',
    name: 'Philadelphia Eagles',
  },

  sports: {
    nfl: {
      label: 'NFL',
      emoji: '🏈',
      league: 1, // API-American-Football: NFL = league 1
      season: Number(env.NFL_SEASON) || 2025,
      favoriteTeams: ['Philadelphia Eagles'],
    },
    nba: {
      label: 'NBA',
      emoji: '🏀',
      league: 'standard',
      season: Number(env.NBA_SEASON) || 2025,
      favoriteTeams: ['Philadelphia 76ers'],
    },
    mlb: {
      label: 'MLB',
      emoji: '⚾',
      league: 1, // API-Baseball: MLB = league 1
      season: Number(env.MLB_SEASON) || 2026,
      favoriteTeams: ['Philadelphia Phillies'],
    },
    soccer: {
      label: 'Soccer',
      emoji: '⚽',
      league: Number(env.SOCCER_LEAGUE) || 39, // 39 = Premier League
      season: Number(env.SOCCER_SEASON) || 2025,
      favoriteTeams: [], // e.g. ['Arsenal']
    },
  },
};
