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
 await p.click('.tab[data-screen="standings"]'); await sleep(700);

 console.log('\n— the standings are four columns again —');
 const heads=await p.$$eval('.st thead th',n=>n.map(x=>x.innerText.trim()));
 console.log('    '+heads.join(' | '));
 ok(heads.length===4,`four headers, not five (${heads.length})`);
 ok(!heads.some(h=>/left/i.test(h)),'nothing says "left"');
 const cells=await p.$$eval('.st tbody tr',n=>n.map(r=>r.children.length));
 ok(cells.every(c=>c===4),'and every row has four cells');
 const note=await p.locator('#s-standings .sub').first().innerText();
 ok(!/32 NFL teams/i.test(note),'the note no longer explains a column that is gone');
 ok(/tiebreaker/i.test(note),'but still explains points');

 console.log('\n— nothing else lost the count —');
 await p.click('.tab[data-screen="history"]'); await sleep(700);
 const hist=await p.locator('#s-history').innerText();
 ok(/teams left/i.test(hist),'My Picks still shows YOUR teams left, where it is about you');
 ok(/Teams you.{0,3}ve used/i.test(hist),'and lists which ones you have spent');
 await p.click('.tab[data-screen="stats"]'); await sleep(800);
 ok(/teams left/i.test(await p.locator('#s-stats').innerText()),'Stats still carries it too');

 console.log('\n— and the table reads better for the room —');
 await p.click('.tab[data-screen="standings"]'); await sleep(600);
 const ell=await p.evaluate(()=>[...document.querySelectorAll('.st .nm')].map(e=>e.innerText.trim()).filter(t=>/…|\.\.\.$/.test(t)));
 ok(ell.length===0,'still no truncated names'+(ell.length?': '+ell.join(', '):''));
 const lines=await p.evaluate(()=>{
   // A short name like "Kate" is one line by definition — measure against the
   // shortest row rather than a guessed line-height.
   const rows=[...document.querySelectorAll('.st .nm')];
   const h=rows.map(e=>e.getBoundingClientRect().height);
   const one=Math.min(...h);
   return rows.filter((e,i)=>h[i]>one*1.6).map(e=>e.innerText.trim());
 });
 ok(lines.length===0,'and with the column gone every name fits on ONE line'+(lines.length?': '+lines.join(', '):''));
 ok(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'no sideways scroll');
 const clip=await p.evaluate(()=>[...document.querySelectorAll('.st th,.st td')].filter(e=>e.scrollWidth>e.clientWidth+1).length);
 ok(clip===0,'no cell clips its contents');
 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 } finally { await b.close(); }
 console.log(`\n${pass} passed, ${fail} failed\n`);
 process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
