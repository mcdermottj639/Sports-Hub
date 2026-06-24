"""
Sports-Hub backend — thin wrapper around the `espn-api` library that exposes
your *real* ESPN fantasy leagues to the static frontend as clean JSON.

It deliberately does very little: read your league with espn-api, reshape the
bits the frontend needs, and send them back with permissive CORS so the
browser app (on GitHub Pages) can read them.

Config comes entirely from environment variables (set as secrets on the host).
Nothing sensitive is committed to the repo. See .env.example.
"""

import os
from functools import lru_cache
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from espn_api.football import League as FootballLeague
from espn_api.baseball import League as BaseballLeague

app = FastAPI(title="Sports-Hub Fantasy API", version="0.1.0")

# --- CORS: allow the static frontend to read us from the browser -------------
# Comma-separated list in ALLOW_ORIGINS, e.g.
#   https://mcdermottj639.github.io,http://localhost:8000
ALLOW_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "ALLOW_ORIGINS", "https://mcdermottj639.github.io"
    ).split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOW_ORIGINS,
    allow_methods=["GET"],
    allow_headers=["*"],
)

# --- per-sport config --------------------------------------------------------
# Each sport reads its own league id / season year / (optional) "which team is
# mine" id from the environment. Cookies are shared (one ESPN login).
ESPN_S2 = os.getenv("ESPN_S2") or None
SWID = os.getenv("SWID") or None

SPORTS = {
    "football": {
        "cls": FootballLeague,
        "league_id": os.getenv("FOOTBALL_LEAGUE_ID"),
        "year": int(os.getenv("FOOTBALL_YEAR", "2025")),
        "team_id": os.getenv("FOOTBALL_TEAM_ID"),
    },
    "baseball": {
        "cls": BaseballLeague,
        "league_id": os.getenv("BASEBALL_LEAGUE_ID"),
        "year": int(os.getenv("BASEBALL_YEAR", "2026")),
        "team_id": os.getenv("BASEBALL_TEAM_ID"),
    },
}


@lru_cache(maxsize=8)
def get_league(sport: str):
    """Build (and cache) an espn-api League for a sport. Cleared by /refresh."""
    cfg = SPORTS.get(sport)
    if not cfg:
        raise HTTPException(404, f"Unknown sport '{sport}'. Try football or baseball.")
    if not cfg["league_id"]:
        raise HTTPException(
            503,
            f"{sport} league not configured. Set {sport.upper()}_LEAGUE_ID "
            "in the host's environment variables.",
        )
    try:
        return cfg["cls"](
            league_id=int(cfg["league_id"]),
            year=cfg["year"],
            espn_s2=ESPN_S2,
            swid=SWID,
        )
    except Exception as e:  # espn-api raises plain Exceptions on auth/404
        raise HTTPException(502, f"Could not load {sport} league from ESPN: {e}")


def my_team(league, team_id: Optional[str]):
    """Pick the owner's team: by configured id, else the first team."""
    if team_id:
        for t in league.teams:
            if str(getattr(t, "team_id", "")) == str(team_id):
                return t
    return league.teams[0] if league.teams else None


# Slot codes that mean "pitcher" vs "hitter". ESPN's per-player `position`
# attribute is unreliable for baseball (it mislabels pitchers), so we derive
# everything from the player's eligible slots instead.
_PITCH_SLOTS = {"SP", "RP", "P"}
_BAT_SLOTS = {"C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "OF", "DH",
              "1B/3B", "2B/SS", "OF/UTIL"}
# Preference order when choosing a single display position for a hitter.
_BAT_ORDER = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "OF", "DH"]


def _derive(eligible, lineup_slot):
    """From eligible slots + current lineup slot, work out (isPitcher, pos, status)."""
    elig = set(eligible or [])
    is_pitcher = bool(elig & _PITCH_SLOTS) and not bool(elig & _BAT_SLOTS)
    if is_pitcher:
        pos = "SP" if "SP" in elig else "RP" if "RP" in elig else "P"
    else:
        pos = next((s for s in _BAT_ORDER if s in elig), "UTIL")
    slot = (lineup_slot or "").upper()
    status = "il" if slot == "IL" else "bench" if slot in ("BE", "BENCH") else "active"
    return is_pitcher, pos, status


def player_dict(p) -> dict:
    """Reshape an espn-api Player into the frontend-ready shape.

    Football and baseball players don't share every attribute, so we read
    defensively with getattr and derive role/position from eligible slots
    (ESPN's raw `position` is unreliable for baseball).
    """
    eligible = getattr(p, "eligibleSlots", []) or []
    lineup_slot = getattr(p, "lineupSlot", "") or ""
    is_pitcher, pos, status = _derive(eligible, lineup_slot)
    return {
        "name": getattr(p, "name", ""),
        "pos": pos,                                      # derived display position
        "isPitcher": is_pitcher,
        "lineupSlot": lineup_slot,
        "status": status,                                # active | bench | il
        "eligibleSlots": [s for s in eligible if s not in ("BE", "IL")],
        "proTeam": getattr(p, "proTeam", "") or "",
        "injuryStatus": getattr(p, "injuryStatus", "") or "",
        "points": getattr(p, "points", None),            # actual fantasy pts (points leagues)
        "projected": getattr(p, "projected_points", None),
        "total": getattr(p, "total_points", None),       # season total (football)
    }


# --- routes ------------------------------------------------------------------
@app.get("/api/health")
def health():
    """Cheap liveness + which sports are wired up."""
    return {
        "ok": True,
        "configured": {
            s: bool(cfg["league_id"]) for s, cfg in SPORTS.items()
        },
        "origins": ALLOW_ORIGINS,
    }


@app.get("/api/fantasy/{sport}/roster")
def roster(sport: str):
    """Your real roster for the sport, grouped enough for the UI to render."""
    league = get_league(sport)
    team = my_team(league, SPORTS[sport]["team_id"])
    if not team:
        raise HTTPException(404, "No teams found in that league.")
    return {
        "sport": sport,
        "team": getattr(team, "team_name", "My Team"),
        "record": {
            "wins": getattr(team, "wins", None),
            "losses": getattr(team, "losses", None),
            "ties": getattr(team, "ties", None),
        },
        "roster": [player_dict(p) for p in getattr(team, "roster", [])],
    }


@app.get("/api/fantasy/{sport}/matchup")
def matchup(sport: str):
    """This week's head-to-head: your score vs opponent's, live if in progress."""
    league = get_league(sport)
    team = my_team(league, SPORTS[sport]["team_id"])
    if not team:
        raise HTTPException(404, "No teams found in that league.")
    try:
        scores = league.scoreboard()
    except Exception as e:
        raise HTTPException(502, f"Could not load scoreboard: {e}")
    for m in scores:
        home, away = m.home_team, m.away_team
        if home is team or away is team:
            mine, opp = (home, away) if home is team else (away, home)
            my_score = m.home_score if home is team else m.away_score
            opp_score = m.away_score if home is team else m.home_score
            return {
                "sport": sport,
                "me": {"team": getattr(mine, "team_name", "Me"), "score": my_score},
                "opponent": {"team": getattr(opp, "team_name", "Opp"), "score": opp_score},
            }
    return {"sport": sport, "me": None, "opponent": None, "note": "No matchup this week."}


@app.get("/api/fantasy/{sport}/standings")
def standings(sport: str):
    """League standings — every team, ranked."""
    league = get_league(sport)
    teams = sorted(
        league.teams,
        key=lambda t: (getattr(t, "wins", 0), getattr(t, "points_for", 0)),
        reverse=True,
    )
    return {
        "sport": sport,
        "teams": [
            {
                "teamId": getattr(t, "team_id", None),
                "team": getattr(t, "team_name", ""),
                "wins": getattr(t, "wins", None),
                "losses": getattr(t, "losses", None),
                "ties": getattr(t, "ties", None),
                "pointsFor": getattr(t, "points_for", None),
            }
            for t in teams
        ],
    }


@app.get("/api/refresh")
def refresh():
    """Drop the cached League objects so the next call re-pulls from ESPN."""
    get_league.cache_clear()
    return {"ok": True, "cleared": True}
