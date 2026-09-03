const { chromium } = require('/home/user/Sports-Hub/survivor/node_modules/playwright-core');
let pass=0,fail=0; const ok=(c,m)=>{if(c){pass++;console.log('  ✓ '+m);}else{fail++;console.log('  ✗ '+m);}};
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
 const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto('http://127.0.0.1:8099/',{waitUntil:'networkidle'});
 await p.click('#first-demo'); await p.waitForSelector('#tabs:not([hidden])'); await p.waitForTimeout(1500);
 const live=await p.evaluate(()=>S.liveWeek);

 console.log('\n— on the current week there is nothing extra —');
 ok(live>0,`the app knows the live week is ${live}`);
 ok(await p.locator('#s-pick .backnow').count()===0,'no jump-back button when you are already there');
 ok(!/not this week/i.test(await p.locator('#s-pick .wknav').innerText()),'and no warning label');

 console.log('\n— wander back a few weeks —');
 for (let i=0;i<3;i++){ await p.click('#s-pick .wknav [data-week]:not([disabled])'); await p.waitForTimeout(400); }
 const at=await p.evaluate(()=>S.week);
 ok(at===live-3,`now looking at week ${at}`);
 ok(await p.locator('#s-pick .backnow').count()>0,'a jump-back button appears');
 const label=await p.locator('#s-pick .backnow').first().innerText();
 ok(new RegExp('Week '+live).test(label),`and it names where it goes: "${label.trim()}"`);
 ok(/not this week/i.test(await p.locator('#s-pick .wknav').first().innerText()),'the week label warns you are off-week');

 console.log('\n— one tap home —');
 await p.click('#s-pick .backnow'); await p.waitForTimeout(700);
 ok(await p.evaluate(()=>S.week)===live,`back on week ${live}`);
 ok(await p.locator('#s-pick .backnow').count()===0,'and the button is gone again');
 ok(await p.evaluate(()=>S.weekPinned)===false,'it also un-pins, so the app follows the season again');

 console.log('\n— it works forwards too —');
 await p.click('#s-pick .wknav [data-week]:not([disabled]):last-of-type'); await p.waitForTimeout(400);
 const fwd=await p.evaluate(()=>S.week);
 ok(fwd>live,`looking ahead at week ${fwd}`);
 ok(await p.locator('#s-pick .backnow').count()>0,'the jump-back is offered going forward as well');
 await p.click('#s-pick .backnow'); await p.waitForTimeout(600);
 ok(await p.evaluate(()=>S.week)===live,'and returns');

 console.log('\n— on the standings too —');
 await p.click('.tab[data-screen="standings"]'); await p.waitForTimeout(500);
 await p.click('#s-standings .wknav [data-week]:not([disabled])'); await p.waitForTimeout(500);
 ok(await p.locator('#s-standings .backnow').count()>0,'the standings week nav offers it as well');
 await p.click('#s-standings .backnow'); await p.waitForTimeout(600);
 ok(await p.evaluate(()=>S.week)===live,'and returns from there');

 console.log('\n— reachable —');
 await p.click('.tab[data-screen="pick"]'); await p.waitForTimeout(300);
 await p.click('#s-pick .wknav [data-week]:not([disabled])'); await p.waitForTimeout(500);
 const h=await p.evaluate(()=>document.querySelector('#s-pick .backnow').getBoundingClientRect().height);
 ok(h>=56,`the button clears the tap-target floor (${h.toFixed(0)}px)`);
 ok(!(await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)),'no overflow');

 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 console.log(`\n${pass} passed, ${fail} failed\n`);
 await b.close(); process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
