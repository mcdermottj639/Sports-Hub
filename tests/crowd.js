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
 await sleep(1600);
 await p.click('.tab[data-screen="stats"]'); await sleep(1600);

 console.log('\n— head to head is gone —');
 const txt=await p.locator('#s-stats').innerText();
 ok(!/head to head/i.test(txt),'no "Head to head" heading');
 ok(await p.locator('#h2h-a, #h2h-b, #h2h-out').count()===0,'and none of its controls remain');
 const src=require('fs').readFileSync('/tmp/fs/survivor.js','utf8');
 ok(!/headToHead|paintH2H|h2h-/.test(src),'no dead code left behind either');
 ok(!/\.h2h/.test(require('fs').readFileSync('/tmp/fs/survivor.css','utf8')),'nor its CSS');

 console.log('\n— the crowd card is there and says something —');
 ok(/with the crowd, or against it/i.test(txt),'the new heading is up');
 ok(await p.locator('.cw-row:not(.cw-hd)').count()>0,`${await p.locator('.cw-row:not(.cw-hd)').count()} people listed`);
 const head=(await p.locator('.cw-head').innerText()).trim();
 console.log('    '+head.replace(/\n/g,' | '));
 ok(/most of the family picked has won \d+ of \d+ week/i.test(head),'it states the crowd\'s record');
 ok(/paid off|exactly even/i.test(head),'and tells you what that means');
 const key=await p.locator('.cw-key').innerText();
 ok(/went with the crowd/i.test(key),'the key says what the two columns are');
 ok(key.length<=110,`and stays a footnote, not a lecture (${key.length} chars)`);

 console.log('\n— the numbers hold up —');
 const chk=await p.evaluate(()=>{
   const c=crowdStats();
   const rows=[...document.querySelectorAll('.cw-row:not(.cw-hd)')].map(r=>({
     nm:r.querySelector('.cw-nm').innerText.replace(/\s*\(you\)$/,'').trim(),
     pct:+(r.querySelector('.cw-v').innerText.match(/^(\d+)/)||[0,0])[1],
     solo:r.querySelector('.cw-s').innerText.trim(),
   }));
   return { c:{weeks:c.weeks.length, w:c.crowdW, l:c.crowdL, t:c.crowdT, per:c.per.length}, rows,
     model:c.per.map(x=>({nm:x.pl.display_name, pct:x.withN,
       solo:x.alone?`${x.aw}-${x.al}`:'—', played:x.played, sum:x.withN+x.alone})) };
 });
 ok(chk.c.weeks>0,`${chk.c.weeks} settled weeks had a single crowd pick`);
 // ⚠️ A tie is a real outcome here (house rule 6), so W+L does NOT have to
 // equal the week count — the card names the tied weeks separately.
 ok(chk.c.w+chk.c.l+chk.c.t===chk.c.weeks,`every one is a win, a loss or a tie (${chk.c.w}/${chk.c.l}/${chk.c.t} of ${chk.c.weeks})`);
 if (chk.c.t) ok(new RegExp(`tied ${chk.c.t}`).test(head),`and the ${chk.c.t} tied weeks are named, not silently dropped`);
 ok(chk.rows.length===chk.model.length,'a row per person with picks');
 const bad=chk.rows.filter((r,i)=>r.nm!==chk.model[i].nm||r.pct!==chk.model[i].pct||r.solo!==chk.model[i].solo);
 ok(bad.length===0,'every rendered row matches the model'+(bad.length?': '+JSON.stringify(bad[0]):''));
 ok(chk.model.every(m=>m.sum===m.played),'with-the-crowd plus on-your-own equals weeks played, for everyone');
 ok(chk.rows.every(r=>r.pct>=0&&r.pct<=chk.c.weeks),`no count above the ${chk.c.weeks} settled weeks`);
 ok(chk.rows[0].pct<=chk.rows[chk.rows.length-1].pct,'sorted most-contrarian first');
 const hd=await p.locator('.cw-hd').innerText();
 ok(/went with them/i.test(hd)&&/on your own/i.test(hd),'both columns are labelled: "'+hd.replace(/\n/g,' / ')+'"');
 ok(!/%/.test(await p.locator('.cw-list').innerText()),'no percentages — counts, because five weeks is not a percentage');

 console.log('\n— it can never leak a hidden pick —');
 ok(/pickVisible/.test(src.split('function crowdStats')[1].split('function ')[0]),'crowdStats filters through pickVisible');
 const leak=await p.evaluate(()=>{
   // hide every pick of the newest week, then confirm that week stops counting
   const wk=S.liveWeek; const before=crowdStats().weeks.length;
   const saved=(S.games[wk]||[]).map(g=>g.state);
   (S.games[wk]||[]).forEach(g=>{g.state='pre';});
   const after=crowdStats().weeks.length;
   (S.games[wk]||[]).forEach((g,i)=>{g.state=saved[i];});
   return { before, after };
 });
 ok(leak.after<=leak.before,`a week whose games have not kicked off is not counted (${leak.before} -> ${leak.after})`);

 console.log('\n— it fits —');
 ok(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'no sideways scroll');
 const clip=await p.evaluate(()=>[...document.querySelectorAll('.cw-row *')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.innerText).slice(0,3));
 ok(clip.length===0,'nothing clips'+(clip.length?': '+clip.join(', '):''));
 const small=await p.evaluate(()=>[...document.querySelectorAll('.cw-row *, .cw-head *')].filter(e=>{
   const t=[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
   return t && parseFloat(getComputedStyle(e).fontSize)<15.5;}).length);
 ok(small===0,'nothing under the 15.5px type floor');
 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 } finally { await b.close(); }
 console.log(`\n${pass} passed, ${fail} failed\n`);
 process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
