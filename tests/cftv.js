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
 await sleep(1400);
 // a week where the pick is still open, so the confirm panel is reachable
 await p.evaluate(async()=>{ S.weekPinned=true; S.week=S.liveWeek+1; await ensureWeeks([S.week]); render(); });
 await sleep(800);

 console.log('\n— the confirm panel says where to watch —');
 const t=await p.evaluate(()=>{const b=[...document.querySelectorAll('#s-pick .pk')].find(x=>!x.disabled);return b?b.dataset.team:null;});
 await p.click(`#s-pick .pk[data-team="${t}"]`); await sleep(450);
 ok(await p.evaluate(()=>!document.querySelector('#confirm').hidden),'the confirm panel is up');
 ok(await p.locator('.cf-tv').count()===1,'it carries a channel line');
 const tv=(await p.locator('.cf-tv').innerText()).trim();
 ok(/^📺 .+/.test(tv),`named, with a screen icon: "${tv}"`);
 ok(/FOX|CBS|NBC|ESPN|Prime/.test(tv),'and it is a real broadcaster');
 const body=await p.locator('#confirm-body').innerText();
 ok(body.indexOf(tv.replace('📺 ',''))>body.indexOf('at the'),'it sits under the kickoff line, not jammed into it');
 const fs=await p.evaluate(()=>parseFloat(getComputedStyle(document.querySelector('.cf-tv')).fontSize));
 ok(fs>=15.5,`readable at ${fs}px`);
 ok(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'no sideways scroll');

 console.log('\n— a game with no listed channel just says nothing —');
 await p.click('#cf-no'); await sleep(300);
 await p.evaluate(()=>{ (S.games[S.week]||[]).forEach(g=>{g.tv='';}); render(); });
 await sleep(300);
 const t2=await p.evaluate(()=>{const b=[...document.querySelectorAll('#s-pick .pk')].find(x=>!x.disabled);return b?b.dataset.team:null;});
 await p.click(`#s-pick .pk[data-team="${t2}"]`); await sleep(400);
 ok(await p.locator('.cf-tv').count()===0,'no empty 📺 line when ESPN lists no broadcast');
 ok(await p.locator('.cf-game').count()===1,'the rest of the panel is unchanged');
 await p.click('#cf-no'); await sleep(250);

 console.log('\n— the channel is read the way ESPN publishes it —');
 const src=require('fs').readFileSync('/home/user/Sports-Hub/survivor/survivor.js','utf8');
 ok(/geoBroadcasts/.test(src),'geoBroadcasts is read');
 ok(/comp\.broadcasts \|\| \[\]/.test(src),'with broadcasts as the fallback');
 const shapes=await p.evaluate(()=>{
   const mk=(comp)=>normGame({id:'x',date:new Date().toISOString(),competitions:[Object.assign({competitors:[
     {homeAway:'home',team:{abbreviation:'KC'},score:'0'},{homeAway:'away',team:{abbreviation:'DEN'},score:'0'}]},comp)]},1);
   return {
     geo: mk({geoBroadcasts:[{media:{shortName:'FOX'}}],broadcasts:[{names:['ignored']}]}).tv,
     bc:  mk({broadcasts:[{names:['CBS']}]}).tv,
     dup: mk({geoBroadcasts:[{media:{shortName:'NBC'}},{media:{callLetters:'NBC'}}]}).tv,
     none: mk({}).tv,
   };
 });
 ok(shapes.geo==='FOX','geoBroadcasts wins when present');
 ok(shapes.bc==='CBS','plain broadcasts still work');
 ok(shapes.dup==='NBC','a channel listed twice is named once');
 ok(shapes.none==='','and nothing is invented when there is nothing');

 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 } finally { await b.close(); }
 console.log(`\n${pass} passed, ${fail} failed\n`);
 process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
