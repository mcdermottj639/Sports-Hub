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
 const g = await p.evaluate(async()=>{
   S.weekPinned=true; S.week=S.liveWeek; await ensureWeeks([S.week]);
   const gs=(S.games[S.week]||[]).slice().sort((a,b)=>new Date(a.date)-new Date(b.date));
   return gs.map(x=>({state:x.state,when:kickWhen(x),tv:x.tv,st:x.statusText,hs:x.home.score,as:x.away.score,t:new Date(x.date).getTime()}));
 });

 console.log('\n— every kickoff is a real NFL slot —');
 const SLOTS=/(1:00 PM|4:05 PM|4:25 PM|8:20 PM|8:15 PM)$/;
 const bad=g.filter(x=>!SLOTS.test(x.when));
 ok(bad.length===0,'no invented times'+(bad.length?': '+bad.map(x=>x.when).join(', '):''));
 ok(!g.some(x=>/ AM$/.test(x.when)),'nothing kicks off in the morning');
 ok(g.filter(x=>/Thu/.test(x.when)).length===1,'exactly one Thursday night game');
 ok(g.filter(x=>/Mon/.test(x.when)).length===1,'exactly one Monday night game');
 ok(g.filter(x=>/8:20 PM/.test(x.when)).length===1,'exactly one Sunday night game');
 ok(g.filter(x=>/1:00 PM/.test(x.when)).length>=6,`the 1:00 window is the bulk of the slate (${g.filter(x=>/1:00 PM/.test(x.when)).length})`);
 ok(g.filter(x=>/4:0|4:2/.test(x.when)).length>=2,'and there is a late-afternoon window');

 console.log('\n— the NFL order, and the app agrees with it —');
 const order=g.map(x=>x.when);
 console.log('    '+order.join('\n    '));
 ok(order.every((w,i)=>i===0||g[i].t>=g[i-1].t),'games are in kickoff order');
 ok(/Thu/.test(order[0]),'Thursday leads');
 ok(/Mon/.test(order[order.length-1]),'Monday night closes it');
 const idx=(re)=>order.findIndex(w=>re.test(w));
 ok(idx(/1:00 PM/)<idx(/4:05 PM/),'1:00 before 4:05');
 ok(idx(/4:05 PM/)<idx(/4:25 PM/),'4:05 before 4:25');
 ok(idx(/4:25 PM/)<idx(/8:20 PM/),'4:25 before Sunday night');

 console.log('\n— the state still makes a testable week —');
 ok(g.some(x=>x.state==='post'),'something has finished');
 ok(g.filter(x=>x.state==='in').length>=3,`several are being played (${g.filter(x=>x.state==='in').length})`);
 const pre=g.filter(x=>x.state==='pre');
 ok(pre.length>=4,`and enough are still pickable (${pre.length})`);
 ok(pre.every(x=>x.t>Date.now()),'every "still to play" game really is in the future');
 ok(g.filter(x=>x.state==='in').every(x=>x.t<=Date.now()),'and every live one really has kicked off');

 console.log('\n— a first-quarter game looks like one —');
 const live=g.filter(x=>x.state==='in');
 ok(live.every(x=>/^1Q · \d{1,2}:\d\d$/.test(x.st)),'the clock reads like a first quarter: '+live[0].st);
 const top=Math.max(...live.map(x=>Math.max(x.hs,x.as)));
 ok(top<=14,`nobody has 20 points in the first quarter (highest is ${top})`);

 console.log('\n— the broadcast matches the slot —');
 ok(g.find(x=>/Thu/.test(x.when)).tv==='Prime Video','Thursday is on Prime');
 ok(g.find(x=>/Mon/.test(x.when)).tv==='ESPN','Monday is on ESPN');
 ok(g.find(x=>/8:20 PM/.test(x.when)).tv==='NBC','Sunday night is on NBC');

 console.log('\n— and the instants are still relative, not pinned —');
 const src=require('fs').readFileSync('/tmp/fs/survivor.js','utf8');
 ok(/const hours = \(h\) => new Date\(Date\.now\(\)/.test(src),'kickoffs are still built off Date.now()');
 ok(/whenLabel/.test(src)&&/kickWhen/.test(src),'the label is a separate field, so the deadline is untouched');

 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 } finally { await b.close(); }
 console.log(`\n${pass} passed, ${fail} failed\n`);
 process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
