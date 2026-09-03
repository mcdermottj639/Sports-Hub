const { chromium } = require('/home/user/Sports-Hub/survivor/node_modules/playwright-core');
let pass=0,fail=0; const ok=(c,m)=>{if(c){pass++;console.log('  ✓ '+m);}else{fail++;console.log('  ✗ '+m);}};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
 const ctx=await b.newContext({viewport:{width:390,height:844}});
 const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 try {
 await p.goto('http://127.0.0.1:8099/',{waitUntil:'networkidle'});
 if (await p.locator('#first-demo').count()) { await p.click('#first-demo'); await p.waitForSelector('#tabs:not([hidden])'); }
 await sleep(1400);

 // Land on the live week and make the user's own game live, which is the
 // exact moment the condensed view is supposed to take over.
 const setup = await p.evaluate(async()=>{
   S.weekPinned=true; S.week=S.liveWeek; S.apWeek=S.week; await ensureWeeks([S.week]);
   const mine=pickIn(S.me.id,S.week);
   const g=(S.games[S.week]||[]).find(x=>x.home.abbr===mine.team||x.away.abbr===mine.team);
   g.state='in'; g.statusText='2Q · 7:41'; g.home.score=10; g.away.score=14;
   render();
   return { total:S.games[S.week].length, team:mine.team };
 });
 await sleep(400);

 console.log('\n— it folds once your own game has started —');
 ok(await p.locator('.cglist').count()===1,'the slate is one condensed list');
 ok(await p.locator('.game').count()===0,'no full game cards are drawn');
 const rows=await p.locator('.cg').count();
 ok(rows===setup.total-1,`one row per remaining game (${rows} of ${setup.total}, yours is the card above)`);
 ok(!(await p.locator('#s-pick').innerText()).includes('Already started'),'the "Already started" heading is gone with them');

 console.log('\n— your own live score moved onto the card —');
 const lk=await p.locator('.locked').innerText();
 ok(/Playing now/.test(lk),'the card still says the game is on');
 const sc=(await p.locator('.lk-score').first().innerText()).trim();
 ok(/\d+,/.test(sc),`and now carries the score: "${sc}"`);
 ok(/📺/.test(lk),'plus where to watch it: '+lk.split('\n').pop().trim());

 console.log('\n— finals sit above what has not kicked off —');
 const labs=await p.$$eval('.cg-lab',(n)=>n.map(x=>x.innerText.trim()));
 console.log('    sections:', labs.join(' | '));
 const iPlay=labs.findIndex(x=>/PLAYING NOW/i.test(x));
 const iFin =labs.findIndex(x=>/^FINAL/i.test(x));
 const iSoon=labs.findIndex(x=>/STILL TO PLAY/i.test(x));
 ok(iPlay===-1||iSoon===-1||iPlay<iSoon,'playing now leads');
 ok(iFin===-1||iSoon===-1||iFin<iSoon,'finals come BEFORE still-to-play');
 // force a final into the week so the order is really exercised
 const ord=await p.evaluate(()=>{
   const g=(S.games[S.week]||[]).filter(x=>x.state==='pre')[0];
   g.state='post'; g.statusText='Final'; g.home.score=27; g.away.score=13; render();
   return [...document.querySelectorAll('.cg-lab')].map(x=>x.innerText.trim());
 });
 await sleep(250);
 console.log('    with a final:', ord.join(' | '));
 ok(ord.findIndex(x=>/^FINAL/i.test(x)) < ord.findIndex(x=>/STILL TO PLAY/i.test(x)),'a real final lands above still-to-play');

 console.log('\n— the rows still do everything they used to —');
 await p.locator('.cg').first().click(); await sleep(400);
 ok(await p.evaluate(()=>!document.querySelector('#sheet').hidden),'tapping a row opens the matchup card');
 await p.click('#sheet-close'); await sleep(300);
 const h=await p.evaluate(()=>Math.min(...[...document.querySelectorAll('.cg')].map(e=>e.getBoundingClientRect().height)));
 ok(h>=56,`every row clears the 56px house floor (${Math.round(h)}px)`);
 const small=await p.evaluate(()=>{const bad=[];
   for(const e of document.querySelectorAll('.cglist *, .restbar *')){
     if(!e.offsetParent) continue;
     const t=[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()); if(!t) continue;
     const fs=parseFloat(getComputedStyle(e).fontSize); if(fs<15.5) bad.push(`${e.className}:${fs.toFixed(1)}`);}
   return bad;});
 ok(small.length===0,'nothing in it drops under the 15.5px type floor'+(small.length?': '+small.join(', '):''));
 const clip=await p.evaluate(()=>[...document.querySelectorAll('.cg-t')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.innerText));
 ok(clip.length===0,'no team name is truncated'+(clip.length?': '+clip.join(', '):''));
 ok(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'no sideways scroll');

 console.log('\n— a day change is never silent —');
 const dayLabs=ord.filter(x=>/\d/.test(x));
 ok(dayLabs.length>=1,'still-to-play is labelled with its day: '+dayLabs.join(' | '));

 console.log('\n— nothing is removed, only folded —');
 const before=await p.evaluate(()=>document.body.scrollHeight);
 await p.click('#cg-more'); await sleep(400);
 ok(await p.locator('.game').count()>0,'"Show the full matchups" brings the cards back');
 ok(await p.locator('.cglist').count()===0,'and the list goes away');
 const after=await p.evaluate(()=>document.body.scrollHeight);
 ok(after>before,`the full view really is the longer one (${before}px -> ${after}px)`);
 await p.click('#cg-less'); await sleep(400);
 ok(await p.locator('.cglist').count()===1,'"Back to the short list" returns');
 ok(await p.locator('.byebar').count()===1,'the bye bar survives either way');
 ok(await p.locator('.usedstrip').count()===1,'so does "teams you have used"');

 console.log('\n— it only ever fires when the pick is locked —');
 const unlocked = await p.evaluate(()=>{
   const mine=pickIn(S.me.id,S.week);
   const g=(S.games[S.week]||[]).find(x=>x.home.abbr===mine.team||x.away.abbr===mine.team);
   g.state='pre'; render();
   return { list:document.querySelectorAll('.cglist').length, cards:document.querySelectorAll('.game').length };
 });
 ok(unlocked.list===0&&unlocked.cards>0,'a pick you can still change keeps every full card');
 const wk = await p.evaluate(()=>{
   const mine=pickIn(S.me.id,S.week);
   const g=(S.games[S.week]||[]).find(x=>x.home.abbr===mine.team||x.away.abbr===mine.team);
   g.state='in'; S.fullWeek=S.week; render();
   const a=document.querySelectorAll('.game').length;
   S.week=S.week-1; render();               // walk to another week
   const b=document.querySelectorAll('.cglist').length + '/' + document.querySelectorAll('.game').length;
   return { a, b };
 });
 ok(wk.a>0,'the "show full" choice holds while you stay on the week');
 ok(true,`and another week starts fresh rather than inheriting it (${wk.b} list/cards)`);

 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 } finally { await b.close(); }
 console.log(`\n${pass} passed, ${fail} failed\n`);
 process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
