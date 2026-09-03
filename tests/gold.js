const { chromium } = require('/tmp/fs/node_modules/playwright-core');
let pass=0,fail=0; const ok=(c,m)=>{if(c){pass++;console.log('  ✓ '+m);}else{fail++;console.log('  ✗ '+m);}};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

/* ─────────────────────────────────────────────────────────────────────────
   THE GOLD IS PINNED. The owner: "Don't change the gold I love the gold."
   These are the exact shipped values. If a change trips this suite, the
   change is wrong — do NOT update the expectations to match it. Ask him.
   ───────────────────────────────────────────────────────────────────────── */
const GOLD = {
  champagne: {
    '--ac':     '#b8942f',
    '--ac6':    '#a07f24',
    '--wm':     '#8a7a58',
    '--on-ac':  '#1a1509',
    '--glow':   '0 4px 14px rgba(184,148,47,.34)',
    '--grad':   'linear-gradient(135deg, #f0dc9e 0%, #d7b34a 26%, #b8942f 52%, #e6d290 74%, #bf9c33 100%)',
  },
  onyx: {
    '--ac':     '#d9b445',
    '--ac6':    '#e8d089',
    '--wm':     '#a89263',
    '--on-ac':  '#17140b',
    '--glow':   '0 4px 16px rgba(217,180,69,.30)',
    '--grad':   'linear-gradient(135deg, #f6e7b4 0%, #dcb84c 28%, #c9a234 54%, #f0dda0 76%, #d3ac3e 100%)',
  },
};
const norm = (s) => String(s).trim().replace(/\s+/g,' ').toLowerCase();

(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
 const ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:'America/New_York'});
 const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 try {
 await p.goto('http://127.0.0.1:8099/',{waitUntil:'networkidle'});
 if (await p.locator('#first-demo').count()) { await p.click('#first-demo'); await p.waitForSelector('#tabs:not([hidden])'); }
 await sleep(1500);

 for (const pal of ['champagne','onyx']) {
   console.log(`\n— the ${pal} gold, exactly as shipped —`);
   await p.evaluate((x)=>{document.documentElement.setAttribute('data-palette',x);
     document.documentElement.setAttribute('data-theme',x==='onyx'?'dark':'light');},pal);
   await sleep(150);
   const got=await p.evaluate((keys)=>{
     const cs=getComputedStyle(document.documentElement); const o={};
     for (const k of keys) o[k]=cs.getPropertyValue(k);
     return o;
   }, Object.keys(GOLD[pal]));
   for (const [k,want] of Object.entries(GOLD[pal])) {
     ok(norm(got[k])===norm(want), `${k} is ${want}${norm(got[k])===norm(want)?'':`  — GOT ${got[k].trim()}`}`);
   }
 }

 console.log('\n— and it is still what the app actually paints —');
 await p.evaluate(()=>{document.documentElement.setAttribute('data-palette','champagne');
   document.documentElement.setAttribute('data-theme','light');});
 await sleep(150);
 const painted=await p.evaluate(()=>{
   const tab=document.querySelector('.tab.on');
   return { tab:getComputedStyle(tab).backgroundImage, ink:getComputedStyle(tab).color };
 });
 ok(/gradient/.test(painted.tab),'the selected tab is the plated gold, not a flat fill');
 ok(painted.tab.includes('240, 220, 158'),'carrying the #f0dc9e highlight');
 ok(painted.ink==='rgb(26, 21, 9)','with the dark ink it was designed for, never white');

 console.log('\n— the green and red are BESIDE the gold, not instead of it —');
 const toks=await p.evaluate(()=>{
   const cs=getComputedStyle(document.documentElement);
   return ['--grad','--grad-pos','--grad-neg','--grad-tie'].map(k=>cs.getPropertyValue(k).trim());
 });
 ok(toks.every(t=>t.length>0),'all four plates exist');
 ok(new Set(toks).size===4,'and all four are different');
 ok(toks[0].includes('#f0dc9e'),'the gold plate is untouched by them');

 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 } finally { await b.close(); }
 console.log(`\n${pass} passed, ${fail} failed\n`);
 if (fail) console.log('⚠️  The gold changed. That is almost certainly a mistake — do not\n    update the expectations to match. Ask the owner.\n');
 process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
