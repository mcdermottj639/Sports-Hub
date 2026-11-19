#!/usr/bin/env python3
"""Build the Matchup Lab snapshot (NFL + NBA) from ESPN's public site API.

Replaces the retired DraftKings connector snapshot. Output keeps the same
schema as data/draftkings-evidence.json so the Lab code is unchanged:
games (schedule + final scores + a few box-score lines) and per-team season
stats with league ranks. Ranks are computed here from ESPN box scores, not
copied from a provider. No odds, no model inputs, no credentials.

Usage: python scripts/espn-lab-evidence.py --output /tmp/espn-lab.json
Then:  node scripts/refresh-sports-evidence.js /tmp/espn-lab.json --write
"""
import argparse
import json
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone

SOURCE = 'ESPN public scoreboard API'
SITE = 'https://site.api.espn.com/apis/site/v2/sports/{path}'
PATHS = {'nfl': 'football/nfl', 'nba': 'basketball/nba'}
COUNTS = {'nfl': 32, 'nba': 30}
PLACEHOLDERS = {'TBD', 'AFC', 'NFC', 'EAST', 'WEST', 'LEB', 'GIA', 'DUR'}


def get(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'sports-hub-lab/1.0'})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except Exception as e:  # network blips: retry, then fail the run
            if i == tries - 1:
                raise RuntimeError(f'{url}: {e}')
            time.sleep(2 * (i + 1))


def num(v):
    try:
        return float(str(v).replace(',', ''))
    except (TypeError, ValueError):
        return None


def made_att(v):
    try:
        a, b = str(v).split('-')
        return float(a), float(b)
    except (TypeError, ValueError):
        return None, None


def ordinal(n):
    n = int(n)
    suf = 'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')
    return f'{n}{suf}'


def iso(dt):
    return dt.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def scoreboards(sport, season, today):
    """All events for the season so far plus the next two weeks."""
    events = {}
    if sport == 'nfl':
        urls = [SITE.format(path=PATHS[sport]) + f'/scoreboard?dates={season}&seasontype={st}&week={w}'
                for st, weeks in ((2, range(1, 19)), (3, range(1, 6))) for w in weeks]
    else:
        # One request per day: the NBA scoreboard rejects date ranges (HTTP 400).
        day, end, urls = datetime(season, 10, 15), today + timedelta(days=14), []
        while day <= end:
            urls.append(SITE.format(path=PATHS[sport]) + f'/scoreboard?dates={day:%Y%m%d}&limit=100')
            day += timedelta(days=1)
    for url in urls:
        for e in get(url).get('events', []):
            events[e['id']] = e
    return list(events.values())


def box(sport, event_id):
    """Per-team box-score numbers keyed by team abbreviation, or {}."""
    try:
        data = get(SITE.format(path=PATHS[sport]) + f'/summary?event={event_id}')
    except RuntimeError:
        return {}
    out = {}
    for t in data.get('boxscore', {}).get('teams', []):
        s = {x.get('name'): x.get('displayValue') for x in t.get('statistics', [])}
        abbr = t.get('team', {}).get('abbreviation')
        if not abbr:
            continue
        if sport == 'nfl':
            row = {'totalYards': num(s.get('totalYards')), 'passYards': num(s.get('netPassingYards')),
                   'rushYards': num(s.get('rushingYards'))}
        else:
            fgm, fga = made_att(s.get('fieldGoalsMade-fieldGoalsAttempted'))
            tpm, tpa = made_att(s.get('threePointFieldGoalsMade-threePointFieldGoalsAttempted'))
            ftm, _ = made_att(s.get('freeThrowsMade-freeThrowsAttempted'))
            row = {'fgm': fgm, 'fga': fga, 'tpm': tpm, 'tpa': tpa, 'ftm': ftm,
                   'reb': num(s.get('totalRebounds')), 'oreb': num(s.get('offensiveRebounds')),
                   'dreb': num(s.get('defensiveRebounds')), 'ast': num(s.get('assists')),
                   'stl': num(s.get('steals')), 'blk': num(s.get('blocks')),
                   'tov': num(s.get('turnovers') or s.get('totalTurnovers'))}
        if all(v is not None for v in row.values()):
            out[abbr] = row
    return out


GAME_LINES = {
    'nfl': [('Total Yards', 'totalYards'), ('Passing Yards', 'passYards'), ('Rushing Yards', 'rushYards')],
    'nba': [('Field Goals Made', 'fgm'), ('3 Pointers Made', 'tpm'), ('Free Throws Made', 'ftm'),
            ('Rebounds', 'reb'), ('Offensive Rebound', 'oreb'), ('Assists', 'ast'), ('Steals', 'stl'),
            ('Blocks', 'blk'), ('Turnovers', 'tov'), ('Defensive Rebound', 'dreb')],
}


def status(comp):
    t = comp.get('status', {}).get('type', {})
    if t.get('completed') and t.get('state') == 'post':
        return 'Final'
    return {'pre': 'Upcoming', 'in': 'InProgress'}.get(t.get('state'), t.get('description') or 'Upcoming')


def build_league(sport, season, today, captured):
    events = scoreboards(sport, season, today)
    teams, games, acc = {}, [], {}
    for e in sorted(events, key=lambda x: x.get('date', '')):
        comp = (e.get('competitions') or [{}])[0]
        sides = {c.get('homeAway'): c for c in comp.get('competitors', [])}
        if 'home' not in sides or 'away' not in sides:
            continue
        # Postseason/all-star placeholders (TBD, AFC/NFC, East/West) are not league teams.
        if any(c.get('team', {}).get('abbreviation') in PLACEHOLDERS or not c.get('team', {}).get('id')
               for c in sides.values()):
            continue
        for c in sides.values():
            t = c.get('team', {})
            if t.get('abbreviation') and t['abbreviation'] not in teams:
                teams[t['abbreviation']] = t
        st = status(comp)
        g = {'id': str(e['id']), 'start': e['date'], 'status': st, 'observedAt': captured,
             'away': {'abbr': sides['away']['team']['abbreviation'], 'name': sides['away']['team'].get('name'), 'score': 0},
             'home': {'abbr': sides['home']['team']['abbreviation'], 'name': sides['home']['team'].get('name'), 'score': 0}}
        if g['start'].count(':') == 1:  # ESPN sends "2026-11-20T01:15Z"
            g['start'] = g['start'].replace('Z', ':00Z')
        if st == 'Final':
            for side in ('home', 'away'):
                g[side]['score'] = int(num(sides[side].get('score')) or 0)
            b = box(sport, e['id'])
            h, a = g['home']['abbr'], g['away']['abbr']
            if h in b and a in b:
                g['stats'] = [{'label': lab, 'home': b[h][k], 'away': b[a][k]} for lab, k in GAME_LINES[sport]]
            for me, opp in ((h, a), (a, h)):
                r = acc.setdefault(me, {'n': 0, 'pf': 0, 'pa': 0, 'bn': 0, 'for': {}, 'against': {}})
                r['n'] += 1
                r['pf'] += g['home' if me == h else 'away']['score']
                r['pa'] += g['away' if me == h else 'home']['score']
                if me in b and opp in b:
                    r['bn'] += 1
                    for k, v in b[me].items():
                        r['for'][k] = r['for'].get(k, 0) + v
                    for k, v in b[opp].items():
                        r['against'][k] = r['against'].get(k, 0) + v
        games.append(g)

    def per(r, side, k):
        return r[side].get(k, 0) / r['bn'] if r['bn'] else None

    # (label, fn(record)->value, higher_is_better, isPercentage)
    if sport == 'nfl':
        defs = [('Points - Offensive', lambda r: r['pf'] / r['n'], True, False),
                ('Total Yards - Offensive', lambda r: per(r, 'for', 'totalYards'), True, False),
                ('Passing Yards - Offensive', lambda r: per(r, 'for', 'passYards'), True, False),
                ('Rushing Yards - Offensive', lambda r: per(r, 'for', 'rushYards'), True, False),
                ('Points - Defensive', lambda r: r['pa'] / r['n'], False, False),
                ('Total Yards - Defensive', lambda r: per(r, 'against', 'totalYards'), False, False),
                ('Passing Yards - Defensive', lambda r: per(r, 'against', 'passYards'), False, False),
                ('Rushing Yards - Defensive', lambda r: per(r, 'against', 'rushYards'), False, False)]
    else:
        def pct(a, b):
            return lambda r: 100 * r['for'].get(a, 0) / r['for'][b] if r['bn'] and r['for'].get(b) else None
        defs = [('PPG', lambda r: r['pf'] / r['n'], True, False),
                ('FG (%)', pct('fgm', 'fga'), True, True),
                ('3PT FG', lambda r: per(r, 'for', 'tpm'), True, False),
                ('3PT FG (%)', pct('tpm', 'tpa'), True, True),
                ('Rebounds', lambda r: per(r, 'for', 'reb'), True, False),
                ('Offensive Rebounds', lambda r: per(r, 'for', 'oreb'), True, False),
                ('Assists', lambda r: per(r, 'for', 'ast'), True, False),
                ('Steals', lambda r: per(r, 'for', 'stl'), True, False),
                ('Turnovers', lambda r: per(r, 'for', 'tov'), False, False),
                ('Effective Field Goal (%)',
                 lambda r: 100 * (r['for']['fgm'] + 0.5 * r['for']['tpm']) / r['for']['fga']
                 if r['bn'] and r['for'].get('fga') else None, True, True)]

    n = COUNTS[sport]
    stats = {abbr: [] for abbr in teams}
    for label, fn, high, is_pct in defs:
        vals = {abbr: fn(acc[abbr]) for abbr in teams if abbr in acc and acc[abbr]['n']}
        vals = {k: round(v, 1) for k, v in vals.items() if v is not None}
        for abbr, v in vals.items():
            rank = 1 + sum(1 for o in vals.values() if (o > v if high else o < v))
            stats[abbr].append({'label': label, 'value': v, 'rank': ordinal(rank),
                                'percent': round((n - rank + 1) / n * 100, 1), 'isPercentage': is_pct})
    out_teams = []
    for abbr, t in sorted(teams.items()):
        logo = (t.get('logos') or [{}])[0].get('href') or t.get('logo')
        out_teams.append({'abbr': abbr, 'name': t.get('name') or t.get('shortDisplayName'), 'id': int(t['id']),
                          'logo': logo, 'color': '#' + t['color'] if t.get('color') else None,
                          'observedAt': captured, 'stats': stats[abbr]})
    return out_teams, games


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--output', required=True)
    args = ap.parse_args()
    now = datetime.now(timezone.utc)
    captured = iso(now)
    leagues, queries, problems = {}, [], []
    for sport, season in (('nfl', now.year if now.month >= 3 else now.year - 1),
                          ('nba', now.year if now.month >= 8 else now.year - 1)):
        teams, games = build_league(sport, season, now.replace(tzinfo=None), captured)
        if len(teams) != COUNTS[sport]:
            problems.append(f'{sport}: {len(teams)} teams')
        thin = [t['abbr'] for t in teams if len(t['stats']) < 4]
        if thin:
            problems.append(f'{sport}: no season stats for {",".join(thin)}')
        leagues[sport] = {'teams': teams, 'games': games}
        starts = sorted(g['start'] for g in games)
        queries.append({'league': sport, 'source': SOURCE, 'start': starts[0] if starts else captured,
                        'end': starts[-1] if starts else captured, 'observedAt': captured,
                        'note': 'Schedule, final scores and box scores; ranks computed from box scores.',
                        'requestId': f'espn-site-api@{captured}', 'count': len(games)})
    if problems:
        print('Refusing incomplete ESPN snapshot: ' + '; '.join(problems), file=sys.stderr)
        return 1
    snap = {'schemaVersion': 1, 'source': SOURCE, 'kind': 'dated-snapshot', 'capturedAt': captured,
            'queries': queries, 'leagues': leagues}
    with open(args.output, 'w') as f:
        json.dump(snap, f)
        f.write('\n')
    print(json.dumps({sport: {'teams': len(l['teams']), 'games': len(l['games']),
                              'finals': sum(g['status'] == 'Final' for g in l['games'])}
                      for sport, l in leagues.items()}))
    return 0


if __name__ == '__main__':
    sys.exit(main())
