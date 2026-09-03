const { chromium } = require('/home/user/Sports-Hub/survivor/node_modules/playwright-core');
let pass=0,fail=0; const ok=(c,m)=>{if(c){pass++;console.log('  ✓ '+m);}else{fail++;console.log('  ✗ '+m);}};
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
 const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const page=await ctx.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(e.message));
 await page.goto('http://127.0.0.1:8099/',{waitUntil:'networkidle'});
 await page.click('#first-demo'); await page.waitForSelector('#tabs:not([hidden])'); await page.waitForTimeout(1200);
 // start from a clean slate this week
 await page.evaluate(async()=>{await S.store.adminSetPick(S.me.token,S.me.id,S.week,null);await reloadPicks();render();});
 await page.waitForTimeout(300);

 console.log('\n— an accidental tap does NOT save —');
 const before=await page.evaluate(()=>(pickIn(S.me.id,S.week)||{}).team||null);
 const team=await page.evaluate(()=>{const x=Array.from(document.querySelectorAll('#s-pick .pk')).find(e=>!e.disabled);return x.dataset.team;});
 await page.click(`#s-pick .pk[data-team="${team}"]`); await page.waitForTimeout(350);
 ok(await page.locator('#confirm').isVisible(),'a confirmation appears instead');
 const mid=await page.evaluate(()=>(pickIn(S.me.id,S.week)||{}).team||null);
 ok(mid===before,'nothing is saved yet');
 const c=await page.locator('#confirm-body').innerText();
 ok(/is this right/i.test(c),'it asks plainly');
 ok(c.includes(await page.evaluate(t=>teamName(t),team)),'names the full team');
 ok(/still change it/i.test(c),'and says it can still be changed');
 ok(await page.locator('#cf-yes').count()===1 && await page.locator('#cf-no').count()===1,'two clear answers');

 console.log('\n— backing out changes nothing —');
 await page.click('#cf-no'); await page.waitForTimeout(300);
 ok(await page.locator('#confirm').isHidden(),'the confirmation closes');
 ok(await page.evaluate(()=>(pickIn(S.me.id,S.week)||{}).team||null)===before,'still no pick saved');
 ok(await page.evaluate(()=>getComputedStyle(document.body).position)!=='fixed','the page is not left pinned');

 console.log('\n— confirming saves —');
 await page.click(`#s-pick .pk[data-team="${team}"]`); await page.waitForTimeout(300);
 await page.click('#cf-yes'); await page.waitForTimeout(600);
 ok(await page.evaluate(()=>(pickIn(S.me.id,S.week)||{}).team)===team,`the pick is saved (${team})`);
 ok(await page.locator('#confirm').isHidden(),'and the confirmation is gone');
 ok(await page.locator('.locked').isVisible(),'the big confirmation card shows');

 console.log('\n— changing a pick says what it replaces —');
 const other=await page.evaluate(()=>{const x=Array.from(document.querySelectorAll('#s-pick .pk')).find(e=>!e.disabled&&!e.classList.contains('chosen'));return x.dataset.team;});
 await page.click(`#s-pick .pk[data-team="${other}"]`); await page.waitForTimeout(300);
 const c2=await page.locator('#confirm-body').innerText();
 ok(/this replaces your pick/i.test(c2),'it warns you are replacing something');
 ok(c2.includes(await page.evaluate(t=>teamShort(t),team)),'and names the team being dropped');
 await page.click('#cf-no'); await page.waitForTimeout(250);
 ok(await page.evaluate(()=>(pickIn(S.me.id,S.week)||{}).team)===team,'backing out keeps the original');

 console.log('\n— safety details —');
 await page.click(`#s-pick .pk[data-team="${other}"]`); await page.waitForTimeout(300);
 ok(await page.evaluate(()=>document.activeElement.id)==='cf-no','the SAFE option holds focus, not the committing one');
 const sizes=await page.evaluate(()=>({yes:document.querySelector('#cf-yes').getBoundingClientRect().height,
                                       no:document.querySelector('#cf-no').getBoundingClientRect().height}));
 ok(sizes.no>=66&&sizes.yes>=66,`both answers are full size (yes ${sizes.yes.toFixed(0)}px, no ${sizes.no.toFixed(0)}px)`);
 await page.keyboard.press('Escape'); await page.waitForTimeout(250);
 ok(await page.locator('#confirm').isHidden(),'Escape backs out');
 await page.click(`#s-pick .pk[data-team="${other}"]`); await page.waitForTimeout(300);
 await page.click('#confirm .sheet-back',{position:{x:5,y:5}}); await page.waitForTimeout(250);
 ok(await page.locator('#confirm').isHidden(),'tapping outside backs out');
 ok(await page.evaluate(()=>(pickIn(S.me.id,S.week)||{}).team)===team,'and neither route changed the pick');

 console.log('\n— from the matchup card too —');
 await page.click('#s-pick .ibtn'); await page.waitForTimeout(350);
 const sheetBtn=await page.locator('#sheet .sh-act .btn').count();
 if (sheetBtn) {
   await page.locator('#sheet .sh-act .btn').first().click(); await page.waitForTimeout(400);
   ok(await page.locator('#confirm').isVisible(),'picking from the matchup card also confirms');
   ok(await page.locator('#sheet').isHidden(),'and the matchup card gets out of the way first');
   await page.click('#cf-no'); await page.waitForTimeout(300);
   ok(await page.evaluate(()=>getComputedStyle(document.body).position)!=='fixed','no overlay leaves the page pinned');
 } else ok(true,'(no pickable team in that card — skipped)');

 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 console.log(`\n${pass} passed, ${fail} failed\n`);
 await b.close(); process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
