/* Top 25 and all D1 tournament games share one compact college board. */
(function(root){
 'use strict';
 let date=null,scope='all',token=0;
 const $=id=>document.getElementById(id);
 function modelPanel(){
  const box=document.createElement('div');box.className='mc-wrap nba-model-info';
  const v=root.SportsHubCBBConfig?.validation?.requestedCoverage;
  box.innerHTML=(v?`<div class="nba-validation"><span><b>${(v.winnerAccuracy*100).toFixed(1)}%</b>Historical winner accuracy</span><span><b>${v.marginMAE.toFixed(1)} pts</b>Margin error</span><span><b>${v.totalMAE.toFixed(1)} pts</b>Total error</span></div><p class="desk-caption">2025–26 replay · ${v.games.toLocaleString()} Top 25 / tournament games. Retrospective ESPN data; not betting returns.</p>`:'')+'<h3>College basketball model</h3><p>Men’s Division I · games with a Top 25 team, plus every D1 tournament game supplied by ESPN. Unranked tournament teams are included.</p><p>Winner probability, projected margin and total use opponent-adjusted D1 scores. Neutral courts have no home advantage. Early-season ratings blend a reduced previous-season prior.</p><details><summary>Inputs, coverage &amp; validation</summary><p>Coverage includes early-season tournaments, conference tournaments, NCAA tournament / First Four and other D1 postseason events. Tournament badges come from the event feed. Rankings select coverage; they are not a strength rating.</p><p>New research model. Forecasts are saved before tipoff and graded separately; betting profitability and prospective calibration are unproven. No player availability or possession-adjusted pace. Sparse history or evidence older than 36 hours withholds the forecast. No new forecasts are calculated for games that have started.</p><p>Data refreshes throughout the day. Frozen picks retain their original inputs and lines. <a href="docs/CBB_MODEL.md">Method and validation</a></p></details>';
  return box;
 }
 async function board(){
  const turn=++token,box=$('cbb-games'),selected=date||ymd(sportsDate());
  $('cbb-date').value=`${selected.slice(0,4)}-${selected.slice(4,6)}-${selected.slice(6,8)}`;
  box.innerHTML='<div class="empty" role="status">Loading college basketball…</div>';
  try{
   const games=await getGames('cbb',selected);if(turn!==token)return;
   const filtered=root.SportsHubCBB.select(games,scope);box.innerHTML='';
   $('cbb-count').textContent=`${filtered.length} game${filtered.length===1?'':'s'} · ${scope==='top25'?'Top 25':scope==='tournaments'?'D1 tournaments':'Top 25 + D1 tournaments'}`;
   if(!filtered.length){box.innerHTML='<div class="empty">No matching games on this date. Choose another date or coverage filter.</div>';return;}
   paintSlate('cbb',filtered,box);
   for(const card of box.querySelectorAll('.game-card[data-gid]')){const g=filtered.find(x=>String(x.id)===card.dataset.gid);if(!g)continue;const label=document.createElement('p');label.className='desk-caption cbb-event-label';label.textContent=root.SportsHubCBB.coverage(g).label+(g.neutralSite?' · Neutral court':'');card.prepend(label);}
   enrichSlate('cbb',box,filtered);
  }catch(_){if(turn===token)box.innerHTML='<div class="empty">College scoreboard unavailable. <button class="fan-btn" data-cbb-retry>Retry</button></div>';}
 }
 function render(){
  const panel=$('cbb');if(!panel.dataset.wired){panel.dataset.wired='1';$('cbb-method').replaceChildren(modelPanel());
   panel.addEventListener('click',e=>{
    const step=e.target.closest('[data-cbb-step]'),filter=e.target.closest('[data-cbb-scope]');
    if(step){const v=date||ymd(sportsDate()),d=new Date(`${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}T12:00:00`);d.setDate(d.getDate()+Number(step.dataset.cbbStep));date=ymd(d);board();}
    if(filter){scope=filter.dataset.cbbScope;panel.querySelectorAll('[data-cbb-scope]').forEach(b=>b.setAttribute('aria-pressed',String(b===filter)));board();}
    if(e.target.closest('[data-cbb-today]')){date=null;board();}
    if(e.target.closest('[data-cbb-retry]'))board();
   });$('cbb-date').addEventListener('change',e=>{if(/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)){date=e.target.value.replaceAll('-','');board();}});
  }board();
 }
 root.SportsHubCBBPage={render,modelPanel};
})(globalThis);
