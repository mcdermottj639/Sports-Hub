const { chromium } = require('/tmp/fs/node_modules/playwright-core');
let pass=0,fail=0; const ok=(c,m)=>{if(c){pass++;console.log('  ✓ '+m);}else{fail++;console.log('  ✗ '+m);}};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const U = (y,mo,d,h,mi=0) => Date.UTC(y,mo-1,d,h,mi);   // an instant, in UTC
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
 const ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:'America/New_York'});
 const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 try {
 await p.goto('http://127.0.0.1:8099/',{waitUntil:'networkidle'});
 if (await p.locator('#first-demo').count()) { await p.click('#first-demo'); await p.waitForSelector('#tabs:not([hidden])'); }
 await sleep(1500);
 const wk = (ms) => p.evaluate((t)=>weekFromClock(new Date(t)), ms);

 console.log('\n— the week turns over on TUESDAY at 4 AM Eastern —');
 // September: Eastern is UTC-4, so 4 AM ET is 08:00 UTC.
 ok(await wk(U(2026,9,14,23))===1,'Monday night, week 1 is still week 1');
 ok(await wk(U(2026,9,15,3))===1,'Tuesday 11 PM Mon ET / 03:00 UTC — still week 1');
 ok(await wk(U(2026,9,15,7,59))===1,'Tuesday 3:59 AM Eastern — still week 1');
 ok(await wk(U(2026,9,15,8))===2,'Tuesday 4:00 AM Eastern — week 2');
 ok(await wk(U(2026,9,15,17))===2,'and it stays week 2 through Tuesday');
 ok(await wk(U(2026,9,21,23))===2,'right up to the next Monday night');
 ok(await wk(U(2026,9,22,8))===3,'then week 3 the following Tuesday at 4');

 console.log('\n— 4 AM, not midnight, so a late Monday game still counts —');
 ok(await wk(U(2026,9,15,4))===1,'a west-coast Monday game ending 12:01 AM ET is still week 1');
 ok(await wk(U(2026,9,15,6,30))===1,'and so is 2:30 AM');

 console.log('\n— the November clock change does not slip it by an hour —');
 // After 1 Nov 2026 Eastern is UTC-5, so 4 AM ET is 09:00 UTC, not 08:00.
 ok(await wk(U(2026,11,10,8,59))===9,'Tue 10 Nov 3:59 AM Eastern (08:59 UTC) — still week 9');
 ok(await wk(U(2026,11,10,9))===10,'Tue 10 Nov 4:00 AM Eastern (09:00 UTC) — week 10');
 ok(await wk(U(2026,11,10,8,30))!==await wk(U(2026,11,10,9,30)),'the boundary really is at 4 AM Eastern, not 4 AM UTC');

 console.log('\n— every Tuesday of the season lands on the right week —');
 const map = {}; let bad = [];
 const tuesdays = [[9,15,2],[9,22,3],[9,29,4],[10,6,5],[10,13,6],[10,20,7],[10,27,8],
   [11,3,9],[11,10,10],[11,17,11],[11,24,12],[12,1,13],[12,8,14],[12,15,15],[12,22,16],[12,29,17]];
 for (const [mo,d,want] of tuesdays) {
   const got = await wk(U(2026,mo,d,12));       // midday Eastern, safely past 4 AM
   map[`${mo}/${d}`]=got; if (got!==want) bad.push(`${mo}/${d} want ${want} got ${got}`);
 }
 ok(bad.length===0,`all 16 in-season Tuesdays correct`+(bad.length?': '+bad.join(', '):''));
 ok(await wk(U(2027,1,5,12))===18,'the last rollover reaches week 18');

 console.log('\n— and it never goes out of the league —');
 ok(await wk(U(2026,8,1,12))===1,'before the season it is week 1');
 ok(await wk(U(2026,9,10,20))===1,'opening night is week 1');
 ok(await wk(U(2027,1,12,12))===18,'a week after the finale it clamps to 18, not 19');
 ok(await wk(U(2027,6,1,12))===18,'and in June it is still 18, never 40');
 const all=[]; for (let d=0; d<130; d++) all.push(await wk(U(2026,9,10,12)+d*86400000));
 ok(all.every((v,i)=>i===0||v>=all[i-1]),'the week never goes backwards across the season');
 ok(new Set(all).size===18,`and it visits all 18 weeks exactly (${new Set(all).size})`);

 console.log('\n— the app uses the clock, not ESPN —');
 const src=require('fs').readFileSync('/tmp/fs/survivor.js','utf8');
 const body=src.split('async function currentWeek()')[1].split('\n}')[0];
 ok(!/fetch|ESPN_SB/.test(body),'currentWeek makes no network call at all');
 ok(/weekFromClock/.test(body),'it reads the clock');
 ok(/DEMO_WEEK/.test(body),'and the demo still overrides it');
 ok(await p.evaluate(async()=>await currentWeek())===await p.evaluate(()=>DEMO_WEEK),'in demo mode it is still the demo week');
 ok(/ESPN_SB/.test(src),'ESPN is still used — for the scores, which is all it is for now');

 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 } finally { await b.close(); }
 console.log(`\n${pass} passed, ${fail} failed\n`);
 process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
