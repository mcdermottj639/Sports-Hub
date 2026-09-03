const { chromium } = require('/home/user/Sports-Hub/survivor/node_modules/playwright-core');
let pass=0,fail=0; const ok=(c,m)=>{if(c){pass++;console.log('  ✓ '+m);}else{fail++;console.log('  ✗ '+m);}};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

const CONTRAST = `(() => {
  const px = (c) => { const m = c.match(/[\\d.]+/g).map(Number); return m; };
  const lum = (r,g,b) => { const f=(v)=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);};
    return .2126*f(r)+.7152*f(g)+.0722*f(b); };
  window.__contrast = (sel) => {
    const el = document.querySelector(sel); if (!el) return null;
    const cs = getComputedStyle(el);
    let fg = px(cs.color); const op = parseFloat(cs.opacity);
    // A PLATED fill is a background-IMAGE — its backgroundColor is transparent,
    // so a naive parent-walk would measure this text against the PAGE and
    // report a failure that is not real. Read the gradient's own stops and
    // take the worst, which is the honest question anyway: the type sits over
    // all of them.
    const stopsOf = (node) => {
      const im = getComputedStyle(node).backgroundImage || '';
      return (im.match(/rgba?\\([^)]+\\)/g) || []).map(px).filter((v) => v.length < 4 || v[3] > 0.5);
    };
    let bg = null, plate = [], n = el;
    while (n) {
      const g = stopsOf(n);
      if (g.length) { plate = g; break; }
      const c = getComputedStyle(n).backgroundColor;
      if (c && !/rgba\\(\\s*0,\\s*0,\\s*0,\\s*0\\s*\\)/.test(c) && !/transparent/.test(c)) { bg = px(c); break; }
      n = n.parentElement;
    }
    const ratio1 = (f, b) => {
      const ff = op < 1 ? [0,1,2].map((i) => f[i]*op + b[i]*(1-op)) : f;
      const A = lum(ff[0],ff[1],ff[2]), B = lum(b[0],b[1],b[2]);
      return (Math.max(A,B)+.05)/(Math.min(A,B)+.05);
    };
    if (plate.length) {
      return { ratio: Math.min(...plate.map((b) => ratio1(fg, b))),
               size: parseFloat(cs.fontSize), bg: 'plated (' + plate.length + ' stops, worst shown)' };
    }
    if (!bg) bg = [255,255,255];
    return { ratio: ratio1(fg, bg), size: parseFloat(cs.fontSize), bg: cs.backgroundColor };
  };
})()`;

(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
 const ctx=await b.newContext({viewport:{width:390,height:844}});
 const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 try {
 await p.goto('http://127.0.0.1:8099/',{waitUntil:'networkidle'});
 if (await p.locator('#first-demo').count()) { await p.click('#first-demo'); await p.waitForSelector('#tabs:not([hidden])'); }
 await sleep(1200);

 // Force each state so all three are exercised regardless of the demo's luck.
 const force = async (status) => p.evaluate((st) => {
   const el = document.querySelector('.locked');
   el.className = 'locked' + (st ? ' ' + st : '');
 }, status);

 console.log('\n— the card itself carries the result —');
 // walk back to a graded week
 let cls='';
 for (let i=0;i<6;i++){
   await p.evaluate(()=>{S.weekPinned=true;S.week=Math.max(1,S.week-1);render();});
   await sleep(700);
   cls = await p.evaluate(()=>{const e=document.querySelector('.locked');return e?e.className:'';});
   if (/win|loss|tie/.test(cls)) break;
 }
 ok(/\b(win|loss|tie)\b/.test(cls),`a graded past week tags the whole card: "${cls}"`);
 const graded = await p.evaluate(()=>{const c=getComputedStyle(document.querySelector('.locked'));
   return c.backgroundImage!=='none' ? c.backgroundImage : c.backgroundColor;});
 ok(/gradient/.test(graded),'and it is PLATED like the gold card, not a flat fill');

 console.log('\n— the colour always matches the real result —');
 const match = await p.evaluate(()=>{
   const mine = pickIn(S.me.id, S.week);
   const st = gradePick(mine.team, S.games[S.week] || []).status;
   const cls = document.querySelector('.locked').className;
   const tone = (cls.match(/\b(win|loss|tie)\b/) || [])[1] || null;
   return { st, tone };
 });
 ok(match.tone===match.st||(match.tone===null&&!['win','loss','tie'].includes(match.st)),
   `the card's colour is the graded status, not a guess (status ${match.st} -> ${match.tone||'gold'})`);

 console.log('\n— gold is reserved for "still your pick" —');
 // A game still in progress must NOT be coloured — nothing has been decided.
 const pend = await p.evaluate(()=>{
   const mine = pickIn(S.me.id, S.week);
   const g = (S.games[S.week]||[]).find(x=>x.home.abbr===mine.team||x.away.abbr===mine.team);
   const was = g.state; g.state = 'in'; render();
   const cls = document.querySelector('.locked').className;
   const sub = document.querySelector('.lk-sub').innerText;
   g.state = was; render();
   return { cls, sub };
 });
 await sleep(200);
 ok(!/\b(win|loss|tie)\b/.test(pend.cls),`a game still being played stays gold: "${pend.cls}"`);
 ok(/playing now/i.test(pend.sub),'and says so: "'+pend.sub.trim()+'"');

 console.log('\n— win, loss and tie are three different colours, in both palettes —');
 for (const pal of ['champagne','onyx']) {
   await p.evaluate((x)=>{document.documentElement.setAttribute('data-palette',x);
     document.documentElement.setAttribute('data-theme', x==='onyx'?'dark':'light');},pal);
   const seen = {};
   for (const st of ['','win','loss','tie']) {
     await force(st); await sleep(120);
     seen[st||'gold'] = await p.evaluate(()=>{const c=getComputedStyle(document.querySelector('.locked'));
       return c.backgroundImage!=='none' ? c.backgroundImage : c.backgroundColor;});
   }
   const vals = Object.values(seen);
   ok(new Set(vals).size===4,`${pal}: gold/win/loss/tie are four distinct fills`);
   ok(seen.win!==seen.loss,`${pal}: a win never looks like a loss`);

   // readability, measured
   await p.addScriptTag({content:CONTRAST});
   for (const st of ['win','loss','tie']) {
     await force(st); await sleep(100);
     await p.addScriptTag({content:CONTRAST});
     for (const sel of ['.lk-team','.lk-res','.lk-score','.lk-k']) {
       const r = await p.evaluate((s)=>window.__contrast(s), sel);
       const big = r.size >= 18.66;               // AA large-text threshold at bold
       const need = big ? 3 : 4.5;
       ok(r && r.ratio >= need, `${pal} ${st} ${sel}: ${r.ratio.toFixed(2)}:1 @ ${r.size.toFixed(1)}px (needs ${need})`);
     }
   }
 }

 console.log('\n— nothing else moved —');
 await p.evaluate(()=>{document.documentElement.setAttribute('data-palette','champagne');
   document.documentElement.setAttribute('data-theme','light');});
 await sleep(150);
 ok(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'no sideways scroll');
 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 } finally { await b.close(); }
 console.log(`\n${pass} passed, ${fail} failed\n`);
 process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
