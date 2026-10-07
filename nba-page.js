/* NBA league page. Reuses Sports Hub's live cards, locked reports and history. */
(function(root){
  'use strict';
  let date=null,token=0;
  const $=id=>document.getElementById(id);
  function modelPanel(){
    const box=document.createElement('div'),N=root.SportsHubNBA,C=root.SportsHubNBAConfig,v=C.validation;
    box.className='mc-wrap nba-model-info';
    box.innerHTML=`<h3>NBA model</h3><p>Separate forecasts for the winner, scoring margin and total. Every available pregame forecast is tracked, including small edges and games without betting prices.</p>
      <div class="nba-validation"><span><b>${(v.winnerAccuracy*100).toFixed(1)}%</b>Winner accuracy</span><span><b>${v.marginMAE.toFixed(1)} pts</b>Margin error</span><span><b>${v.totalMAE.toFixed(1)} pts</b>Total error</span></div>
      <p class="desk-caption">Historical 2025–26 holdout · ${v.holdoutN.toLocaleString()} games, including the NBA Cup final. Trained on 2022–24, settings selected on 2024–25; the holdout was not used to fit coefficients. These are forecast results, not betting returns.</p>
      <details><summary>Inputs &amp; limits</summary><p>Season offense and defense, scoring margin, last 10 games, win rate, home court, rest and back-to-backs. Early in the season, the previous regular season contributes 15 games of prior weight. Only games completed before the forecast enter the calculation.</p><p>Player availability, starting lineups, trades and possession-adjusted pace are not modeled. Early-season roster changes can make last season a weak guide. Preseason is excluded. Playoff forecasts use the same formula; playoff accuracy has not been validated.</p><p>Live winner, spread and total results start with this release. No betting profitability or spread/total probability calibration is established. The 3-point spread and 6-point total filters are display filters; all available forecasts remain in the official record.</p></details>
      ${[['winner','Winner · log-odds',N.marginKeys],['margin','Margin · home points',N.marginKeys],['total','Total · combined points',N.totalKeys]].map(([name,label,keys])=>`<details><summary>${label} · weights</summary><div class="nba-table-wrap"><table><thead><tr><th>Factor</th><th>Coefficient</th></tr></thead><tbody>${keys.map((key,i)=>`<tr><td>${N.labels[key]}</td><td>${C[name][i].toFixed(4)}</td></tr>`).join('')}</tbody></table></div></details>`).join('')}`;
    return box;
  }
  async function board(){
    const turn=++token,box=$('nba-games'),selected=date||ymd(sportsDate());
    $('nba-date').value=`${selected.slice(0,4)}-${selected.slice(4,6)}-${selected.slice(6,8)}`;
    box.innerHTML='<div class="empty" role="status">Loading NBA games…</div>';
    try{
      const sb=await scoreboard('nba',selected,{limit:100});if(turn!==token)return;
      const games=sb.games,preseason=games.length&&games.every(g=>g.seasonType===1);
      $('nba-phase').textContent=preseason?'Preseason · scores only':games.some(g=>g.seasonType===3)?'Playoffs':'Daily games & model forecasts';
      $('nba-season-note').textContent=preseason?'Preseason games do not enter the model or its official record.':'Winner, spread and total · forecasts freeze at tipoff.';
      if(!games.length)box.innerHTML='<div class="empty">No NBA games on this date. Choose another day above.</div>';
      else{box.innerHTML='';paintSlate('nba',games,box);enrichSlate('nba',box,games);}
      if(preseason||!games.length){
        const now=sportsDate(),year=games[0]?.season||(now.getFullYear()+(now.getMonth()>=8?1:0));
        const schedule=await fetchJSON(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${games[0]?.home?.id||'2'}/schedule?season=${year}&seasontype=2`,5*60000).catch(()=>null);
        const upcoming={games:(schedule?.events||[]).map(e=>({id:e.id,date:e.date,seasonType:Number(e.seasonType?.type??e.season?.type)}))};
        if(turn!==token)return;
        const next=upcoming?.games.filter(g=>g.seasonType===2&&Date.parse(g.date)>Date.now()).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date))[0];
        const shortcut=$('nba-next-slate');shortcut.hidden=!next;
        if(next){shortcut.dataset.nbaDate=new Date(next.date).toLocaleDateString('en-CA',{timeZone:'America/New_York'}).replaceAll('-','');shortcut.textContent=`Upcoming regular-season slate · ${new Date(next.date).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'America/New_York'})}`;}
      }else $('nba-next-slate').hidden=true;
    }catch(_){if(turn===token)box.innerHTML='<div class="empty">NBA scoreboard is unavailable. <button class="fan-btn" data-nba-retry>Retry</button></div>';}
  }
  async function standings(){
    const box=$('nba-standings');
    try{
      const rows=await getStandings('nba');
      if(!rows.length){box.innerHTML='<div class="empty">Standings are not available yet.</div>';return;}
      const played=rows.some(r=>r.wins+r.losses>0);
      box.innerHTML=`${played?'':'<p class="desk-caption">Season standings will develop as regular-season games finish.</p>'}${['Eastern','Western'].map(conf=>{
        const list=rows.filter(r=>`${r.league} ${r.division}`.includes(conf)).sort((a,b)=>Number(a.seed||99)-Number(b.seed||99)||b.wins/(b.wins+b.losses||1)-a.wins/(a.wins+a.losses||1));
        return list.length?`<div class="nba-conference"><h3>${conf} Conference</h3><div class="nba-table-wrap"><table><thead><tr><th>Team</th><th>W–L</th><th>Win %</th></tr></thead><tbody>${list.map(r=>`<tr><td>${r.logo?`<img src="${esc(r.logo)}" alt="" loading="lazy">`:''}${esc(r.team)}</td><td>${r.wins}–${r.losses}</td><td>${(100*r.wins/(r.wins+r.losses||1)).toFixed(0)}%</td></tr>`).join('')}</tbody></table></div></div>`:'';
      }).join('')}`;
      if(!box.querySelector('table'))box.innerHTML='<div class="empty">Conference standings are not available yet.</div>';
    }catch(_){box.innerHTML='<div class="empty">Standings could not be loaded.</div>';}
  }
  async function news(){
    const box=$('nba-news');
    try{const data=await fetchJSON('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/news?limit=8',5*60000),articles=data.articles||[];
      box.innerHTML=articles.length?articles.slice(0,8).map((a,i)=>`<button type="button" class="nba-news-item" data-nba-news="${i}"><b>${esc(a.headline||'NBA news')}</b><span>${esc(a.description||'')}</span></button>`).join(''):'<div class="empty">No NBA headlines available.</div>';
      box.querySelectorAll('[data-nba-news]').forEach(b=>b.onclick=()=>openNewsSummary(articles[Number(b.dataset.nbaNews)]));
    }catch(_){box.innerHTML='<div class="empty">NBA news is temporarily unavailable.</div>';}
  }
  function render(){
    const panel=$('nba');
    if(!panel.dataset.wired){panel.dataset.wired='1';panel.addEventListener('click',e=>{
      const step=e.target.closest('[data-nba-step]'),jump=e.target.closest('[data-nba-date]');
      if(step){const value=date||ymd(sportsDate()),d=new Date(`${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}T12:00:00`);d.setDate(d.getDate()+Number(step.dataset.nbaStep));date=ymd(d);board();}
      if(jump){date=jump.dataset.nbaDate||ymd(sportsDate());board();}
      if(e.target.closest('[data-nba-retry]'))board();
    });$('nba-date').addEventListener('change',e=>{if(/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)){date=e.target.value.replaceAll('-','');board();}});$('nba-method').replaceChildren(modelPanel());}
    board();standings();news();
  }
  root.SportsHubNBAPage={render,modelPanel};
})(globalThis);
