const { chromium } = require('/home/user/Sports-Hub/survivor/node_modules/playwright-core');
let pass=0,fail=0; const ok=(c,m)=>{if(c){pass++;console.log('  ✓ '+m);}else{fail++;console.log('  ✗ '+m);}};
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
 const ctx=await b.newContext({viewport:{width:390,height:844}}); const page=await ctx.newPage();
 const errs=[]; page.on('pageerror',e=>errs.push(e.message));
 await page.goto('http://127.0.0.1:8099/',{waitUntil:'networkidle'});
 await page.click('#first-demo'); await page.waitForSelector('#tabs:not([hidden])');
 await page.click('.tab[data-screen="admin"]'); await page.waitForTimeout(300);

 console.log('\n— device-only mode is unmissable —');
 ok(await page.locator('#s-admin .warnbox').count()>=1,'a red warning box, not a quiet note');
 const w=await page.locator('#s-admin .warnbox').first().innerText();
 ok(/do not send links/i.test(w),'it says plainly: do not send links');
 ok(/none of it will reach you/i.test(w),'and explains the consequence');
 ok(await page.evaluate(()=>isShared())===false,'isShared() reports false');

 console.log('\n— the copy buttons refuse to hand out dead links —');
 let dialog=null;
 page.on('dialog',async d=>{dialog=d.message();await d.dismiss();});
 await page.click('#ad-copyjoin'); await page.waitForTimeout(300);
 ok(dialog&&/NOT connected/i.test(dialog),'copying the league link warns first');
 ok(/would open an empty app/i.test(dialog||''),'and says what the recipient would actually see');
 ok(await page.locator('[data-copy]').count()===0,'per-person private links are gone — Put back on list covers that case');
 ok(await page.locator('#ad-copyall').count()===0,'and so is the bulk copy from the old design');

 console.log('\n— the setup steps are actually present —');
 const steps=await page.locator('#s-admin .steps:not(.demo-guide)').innerText();
 ok(/supabase\.com/i.test(steps),'names where to make the project');
 ok(/schema\.sql/i.test(steps),'tells you to run schema.sql');
 ok(/admin_add_player\('bootstrap'/.test(steps),'gives the exact commissioner-seed SQL');
 ok(/anon/i.test(steps),'tells you which key to copy');
 const n=await page.locator('#s-admin .steps:not(.demo-guide) li').count();
 ok(n===5,`five numbered steps (${n})`);

 console.log('\n— switching to shared mode flips everything —');
 await page.evaluate(()=>{localStorage.setItem('survivor:sb',JSON.stringify({url:'https://example.supabase.co',key:'test-key'}));});
 await page.reload({waitUntil:'domcontentloaded'}); await page.waitForTimeout(1200);
 const mode=await page.evaluate(()=>({kind:S.store&&S.store.kind, shared:typeof isShared==='function'?isShared():null}));
 ok(mode.kind==='cloud','with a URL+key it uses the Supabase store');
 ok(mode.shared===true,'and isShared() reports true');
 await page.evaluate(()=>localStorage.removeItem('survivor:sb'));

 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 console.log(`\n${pass} passed, ${fail} failed\n`);
 await b.close(); process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
