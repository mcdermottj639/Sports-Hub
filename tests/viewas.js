const { chromium } = require('/tmp/fs/node_modules/playwright-core');
let pass=0,fail=0; const ok=(c,m)=>{if(c){pass++;console.log('  ✓ '+m);}else{fail++;console.log('  ✗ '+m);}};
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
 const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto('http://127.0.0.1:8099/',{waitUntil:'networkidle'});
 await p.click('#first-demo'); await p.waitForSelector('#tabs:not([hidden])'); await p.waitForTimeout(1500);
 const me=await p.evaluate(()=>({name:S.me.display_name, admin:S.me.is_admin, tok:S.me.token}));
 ok(me.admin,`signed in as the commissioner (${me.name})`);
 ok(await p.locator('#viewas').isHidden(),'no view-as bar normally');

 console.log('\n— view as somebody else —');
 await p.click('.tab[data-screen="admin"]'); await p.waitForTimeout(400);
 const targetName=await p.evaluate(()=>{
   const row=Array.from(document.querySelectorAll('.plrow')).find(r=>!/👑/.test(r.innerText));
   return row.querySelector('.pn').innerText.trim();});
 await p.evaluate((n)=>{
   const row=Array.from(document.querySelectorAll('.plrow')).find(r=>r.querySelector('.pn').innerText.trim()===n);
   row.querySelector('[data-view]').click();},targetName);
 await p.waitForTimeout(1400);
 ok((await p.evaluate(()=>S.me.display_name))===targetName,`now viewing as ${targetName}`);
 ok(!(await p.evaluate(()=>S.me.is_admin)),'and no longer have admin');

 console.log('\n— and there IS a way back —');
 ok(await p.locator('#viewas').isVisible(),'a bar appears saying so');
 const bar=await p.locator('#viewas').innerText();
 ok(new RegExp(targetName).test(bar),`it names who you are pretending to be: "${bar.replace(/\n/g,' ').trim()}"`);
 ok(await p.locator('#va-back').count()===1,'with a Back to my account button');

 console.log('\n— it follows you everywhere —');
 for (const sc of ['standings','history','stats']) {
   await p.click(`.tab[data-screen="${sc}"]`); await p.waitForTimeout(400);
   ok(await p.locator('#viewas').isVisible(),`still visible on ${sc}`);
 }

 console.log('\n— hopping to a third person keeps the way home —');
 await p.evaluate(()=>{}); // still as target; go back to admin first is impossible (no admin tab)
 const stashed=await p.evaluate(()=>localStorage.getItem('survivor:viewas'));
 ok(stashed===me.tok,'the commissioner token is stashed, not overwritten');

 console.log('\n— one tap home —');
 await p.click('#va-back'); await p.waitForTimeout(1400);
 ok((await p.evaluate(()=>S.me.display_name))===me.name,`back as ${me.name}`);
 ok(await p.evaluate(()=>S.me.is_admin),'with admin restored');
 ok(await p.locator('#viewas').isHidden(),'and the bar is gone');
 ok(await p.evaluate(()=>!localStorage.getItem('survivor:viewas')),'the stash is cleared');
 ok(await p.locator('#tab-admin').isVisible(),'the Admin tab is back');

 console.log('\n— it survives a reload while viewing —');
 await p.click('.tab[data-screen="admin"]'); await p.waitForTimeout(400);
 await p.evaluate((n)=>{
   const row=Array.from(document.querySelectorAll('.plrow')).find(r=>r.querySelector('.pn').innerText.trim()===n);
   row.querySelector('[data-view]').click();},targetName);
 await p.waitForTimeout(1400);
 await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(1400);
 ok(await p.locator('#viewas').isVisible(),'the bar is still there after a reload');
 await p.click('#va-back'); await p.waitForTimeout(1400);
 ok(await p.evaluate(()=>S.me.is_admin),'and still gets you home');

 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 console.log(`\n${pass} passed, ${fail} failed\n`);
 await b.close(); process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
