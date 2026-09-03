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
 await sleep(1500);
 await p.evaluate(async()=>{ S.weekPinned=true; S.week=S.liveWeek+1; await ensureWeeks([S.week]); render(); });
 await sleep(700);

 console.log('\n— the percentage is the moneyline, and only the moneyline —');
 const basis=await p.evaluate(()=>{
   const gs=(S.games[S.week]||[]);
   return gs.map(g=>{const r=matchupRead(g);return {b:r.basis, p:r.pHome, s:r.homeSpread};});
 });
 ok(basis.every(x=>x.p==null||x.b==='moneyline'),'no game gets a probability from anything but the moneyline');
 ok(basis.some(x=>x.b==='moneyline'),'and the demo games do have moneylines');
 const src=require('fs').readFileSync('/tmp/fs/survivor.js','utf8');
 const fn=src.split('function matchupRead')[1].split('\nfunction ')[0];
 ok(!/basis = 'spread'/.test(fn),'the spread-to-probability branch is gone from matchupRead');
 // ⚠️ Strip comments first — the function's own comment NAMES the conversion
 // it no longer does, and a naive grep flags the explanation as the offence.
 const code = fn.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
 ok(!/ncdf\(/.test(code),'matchupRead runs no spread-to-probability conversion in its code');
 ok(/ncdf/.test(fn),'though its comment still names the one it rejected, and why');

 console.log('\n— a game with a spread but NO moneyline shows no number —');
 const nolm=await p.evaluate(()=>{
   const g=(S.games[S.week]||[]).find(x=>x.state==='pre');
   const keep={h:g.odds.hML,a:g.odds.aML};
   g.odds.hML=null; g.odds.aML=null;
   const r=matchupRead(g);
   const out={ fav:!!r.fav, favBy:r.favBy, p:r.pHome, basis:r.basis, hasLine:r.hasLine,
               card:matchupHTML(g) };
   g.odds.hML=keep.h; g.odds.aML=keep.a;
   return out;
 });
 ok(nolm.p===null,'no probability without a moneyline');
 ok(nolm.basis===null,'and no basis claimed');
 ok(nolm.fav===true&&nolm.favBy>0,`but the spread still names the favourite (by ${nolm.favBy})`);
 ok(!/%/.test(nolm.card.split('sh-proj')[1].split('</div></div>')[0]||''),'the projection block quotes no percentage');
 ok(/Spread/.test(nolm.card),'and the Vegas line table still shows the spread');
 ok(/No moneyline is posted/.test(nolm.card),'the read says why there is no percentage');

 console.log('\n— the spread is still information, everywhere it was —');
 const pill=await p.locator('.ibtn-l').first().innerText();
 ok(/-\d/.test(pill),`the little ⓘ widget still shows the spread: "${pill}"`);
 await p.locator('.ibtn').first().click(); await sleep(500);
 const sheet=await p.locator('#sheet-body').innerText();
 ok(/Spread/.test(sheet)&&/-\d/.test(sheet),'the matchup card still lists the spread');
 ok(/Moneyline/.test(sheet),'and the moneyline beside it');
 ok(/on the moneyline/.test(sheet),'the projection names where its number came from');
 await p.click('#sheet-close'); await sleep(300);

 console.log('\n— the pick buttons agree with the card —');
 const agree=await p.evaluate(()=>{
   const out=[];
   for (const card of document.querySelectorAll('#s-pick .game:not(.started)')) {
     const g=(S.games[S.week]||[]).find(x=>x.id===card.dataset.gid) ||
             (S.games[S.week]||[]).find(x=>x.away.abbr===card.querySelector('.pk').dataset.team);
     if (!g) continue;
     const r=matchupRead(g);
     const w=[...card.querySelectorAll('.pk-win')].map(e=>+e.innerText.match(/\d+/)[0]);
     if (!w.length) { out.push({skip:true}); continue; }
     out.push({ away:w[0], home:w[1], eAway:Math.round((1-r.pHome)*100), eHome:Math.round(r.pHome*100), basis:r.basis });
   }
   return out;
 });
 const shown=agree.filter(x=>!x.skip);
 ok(shown.length>0,`${shown.length} games show a percentage`);
 ok(shown.every(x=>x.basis==='moneyline'),'every one of them is moneyline-based');
 ok(shown.every(x=>x.away===x.eAway&&x.home===x.eHome),'and each matches matchupRead exactly');

 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 } finally { await b.close(); }
 console.log(`\n${pass} passed, ${fail} failed\n`);
 process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
