const { chromium } = require('/home/user/Sports-Hub/survivor/node_modules/playwright-core');
let pass=0,fail=0; const ok=(c,m)=>{if(c){pass++;console.log('  ✓ '+m);}else{fail++;console.log('  ✗ '+m);}};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
// a 1x1 green PNG, standing in for ESPN's helmet
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
 const boot=async(ctx)=>{const p=await ctx.newPage();
   await p.goto('http://127.0.0.1:8099/',{waitUntil:'networkidle'});
   if (await p.locator('#first-demo').count()) { await p.click('#first-demo'); await p.waitForSelector('#tabs:not([hidden])'); }
   await sleep(1500);
   // The current week's pick is locked in the demo, which folds the slate away
   // — there are no team buttons (and so no helmets) until it is opened.
   if (await p.locator('#cg-more').count()) { await p.click('#cg-more'); await sleep(500); }
   return p; };
 try {

 console.log('\n— when ESPN answers, the helmets are there —');
 let ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:'America/New_York'});
 let hits=0;
 await ctx.route('https://a.espncdn.com/**',(r)=>{hits++;r.fulfill({status:200,contentType:'image/png',body:PNG});});
 let p=await boot(ctx);
 const n=await p.evaluate(()=>document.querySelectorAll('.pk img').length);
 ok(n>0,`${n} helmets rendered on the pick screen`);
 ok(hits>0,`and ${hits} were actually fetched from ESPN`);
 ok(await p.evaluate(()=>document.querySelectorAll('.lg-fb').length)===0,'no fallback badges when the images load');
 ok(await p.evaluate(()=>{const i=document.querySelector('.pk img');return i.src.includes('espncdn')&&/\.png$/.test(i.src);}),'pointing at the real logo URL');
 // the confirm panel's big one
 const t=await p.evaluate(()=>{const x=[...document.querySelectorAll('#s-pick .pk')].find(y=>!y.disabled);return x?x.dataset.team:null;});
 await p.click(`#s-pick .pk[data-team="${t}"]`); await sleep(400);
 ok(await p.locator('.cf-team img').count()===1,'and the confirmation shows the big one');
 await p.click('#cf-no'); await sleep(200);
 await ctx.close();

 console.log('\n— one failed load is retried, not thrown away —');
 ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:'America/New_York'});
 let tries=0;
 await ctx.route('https://a.espncdn.com/**',(r)=>{ tries++;
   // fail every first attempt (no ?r=), succeed on the retry
   if (!r.request().url().includes('?r=')) return r.abort();
   return r.fulfill({status:200,contentType:'image/png',body:PNG}); });
 p=await boot(ctx);
 await sleep(1800);                       // the 700ms retry plus slack
 const after=await p.evaluate(()=>({img:document.querySelectorAll('.pk img').length,fb:document.querySelectorAll('.lg-fb').length}));
 ok(after.img>0,`the helmets came back on the retry (${after.img} images)`);
 ok(after.fb===0,'so no fallback badge was ever needed');
 ok(tries>after.img,'which took a second request per logo');
 await ctx.close();

 console.log('\n— ESPN unreachable: a badge, never a hole —');
 ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:'America/New_York'});
 await ctx.route('https://a.espncdn.com/**',(r)=>r.abort());
 p=await boot(ctx);
 await sleep(2200);
 const dead=await p.evaluate(()=>{
   const fb=[...document.querySelectorAll('.pk .lg-fb')];
   const box=fb[0]&&fb[0].getBoundingClientRect();
   return { fb:fb.length, text:fb[0]&&fb[0].textContent, w:box&&box.width, h:box&&box.height,
            names:document.querySelectorAll('.pk-name').length };
 });
 ok(dead.fb>0,`${dead.fb} teams fall back to a badge instead of vanishing`);
 ok(/^[A-Z]{2,3}$/.test(dead.text||''),`showing the team's abbreviation: "${dead.text}"`);
 ok(Math.round(dead.w)===34&&Math.round(dead.h)===34,`in exactly the image's box (${Math.round(dead.w)}x${Math.round(dead.h)}) so nothing shifts`);
 ok(dead.fb===dead.names,'every team has one — none is left blank');
 ok(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'no sideways scroll');
 const errs=await p.evaluate(()=>window.__err||0);
 ok(!errs,'and a dead CDN throws no script errors');
 await ctx.close();

 } finally { await b.close(); }
 console.log(`\n${pass} passed, ${fail} failed\n`);
 process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
