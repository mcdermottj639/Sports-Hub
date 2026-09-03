const { chromium } = require('/home/user/Sports-Hub/survivor/node_modules/playwright-core');
let pass=0,fail=0; const ok=(c,m)=>{if(c){pass++;console.log('  ✓ '+m);}else{fail++;console.log('  ✗ '+m);}};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
 const ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:'America/New_York'});
 const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 try {
 await p.goto('http://127.0.0.1:8099/',{waitUntil:'networkidle'});
 if (await p.locator('#first-demo').count()) { await p.click('#first-demo'); await p.waitForSelector('#tabs:not([hidden])'); }
 await sleep(1600);
 await p.click('.tab[data-screen="standings"]'); await sleep(1200);

 console.log('\n— every row says which way it moved —');
 const rows=await p.locator('.st tbody tr').count();
 const marks=await p.locator('.st .tr').count();
 ok(rows>0,`${rows} rows in the table`);
 // ⚠️ The arrows come from the last COMPLETE week, so they are there all week
 // — they do not wait for the current one to finish, and they do not flicker
 // as its games end one at a time.
 ok(marks>0,`${marks} arrows are showing mid-week, from the last finished week`);
 let kinds=await p.$$eval('.st .tr',n=>n.map(x=>x.className.replace('tr ','')+':'+x.innerText.trim()));
 ok(kinds.every(k=>/^(up ▲\d+|dn ▼\d+)$/.test(k.replace(':',' '))),'each is an arrow with a number — never a dash');
 ok(kinds.length<rows,'and anyone who did not move carries no mark');
 const note=await p.locator('#s-standings .sub').first().innerText();
 ok(/how the table moved when week \d+ was played/.test(note),'and the table names the week they belong to: "'+(note.match(/▲▼[^.]*\./)||[''])[0]+'"');

 console.log('\n— they hold steady while the next week is in progress —');
 const holdA=await p.$$eval('.st .tr',n=>n.map(x=>x.className+x.innerText));
 await p.evaluate(()=>{ const g=(S.games[S.liveWeek]||[]).find(x=>x.state!=='post');
   if (g) { g.state='post'; g.statusText='Final'; g.home.score=31; g.away.score=3; } render(); });
 await sleep(500);
 const holdB=await p.$$eval('.st .tr',n=>n.map(x=>x.className+x.innerText));
 ok(JSON.stringify(holdA)===JSON.stringify(holdB),'one more game finishing does not move them');

 console.log('\n— and roll over only when the week is DONE —');
 await p.evaluate(()=>{
   for (const g of S.games[S.liveWeek]||[]) {
     if (g.state==='post') continue;
     g.state='post'; g.statusText='Final';
     g.home.score=(g.home.score||0)+((g.id.charCodeAt(g.id.length-1)%2)?21:3);
     g.away.score=(g.away.score||0)+((g.id.charCodeAt(g.id.length-1)%2)?3:24);
   }
   render();
 });
 await sleep(700);
 kinds=await p.$$eval('.st .tr',n=>n.map(x=>x.className.replace('tr ','')+':'+x.innerText.trim()));
 console.log('    '+kinds.join('  '));
 ok(kinds.some(k=>k.startsWith('up')),'somebody climbed');
 ok(kinds.some(k=>k.startsWith('dn')),'somebody fell');
 ok(kinds.every(k=>/^(up ▲\d+|dn ▼\d+)$/.test(k.replace(':',' '))),'every mark is an arrow with a number — no dashes');
 ok(kinds.length<await p.locator('.st tbody tr').count(),'and the people who did not move carry no mark');

 console.log('\n— the arrows are the real difference, not decoration —');
 const chk=await p.evaluate(()=>{
   const wk=lastCompleteWeek(S.games);
   const before=standings(S.games, wk-1), now=standings(S.games, wk);
   const was=new Map(before.map(r=>[r.p.id,r.rank]));
   const out=[];
   document.querySelectorAll('.st tbody tr').forEach((tr,i)=>{
     const r=now[i]; const el=tr.querySelector('.tr');
     const shown=!el?0:el.classList.contains('up')?+el.innerText.replace('▲','')
       :el.classList.contains('dn')?-+el.innerText.replace('▼',''):0;
     out.push({name:r.p.display_name, expect:was.get(r.p.id)-r.rank, shown});
   });
   return {wk, out};
 });
 ok(chk.wk>=2,`measured on the last COMPLETE week (week ${chk.wk})`);
 const wrong=chk.out.filter(r=>r.expect!==r.shown);
 ok(wrong.length===0,`all ${chk.out.length} match a re-derived ranking`+(wrong.length?': '+JSON.stringify(wrong[0]):''));
 // ⚠️ NOT a permutation: tied players share a rank and the next rank is
 // skipped, so the moves do not have to sum to zero. What must hold is that
 // the table is a valid ranking and no move exceeds the field size.
 const ranks=await p.$$eval('.st tbody tr td:first-child',n=>n.map(x=>parseInt(x.innerText,10)));
 ok(ranks[0]===1,'the table starts at rank 1');
 ok(ranks.every((v,i)=>i===0||v>=ranks[i-1]),'and never goes backwards');
 ok(chk.out.every(r=>Math.abs(r.shown)<chk.out.length),'no move is larger than the field');

 console.log('\n— it never invents history —');
 const early=await p.evaluate(()=>{
   const only1={1:S.games[1]||[]};
   return { one:trendMap(only1)===null, none:trendMap({})===null };
 });
 ok(early.one,'week 1 alone produces no arrows');
 ok(early.none,'and neither does a league with no games');

 console.log('\n— and it costs the table nothing —');
 const heads=await p.$$eval('.st thead th',n=>n.map(x=>x.innerText.trim()));
 ok(heads.length===4,`still four columns (${heads.join('/')})`);
 const ell=await p.evaluate(()=>[...document.querySelectorAll('.st .nm')].map(e=>e.innerText.trim()).filter(t=>/…/.test(t)));
 ok(ell.length===0,'no name truncated');
 const lines=await p.evaluate(()=>{const r=[...document.querySelectorAll('.st .nm')].map(e=>e.getBoundingClientRect().height);
   const one=Math.min(...r); return r.filter(h=>h>one*1.6).length;});
 ok(lines===0,'every name still on one line');
 const fs=await p.evaluate(()=>parseFloat(getComputedStyle(document.querySelector('.st .tr')).fontSize));
 ok(fs>=13,`the mark is small but legible (${fs}px)`);
 ok(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'no sideways scroll');

 console.log('\n— the two standings views still agree —');
 await p.click('[data-stview="grid"]'); await sleep(600);
 ok(await p.locator('.gr').count()===1,'the week-by-week grid still renders');
 await p.click('[data-stview="table"]'); await sleep(500);
 // ⚠️ NOT `=== rows` — only movers carry a mark now, so compare against the
 // count we actually saw a moment ago.
 ok(await p.locator('.st .tr').count()===kinds.length,`and coming back the ${kinds.length} arrows are still there`);
 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 } finally { await b.close(); }
 console.log(`\n${pass} passed, ${fail} failed\n`);
 process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
