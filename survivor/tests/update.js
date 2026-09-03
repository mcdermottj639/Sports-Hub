const { chromium } = require('/home/user/Sports-Hub/survivor/node_modules/playwright-core');
const fs=require('fs');
const CSS='/home/user/Sports-Hub/survivor/survivor.css';
let pass=0,fail=0; const ok=(c,m)=>{if(c){pass++;console.log('  ✓ '+m);}else{fail++;console.log('  ✗ '+m);}};
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
 const ctx=await b.newContext({viewport:{width:390,height:844}});
 const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));

 console.log('\n— the worker installs —');
 await p.goto('http://127.0.0.1:8099/',{waitUntil:'networkidle'});
 await p.waitForTimeout(1500);
 const reg=await p.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();return !!r;});
 ok(reg,'a service worker is registered for the survivor app');
 ok(await p.evaluate(()=>typeof APP_V==='string'),'the app carries a version constant: '+await p.evaluate(()=>APP_V));

 console.log('\n— ESPN and Supabase are never intercepted —');
 const sw=fs.readFileSync('/home/user/Sports-Hub/survivor/sw.js','utf8');
 ok(/url\.origin !== self\.location\.origin\) return/.test(sw),'cross-origin requests bypass the worker entirely');
 ok(/no-store/.test(sw),'and same-origin requests are fetched network-first with no-store');

 console.log('\n— a shipped change reaches a returning phone —');
 const before=await p.evaluate(()=>getComputedStyle(document.querySelector('.hd')).borderBottomColor);
 const orig=fs.readFileSync(CSS,'utf8');
 fs.writeFileSync(CSS, orig+'\n.hd{border-bottom-color:rgb(1,2,3)}\n');   // "ship" an update
 await p.waitForTimeout(400);
 await p.reload({waitUntil:'networkidle'});
 await p.waitForTimeout(1200);
 const after=await p.evaluate(()=>getComputedStyle(document.querySelector('.hd')).borderBottomColor);
 ok(after==='rgb(1, 2, 3)',`the phone picked up the new CSS on next open (${before} -> ${after})`);
 ok(before!==after,'i.e. the ?v= query string is no longer what updates depend on');
 fs.writeFileSync(CSS, orig);
 await p.reload({waitUntil:'networkidle'}); await p.waitForTimeout(1000);
 ok(await p.evaluate(()=>getComputedStyle(document.querySelector('.hd')).borderBottomColor)===before,'and a revert lands just as fast');

 console.log('\n— still works with no network —');
 await ctx.setOffline(true);
 await p.reload({waitUntil:'domcontentloaded'}).catch(()=>{});
 await p.waitForTimeout(1200);
 const alive=await p.evaluate(()=>!!document.querySelector('header .hd-name'));
 ok(alive,'the app still loads from the offline cache');
 await ctx.setOffline(false);

 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 console.log(`\n${pass} passed, ${fail} failed\n`);
 await b.close(); process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
