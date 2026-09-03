const { chromium } = require('/home/user/Sports-Hub/survivor/node_modules/playwright-core');
let pass=0,fail=0; const ok=(c,m)=>{if(c){pass++;console.log('  ✓ '+m);}else{fail++;console.log('  ✗ '+m);}};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const SB='http://127.0.0.1:8099/';
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
 try {

 console.log('\n— a "final" with no score is never frozen onto the phone —');
 {
  const ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:'America/New_York'});
  const p=await ctx.newPage();
  await p.goto(SB,{waitUntil:'networkidle'});
  const r=await p.evaluate(()=>{
    const good=[{id:'a',week:1,state:'post',home:{abbr:'KC',score:27},away:{abbr:'DEN',score:17}}];
    const bad =[{id:'a',week:1,state:'post',home:{abbr:'KC',score:null},away:{abbr:'DEN',score:17}}];
    const settled=(gs)=>gs.length&&gs.every(g=>g.state==='post'
      &&typeof g.home.score==='number'&&typeof g.away.score==='number');
    return { good:settled(good), bad:settled(bad) };
  });
  ok(r.good===true,'a properly finished week still caches');
  ok(r.bad===false,'one null score keeps the whole week re-fetchable');
  // and a bad copy already on the device is thrown away
  const purged=await p.evaluate(()=>{
    const k=`survivor:wk:2026:5`;
    localStorage.setItem(k, JSON.stringify([{id:'x',home:{abbr:'KC',score:null},away:{abbr:'DEN',score:3},state:'post'}]));
    const cached=JSON.parse(localStorage.getItem(k));
    const usable=cached&&cached.length&&cached.every(g=>g&&g.home&&g.away
      &&typeof g.home.score==='number'&&typeof g.away.score==='number');
    if (!usable) localStorage.removeItem(k);
    return { usable, still:localStorage.getItem(k) };
  });
  ok(purged.usable===false&&purged.still===null,'and a broken copy written by an older version is dropped');
  await ctx.close();
 }

 console.log('\n— a browser that saves nothing is told so, not blamed on the link —');
 {
  const ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:'America/New_York'});
  await ctx.addInitScript(()=>{
    const die=()=>{ throw new DOMException('denied','SecurityError'); };
    Object.defineProperty(window,'localStorage',{get:die,configurable:true});
  });
  const p=await ctx.newPage();
  await p.goto(SB+'?u=nana-abc123',{waitUntil:'domcontentloaded'});
  await sleep(2200);
  const txt=await p.evaluate(()=>document.body.innerText);
  ok(/isn.t saving anything|Private Browsing/i.test(txt),'it names the real cause');
  ok(!/Ask Jack/.test(txt),'and does not send them to the commissioner over nothing');
  ok(/open your normal browser/i.test(txt),'with something they can actually do');
  await ctx.close();
 }

 console.log('\n— a pick that did not save does not say it did —');
 {
  const ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:'America/New_York'});
  const p=await ctx.newPage();
  await p.goto(SB,{waitUntil:'networkidle'});
  if (await p.locator('#first-demo').count()) { await p.click('#first-demo'); await p.waitForSelector('#tabs:not([hidden])'); }
  await sleep(1600);
  const r=await p.evaluate(async()=>{
    S.weekPinned=true; S.week=S.liveWeek+1; await ensureWeeks([S.week]);
    const used=usedTeams(S.me.id,S.week);
    const g=(S.games[S.week]||[]).find(x=>x.state==='pre'&&!used[x.away.abbr]);
    const real=localStorage.setItem.bind(localStorage);
    localStorage.setItem=(k,v)=>{ if(k==='survivor:local') throw new DOMException('full','QuotaExceededError'); return real(k,v); };
    const res=await S.store.submitPick(S.me.token,S.week,g.away.abbr,g.date);
    localStorage.setItem=real;
    return res;
  });
  ok(r.ok===false,'the store reports failure instead of a cheerful lie');
  ok(/would not save/i.test(r.error||''),`and says why: "${r.error}"`);
  await ctx.close();
 }

 console.log('\n— a kickoff we cannot read fails CLOSED —');
 {
  const ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:'America/New_York'});
  const p=await ctx.newPage();
  await p.goto(SB,{waitUntil:'networkidle'});
  if (await p.locator('#first-demo').count()) { await p.click('#first-demo'); await p.waitForSelector('#tabs:not([hidden])'); }
  await sleep(1600);
  const r=await p.evaluate(async()=>{
    S.weekPinned=true; S.week=S.liveWeek+1; await ensureWeeks([S.week]);
    const used=usedTeams(S.me.id,S.week);
    const g=(S.games[S.week]||[]).find(x=>x.state==='pre'&&!used[x.away.abbr]);
    const self=await S.store.submitPick(S.me.token,S.week,g.away.abbr,'not-a-real-date');
    const adm =await S.store.adminSetPick(S.me.token,S.me.id,S.week,g.home.abbr,'not-a-real-date');
    return { self, adm };
  });
  ok(r.self.ok===false,'a garbage date is refused, not waved through');
  ok(/can't read the kickoff/i.test(r.self.error||''),`with a readable reason: "${r.self.error}"`);
  ok(r.adm.ok===false,'the admin path refuses it too');
  await ctx.close();
 }

 } finally { await b.close(); }
 console.log(`\n${pass} passed, ${fail} failed\n`);
 process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
