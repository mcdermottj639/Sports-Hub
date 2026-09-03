const { chromium } = require('/home/user/Sports-Hub/survivor/node_modules/playwright-core');
let pass=0,fail=0; const ok=(c,m)=>{if(c){pass++;console.log('  ✓ '+m);}else{fail++;console.log('  ✗ '+m);}};
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
 const ctx=await b.newContext({viewport:{width:390,height:844},timezoneId:'America/New_York'});
 const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 try {
 await p.goto('http://127.0.0.1:8099/',{waitUntil:'networkidle'});
 if (await p.locator('#first-demo').count()) { await p.click('#first-demo'); await p.waitForSelector('#tabs:not([hidden])'); }
 await sleep(1600);
 await p.click('.tab[data-screen="stats"]'); await sleep(1800);

 console.log('\n— a hidden pick cannot be counted out of somebody else\'s bench —');
 const r=await p.evaluate(()=>{
   const wk=S.liveWeek, games=S.games[wk]||[];
   // somebody who is NOT me and whose week pick has not kicked off
   const secret=S.picks.find(x=>x.week===wk && x.player_id!==S.me.id && !pickVisible(x.team, games));
   if (!secret) return {none:true};
   const who=S.players.find(x=>x.id===secret.player_id);
   const all=usedTeams(secret.player_id,null), vis=usedTeamsVisible(secret.player_id,null);
   const st=statsFor(secret.player_id);
   return { name:who.display_name, team:secret.team,
     inAll:!!all[secret.team], inVisible:!!vis[secret.team],
     teamsLeft:st.teamsLeft, honest:ABBRS.filter(a=>!vis[a]).length,
     benchTop:st.benchTop, rendered:document.querySelector('#s-stats').innerText };
 });
 ok(!r.none,`found a hidden pick to test: ${r.name} on ${r.team}`);
 ok(r.inAll===true,'the raw usedTeams still knows about it — the data is unchanged');
 ok(r.inVisible===false,'but the VISIBLE view withholds it');
 ok(r.teamsLeft===r.honest,`their "teams left" is the honest ${r.honest}, not one lower`);
 ok(!r.benchTop.includes(r.team),'and the hidden team is still listed among their best left');
 ok(!new RegExp(`${r.team}`).test(r.rendered.split(r.name)[1]?.slice(0,80)||''),'nothing on the row names it');

 console.log('\n— but you can still see your OWN —');
 const me=await p.evaluate(()=>{
   const wk=S.liveWeek, games=S.games[wk]||[];
   const mine=S.picks.find(x=>x.week===wk && x.player_id===S.me.id);
   if (!mine) return {none:true};
   const vis=usedTeamsVisible(S.me.id,null);
   return { team:mine.team, counted:!!vis[mine.team], visible:pickVisible(mine.team, games) };
 });
 ok(me.none||me.counted,'your own pick still counts against your own bench');

 console.log('\n— the numbers still add up —');
 const sane=await p.evaluate(()=>S.players.map(pl=>{
   const st=statsFor(pl.id); const vis=usedTeamsVisible(pl.id,null);
   return st.teamsLeft===ABBRS.filter(a=>!vis[a]).length && st.teamsLeft>=0 && st.teamsLeft<=32;
 }).every(Boolean));
 ok(sane,'every player row is internally consistent');
 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 } finally { await b.close(); }
 console.log(`\n${pass} passed, ${fail} failed\n`);
 process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
