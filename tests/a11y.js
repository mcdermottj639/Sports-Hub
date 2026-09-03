const { chromium } = require('/home/user/Sports-Hub/survivor/node_modules/playwright-core');
let pass=0, fail=0;
const ok=(c,m)=>{ if(c){pass++;console.log('  ✓ '+m);} else {fail++;console.log('  ✗ '+m);} };
const lum=h=>{h=h.replace(/[^0-9a-f]/gi,'');const[r,g,b]=[0,2,4].map(i=>parseInt(h.substr(i,2),16)/255);
  const f=c=>c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);};
const rgb2hex=s=>{const m=s.match(/\d+/g);return m?m.slice(0,3).map(n=>(+n).toString(16).padStart(2,'0')).join(''):'000000';};
const cr=(a,b)=>{const[L1,L2]=[lum(a),lum(b)].sort((x,y)=>y-x);return (L1+0.05)/(L2+0.05);};
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await ctx.newPage(); const errs=[];
  page.on('pageerror',e=>errs.push(e.message));
  await page.goto('http://127.0.0.1:8099/',{waitUntil:'networkidle'});
  await page.click('#first-demo'); await page.waitForSelector('#tabs:not([hidden])');

  for (const pal of ['champagne','onyx']) {
    await page.evaluate(p=>{document.documentElement.setAttribute('data-palette',p);
      document.documentElement.setAttribute('data-theme',p==='onyx'?'dark':'light');},pal);
    await page.waitForTimeout(150);
    console.log(`\n— contrast, ${pal} —`);
    // A locked pick folds the slate — open it, or .pk-rec below measures
    // nothing and the check silently disappears instead of failing.
    if (await page.locator('#cg-more').count()) { await page.click('#cg-more'); await page.waitForTimeout(300); }
    const checks=await page.evaluate(()=>{
      const out=[];
      const grab=(sel,label)=>{const e=document.querySelector(sel); if(!e||!e.offsetParent) return;
        const cs=getComputedStyle(e); let bg='rgba(0, 0, 0, 0)',n=e;
        while(n&&/^rgba\(0, 0, 0, 0\)$|^transparent$/.test(bg)){bg=getComputedStyle(n).backgroundColor;n=n.parentElement;}
        out.push({label,fg:cs.color,bg,size:parseFloat(cs.fontSize)});};
      grab('.pk-rec','team record (Pick)');
      grab('.ft .pillmode','footer mode pill');
      grab('.note','notes');
      return out;
    });
    for(const c of checks){
      const ratio=cr(rgb2hex(c.fg),rgb2hex(c.bg));
      ok(ratio>=4.5,`${c.label}: ${ratio.toFixed(2)}:1 @ ${c.size}px`);
    }
    await page.click('.tab[data-screen="standings"]'); await page.waitForTimeout(150);
    await page.click('[data-stview="grid"]'); await page.waitForTimeout(250);
    const g=await page.evaluate(()=>{
      const e=document.querySelector('.gcell.none')||document.querySelector('.gcell');
      const cs=getComputedStyle(e); let bg='rgba(0, 0, 0, 0)',n=e;
      while(n&&/^rgba\(0, 0, 0, 0\)$|^transparent$/.test(bg)){bg=getComputedStyle(n).backgroundColor;n=n.parentElement;}
      return {fg:cs.color,bg};});
    ok(cr(rgb2hex(g.fg),rgb2hex(g.bg))>=4.5,`grid cell text: ${cr(rgb2hex(g.fg),rgb2hex(g.bg)).toFixed(2)}:1`);
    await page.click('.tab[data-screen="pick"]'); await page.waitForTimeout(150);
  }

  console.log('\n— the margin is now readable without a gesture iOS lacks —');
  await page.click('.tab[data-screen="standings"]'); await page.waitForTimeout(150);
  await page.click('[data-stview="grid"]'); await page.waitForTimeout(250);
  const cellText=await page.$$eval('#s-standings .gcell', n=>n.map(x=>x.innerText.replace(/\n/g,' ')).slice(0,6));
  ok(cellText.some(t=>/[+−-]\d/.test(t)), 'margins visible in the cells: '+cellText.join(' | '));
  const legend=await page.locator('#s-standings').innerText();
  ok(!/tap and hold/i.test(legend), 'the impossible "tap and hold" instruction is gone');
  ok(/how much they won or lost by/i.test(legend), 'the legend explains the number instead');
  const colourOnly=await page.evaluate(()=>{
    const w=document.querySelector('.gcell.w'), l=document.querySelector('.gcell.l');
    return w&&l ? w.innerText!==l.innerText : true; });
  ok(colourOnly,'win and loss cells differ by more than colour');

  console.log('\n— type and targets —');
  // ⚠️ This scan used to run on whichever screen the previous section happened
  // to leave us on (standings), so a 15.05px line on the PICK card shipped
  // unnoticed for five versions. Sweep every screen.
  const everywhere=[];
  for (const sc of ['pick','standings','history','stats','admin']) {
    if (!await page.locator(`.tab[data-screen="${sc}"]`).count()) continue;
    await page.click(`.tab[data-screen="${sc}"]`); await page.waitForTimeout(350);
    const bad=await page.evaluate(()=>{
      const out=[];
      for(const e of document.querySelectorAll('main *')){
        if(!e.offsetParent||!e.childNodes.length) continue;
        if(!Array.from(e.childNodes).some(n=>n.nodeType===3&&n.textContent.trim())) continue;
        const fs=parseFloat(getComputedStyle(e).fontSize);
        // Exempt: the commissioner's own setup panel deliberately renders
        // keys and SQL in small monospace so they can be read and pasted —
        // that screen is one person, not the family.
        if(e.closest('#s-admin') && e.closest('.mono, code, pre')) continue;
        if(fs<15.5 && !e.closest('.hd-btn') && !e.matches('.gcell i')) out.push(`${e.className||e.tagName}:${fs.toFixed(2)}`);
      } return out;});
    bad.forEach(x=>everywhere.push(`${sc} ${x}`));
  }
  ok(everywhere.length===0,'no text under 15.5px on ANY screen'+(everywhere.length?': '+[...new Set(everywhere)].slice(0,6).join(', '):''));
  await page.click('.tab[data-screen="pick"]'); await page.waitForTimeout(300);
  if (await page.locator('#cg-more').count()) { await page.click('#cg-more'); await page.waitForTimeout(300); }

  const small=await page.evaluate(()=>{
    const bad=[];
    for(const e of document.querySelectorAll('main *, nav *, header *, footer *')){
      if(!e.offsetParent||!e.childNodes.length) continue;
      const hasText=Array.from(e.childNodes).some(n=>n.nodeType===3&&n.textContent.trim());
      if(!hasText) continue;
      const fs=parseFloat(getComputedStyle(e).fontSize);
      if(fs<15.5 && !e.closest('.hd-btn') && !e.matches('.gcell i')) bad.push(`${e.className||e.tagName}:${fs.toFixed(1)}`);
    } return bad; });
  ok(await page.locator('.pk').count()>0,'the pick screen really has team buttons to measure');
  // ⚠️ The 56px house floor is for PRIMARY controls. `.ibtn` — the little ⓘ
  // beside a game — is deliberately 44px, the iOS floor, so it cannot be
  // mistaken for the team button next to it. Asserted separately, not waived.
  const ib=await page.evaluate(()=>[...document.querySelectorAll('.ibtn')].map(e=>e.getBoundingClientRect().height));
  ok(!ib.length||Math.min(...ib)>=44,`the ⓘ buttons hold the 44px floor (${ib.length?Math.min(...ib):'none'})`);
  ok(small.length===0,'no visible text under ~16px'+(small.length?': '+small.slice(0,6).join(', '):''));
  const tap=await page.evaluate(()=>{
    // .ibtn is the one deliberate 44px control (asserted just above).
    const r=Array.from(document.querySelectorAll('button')).filter(e=>e.offsetParent&&!e.classList.contains('ibtn'));
    const under=r.filter(e=>e.getBoundingClientRect().height<56).map(e=>(e.id||e.className)+':'+e.getBoundingClientRect().height.toFixed(0));
    return {n:r.length,under}; });
  ok(tap.under.length===0,`all ${tap.n} buttons meet the 56px house floor`+(tap.under.length?': '+tap.under.join(', '):''));

  console.log('\n— labels and feedback —');
  const labels=await page.evaluate(()=>Array.from(document.querySelectorAll('button')).filter(e=>e.offsetParent)
    .filter(e=>!e.innerText.trim()&&!e.getAttribute('aria-label')).length);
  ok(labels===0,'every icon-only button has an aria-label');
  const hdr=await page.evaluate(()=>({big:document.querySelector('#big-btn').innerText.replace(/\n/g,''),
    pal:document.querySelector('#pal-btn').innerText.replace(/\n/g,'')}));
  ok(/Text/.test(hdr.big)&&/Theme/.test(hdr.pal),`header buttons carry visible words: "${hdr.big}" / "${hdr.pal}"`);
  const act=await page.evaluate(()=>{
    let found=false;
    for(const ss of document.styleSheets){ try{ for(const r of ss.cssRules){
      if(r.selectorText&&/:active/.test(r.selectorText)&&/transform/.test(r.cssText)) found=true; } }catch(e){} }
    return found; });
  ok(act,'a pressed state exists so a tap is confirmed instantly');

  console.log('\n— the page no longer jumps to the top on every tap —');
  await page.click('.tab[data-screen="pick"]'); await page.waitForTimeout(200);
  // A locked pick now folds the slate; open it, which is what a user does.
  if (await page.locator('#cg-more').count()) { await page.click('#cg-more'); await page.waitForTimeout(350); }
  await page.evaluate(()=>window.scrollTo(0,400)); await page.waitForTimeout(100);
  const before=await page.evaluate(()=>window.scrollY);
  const t=await page.evaluate(()=>{const b=Array.from(document.querySelectorAll('#s-pick .pk')).find(x=>!x.disabled);return b?b.dataset.team:null;});
  await page.click(`#s-pick .pk[data-team="${t}"]`); await page.waitForTimeout(350);
  await page.click('#cf-yes'); await page.waitForTimeout(600);
  const after=await page.evaluate(()=>window.scrollY);
  ok(after>0,`making a pick keeps your place (was ${before}, now ${after})`);
  await page.click('.tab[data-screen="standings"]'); await page.waitForTimeout(250);
  ok(await page.evaluate(()=>window.scrollY)===0,'but switching tabs still goes to the top');

  ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
  console.log(`\n${pass} passed, ${fail} failed\n`);
  await b.close(); process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
