// Read-only reporting over immutable scheduled predictions. No model fitting.
(function(root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./ai-model-utils.js') : root.SportsHubAI);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SportsHubPerformance = api;
})(globalThis, function(A) {
  'use strict';
  const SPORTS = ['nfl','cfb','mlb','nba'];
  const MARKETS = ['moneyline','spread','total'];
  const settled = r => ['win','loss','push'].includes(r.result);
  const gameKey = r => [r.sport,r.event_id,r.starts_at,r.model_version].join('|');
  const key = r => `${gameKey(r)}|${r.market}`;
  function legacy(r) {
    return {s:r.sport,p:r.selection,tr:r.tier,a:r.market==='spread',t:r.market==='total',
      ...(r.result==='push'?{pu:1}:settled(r)?{c:r.result==='win'?1:0}:{}),
      q:{...r.snapshot,v:r.model_version,at:r.captured_at,start:r.starts_at,price:r.price,
        prob:r.model_probability,home:r.selection_home,line:r.line,proj:r.projection,
        finalHome:r.final_home_score,finalAway:r.final_away_score}};
  }
  const qualified = r => A.qualifyingBet(legacy(r));
  function valid(rows) {
    const unique = new Map();
    for (const r of rows || []) {
      if (!r?.event_id || !SPORTS.includes(r.sport) || !MARKETS.includes(r.market)
        || !(Date.parse(r.captured_at)<Date.parse(r.starts_at))) continue;
      const k = key(r), prev = unique.get(k);
      // Copies of one immutable forecast may include a more recent settlement.
      if (!prev || (r.id === prev.id && Date.parse(r.updated_at||r.graded_at||r.captured_at)>Date.parse(prev.updated_at||prev.graded_at||prev.captured_at))
        || (r.id !== prev.id && Date.parse(r.captured_at)<Date.parse(prev.captured_at))) unique.set(k,r);
    }
    return [...unique.values()];
  }
  function select(rows, opts={}) {
    const now=opts.now??Date.now(), days=Number(opts.days)||0;
    return valid(rows).filter(r=>(!opts.sport||opts.sport==='all'||r.sport===opts.sport)
      && (!opts.market||r.market===opts.market)
      && (opts.cohort && opts.cohort!=='current' ? `${r.sport}|${r.model_version}`===opts.cohort : !opts.versionFor || r.model_version===opts.versionFor(r.sport))
      && (!days||Date.parse(r.starts_at)>=now-days*864e5)
      && (!opts.query||`${r.matchup} ${r.selection}`.toLowerCase().includes(opts.query.toLowerCase())));
  }
  function summary(rows) {
    const bets=rows.filter(qualified).filter(r=>r.result!=='void');
    const e=A.evaluate(bets.filter(settled).map(legacy));
    return {...e,games:new Set(bets.filter(settled).map(gameKey)).size,
      pending:bets.filter(r=>r.result==='pending').length,unpriced:e.n-e.priced};
  }
  function profit(r) {
    const price=A.american(r.price);
    return !settled(r)||price==null ? null : r.result==='push'?0:r.result==='loss'?-1:price>0?price/100:100/-price;
  }
  const day = r => new Date(r.starts_at).toLocaleDateString('en-CA',{timeZone:'America/New_York'});
  function series(rows) {
    const buckets=new Map();
    rows.filter(qualified).filter(settled).sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at)).forEach(r=>{
      const p=profit(r);if(p==null)return;
      const d=day(r),v=buckets.get(d)||{date:d,units:0,n:0};v.units+=p;v.n++;buckets.set(d,v);
    });
    let units=0,n=0;
    return [...buckets.values()].map(d=>({...d,dailyUnits:d.units,units:units+=d.units,n:n+=d.n}));
  }
  function weekly(rows) {
    const groups=new Map();
    for(const r of rows.filter(qualified).filter(settled)) {
      const date=new Date(`${day(r)}T12:00:00Z`);date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);
      const k=date.toISOString().slice(0,10);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);
    }
    return [...groups].sort(([a],[b])=>b.localeCompare(a)).map(([date,rs])=>({date,...summary(rs)}));
  }
  // Baselines use both sides of the very same saved quote as the model bet.
  // No reverse-engineered odds, refreshed lines, or convenient extra games.
  function benchmarkRow(r, strategy) {
    if(!qualified(r)||!settled(r)||A.american(r.price)==null)return null;
    const h=A.number(r.final_home_score),a=A.number(r.final_away_score);
    if(h==null||a==null)return null;
    const snap=r.snapshot||{}, enriched=Date.parse(snap.priceCapturedAt)<Date.parse(r.starts_at);
    const candidates=[snap.odds,...(enriched?[snap.pricedOdds]:[])].filter(Boolean);
    for(const o of candidates) {
      let target, ownPrice, price, outcome;
      if(r.market==='total') {
        if(!['over','under'].includes(strategy)||A.number(r.line)==null||A.number(o.ou)!==A.number(r.line))continue;
        ownPrice=/^OVER\b/i.test(r.selection)?o.overPrice:o.underPrice;
        target=strategy==='over';price=target?o.overPrice:o.underPrice;
        outcome=h+a-Number(r.line);
      } else {
        if(!['home','favorite'].includes(strategy)||typeof r.selection_home!=='boolean')continue;
        if(r.market==='spread') {
          if(A.number(r.line)==null||A.number(o.spread)!==A.number(r.line))continue;
          if(strategy==='favorite'&&Number(r.line)===0)continue;
          target=strategy==='home'||Number(r.line)<0;
          ownPrice=r.selection_home?o.hSpreadPrice:o.aSpreadPrice;
          price=target?o.hSpreadPrice:o.aSpreadPrice;outcome=h-a+Number(r.line);
        } else {
          const hp=A.implied(o.hML),ap=A.implied(o.aML);
          if(strategy==='favorite'&&(hp==null||ap==null||hp===ap))continue;
          target=strategy==='home'||hp>ap;ownPrice=r.selection_home?o.hML:o.aML;
          price=target?o.hML:o.aML;outcome=h-a;
          if(outcome===0)continue; // moneyline tie settlement varies by sport/book
        }
      }
      if(A.american(ownPrice)!==A.american(r.price)||A.american(price)==null)continue;
      // Require both original side prices even when the selections coincide.
      const other=r.market==='total'?(/^OVER\b/i.test(r.selection)?o.underPrice:o.overPrice)
        :r.market==='spread'?(r.selection_home?o.aSpreadPrice:o.hSpreadPrice):(r.selection_home?o.aML:o.hML);
      if(A.american(other)==null)continue;
      return {...r,price,result:outcome===0?'push':(outcome>0)===target?'win':'loss',model_probability:null,snapshot:{...snap,probability:null}};
    }
    return null;
  }
  function benchmarks(rows,market) {
    return (market==='total'?['over','under']:['home','favorite']).map(strategy=>{
      const pairs=rows.filter(r=>r.market===market).map(r=>({model:r,base:benchmarkRow(r,strategy)})).filter(p=>p.base);
      return {strategy,n:pairs.length,model:summary(pairs.map(p=>p.model)),baseline:summary(pairs.map(p=>p.base))};
    });
  }
  function splits(rows,dimension) {
    const groups=new Map();
    for(const r of rows.filter(qualified)) {
      let label;
      if(dimension==='side')label=r.market==='total'?(/^OVER\b/i.test(r.selection)?'Over':'Under')
        :typeof r.selection_home==='boolean'?(r.snapshot?.neutral?'Neutral venue':r.selection_home?'Home':'Away'):'Side unavailable';
      if(dimension==='favorite') {
        if(r.market==='total')continue;
        const o=r.snapshot?.odds||{};
        if(r.market==='spread') {const line=A.number(r.line);label=line==null?'Unknown':line===0?'Pick’em':(line<0)===r.selection_home?'Favorite':'Underdog';}
        else {const h=A.implied(o.hML),a=A.implied(o.aML);label=h==null||a==null||typeof r.selection_home!=='boolean'?'Unknown':h===a?'Pick’em':(h>a)===r.selection_home?'Favorite':'Underdog';}
      }
      if(dimension==='edge') {
        const proj=A.number(r.projection),line=A.number(r.line),mp=A.number(r.model_probability),bp=A.number(r.market_probability);
        const gap=r.market==='moneyline'?(mp==null||bp==null?null:100*(mp-bp)):proj==null||line==null?null:Math.abs(r.market==='spread'?proj+line:proj-line);
        const unit=r.market==='moneyline'?'pp':'points';
        label=gap==null?'Gap unavailable':gap<2?`Under 2 ${unit}`:gap<5?`2–5 ${unit}`:`5+ ${unit}`;
      }
      if(!groups.has(label))groups.set(label,[]);groups.get(label).push(r);
    }
    return [...groups].map(([label,rs])=>({label,...summary(rs)}));
  }
  function calibration(rows) {
    const buckets=new Map();
    for(const r of rows.filter(qualified).filter(settled)) {
      if(r.result==='push')continue;
      const v=A.evaluate([legacy(r)]);if(!v.probabilityN)continue;
      const low=Math.min(90,Math.floor(Number(r.model_probability)*10)*10);
      const k=`${low}–${low+10}%`,g=buckets.get(k)||{label:k,low,n:0,w:0,sum:0};
      g.n++;g.w+=r.result==='win'?1:0;g.sum+=Number(r.model_probability);buckets.set(k,g);
    }
    return [...buckets.values()].sort((a,b)=>a.low-b.low).map(g=>({...g,expected:g.sum/g.n,actual:g.w/g.n}));
  }
  function forecastErrors(rows) {
    const games=new Map();
    rows.filter(r=>r.result!=='void').forEach(r=>{
      const k=gameKey(r);if(!games.has(k)||r.market==='moneyline')games.set(k,r);
    });
    return ['margin','total'].map(metric=>{
      const errors=[...games.values()].flatMap(r=>{
        const p=A.number(r.snapshot?.forecast?.[metric]),h=A.number(r.final_home_score),a=A.number(r.final_away_score);
        return p==null||h==null||a==null?[]:[p-(metric==='margin'?h-a:h+a)];
      });
      return {metric,n:errors.length,mae:errors.length?errors.reduce((a,b)=>a+Math.abs(b),0)/errors.length:null,
        bias:errors.length?errors.reduce((a,b)=>a+b,0)/errors.length:null};
    });
  }
  function games(rows, now = Date.now()) {
    const groups=new Map();for(const r of rows){const k=gameKey(r);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}
    return [...groups.values()].sort((a,b)=>{
        const at=Date.parse(a[0].starts_at),bt=Date.parse(b[0].starts_at);
        const af=at>now,bf=bt>now;
        return Number(af)-Number(bf)||(af?at-bt:bt-at);
      })
      .map(rs=>rs.sort((a,b)=>MARKETS.indexOf(a.market)-MARKETS.indexOf(b.market)));
  }
  return Object.freeze({SPORTS,MARKETS,legacy,valid,select,qualified,settled,summary,profit,series,weekly,benchmarks,splits,calibration,forecastErrors,games});
});
