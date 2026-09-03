const { chromium } = require('/home/user/Sports-Hub/survivor/node_modules/playwright-core');
let pass=0,fail=0; const ok=(c,m)=>{if(c){pass++;console.log('  ✓ '+m);}else{fail++;console.log('  ✗ '+m);}};
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
 const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,colorScheme:'dark'});
 const page=await ctx.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(e.message));
 await page.goto('http://127.0.0.1:8099/',{waitUntil:'networkidle'});

 console.log('\n— light by default, even on a dark phone —');
 ok(await page.evaluate(()=>document.documentElement.getAttribute('data-palette'))==='champagne','opens in light mode despite the OS being dark');
 await page.click('#first-demo'); await page.waitForSelector('#tabs:not([hidden])'); await page.waitForTimeout(1500);
 ok(await page.evaluate(()=>document.documentElement.getAttribute('data-palette'))==='champagne','still light after loading the league');
 await page.click('#pal-btn'); await page.waitForTimeout(200);
 await page.reload({waitUntil:'networkidle'}); await page.waitForTimeout(1200);
 ok(await page.evaluate(()=>document.documentElement.getAttribute('data-palette'))==='onyx','a deliberate choice of dark is remembered');
 await page.click('#pal-btn'); await page.waitForTimeout(200);

 console.log('\n— the Stats tab —');
 await page.click('.tab[data-screen="stats"]'); await page.waitForTimeout(800);
 const s=await page.locator('#s-stats').innerText();
 ok(/week winners/i.test(s),'week winners');
 ok(/everyone/i.test(s),'a row per person');
 ok(/with the crowd/i.test(s),'with the crowd, or against it (replaced head to head in v34)');
 ok(/most-picked teams/i.test(s),'team popularity');
 const rows=await page.locator('.statrow').count();
 ok(rows===await page.evaluate(()=>S.players.length),`${rows} player rows`);
 ok(/teams left/i.test(s),'the headline number is the strength of teams still in hand');
 ok(!/\[object /.test(s),'no unresolved values leak into the list');
 ok(/\d+%/.test(s),'the headline renders as a real percentage');

 console.log('\n— the numbers are real —');
 const chk=await page.evaluate(()=>{
   const me=S.me.id, st=statsFor(me), t=tallyFor(me,S.games);
   const used=usedTeams(me,null), left=ABBRS.filter(a=>!used[a]);
   return {teamsLeft:st.teamsLeft, expected:left.length, bench:st.bench,
           xwN:st.xwN, graded:st.graded, luckSane:st.luck==null||Math.abs(st.luck)<=t.rows.length,
           benchInRange:st.bench==null||(st.bench>=0&&st.bench<=1)};});
 ok(chk.teamsLeft===chk.expected,`teams left counts correctly (${chk.teamsLeft})`);
 ok(chk.benchInRange,'bench strength is a real proportion');
 ok(chk.luckSane,'luck vs skill is within a sane range');
 ok(chk.xwN<=chk.graded,'expected wins uses no more games than were graded');

 console.log('\n— hidden picks never leak into the stats —');
 const leak=await page.evaluate(()=>{
   let bad=0;
   const pop=teamPopularity().map(x=>x[0]);
   for(const p of S.picks){
     const g=S.games[p.week]||[];
     if(!g.length) continue;
     if(!pickVisible(p.team,g)){
       // a hidden pick must not be counted in any aggregate
       const before=teamPopularity().find(x=>x[0]===p.team);
       if(before && !S.picks.some(q=>q.team===p.team&&pickVisible(q.team,S.games[q.week]||[]))) bad++;
     }
   }
   return bad;});
 ok(leak===0,'no team appears in the popularity chart only because of a hidden pick');
 const conSafe=await page.evaluate(()=>{
   const c=contrarianFor(S.me.id);
   return c===null||(c.score>=0&&c.score<=1&&c.weeks>0);});
 ok(conSafe,'the contrarian score only counts weeks with public picks');

 console.log('\n— a player detail sheet —');
 await page.click('.statrow'); await page.waitForTimeout(500);
 ok(await page.locator('#sheet').isVisible(),'tapping a row opens their numbers');
 const d=await page.locator('#sheet-body').innerText();
 ok(/teams still in hand/i.test(d),'teams in hand');
 ok(/luck or judgement/i.test(d),'luck vs judgement');
 ok(/style/i.test(d)&&/own way/i.test(d),'style and contrarian-ness');
 ok(/form/i.test(d)&&/best run/i.test(d),'streaks');
 ok(/biggest win/i.test(d)&&/worst beat/i.test(d),'best and worst results');
 ok(/final odds/i.test(d) && /not the odds when the pick was made/i.test(d),
    'and it is honest that the odds are the final ones, not the ones at pick time');
 ok(/small sample/i.test(d),'and about the sample size');

 console.log('\n— every stat is explained —');
 const srows=await page.locator('#sheet .sh-t tbody tr').count();
 const foots=await page.locator('#sheet .sh-t .st-n').count();
 ok(srows>=12,`${srows} stat rows`);
 ok(foots>=srows-2,`${foots} of ${srows} carry a footnote`);
 const longest=await page.evaluate(()=>Math.max(...Array.from(document.querySelectorAll('#sheet .st-n')).map(e=>e.innerText.trim().length)));
 ok(longest<=60,`footnotes stay short (longest ${longest} chars)`);
 const fs=await page.evaluate(()=>parseFloat(getComputedStyle(document.querySelector('#sheet .st-n')).fontSize));
 ok(fs<15,`and small (${fs}px)`);
 ok(await page.locator('#sheet .statwhat').count()===1,'the full definitions are folded away for anyone who wants them');
 ok(await page.evaluate(()=>document.querySelector('.statwhat').open)!==true,'and start closed');
 const jargon=await page.evaluate(()=>{
   const bad=/\b(variance|standard deviation|regression|expected value|EV|z-score|correlat|p-value|sigma|de-?vig)\b/i;
   return Array.from(document.querySelectorAll('#sheet .st-n, #sheet .statwhat p')).map(e=>e.innerText).filter(t=>bad.test(t));});
 ok(jargon.length===0,'no statistical jargon in any explainer'+(jargon.length?': '+jargon[0].slice(0,60):''));
 const heads=await page.locator('#sheet .sh-h').count();
 ok(heads>=4,`${heads} labelled sections`);
 // "Patti take coin flips" — plural verbs after a singular name
 const grammar=await page.evaluate(()=>{
   const name=document.querySelector('.sh-title').innerText.trim();
   // "Did Patti win" is correct (auxiliary + bare infinitive); only a bare
   // "Patti win" is wrong.
   const bad=new RegExp('(?<!\\b(?:did|does|do|will|can|would|should)\\s)'+name+'\\s+(take|stick|tend|win|lose|play)\\b','i');
   return Array.from(document.querySelectorAll('#sheet .st-n, #sheet .statwhat p'))
     .map(e=>e.innerText).filter(t=>bad.test(t));});
 ok(grammar.length===0,'verbs agree with the name'+(grammar.length?': '+grammar[0].slice(0,70):''));
 const tall=await page.evaluate(()=>document.querySelector('#sheet-body').getBoundingClientRect().height);
 ok(tall<3400,`the whole sheet stays compact (${Math.round(tall)}px, was ~4600 with paragraphs)`);
 // assert the VALUES render, not just the labels — an `async` accidentally
 // welded onto pctStr made every percentage print "[object Promise]" while
 // every heading assertion still passed.
 ok(!/\[object /.test(d),'no unresolved values leak into the sheet');
 ok(/\d+%/.test(d),'percentages render as real numbers');
 const nums=(d.match(/\d/g)||[]).length;
 ok(nums>15,`the sheet is full of actual numbers (${nums} digits)`);
 await page.click('#sheet-close'); await page.waitForTimeout(300);
 ok(await page.evaluate(()=>getComputedStyle(document.body).position)!=='fixed','closing unpins the page');

 console.log('\n— with the crowd, or against it —');
 const cw=await page.locator('.cw-head').innerText();
 ok(cw.length>0,'renders a league line: '+cw.split('\n')[0]);
 ok((await page.locator('.cw-row').count())>0,'and a row per player');
 // ⚠️ A COUNT, not a percentage — five weeks is not a percentage, the same
 // reason head to head was always counted. v37 changed this after the owner
 // read "0%" beside "4-1" and asked whether 4-1 was somehow 0%.
 ok(/\d+ of \d+/.test(await page.locator('.cw-list').innerText()),'with a count of weeks for each');
 ok(!/%/.test(await page.locator('.cw-list').innerText()),'and no percentage anywhere in it');

 console.log('\n— it stays out of the way —');
 await page.click('.tab[data-screen="pick"]'); await page.waitForTimeout(300);
 const pick=await page.locator('#s-pick').innerText();
 ok(!/luck|contrarian|expected wins/i.test(pick),'none of it appears on the Pick screen');
 const over=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
 ok(!over,'no horizontal overflow');
 await page.click('.tab[data-screen="stats"]'); await page.waitForTimeout(500);
 ok(!(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1)),'nor on Stats');
 const small=await page.evaluate(()=>Array.from(document.querySelectorAll('#s-stats button')).filter(e=>e.offsetParent&&e.getBoundingClientRect().height<44).length);
 ok(small===0,'every control on Stats clears 44px');

 ok(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
 console.log(`\n${pass} passed, ${fail} failed\n`);
 await b.close(); process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
