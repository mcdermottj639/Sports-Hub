"""
Sports-Hub backend — thin wrapper around the `espn-api` library that exposes
your *real* ESPN fantasy leagues to the static frontend as clean JSON.

It deliberately does very little: read your league with espn-api, reshape the
bits the frontend needs, and send them back with permissive CORS so the
browser app (on GitHub Pages) can read them.

Config comes entirely from environment variables (set as secrets on the host).
Nothing sensitive is committed to the repo. See .env.example.
"""

import math
import os
import random
import time
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


# How long a pulled League snapshot is reused before we re-fetch from ESPN.
# Without this the cache lived forever (only /api/refresh cleared it), so the
# Fantasy tab looked frozen. A small TTL keeps it fresh without hammering ESPN.
# Override with the LEAGUE_TTL_SECONDS env var (set 0 to disable caching).
LEAGUE_TTL_SECONDS = int(os.getenv("LEAGUE_TTL_SECONDS", "300"))


@lru_cache(maxsize=32)
def _build_league(sport: str, _bucket: int):
    """Build an espn-api League. `_bucket` is a time bucket so the cache key
    rolls over every LEAGUE_TTL_SECONDS — a new bucket is a cache miss and
    forces a fresh ESPN pull. Don't call directly; go through get_league()."""
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


def get_league(sport: str):
    """Cached League for a sport. Auto-refreshes every LEAGUE_TTL_SECONDS and
    on demand via /api/refresh."""
    bucket = int(time.time() // LEAGUE_TTL_SECONDS) if LEAGUE_TTL_SECONDS > 0 else int(time.time())
    return _build_league(sport, bucket)


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
        "owned": getattr(p, "percent_owned", None),
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


@app.get("/api/fantasy/{sport}/freeagents")
def free_agents(sport: str, size: int = 40):
    """Top available players (free agents/waivers), most-owned first."""
    league = get_league(sport)
    try:
        fas = league.free_agents(size=min(size, 100))
    except Exception as e:
        raise HTTPException(502, f"Could not load free agents: {e}")
    return {"sport": sport, "players": [player_dict(p) for p in fas]}


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


def _team_form(team):
    """Chronological W/L/T list from a team's completed matchups."""
    out = []
    for mu in getattr(team, "schedule", []):
        winner = (getattr(mu, "winner", "") or "").upper()
        if winner in ("", "UNDECIDED", "NONE"):
            continue
        home = getattr(mu, "home_team", None)
        home_id = getattr(home, "team_id", home)
        is_home = str(home_id) == str(team.team_id)
        if winner == "TIE":
            out.append("T")
        elif (winner == "HOME") == is_home:
            out.append("W")
        else:
            out.append("L")
    return out


def _streak(form):
    """Trailing streak as e.g. 'W3' from a chronological form list."""
    if not form:
        return ""
    last = form[-1]
    n = 0
    for r in reversed(form):
        if r == last:
            n += 1
        else:
            break
    return f"{last}{n}"


@app.get("/api/fantasy/{sport}/standings")
def standings(sport: str):
    """League standings + computed power rankings (record + recent form)."""
    league = get_league(sport)
    my_id = str(SPORTS[sport]["team_id"] or "")
    rows = []
    for t in league.teams:
        wins = getattr(t, "wins", 0) or 0
        losses = getattr(t, "losses", 0) or 0
        ties = getattr(t, "ties", 0) or 0
        games = wins + losses + ties
        win_pct = (wins + 0.5 * ties) / games if games else 0.0
        form = _team_form(t)
        recent = form[-5:]
        rec_pct = (sum(1 if r == "W" else 0.5 if r == "T" else 0 for r in recent) / len(recent)
                   if recent else win_pct)
        power = round(100 * (0.6 * win_pct + 0.4 * rec_pct), 1)
        rows.append({
            "teamId": getattr(t, "team_id", None),
            "team": getattr(t, "team_name", ""),
            "abbrev": getattr(t, "team_abbrev", ""),
            "wins": wins, "losses": losses, "ties": ties,
            "standing": getattr(t, "standing", None),
            "last5": "".join(form[-5:]),
            "streak": _streak(form),
            "winPct": round(win_pct, 3),
            "powerScore": power,
            "isMe": str(getattr(t, "team_id", "")) == my_id,
        })
    rows.sort(key=lambda r: (r["standing"] if r["standing"] else 99))
    return {"sport": sport, "teams": rows}


def _season_cats(league):
    """Shared season-category data used by /catranks and /playoffs.

    Returns (cats, totals):
      cats   = [{statId, name, reverse}] for each SCORED category, in league
               order (reverse = lower is better, e.g. ERA/WHIP).
      totals = {teamId(str): {statId(int): seasonValue}}.

    Both come from a single ESPN request: `mTeam` (cumulative season
    `valuesByStat` per team) + `mSettings` (`scoringItems` = which stats are
    counted and their direction). Stat ids -> abbreviations via STATS_MAP.
    """
    from espn_api.baseball.constant import STATS_MAP
    # mStandings is included alongside mTeam because some ESPN league responses
    # only attach each team's cumulative season `valuesByStat` under the
    # standings view; mSettings carries the scored-category config.
    raw = league.espn_request.league_get(params={"view": ["mTeam", "mStandings", "mSettings"]})
    scoring = (((raw.get("settings") or {}).get("scoringSettings") or {}).get("scoringItems")) or []
    cats, seen = [], set()
    for it in scoring:
        sid = it.get("statId")
        if sid is None or sid in seen:
            continue
        seen.add(sid)
        cats.append({"statId": int(sid), "name": STATS_MAP.get(int(sid), str(sid)),
                     "reverse": bool(it.get("isReverseItem"))})
    totals = {}
    for t in raw.get("teams", []):
        tid = str(t.get("id"))
        vbs = t.get("valuesByStat") or {}
        totals[tid] = {int(k): v for k, v in vbs.items() if v is not None}
    return cats, totals


@app.get("/api/fantasy/{sport}/catranks")
def catranks(sport: str):
    """Each team's season total + league rank for every scoring category (the
    "counted stats"). Powers the slimmed opponent view: instead of dumping the
    opponent's roster, the frontend shows where they rank in HR/RBI/ERA/etc.
    """
    if sport != "baseball":
        return {"sport": sport, "categories": [], "teams": [], "note": "Category ranks are baseball-only for now."}
    league = get_league(sport)
    my_id = str(SPORTS[sport]["team_id"] or "")

    # This week's opponent, so the frontend can pull just their row.
    opp_id = None
    try:
        me_t = my_team(league, SPORTS[sport]["team_id"])
        b = _find_box(league, _tid(me_t), sport)
        if b is not None:
            mine_home = _tid(getattr(b, "home_team", None)) == _tid(me_t)
            opp_id = _tid(b.away_team if mine_home else b.home_team)
    except Exception:
        pass

    try:
        cats, totals = _season_cats(league)
    except Exception as e:
        raise HTTPException(502, f"Could not load team season stats: {e}")

    name_by_id = {str(getattr(t, "team_id", "")): getattr(t, "team_name", "") for t in league.teams}
    out = {tid: {"teamId": tid, "team": name_by_id.get(tid, ""),
                 "isMe": tid == my_id, "isOpp": tid == opp_id, "cats": {}}
           for tid in totals}

    # Rank each team per scored category (rank 1 = best; reverse = lower is best).
    for c in cats:
        sid = c["statId"]
        vals = [(tid, tv[sid]) for tid, tv in totals.items() if sid in tv]
        vals.sort(key=lambda x: x[1], reverse=not c["reverse"])
        rank, prev = 0, object()
        for i, (tid, v) in enumerate(vals):
            if v != prev:
                rank, prev = i + 1, v
            out[tid]["cats"][c["name"]] = {"value": v, "rank": rank, "of": len(vals)}

    return {
        "sport": sport,
        "myTeamId": my_id,
        "oppTeamId": opp_id,
        "teamCount": len(totals),
        "categories": [c["name"] for c in cats],
        "teams": list(out.values()),
    }


def _cat_win_prob(a_id, b_id, cats, totals):
    """Estimate P(team A beats team B) in a single H2H-category matchup from
    their SEASON category rates. Count the categories A is favored in
    (direction-aware), turn that fraction into a win probability with a logistic
    so leading more categories means a higher — but not certain — chance."""
    ta, tb = totals.get(a_id, {}), totals.get(b_id, {})
    edge, n = 0.0, 0
    for c in cats:
        va, vb = ta.get(c["statId"]), tb.get(c["statId"])
        if va is None or vb is None:
            continue
        n += 1
        if va == vb:
            edge += 0.5
        else:
            a_better = (va < vb) if c["reverse"] else (va > vb)
            edge += 1.0 if a_better else 0.0
    if n == 0:
        return 0.5
    frac = edge / n
    return 1.0 / (1.0 + math.exp(-6.0 * (frac - 0.5)))


@app.get("/api/fantasy/{sport}/playoffs")
def playoffs(sport: str, slots: int = 6, sims: int = 10000):
    """Monte-Carlo playoff odds. Plays out every remaining matchup `sims` times,
    deciding each by the two teams' season category strength (`_cat_win_prob`),
    then counts how often each team lands in the top `slots` of the final
    standings. Returns playoff odds, projected final wins, and average seed.
    """
    if sport != "baseball":
        return {"sport": sport, "teams": [], "note": "Playoff odds are baseball-only for now."}
    league = get_league(sport)
    my_id = str(SPORTS[sport]["team_id"] or "")
    try:
        cats, totals = _season_cats(league)
    except Exception:
        cats, totals = [], {}

    teams = league.teams or []
    info = {}
    for t in teams:
        tid = _tid(t)
        w = getattr(t, "wins", 0) or 0
        l = getattr(t, "losses", 0) or 0
        ti = getattr(t, "ties", 0) or 0
        info[tid] = {"team": getattr(t, "team_name", ""), "wins": w, "losses": l,
                     "ties": ti, "base": w + 0.5 * ti, "standing": getattr(t, "standing", None)}

    # Remaining (undecided) matchups, deduped across both teams' schedules.
    remaining, seen = [], set()
    max_left = 0
    for t in teams:
        left = 0
        for idx, mu in enumerate(getattr(t, "schedule", []) or []):
            winner = (getattr(mu, "winner", "") or "").upper()
            if winner not in ("UNDECIDED", "NONE", ""):
                continue
            a, b = _tid(getattr(mu, "home_team", None)), _tid(getattr(mu, "away_team", None))
            if not a or not b or a == b:
                continue
            left += 1
            key = (idx, frozenset((a, b)))
            if key in seen:
                continue
            seen.add(key)
            remaining.append((a, b))
        max_left = max(max_left, left)

    ids = list(info.keys())
    n_teams = len(ids)
    slots = max(1, min(slots, n_teams))
    # Pre-compute each remaining matchup's home win prob once.
    probs = [(a, b, _cat_win_prob(a, b, cats, totals)) for (a, b) in remaining]

    made = {tid: 0 for tid in ids}
    seed_sum = {tid: 0 for tid in ids}
    win_sum = {tid: 0.0 for tid in ids}
    # Tiny stable per-team jitter base for tiebreaks (favor better current seed).
    for _ in range(max(1, sims)):
        wins = {tid: info[tid]["base"] for tid in ids}
        for (a, b, p) in probs:
            if random.random() < p:
                wins[a] += 1
            else:
                wins[b] += 1
        for tid in ids:
            win_sum[tid] += wins[tid]
        order = sorted(ids, key=lambda tid: (wins[tid], random.random()), reverse=True)
        for seed, tid in enumerate(order, start=1):
            seed_sum[tid] += seed
            if seed <= slots:
                made[tid] += 1

    s = max(1, sims)
    rows = []
    for tid in ids:
        odds = round(100.0 * made[tid] / s, 1)
        rows.append({
            "teamId": tid,
            "team": info[tid]["team"],
            "isMe": tid == my_id,
            "wins": info[tid]["wins"],
            "losses": info[tid]["losses"],
            "ties": info[tid]["ties"],
            "currentSeed": info[tid]["standing"],
            "projWins": round(win_sum[tid] / s, 1),
            "playoffOdds": odds,
            "avgSeed": round(seed_sum[tid] / s, 1),
            "clinched": odds >= 99.95,
            "eliminated": odds <= 0.05,
        })
    rows.sort(key=lambda r: (-r["playoffOdds"], r["avgSeed"]))
    return {
        "sport": sport,
        "slots": slots,
        "teamCount": n_teams,
        "gamesLeft": max_left,
        "sims": s,
        "usedCategoryModel": bool(cats and totals),
        "teams": rows,
    }


@app.get("/api/refresh")
def refresh():
    """Drop the cached League objects so the next call re-pulls from ESPN."""
    _build_league.cache_clear()
    return {"ok": True, "cleared": True}
