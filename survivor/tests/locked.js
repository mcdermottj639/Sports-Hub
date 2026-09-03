const { chromium } = require('/home/user/Sports-Hub/survivor/node_modules/playwright-core');
let pass=0,fail=0; const ok=(c,m)=>{if(c){pass++;console.log('  ✓ '+m);}else{fail++;console.log('  ✗ '+m);}};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
 const ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:'America/New_York'});
 const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 try {
 // a clean device so the demo re-seeds with kickoffs
 await p.goto('http://127.0.0.1:8099/',{waitUntil:'networkidle'});
 await p.evaluate(()=>localStorage.clear());
 await p.reload({waitUntil:'networkidle'});
 if (await p.locator('#first-demo').count()) { await p.click('#first-demo'); await p.waitForSelector('#tabs:not([hidden])'); }
 await sleep(1800);

 console.log('\n— a decided week cannot be re-picked —');
 const before=await p.evaluate(async()=>{
   S.weekPinned=true; S.week=S.liveWeek; await ensureWeeks([S.week]);
   const mine=pickIn(S.me.id,S.week);
   const g=(S.games[S.week]||[]).find(x=>x.home.abbr===mine.team||x.away.abbr===mine.team);
   g.state='post'; g.statusText='Final'; g.home.score=12; g.away.score=38;
   const t=tallyFor(S.me.id,S.games);
   return { team:mine.team, kickoff:mine.kickoff, w:t.w, l:t.l, pts:t.pts,
            used:Object.keys(usedTeams(S.me.id,null)).length, hadTeam:!!usedTeams(S.me.id,null)[mine.team] };
 });
 ok(before.kickoff,'the seeded pick carries its kickoff, so the guard has something to judge');
 ok(before.hadTeam,`${before.team} is on the used list`);
 const other=await p.evaluate(async()=>{
   const mine=pickIn(S.me.id,S.week);
   const g=(S.games[S.week]||[]).find(x=>x.state==='pre'&&x.away.abbr!==mine.team&&x.home.abbr!==mine.team
     && !usedTeams(S.me.id,S.week)[x.away.abbr]);
   return g ? { team:g.away.abbr, date:g.date } : null;
 });
 ok(other,`found an unstarted game to try switching to (${other && other.team})`);
 const r=await p.evaluate(async(o)=>await S.store.submitPick(S.me.token, S.week, o.team, o.date), other);
 ok(r.ok===false,'the store refuses the switch');
 ok(/already started/.test(r.error||''),`with a sentence a person can read: "${r.error}"`);
 const after=await p.evaluate(()=>{
   const t=tallyFor(S.me.id,S.games);
   const mine=pickIn(S.me.id,S.week);
   return { team:mine.team, w:t.w, l:t.l, pts:t.pts, used:Object.keys(usedTeams(S.me.id,null)).length };
 });
 ok(after.team===before.team,'the original pick is untouched');
 ok(after.l===before.l&&after.pts===before.pts,`the loss and the margin survive (${after.l} losses, ${after.pts} pts)`);
 ok(after.used===before.used,'and the team stays spent — it is not handed back');

 console.log('\n— but a week still in play can be changed freely —');
 const open=await p.evaluate(async()=>{
   S.week=S.liveWeek+1; await ensureWeeks([S.week]);
   // ⚠️ must be teams this player has NOT already spent, or the refusal under
   // test is the no-repeat rule rather than the lock.
   const used=usedTeams(S.me.id,S.week);
   const g=(S.games[S.week]||[]).filter(x=>x.state==='pre'&&!used[x.away.abbr]);
   const a=g[0], c=g[1];
   const r1=await S.store.submitPick(S.me.token,S.week,a.away.abbr,a.date);
   S.picks=await S.store.listPicks();
   const r2=await S.store.submitPick(S.me.token,S.week,c.away.abbr,c.date);
   S.picks=await S.store.listPicks();
   return { r1, r2, ended:pickIn(S.me.id,S.week).team, wanted:c.away.abbr,
            freed:!usedTeams(S.me.id,null)[a.away.abbr] };
 });
 ok(open.r1.ok&&open.r2.ok,`both picks are accepted (${open.r1.error||'ok'} / ${open.r2.error||'ok'})`);
 ok(open.ended===open.wanted,'the second one wins — changing your mind still works');
 ok(open.freed,'and the team you changed away from is free again, as it should be');

 console.log('\n— the commissioner is held to it too —');
 const adm=await p.evaluate(async()=>{
   const victim=S.players.find(x=>x.id!==S.me.id);
   const wk=S.liveWeek;
   const cur=pickIn(victim.id,wk);
   if (!cur) return {skip:true};
   // make their game decided
   const g=(S.games[wk]||[]).find(x=>x.home.abbr===cur.team||x.away.abbr===cur.team);
   if (g) { g.state='post'; g.statusText='Final'; }
   const free=(S.games[wk]||[]).find(x=>x.state==='pre'&&!usedTeams(victim.id,wk)[x.away.abbr]);
   const r=await S.store.adminSetPick(S.me.token, victim.id, wk, free.away.abbr, free.date);
   S.picks=await S.store.listPicks();
   return { name:victim.display_name, ok:r.ok, err:r.error, still:pickIn(victim.id,wk).team, was:cur.team };
 });
 ok(adm.skip||adm.ok===false,`the admin path refuses too: "${adm.err}"`);
 ok(adm.skip||adm.still===adm.was,`${adm.name}'s pick is unchanged`);

 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 } finally { await b.close(); }
 console.log(`\n${pass} passed, ${fail} failed\n`);
 process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
