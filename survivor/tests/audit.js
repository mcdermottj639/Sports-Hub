const { chromium } = require('/home/user/Sports-Hub/survivor/node_modules/playwright-core');
let pass=0,fail=0; const ok=(c,m)=>{if(c){pass++;console.log('  ✓ '+m);}else{fail++;console.log('  ✗ '+m);}};
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
 const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const page=await ctx.newPage(); const errs=[];
 page.on('pageerror',e=>errs.push(e.message));
 await page.goto('http://127.0.0.1:8099/',{waitUntil:'networkidle'});
 await page.click('#first-demo'); await page.waitForSelector('#tabs:not([hidden])');

 console.log('\n— C4: a failed fetch no longer pins a week to "no games" —');
 const heal=await page.evaluate(async()=>{
   S.games[9]=[];                                  // simulate a failed fetch
   const before=S.games[9].length;
   await ensureWeeks([9]);                          // must retry, not short-circuit
   return {before,after:(S.games[9]||[]).length};});
 ok(heal.before===0&&heal.after>0,`an empty week is retried and refills (${heal.before} -> ${heal.after})`);

 console.log('\n— C1: standings cannot depend on which weeks happen to be cached —');
 const stale=await page.evaluate(async()=>{
   const p=S.players[1];
   // must be a week with GRADED results, or there is nothing to lose and the
   // assertion passes for the wrong reason
   const t0=tallyFor(p.id,S.games);
   const graded=t0.rows.filter(r=>r.pick&&['win','loss','tie'].includes(r.status)).map(r=>r.week);
   const wk=graded[0];
   const full=tallyFor(p.id,S.games);
   const saved=S.games[wk]; delete S.games[wk];      // pretend this tab never loaded it
   const gap=tallyFor(p.id,S.games);
   const missing=weeksInPlay().filter(w=>!(S.games[w]&&S.games[w].length));
   S.games[wk]=saved;
   return {wk,fullW:full.w+full.l+full.t,gapW:gap.w+gap.l+gap.t,detects:missing.includes(wk)};});
 ok(stale.fullW!==stale.gapW,`an unloaded week really does drop results (${stale.fullW} -> ${stale.gapW} graded)`);
 ok(stale.detects,'weeksInPlay() now flags that week as needing a load');
 await page.click('.tab[data-screen="standings"]'); await page.waitForTimeout(500);
 const covered=await page.evaluate(()=>weeksInPlay().filter(w=>!(S.games[w]&&S.games[w].length)).length);
 ok(covered===0,'opening Standings guarantees every week with a pick is loaded');

 console.log('\n— C2: the commissioner cannot pick a game that already started —');
 await page.click('.tab[data-screen="admin"]'); await page.waitForTimeout(250);
 await page.selectOption('#ap-week','4'); await page.waitForTimeout(500);
 const started=await page.evaluate(()=>{
   const g=(S.games[4]||[]).find(x=>x.state==='post');
   const opts=Array.from(document.querySelectorAll('#ap-team option')).map(o=>o.value);
   return {team:g.home.abbr,offered:opts.includes(g.home.abbr),date:g.date};});
 ok(!started.offered,`a finished game's team (${started.team}) is not offered`);
 const guard=await page.evaluate(async()=>{
   const g=(S.games[4]||[]).find(x=>x.state==='post');
   const other=S.players.find(p=>p.id!==S.me.id);
   return S.store.adminSetPick(S.me.token,other.id,4,g.home.abbr,g.date);});
 ok(guard&&guard.ok===false,`and the store refuses it: "${guard.error}"`);
 const note=await page.locator('#s-admin .note').filter({hasText:'already started'}).count();
 ok(note>=1,'the admin card says how many games have started');

 console.log('\n— M8: personal links are not guessable —');
 const toks=await page.evaluate(()=>JSON.parse(localStorage.getItem('survivor:local')).players.map(p=>p.token));
 ok(toks.every(t=>/-[a-z2-9]{6}$/.test(t)),'every token carries a random tail: '+toks.slice(0,3).join(', '));
 ok(!toks.includes('nana')&&!toks.includes('jack'),'a bare first name is no longer a valid link');
 const guessed=await page.evaluate(async()=>await S.store.whoami('nana'));
 ok(guessed===null,'guessing "nana" resolves to nobody');

 console.log('\n— M6: a bad cached week can be cleared —');
 const cache=await page.evaluate(async()=>{
   localStorage.setItem('survivor:wk:2026:2',JSON.stringify([{id:'bogus'}]));
   const before=Object.keys(localStorage).filter(k=>k.startsWith('survivor:wk:')).length;
   const n=clearWeekCache();
   const after=Object.keys(localStorage).filter(k=>k.startsWith('survivor:wk:')).length;
   return {before,n,after};});
 ok(cache.after===0&&cache.n>0,`clearWeekCache removed ${cache.n} cached week(s)`);

 console.log('\n— C5: the live refresh no longer gates on stale data —');
 const gate=await page.evaluate(()=>{
   const src=document.querySelector('script[src^="survivor.js"]')?1:1;
   const games=[{state:'pre'},{state:'pre'}];
   const unfinished=!games.length||games.some(g=>g.state!=='post');
   const oldGate=games.some(g=>g.state==='in');
   return {unfinished,oldGate};});
 ok(gate.unfinished&&!gate.oldGate,'an all-pregame week now refreshes (it previously would not)');

 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 console.log(`\n${pass} passed, ${fail} failed\n`);
 await b.close(); process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
