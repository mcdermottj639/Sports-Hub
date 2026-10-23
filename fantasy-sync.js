// A fantasy matchup is one snapshot: never replace it with half a response.
(function (root, factory) {
  const api = factory();
  root.SportsHubFantasySync = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DAY = 86400000;
  const score = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  function complete(L) {
    const M = L?.matchup, O = L?.opponent;
    return !!(L?.rosterFull?.length && M?.me?.team && M?.opponent?.team &&
      score(M.me.score) && score(M.opponent.score) && O?.roster?.length &&
      O.opponent === M.opponent.team && L.team === M.me.team);
  }
  // Fantasy's weekly rollover is Tuesday at 4 AM Eastern, including DST.
  function weekKey(at) {
    if (!Number.isFinite(Number(at)) || !at) return null;
    const parts = new Intl.DateTimeFormat('en-US', {timeZone:'America/New_York',
      year:'numeric',month:'numeric',day:'numeric',hour:'numeric',hourCycle:'h23'}).formatToParts(new Date(at));
    const p = Object.fromEntries(parts.map(x => [x.type,x.value]));
    const d = new Date(Date.UTC(+p.year,+p.month-1,+p.day,+p.hour)-4*3600000);
    d.setUTCDate(d.getUTCDate() - (d.getUTCDay()+5)%7);
    return d.toISOString().slice(0,10);
  }
  function create({read, request, invalidate, publish, status, now = Date.now}) {
    let pending = null;
    const details = ['standings','freeAgents','season','rosters'];
    const paths = {standings:'standings',freeAgents:'freeagents?size=80',season:'season',rosters:'rosters'};
    const get = path => Promise.resolve().then(() => request(path)).catch(() => null);
    function sync(force = false) {
      if (pending) return pending;
      status({busy:true,phase:'refreshing',message:'Refreshing from ESPN… Your saved matchup stays visible.'});
      pending = (async () => {
        const previous = read();
        if (force && invalidate) await invalidate().catch(() => {});
        // Warm the league once before concurrent endpoints use it.
        const data = await get('roster');
        if (!data?.roster?.length || data.__stale) throw new Error('Roster unavailable');
        const extra = Promise.all(details.map(async key => [key,await get(paths[key])]));
        const [matchup, opponent] = await Promise.all([get('matchup'),get('opponent')]);
        const at = now();
        const next = {team:data.team,record:data.record,rosterFull:data.roster,rules:data.rules || null,
          live:!!data.live,matchup,opponent,carried:{},syncedAt:at,coreSyncedAt:at};
        if (!complete(next) || matchup?.__stale || opponent?.__stale) {
          // Supplemental calls are caught independently; none can overwrite the saved core.
          throw new Error('Matchup incomplete');
        }
        for (const key of details) {
          const oldAt = previous?.carried?.[key] || previous?.syncedAt;
          if (previous?.[key] && oldAt && at-oldAt < 3*DAY) {
            next[key] = previous[key]; next.carried[key] = oldAt;
          } else next[key] = null;
        }
        publish(next);
        status({busy:true,phase:'details',message:'Matchup updated. Finishing league details…'});
        const result = {...next,carried:{...next.carried}};
        let missing = false;
        for (const [key,value] of await extra) {
          if (value && !value.__stale) {result[key]=value;delete result.carried[key];}
          else missing = true;
        }
        publish(result);
        status({busy:false,phase:missing?'partial':'ready',message:missing
          ? 'Matchup updated. Some league details could not refresh; saved details are labeled.'
          : 'Up to date with the latest ESPN sync.'});
        return true;
      })().catch(() => {
        status({busy:false,phase:'failed',message:complete(read())
          ? 'ESPN refresh did not finish. Your last complete matchup is still saved. Try again.'
          : 'The full matchup has not loaded. Missing scores are not zeroes. Try refreshing again.'});
        return false;
      }).finally(() => {pending=null;});
      return pending;
    }
    return {sync};
  }
  function snapshotIssue(L, at = Date.now()) {
    if (!complete(L)) return 'The opponent lineup or matchup scores have not loaded. Win chance is unavailable until both sides are complete.';
    if (weekKey(L.coreSyncedAt || L.syncedAt) !== weekKey(at)) return 'This saved matchup is from an earlier week. Refresh to load this week’s scores and opponent.';
    return '';
  }
  return {complete,weekKey,snapshotIssue,create};
});
