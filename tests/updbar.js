const { chromium } = require('/home/user/Sports-Hub/survivor/node_modules/playwright-core');
const fs=require('fs');
const JS='/home/user/Sports-Hub/survivor/survivor.js';
let pass=0,fail=0; const ok=(c,m)=>{if(c){pass++;console.log('  ✓ '+m);}else{fail++;console.log('  ✗ '+m);}};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const orig=fs.readFileSync(JS,'utf8');
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
 const ctx=await b.newContext({viewport:{width:390,height:844}});
 const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 try {

 console.log('\n— no bar, no chore —');
 await p.goto('http://127.0.0.1:8099/',{waitUntil:'networkidle'});
 await sleep(900);
 ok(await p.locator('#updbar').count()===0,'the "Update now" bar is gone from the shell');
 ok(!/updbar/.test(fs.readFileSync('/home/user/Sports-Hub/survivor/survivor.css','utf8')),'and its CSS with it');
 ok(await p.evaluate(()=>updStamp!==null),'the running copy was fingerprinted at boot');

 console.log('\n— a shipped change reloads the phone by itself —');
 let navs=0; p.on('framenavigated',f=>{if(f===p.mainFrame())navs++;});
 fs.writeFileSync(JS, orig+'\n// shipped\n');
 await sleep(1100);                                   // mtime granularity
 await p.evaluate(()=>checkForUpdate(true));
 await p.waitForLoadState('networkidle').catch(()=>{});
 await sleep(1400);
 ok(navs>=1,`the page reloaded with nobody tapping anything (${navs} navigation)`);
 ok(await p.evaluate(()=>!!document.querySelector('header .hd-name')),'and came back up');
 fs.writeFileSync(JS, orig);
 await sleep(1100);

 console.log('\n— but never over a pick being made —');
 await p.reload({waitUntil:'networkidle'}); await sleep(900);
 const held=await p.evaluate(async()=>{
   S.confirming={team:'KC'}; S.reloading=false;
   applyUpdate();                       // would reload if it did not check
   await new Promise(r=>setTimeout(r,300));
   const a=S.reloading; S.confirming=null; return a;});
 ok(held===false,'a confirm dialog open holds the reload back');
 const held2=await p.evaluate(async()=>{
   S.saving=true; S.reloading=false; applyUpdate();
   await new Promise(r=>setTimeout(r,300));
   const a=S.reloading; S.saving=false; return a;});
 ok(held2===false,'a pick still being written holds it back too');
 ok(/setTimeout\(applyUpdate, 4000\)/.test(orig),'and it waits rather than skipping — the update still lands');
 ok(/S\.saving = true/.test(orig)&&/finally \{ S\.saving = false; \}/.test(orig),'savePick raises and always lowers the flag');

 console.log('\n— the source says what it does —');
 ok(/controllerchange[\s\S]{0,200}applyUpdate\(\)/.test(orig),'the worker taking over reloads again');
 ok(!/upd-go/.test(orig),'no button handler left behind');
 ok(/first read IS what we run/.test(orig),'the first fingerprint read is still only a baseline');

 console.log('\n— a first read is never a change —');
 await p.evaluate(()=>{S.reloading=false;updStamp=null;});
 await p.evaluate(()=>checkForUpdate(true)); await sleep(400);
 ok(await p.evaluate(()=>S.reloading)===false,'so a fresh page does not reload itself on boot');
 ok(await p.evaluate(async()=>{const a=await fileStamp();const b=await fileStamp();return a===b&&a!==null;}),'two reads of an unchanged file match');

 console.log('\n— the result line: margin and score are separate things —');
 await p.goto('http://127.0.0.1:8099/',{waitUntil:'networkidle'});
 const first=await p.locator('#first-demo').count();
 if (first) { await p.click('#first-demo'); await p.waitForSelector('#tabs:not([hidden])'); }
 await sleep(1200);
 // walk back to a week that has a graded pick for whoever we are
 let txt='';
 for (let i=0;i<6 && !/won by|lost by/i.test(txt);i++){
   await p.evaluate(()=>{S.weekPinned=true;S.week=Math.max(1,S.week-1);render();});
   await sleep(700);
   txt=await p.locator('.locked').count() ? await p.locator('.locked').innerText() : '';
 }
 ok(/won by|lost by/i.test(txt),'found a graded, locked-in pick: "'+txt.replace(/\n/g,' | ')+'"');
 ok(await p.locator('.lk-res').count()===1,'the verdict is its own element');
 ok(await p.locator('.lk-score').count()===1,'and the score is its own element');
 const v=await p.locator('.lk-res').innerText(), sc=await p.locator('.lk-score').innerText();
 ok(/^(Won|Lost) by \d+$/.test(v.trim()),`the verdict says only the margin: "${v.trim()}"`);
 ok(/^Final score: .+ \d+,\s*.+ \d+$/.test(sc.trim()),`the score names both teams: "${sc.trim()}"`);
 ok(!/—\s*\d+-\d+/.test(txt),'the "— 19-26" run of dashes is gone');
 ok((v.match(/-/g)||[]).length===0,'no dash in the verdict at all');
 const boxes=await p.evaluate(()=>{const a=document.querySelector('.lk-res').getBoundingClientRect(),
   b=document.querySelector('.lk-score').getBoundingClientRect();return {ay:a.top,by:b.top,af:parseFloat(getComputedStyle(document.querySelector('.lk-res')).fontSize),bf:parseFloat(getComputedStyle(document.querySelector('.lk-score')).fontSize)};});
 ok(boxes.by>boxes.ay+4,'they are on separate lines, not run together');
 ok(boxes.bf<boxes.af,'and the score is visibly the secondary of the two');
 ok(boxes.bf>=15,`the score is still readable (${boxes.bf.toFixed(1)}px)`);
 ok(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'no sideways scroll');

 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 } finally { fs.writeFileSync(JS,orig); await b.close(); }
 console.log(`\n${pass} passed, ${fail} failed\n`);
 process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
