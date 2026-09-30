/* Prospective football experiments. No fitted probability or stake claims. */
(function (root) {
  'use strict';
  const VERSION = 'football-research-v2';
  const versionFor = sport => sport === 'nfl' ? 'football-research-nfl-v3' : VERSION;
  const finite = v => v != null && String(v).trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
  function phase(start, at) {
    const minutes = (Date.parse(start) - Date.parse(at)) / 60000;
    return !Number.isFinite(minutes) || minutes <= 0 ? null : minutes <= 90 ? 'near' : 'early';
  }
  function fpi(data, year, at) {
    const updated = Date.parse(data?.lastUpdated), now = Date.parse(at);
    const valid = Number(data?.requestedSeason?.year) === Number(year) && Number.isFinite(updated) && updated <= now && now - updated <= 8 * 864e5;
    const result = { source: 'ESPN FPI', updatedAt: data?.lastUpdated || null, season: year, ratings: {}, available: false };
    if (!valid) return result;
    const meta = data.categories?.find(c => c.name === 'fpi');
    const index = meta?.names?.indexOf('fpi');
    if (!(index >= 0)) return result;
    for (const entry of data.teams || []) {
      const value = finite(entry.categories?.find(c => c.name === 'fpi')?.values?.[index]);
      if (entry.team?.id && value != null) result.ratings[String(entry.team.id)] = value;
    }
    result.available = Object.keys(result.ratings).length > 0;
    return result;
  }
  function collegeMargin(ratings, homeId, awayId, neutral) {
    const home = finite(ratings?.ratings?.[String(homeId)]), away = finite(ratings?.ratings?.[String(awayId)]);
    // Never mix FPI points with conference-tier points. Keep the old home term
    // fixed so this experiment changes one input; no duplicate form adjustment.
    return !ratings?.available || home == null || away == null ? null : Math.round((home - away + (neutral ? 0 : 3)) * 10) / 10;
  }
  function athleteId(a) {
    return String(a?.id || (a?.links || []).map(l => String(l.href || '').match(/\/id\/(\d+)/)?.[1]).find(Boolean) || '');
  }
  function quarterback(depth, injuries, teamId, year, at) {
    const now = Date.parse(at), stamp = Date.parse(depth?.timestamp);
    const fresh = Number(depth?.season?.year) === Number(year) && String(depth?.team?.id) === String(teamId) && Number.isFinite(stamp) && stamp <= now && now - stamp < 2 * 864e5;
    const result = { source: 'ESPN depth chart and injury feed', observedAt: at, depthUpdatedAt: depth?.timestamp || null, injuryUpdatedAt: injuries?.timestamp || null, name: null, athleteId: null, status: 'unknown', confirmedStarter: false, needsReview: true };
    if (!fresh) return result;
    const position = (depth.depthchart || []).flatMap(c => Object.values(c.positions || {})).find(p => String(p.position?.abbreviation).toUpperCase() === 'QB');
    const qb = position?.athletes?.[0];
    if (!qb) return result;
    result.name = qb.displayName || qb.fullName || null;
    result.athleteId = athleteId(qb);
    const injuryStamp = Date.parse(injuries?.timestamp);
    const injuryFresh = Number(injuries?.season?.year) === Number(year) && Number.isFinite(injuryStamp) && injuryStamp <= now && now - injuryStamp < 2 * 864e5;
    const reports = [...(qb.injuries || []), ...(injuryFresh ? (injuries.injuries || []).find(t => String(t.id) === String(teamId))?.injuries || [] : [])];
    const relevant = reports.filter(r => (!r.athlete || athleteId(r.athlete) === result.athleteId) && /out|doubtful|questionable|reserve|suspend|pup/i.test(r.status || '') && Number.isFinite(Date.parse(r.date)) && Date.parse(r.date) <= now && now - Date.parse(r.date) < 8 * 864e5);
    result.status = relevant.length ? relevant.sort((a,b) => Date.parse(b.date)-Date.parse(a.date))[0].status : injuryFresh ? 'No current restriction found; starter unconfirmed' : 'Injury feed unavailable; starter unconfirmed';
    return result;
  }
  function mergeSchedules(...payloads) {
    const events = new Map();
    for (const p of payloads) for (const e of p?.events || []) if (e.id) events.set(String(e.id), e);
    return { events: [...events.values()] };
  }
  function grade(market, selection, home, line, scores) {
    if (!scores || finite(scores.home) == null || finite(scores.away) == null) return null;
    const delta = market === 'total' ? scores.home + scores.away - line : scores.home - scores.away + (market === 'spread' ? line : 0);
    if (!delta) return market === 'moneyline' ? 'void' : 'push';
    return (market === 'total' ? /^OVER/.test(selection) ? delta > 0 : delta < 0 : home ? delta > 0 : delta < 0) ? 'win' : 'loss';
  }
  function humanReview(row, input, at) {
    if (!phase(row.starts_at, at) || Date.parse(at) < Date.parse(row.captured_at)) throw new Error('Review must be saved before kickoff, after the forecast.');
    const margin = finite(input.margin), total = finite(input.total), reason = String(input.reason || '').trim();
    if (margin == null || Math.abs(margin) > 100 || total == null || total < 0 || total > 150 || reason.length < 8) throw new Error('Enter a margin, a total, and a reason of at least 8 characters.');
    const base = row.snapshot?.research?.baseline;
    if (!base || finite(base.margin) == null || finite(base.total) == null) throw new Error('Baseline unavailable.');
    // 50/50 blend is a fixed research policy, not a fitted improvement.
    return { eventId: row.event_id, stage: row.snapshot.research.phase, sourceCapturedAt: row.captured_at, at, startsAt: row.starts_at, baseline: { ...base }, human: { margin, total }, combined: { margin: (margin + base.margin) / 2, total: (total + base.total) / 2 }, reason, factors: (input.factors || []).filter(x => ['QB','Line play','Schedule','Tempo','Coaching'].includes(x)), policy: 'equal-blend-v1' };
  }
  const api = { VERSION, versionFor, phase, fpi, collegeMargin, quarterback, mergeSchedules, grade, humanReview };
  root.SportsHubFootballResearch = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
