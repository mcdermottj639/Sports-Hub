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


def _tid(t):
    return str(getattr(t, "team_id", "") or "")


def _mscore(m, side):
    """Read a matchup's per-side score across espn-api's attribute names."""
    for attr in (f"{side}_score", f"{side}_final_score", f"{side}_team_live_score"):
        v = getattr(m, attr, None)
        if v is not None:
            return v
    return None


def _find_box(league, my_id, sport):
    """Find the box score (rich, per-category stats) containing my team.

    espn-api only auto-selects a box-score parser when scoringType is exactly
    H2H_CATEGORY or H2H_POINTS; other categories formats (e.g.
    H2H_MOST_CATEGORIES) fall back to the abstract base class and raise. For
    baseball we retry with the categories parser, which reads the same
    cumulativeScore.scoreByStat payload regardless of the exact scoring type.
    """
    def _attempt():
        for b in league.box_scores():
            if my_id in (_tid(getattr(b, "home_team", None)), _tid(getattr(b, "away_team", None))):
                return b
        return None
    try:
        return _attempt()
    except Exception:
        if sport == "baseball":
            try:
                from espn_api.baseball.box_score import H2HCategoryBoxScore
                league._box_score_class = H2HCategoryBoxScore
                return _attempt()
            except Exception:
                return None
        return None


@app.get("/api/fantasy/{sport}/matchup")
def matchup(sport: str):
    """This week's head-to-head. For categories leagues, returns the
    category-by-category breakdown (who's winning R, HR, ERA, WHIP, ...)."""
    league = get_league(sport)
    team = my_team(league, SPORTS[sport]["team_id"])
    if not team:
        raise HTTPException(404, "No teams found in that league.")
    my_id = _tid(team)

    b = _find_box(league, my_id, sport)
    if b is not None:
        mine_home = _tid(getattr(b, "home_team", None)) == my_id
        me_t = b.home_team if mine_home else b.away_team
        opp_t = b.away_team if mine_home else b.home_team
        me_stats = getattr(b, "home_stats" if mine_home else "away_stats", None) or {}
        opp_stats = getattr(b, "away_stats" if mine_home else "home_stats", None) or {}
        me_score = getattr(b, "home_score" if mine_home else "away_score", None)
        opp_score = getattr(b, "away_score" if mine_home else "home_score", None)

        cats, won, lost, tied = [], 0, 0, 0
        for name, mv in me_stats.items():
            ov = opp_stats.get(name, {})
            mval = mv.get("value") if isinstance(mv, dict) else mv
            oval = ov.get("value") if isinstance(ov, dict) else ov
            res = ((mv.get("result") if isinstance(mv, dict) else "") or "").upper()
            # Only the actual scoring categories carry a WIN/LOSS/TIE result;
            # the rest (AB, H, OUTS, 2B...) are component stats — skip them.
            if res == "WIN":
                won += 1
            elif res == "LOSS":
                lost += 1
            elif res == "TIE":
                tied += 1
            else:
                continue
            cats.append({"cat": name, "me": mval, "opp": oval, "result": res})
        return {
            "sport": sport,
            "me": {"team": getattr(me_t, "team_name", "Me"), "catsWon": won, "score": me_score},
            "opponent": {"team": getattr(opp_t, "team_name", "Opp"), "catsWon": lost, "score": opp_score},
            "tied": tied,
            "categories": cats,
        }

    # Fallback: scoreboard (points leagues, or when box scores are unavailable).
    try:
        sb = league.scoreboard()
    except Exception:
        sb = []
    for m in sb:
        home, away = getattr(m, "home_team", None), getattr(m, "away_team", None)
        if my_id not in (_tid(home), _tid(away)):
            continue
        mine_home = _tid(home) == my_id
        me_t, opp_t = (home, away) if mine_home else (away, home)
        return {
            "sport": sport,
            "me": {"team": getattr(me_t, "team_name", "Me"), "score": _mscore(m, "home" if mine_home else "away")},
            "opponent": {"team": getattr(opp_t, "team_name", "Opp"), "score": _mscore(m, "away" if mine_home else "home")},
            "categories": [],
        }
    return {"sport": sport, "me": None, "opponent": None, "note": "No matchup this week."}


@app.get("/api/fantasy/{sport}/opponent")
def opponent(sport: str):
    """This week's opponent and their full roster (for start/sit scouting)."""
    league = get_league(sport)
    team = my_team(league, SPORTS[sport]["team_id"])
    if not team:
        raise HTTPException(404, "No teams found in that league.")
    my_id = _tid(team)
    b = _find_box(league, my_id, sport)
    if b is None:
        return {"sport": sport, "opponent": None, "note": "No matchup this week."}
    mine_home = _tid(getattr(b, "home_team", None)) == my_id
    opp_t = b.away_team if mine_home else b.home_team
    opp_lineup = getattr(b, "away_lineup" if mine_home else "home_lineup", None)
    players = opp_lineup if opp_lineup else getattr(opp_t, "roster", [])
    return {
        "sport": sport,
        "opponent": getattr(opp_t, "team_name", "Opponent"),
        "roster": [player_dict(p) for p in (players or [])],
    }


@app.get("/api/fantasy/{sport}/debug")
def debug(sport: str):
    """Diagnostic: what does ESPN actually return for matchups this week?"""
    league = get_league(sport)
    team = my_team(league, SPORTS[sport]["team_id"])
    my_id = _tid(team)
    out = {
        "sport": sport,
        "myTeamId": my_id,
        "myTeam": getattr(team, "team_name", None),
        "scoringType": getattr(league, "scoring_type", None),
        "currentMatchupPeriod": getattr(league, "currentMatchupPeriod", None),
        "current_week": getattr(league, "current_week", None),
        "scoringPeriodId": getattr(league, "scoringPeriodId", None),
        "year": getattr(league, "year", None),
    }
    try:
        boxes = league.box_scores()
        out["boxCount"] = len(boxes)
        out["boxPairs"] = [
            {"home": _tid(getattr(b, "home_team", None)),
             "away": _tid(getattr(b, "away_team", None)),
             "homeStatsKeys": list((getattr(b, "home_stats", None) or {}).keys())[:6]}
            for b in boxes[:8]
        ]
    except Exception as e:
        out["boxError"] = f"{type(e).__name__}: {e}"
    try:
        sb = league.scoreboard()
        out["scoreboardCount"] = len(sb)
        pairs = []
        for m in sb:
            ht, at = _tid(getattr(m, "home_team", None)), _tid(getattr(m, "away_team", None))
            pairs.append({"home": ht, "away": at})
            if my_id in (ht, at):  # dump the simple attributes of my own matchup
                attrs = {}
                for k in dir(m):
                    if k.startswith("_"):
                        continue
                    try:
                        v = getattr(m, k)
                    except Exception:
                        continue
                    if isinstance(v, (int, float, str, bool)) or v is None:
                        attrs[k] = v
                out["myMatchupAttrs"] = attrs
        out["scoreboardPairs"] = pairs[:8]
    except Exception as e:
        out["scoreboardError"] = f"{type(e).__name__}: {e}"
    return out


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
