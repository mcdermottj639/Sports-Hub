const { chromium } = require('/home/user/Sports-Hub/survivor/node_modules/playwright-core');
let pass=0,fail=0; const ok=(c,m)=>{if(c){pass++;console.log('  ✓ '+m);}else{fail++;console.log('  ✗ '+m);}};
const BASE='http://127.0.0.1:8099/';
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
 const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const a=await ctx.newPage(); const errs=[]; a.on('pageerror',e=>errs.push(e.message));
 await a.goto(BASE,{waitUntil:'networkidle'});
 await a.click('#first-demo'); await a.waitForSelector('#tabs:not([hidden])'); await a.waitForTimeout(1200);

 // a relative arrives at the join screen
 const n=await ctx.newPage();
 await n.goto(BASE); await n.evaluate(()=>localStorage.removeItem('survivor:me'));
 await n.goto(BASE,{waitUntil:'networkidle'}); await n.waitForTimeout(600);

 console.log('\n— tapping a name asks first —');
 const target=await n.evaluate(()=>document.querySelector('.namebtn').innerText.trim());
 await n.click('.namebtn'); await n.waitForTimeout(400);
 ok(await n.locator('#confirm').isVisible(),'a confirmation appears');
 const c=await n.locator('#confirm-body').innerText();
 ok(new RegExp('Are you '+target,'i').test(c),`it names them: "Are you ${target}?"`);
 ok(/comes off the list for everyone else/i.test(c),'and says the consequence');
 ok(await n.evaluate(()=>document.activeElement.id)==='nm-no','the safe answer holds focus');

 console.log('\n— backing out claims nothing —');
 await n.click('#nm-no'); await n.waitForTimeout(400);
 const stillFree=await n.evaluate((t)=>{
   const db=JSON.parse(localStorage.getItem('survivor:local'));
   const p=db.players.find(x=>x.display_name===t);
   return {claimed:!!p.claimed_at, onList:Array.from(document.querySelectorAll('.namebtn')).some(b=>b.innerText.trim()===t)};},target);
 ok(!stillFree.claimed,'the name is still unclaimed');
 ok(stillFree.onList,'and still on the list');
 ok(await n.evaluate(()=>!localStorage.getItem('survivor:me')),'nobody was signed in');

 console.log('\n— the wrong name, tapped and confirmed —');
 await n.click('.namebtn'); await n.waitForTimeout(350);
 await n.click('#nm-yes'); await n.waitForTimeout(900);
 ok(new RegExp(target,'i').test(await n.locator('#whoami').innerText()),`signed in as ${target}`);
 ok(await n.locator('#notme').count()===1,'an escape hatch is offered on the pick screen');
 const esc=await n.locator('.notme').innerText();
 ok(new RegExp('Not '+target,'i').test(esc),`it names them: "${esc.trim().slice(0,40)}…"`);

 console.log('\n— once they have picked, only the commissioner can fix it —');
 await n.click('#notme'); await n.waitForTimeout(1000);
 ok(await n.locator('.namebtn').count()>0,'they are back on the join screen');
 const back=await n.evaluate((t)=>{
   const db=JSON.parse(localStorage.getItem('survivor:local'));
   const p=db.players.find(x=>x.display_name===t);
   return {claimed:!!p.claimed_at, onList:Array.from(document.querySelectorAll('.namebtn')).some(b=>b.innerText.trim()===t),
           signedIn:!!localStorage.getItem('survivor:me')};},target);
 ok(!back.claimed,`${target} is free again`);
 ok(back.onList,'and back on the list for the right person');
 ok(!back.signedIn,'and this phone is signed out');

 console.log('\n— once they have picked, only the commissioner can fix it —');
 await n.click('.namebtn'); await n.waitForTimeout(300); await n.click('#nm-yes'); await n.waitForTimeout(900);
 const t2=await n.evaluate(()=>{const x=Array.from(document.querySelectorAll('#s-pick .pk')).find(e=>!e.disabled);return x?x.dataset.team:null;});
 await n.click(`#s-pick .pk[data-team="${t2}"]`); await n.waitForTimeout(350);
 await n.click('#cf-yes'); await n.waitForTimeout(700);
 ok(await n.locator('#notme').count()===0,'the escape hatch disappears once a pick exists');
 const refused=await n.evaluate(async()=>S.store.releaseMe(S.me.token));
 ok(refused&&refused.ok===false,`and the store refuses a self-release: "${refused.error}"`);
 ok(/ask the commissioner/i.test(refused.error),'pointing them at the commissioner');

 console.log('\n— the commissioner can still fix it —');
 await a.bringToFront(); await a.evaluate(()=>{const db=JSON.parse(localStorage.getItem('survivor:local'));
   localStorage.setItem('survivor:me', db.players.find(p=>p.is_admin).token);});
 await a.reload({waitUntil:'networkidle'}); await a.waitForTimeout(900);
 await a.click('.tab[data-screen="admin"]'); await a.waitForTimeout(400);
 ok(await a.locator('[data-unclaim]').count()>0,'Release is still there in Admin for the harder cases');

 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 console.log(`\n${pass} passed, ${fail} failed\n`);
 await b.close(); process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
