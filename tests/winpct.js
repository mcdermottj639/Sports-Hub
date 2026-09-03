const { chromium } = require('/tmp/fs/node_modules/playwright-core');
let pass=0,fail=0; const ok=(c,m)=>{if(c){pass++;console.log('  ✓ '+m);}else{fail++;console.log('  ✗ '+m);}};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
 const ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:'America/New_York'});
 const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 try {
 await p.goto('http://127.0.0.1:8099/',{waitUntil:'networkidle'});
 if (await p.locator('#first-demo').count()) { await p.click('#first-demo'); await p.waitForSelector('#tabs:not([hidden])'); }
 await sleep(1400);
 await p.evaluate(async()=>{ S.weekPinned=true; S.week=S.liveWeek+1; await ensureWeeks([S.week]); render(); });
 await sleep(700);

 console.log('\n— every side of every upcoming game carries a number —');
 const n=await p.locator('#s-pick .game:not(.started) .pk').count();
 const w=await p.locator('#s-pick .game:not(.started) .pk-win').count();
 ok(n>0&&w===n,`${w} percentages for ${n} team buttons`);
 const txt=await p.$$eval('.pk-win',e=>e.map(x=>x.innerText.trim()));
 ok(txt.every(t=>/^\d{1,3}% to win$/.test(t)),`each reads like a chance: "${txt[0]}"`);
 ok(txt.every(t=>{const v=+t.match(/\d+/)[0];return v>=1&&v<=99;}),'nothing claims 0% or 100%');

 console.log('\n— the two sides of a game add up —');
 const pairs=await p.$$eval('#s-pick .game:not(.started)',gs=>gs.map(g=>
   [...g.querySelectorAll('.pk-win')].map(x=>+x.innerText.match(/\d+/)[0])));
 ok(pairs.every(pr=>pr.length===2),'two numbers per game');
 const sums=pairs.map(pr=>pr[0]+pr[1]);
 ok(sums.every(s=>s>=99&&s<=101),`and they total 100 (rounding aside): ${[...new Set(sums)].join(', ')}`);

 console.log('\n— it agrees with the matchup card, because it is the same read —');
 const chk=await p.evaluate(()=>{
   const g=(S.games[S.week]||[]).find(x=>x.state==='pre'&&matchupRead(x).pHome!=null);
   const r=matchupRead(g);
   const card=document.querySelectorAll('#s-pick .game:not(.started)');
   const el=[...card].find(c=>c.querySelector('.pk').dataset.team===g.away.abbr);
   const shown=[...el.querySelectorAll('.pk-win')].map(x=>+x.innerText.match(/\d+/)[0]);
   return { away:Math.round((1-r.pHome)*100), home:Math.round(r.pHome*100), shown };
 });
 ok(chk.shown[0]===chk.away&&chk.shown[1]===chk.home,
   `away ${chk.shown[0]}% / home ${chk.shown[1]}% matches matchupRead exactly`);

 console.log('\n— a game already played shows no chance to win —');
 await p.evaluate(async()=>{ S.week=S.liveWeek; await ensureWeeks([S.week]); S.fullWeek=S.week; render(); });
 await sleep(700);
 const started=await p.locator('#s-pick .game.started').count();
 ok(started>0,`${started} games have started`);
 ok(await p.locator('#s-pick .game.started .pk-win').count()===0,'none of them shows a percentage');

 console.log('\n— it says whose number it is —');
 await p.evaluate(async()=>{ S.week=S.liveWeek+1; await ensureWeeks([S.week]); render(); });
 await sleep(600);
 const sub=await p.locator('#s-pick .sub').first().innerText();
 ok(/betting market/i.test(sub),'the note names the source: "'+sub.trim().split('\n').pop().trim()+'"');
 ok(/not a guarantee/i.test(sub),'and does not oversell it');

 console.log('\n— legible, and it did not break the button —');
 const m=await p.evaluate(()=>{
   const e=document.querySelector('.pk-win'), b=document.querySelector('.pk');
   return { fs:parseFloat(getComputedStyle(e).fontSize), h:b.getBoundingClientRect().height,
            clip:[...document.querySelectorAll('.pk-win,.pk-name')].filter(x=>x.scrollWidth>x.clientWidth+1).length };
 });
 ok(m.fs>=15.5,`readable at ${m.fs}px`);
 ok(m.h>=56,`the button still clears the tap floor (${Math.round(m.h)}px)`);
 ok(m.clip===0,'nothing truncates');
 ok(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'no sideways scroll');

 console.log('\n— no line posted, no number invented —');
 await p.evaluate(()=>{ (S.games[S.week]||[]).forEach(g=>{ g.odds=null; }); render(); });
 await sleep(400);
 ok(await p.locator('.pk-win').count()===0,'with no odds at all, no percentages are shown');
 ok(await p.locator('#s-pick .pk').count()>0,'and the teams are still pickable');

 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 } finally { await b.close(); }
 console.log(`\n${pass} passed, ${fail} failed\n`);
 process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
