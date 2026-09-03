const { chromium } = require('/tmp/fs/node_modules/playwright-core');
let pass=0,fail=0; const ok=(c,m)=>{if(c){pass++;console.log('  ✓ '+m);}else{fail++;console.log('  ✗ '+m);}};
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
 const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const page=await ctx.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(e.message));
 await page.goto('http://127.0.0.1:8099/',{waitUntil:'networkidle'});
 await page.click('#first-demo'); await page.waitForSelector('#tabs:not([hidden])');

 // become someone with no picks yet
 const tok=await page.evaluate(()=>{
   const db=JSON.parse(localStorage.getItem('survivor:local'));
   const withPicks=new Set(db.picks.map(p=>p.player_id));
   const fresh=db.players.find(p=>!withPicks.has(p.id))||db.players[0];
   db.picks=db.picks.filter(p=>p.player_id!==fresh.id);
   localStorage.setItem('survivor:local',JSON.stringify(db));
   localStorage.removeItem('survivor:welcomed');
   return fresh.token;});
 await page.goto('http://127.0.0.1:8099/?u='+tok,{waitUntil:'networkidle'});
 await page.waitForTimeout(700);

 console.log('\n— a first-timer arriving from a text —');
 ok(await page.locator('.welcome').count()===1,'gets a welcome card');
 const w=await page.locator('.welcome').innerText();
 ok(/one team you think will win/i.test(w),'told what to do in one sentence');
 ok(/never knocked out/i.test(w),'told the rule that makes this pool different');
 ok(/can't pick the same team twice/i.test(w),'told the only rule they must remember');
 ok(/nothing to install/i.test(w),'reassured there is nothing to install');
 ok(await page.locator('#s-pick .pk').count()>0,'the games are right there underneath it');

 console.log('\n— and it gets out of the way —');
 await page.click('#wl-ok'); await page.waitForTimeout(300);
 ok(await page.locator('.welcome').count()===0,'dismissing removes it');
 await page.reload({waitUntil:'networkidle'}); await page.waitForTimeout(700);
 ok(await page.locator('.welcome').count()===0,'and it stays gone after a reload');

 console.log('\n— it never returns once they are playing —');
 await page.evaluate(()=>localStorage.removeItem('survivor:welcomed'));
 await page.reload({waitUntil:'networkidle'}); await page.waitForTimeout(700);
 const t=await page.evaluate(()=>{const x=Array.from(document.querySelectorAll('#s-pick .pk')).find(e=>!e.disabled);return x?x.dataset.team:null;});
 await page.click(`#s-pick .pk[data-team="${t}"]`); await page.waitForTimeout(350);
 await page.click('#cf-yes'); await page.waitForTimeout(600);
 ok(await page.locator('.welcome').count()===0,'once a pick exists the card never shows again');

 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 console.log(`\n${pass} passed, ${fail} failed\n`);
 await b.close(); process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
