const { chromium } = require('/tmp/fs/node_modules/playwright-core');
const fs=require('fs');
const CSS='/tmp/fs/survivor.css';
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

 // 🚨 A version that lies is worse than none — the exact failure this app
 // already had, where survivor.js changed 16 times while index.html still
 // asked for ?v=1. The worker means the query string no longer DELIVERS
 // anything (proved below), but three numbers that are supposed to say
 // "this is build N" must not be free to drift apart.
 console.log('\n— the three version numbers cannot drift apart —');
 const SRC='/tmp/fs/';
 const jsv=(fs.readFileSync(SRC+'survivor.js','utf8').match(/const APP_V = '(v\d+)'/)||[])[1];
 const swv=(fs.readFileSync(SRC+'sw.js','utf8').match(/const APP_V = '(v\d+)'/)||[])[1];
 const html=fs.readFileSync(SRC+'index.html','utf8');
 ok(!!jsv,'survivor.js declares APP_V ('+jsv+')');
 ok(swv===jsv,`sw.js carries the same one (${swv}) — forgetting it costs the take-over update signal`);
 const n=jsv.slice(1);
 for (const f of ['survivor.css','survivor.js']) {
   const q=(html.match(new RegExp(f.replace('.','\\.')+'\\?v=(\\d+)'))||[])[1];
   ok(q===n,`index.html asks for ${f}?v=${n}${q===n?'':` — it says ?v=${q}, which is build ${q} pretending to be build ${n}`}`);
 }

 console.log('\n— ESPN and Supabase are never intercepted —');
 const sw=fs.readFileSync('/tmp/fs/sw.js','utf8');
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
