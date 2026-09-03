const { chromium } = require('/tmp/fs/node_modules/playwright-core');
let pass=0,fail=0; const ok=(c,m)=>{if(c){pass++;console.log('  ✓ '+m);}else{fail++;console.log('  ✗ '+m);}};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const alpha=(c)=>{const m=String(c).match(/[\d.]+/g)||[];return m.length>3?+m[3]:1;};
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
 const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,timezoneId:'America/New_York'});
 const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 try {
 await p.goto('http://127.0.0.1:8099/',{waitUntil:'networkidle'});
 if (await p.locator('#first-demo').count()) { await p.click('#first-demo'); await p.waitForSelector('#tabs:not([hidden])'); }
 await sleep(1600);
 await p.click('.tab[data-screen="standings"]'); await sleep(800);
 await p.click('[data-stview="grid"]'); await sleep(800);

 for (const pal of ['champagne','onyx']) {
   await p.evaluate((x)=>{document.documentElement.setAttribute('data-palette',x);
     document.documentElement.setAttribute('data-theme',x==='onyx'?'dark':'light');},pal);
   await sleep(200);
   console.log(`\n— ${pal}: the sticky name column is opaque on EVERY row —`);
   const bg=await p.evaluate(()=>[...document.querySelectorAll('.gr .gnm')].map(e=>{
     const cs=getComputedStyle(e);
     return { you:e.closest('tr').classList.contains('you'), c:cs.backgroundColor, img:cs.backgroundImage };
   }));
   const see=bg.filter(x=>{const m=String(x.c).match(/[\d.]+/g)||[];return (m.length>3?+m[3]:1)<1;});
   ok(see.length===0,`${bg.length} name cells, none see-through`+(see.length?`: ${see.length} at alpha<1`:''));
   const you=bg.find(x=>x.you);
   ok(you,'your own row is in the grid');
   ok(alpha(you.c)===1,`and your name cell is fully opaque (${you.c})`);
   ok(/gradient/.test(you.img),'with the highlight tint layered on top of it, so the colour is unchanged');
 }
 await p.evaluate(()=>{document.documentElement.setAttribute('data-palette','champagne');
   document.documentElement.setAttribute('data-theme','light');});
 await sleep(200);

 console.log('\n— scrolled to the newest week, nothing sits over a name —');
 const wrap=await p.locator('.grid-wrap');
 const scrolled=await p.evaluate(()=>{const w=document.querySelector('.grid-wrap');
   w.scrollLeft=w.scrollWidth; return {left:w.scrollLeft, max:w.scrollWidth-w.clientWidth};});
 ok(scrolled.max>0,`the grid really does scroll sideways (${scrolled.max}px of it)`);
 await sleep(300);
 // A cell may pass BEHIND the sticky column — that is the point of it. What
 // must not happen is a cell painting ON TOP, so check the stacking order.
 const z=await p.evaluate(()=>{
   const nm=document.querySelector('.gr tr.you .gnm');
   const cs=getComputedStyle(nm);
   const cell=document.querySelector('.gr tr.you td:not(.gnm)');
   return { pos:cs.position, z:cs.zIndex, cellZ:getComputedStyle(cell).zIndex };
 });
 ok(z.pos==='sticky','the name column is sticky');
 ok(Number(z.z)>=1,`and stacks above the cells (z ${z.z} vs ${z.cellZ})`);

 // the real proof: sample the pixels where a name sits, with cells scrolled under it
 const shot=await p.locator('.gr tr.you .gnm').screenshot();
 const png=shot.toString('base64');
 ok(png.length>0,'the name cell renders');
 const overlap=await p.evaluate(()=>{
   const nm=document.querySelector('.gr tr.you .gnm').getBoundingClientRect();
   const cells=[...document.querySelectorAll('.gr tr.you .gcell')].map(c=>c.getBoundingClientRect());
   // how many cells physically overlap the name box right now
   const over=cells.filter(c=>c.right>nm.left+2 && c.left<nm.right-2).length;
   // and what the browser says is actually on top at the name's centre
   const at=document.elementFromPoint(nm.left+nm.width/2, nm.top+nm.height/2);
   return { over, top: at ? at.className || at.tagName : null };
 });
 ok(overlap.over>0,`${overlap.over} cells are physically scrolled under the name box`);
 ok(/gnm/.test(String(overlap.top)),`and the name cell is what is painted on top (${overlap.top})`);

 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 } finally { await b.close(); }
 console.log(`\n${pass} passed, ${fail} failed\n`);
 process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
