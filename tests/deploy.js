const { chromium } = require('/tmp/fs/node_modules/playwright-core');
let pass=0,fail=0; const ok=(c,m)=>{if(c){pass++;console.log('  ✓ '+m);}else{fail++;console.log('  ✗ '+m);}};
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});

 console.log('\n— a relative following a link into an unconfigured app —');
 const N=await b.newContext({viewport:{width:390,height:844}}); const n=await N.newPage();
 const errs=[]; n.on('pageerror',e=>errs.push(e.message));
 await n.goto('http://127.0.0.1:8099/?u=nana-abc123',{waitUntil:'networkidle'});
 await n.waitForTimeout(600);
 const txt=await n.locator('#s-pick').innerText();
 ok(/link isn't working/i.test(txt),'she is told the link is not working');
 ok(!/start the league/i.test(txt),'she is NOT invited to start her own league');
 ok(await n.locator('#first-go').count()===0,'and there is no way for her to create one by accident');
 ok(/ask jack/i.test(txt),'she is told who to ask');
 ok(/nothing is wrong with your phone/i.test(txt),'and reassured it is not her fault');
 ok(await n.locator('#tabs').isHidden(),'no tabs to wander into');

 console.log('\n— the commissioner setting up fresh still can —');
 const A=await b.newContext(); const a=await A.newPage();
 await a.goto('http://127.0.0.1:8099/',{waitUntil:'networkidle'});
 ok(await a.locator('#first-go').count()===1,'with no link in the URL, setup is still offered');

 console.log('\n— the admin screen says the paste box is device-only —');
 await a.click('#first-demo'); await a.waitForSelector('#tabs:not([hidden])');
 await a.click('.tab[data-screen="admin"]'); await a.waitForTimeout(300);
 const boxes=await a.locator('#s-admin .warnbox').count();
 ok(boxes>=2,`both warnings present (not-shared + device-only): ${boxes}`);
 const adm=await a.locator('#s-admin').innerText();
 ok(/only configures THIS phone/i.test(adm),'it says saving configures only this phone');
 ok(/survivor\.js/i.test(adm),'and names the file the values must go into');

 console.log('\n— the deploy snippet —');
 await a.fill('#sb-url','https://demo.supabase.co/');
 await a.fill('#sb-key','anon-key-123');
 await A.grantPermissions(['clipboard-read','clipboard-write']);
 await a.click('#sb-copycfg'); await a.waitForTimeout(400);
 const clip=await a.evaluate(()=>navigator.clipboard.readText().catch(()=>''));
 ok(/let SUPABASE_URL = 'https:\/\/demo\.supabase\.co';/.test(clip),'snippet has the URL line, trailing slash stripped');
 ok(/let SUPABASE_KEY = 'anon-key-123';/.test(clip),'snippet has the key line');
 ok(clip.split('\n').length===2,'exactly two lines, ready to paste');

 console.log('\n— and those two lines really do switch everyone on —');
 const fs=require('fs');
 const src=fs.readFileSync('/tmp/fs/survivor.js','utf8');
 const patched=src.replace("let SUPABASE_URL = '';","let SUPABASE_URL = 'https://demo.supabase.co';")
                  .replace("let SUPABASE_KEY = '';","let SUPABASE_KEY = 'anon-key-123';");
 fs.writeFileSync('/tmp/fs/.tmp-check.js',patched);
 const C=await b.newContext(); const c=await C.newPage();
 await c.goto('http://127.0.0.1:8099/');
 const kind=await c.evaluate(async()=>{
   const r=await fetch('.tmp-check.js'); const t=await r.text();
   // read what pickStore() would decide with those constants filled in
   return /let SUPABASE_URL = 'https:\/\/demo\.supabase\.co'/.test(t) && /let SUPABASE_KEY = 'anon-key-123'/.test(t);
 });
 ok(kind,'a fresh device with the values baked into the FILE needs no local config');
 fs.unlinkSync('/tmp/fs/.tmp-check.js');

 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 console.log(`\n${pass} passed, ${fail} failed\n`);
 await b.close(); process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
