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
 // make a pick so the "you can still change it" card is on screen
 const t=await p.evaluate(()=>{const b=[...document.querySelectorAll('#s-pick .pk')].find(x=>!x.disabled);return b?b.dataset.team:null;});
 await p.click(`#s-pick .pk[data-team="${t}"]`); await sleep(400);
 await p.click('#cf-yes'); await sleep(800);

 console.log('\n— the pick card says who, when and where to watch —');
 const card=await p.locator('.locked').innerText();
 console.log('    '+card.replace(/\n/g,'\n    '));
 ok(await p.locator('.locked .lk-meta').count()===2,'two supporting lines: the fixture and the channel');
 const meta=await p.$$eval('.locked .lk-meta',n=>n.map(x=>x.innerText.trim()));
 ok(/^(at home to|away at) the .+ · .+/.test(meta[0]),`the opponent and the kickoff: "${meta[0]}"`);
 ok(/\d?\d:\d\d (AM|PM)$/.test(meta[0]),'ending in a real kickoff time');
 ok(/^📺 .+/.test(meta[1]),`the channel: "${meta[1]}"`);
 ok(/FOX|CBS|NBC|ESPN|Prime/.test(meta[1]),'and it is a real broadcaster');
 ok(await p.locator('.locked .lk-hint').count()===1,'the "you can still change it" line is still there');

 console.log('\n— it says the same thing the confirmation did —');
 const t2=await p.evaluate(()=>{const b=[...document.querySelectorAll('#s-pick .pk')].find(x=>!x.disabled&&!x.classList.contains('chosen'));return b?b.dataset.team:null;});
 await p.click(`#s-pick .pk[data-team="${t2}"]`); await sleep(400);
 const cf=(await p.locator('.cf-game').innerText()).trim();
 await p.click('#cf-yes'); await sleep(800);
 const m2=(await p.locator('.locked .lk-meta').first().innerText()).trim();
 ok(cf===m2,`the card and the confirmation word it identically ("${m2}")`);
 ok(/matchupLine\(g, team\)/.test(require('fs').readFileSync('/tmp/fs/survivor.js','utf8')),'because both call one function');

 console.log('\n— order and legibility —');
 const box=await p.evaluate(()=>{
   const q=(s)=>document.querySelector(s).getBoundingClientRect();
   const cs=(s)=>getComputedStyle(document.querySelector(s));
   return { team:q('.lk-team').top, meta:q('.lk-meta').top, hint:q('.lk-hint').top,
            mf:parseFloat(cs('.lk-meta').fontSize), hf:parseFloat(cs('.lk-hint').fontSize) };
 });
 ok(box.meta>box.team,'the fixture sits under the team name');
 ok(box.hint>box.meta,'and the instruction sits under the fixture, not above it');
 ok(box.mf>=15.5&&box.hf>=15.5,`both clear the type floor (${box.mf}px / ${box.hf}px)`);
 ok(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'no sideways scroll');
 const contrast=await p.evaluate(()=>{
   const lum=(r,g,b)=>{const f=(v)=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);};return .2126*f(r)+.7152*f(g)+.0722*f(b);};
   const px=(c)=>c.match(/[\d.]+/g).map(Number);
   const e=document.querySelector('.lk-meta'), cs=getComputedStyle(e);
   const op=parseFloat(cs.opacity); let fg=px(cs.color);
   // the card is a gradient; sample its darkest declared stop as the ground
   const bg=[184,148,47];
   fg=[0,1,2].map(i=>fg[i]*op+bg[i]*(1-op));
   const a=lum(...fg), b2=lum(...bg); const hi=Math.max(a,b2), lo=Math.min(a,b2);
   return (hi+.05)/(lo+.05);
 });
 ok(contrast>=4.5,`readable on the gold fill: ${contrast.toFixed(2)}:1`);

 console.log('\n— a game with no listed channel just shows the fixture —');
 await p.evaluate(()=>{ (S.games[S.week]||[]).forEach(g=>{g.tv='';}); render(); });
 await sleep(400);
 ok(await p.locator('.locked .lk-meta').count()===1,'one line, no empty 📺');
 ok(await p.locator('.locked .lk-hint').count()===1,'and the instruction survives');

 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 } finally { await b.close(); }
 console.log(`\n${pass} passed, ${fail} failed\n`);
 process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
