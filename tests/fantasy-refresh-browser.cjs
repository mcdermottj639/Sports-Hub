// Optional browser regression: PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium
// node tests/fantasy-refresh-browser.cjs (requires Playwright).
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright' : 'playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),fixture=require('./fixtures/matchup-hq-week7.json');
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const slate={week:{number:7},season:{type:2,year:2026},events:fixture.games.map(g=>({
  id:g.id,date:g.date,season:{year:g.season,type:g.seasonType},status:{type:{state:g.state,shortDetail:g.statusText}},
  competitions:[{competitors:['home','away'].map(side=>({homeAway:side,score:g[side].score,team:{id:g[side].abbr,abbreviation:g[side].abbr,displayName:g[side].abbr}})),odds:g.odds?[g.odds]:[]}],
}))};
const L=fixture.L;
const responses={roster:{team:L.team,roster:L.rosterFull,record:L.record,rules:L.rules,live:true},matchup:L.matchup,opponent:L.opponent,standings:L.standings,season:L.season,rosters:L.rosters,freeagents:L.freeAgents};
(async()=>{
  const server=http.createServer((req,res)=>{
    const file=path.join(root,new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
    if(!file.startsWith(root) || !fs.existsSync(file)){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',({html:'text/html',js:'application/javascript',css:'text/css',json:'application/json',webmanifest:'application/manifest+json'})[file.split('.').pop()]||'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
  try {
    for(const width of [390,320,1280]) {
      const context=await browser.newContext({viewport:{width,height:844},isMobile:width<761,hasTouch:width<761,serviceWorkers:'block'});
      const page=await context.newPage(),errors=[],calls=[];page.on('pageerror',e=>errors.push(e.message));
      let core=defer(),extras=defer(),nfl=defer(),failOpponent=false,offline=false;
      await page.addInitScript(({L,broken})=>{
        if(localStorage.getItem('fantasy-test-seeded'))return;
        const saved={...L,syncedAt:Date.now()-(broken?18*86400000:3600000)};
        if(broken)saved.opponent=null;
        localStorage.setItem('sportshub:cfg',JSON.stringify({configured:{football:true}}));
        localStorage.setItem('sportshub:league:football',JSON.stringify(saved));
        localStorage.setItem('fantasy-test-seeded','yes');
      },{L,broken:width===320});
      await page.route('**/*',async route=>{
        const u=new URL(route.request().url()),p=u.pathname;
        const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body||{})});
        if(u.origin===origin)return route.continue();
        if(u.hostname==='sports-hub-fantasy-api.onrender.com') {
          if(p==='/api/health')return json({configured:{football:true}});
          if(p==='/api/refresh'){calls.push('refresh');return json({ok:true});}
          if(p.startsWith('/api/fantasy/football/')) {
            const key=p.split('/').at(-1);calls.push(key);
            if(offline)return json({error:'offline'},503);
            if(key==='roster')await core.promise;
            if(key==='freeagents')await extras.promise;
            if(key==='opponent' && failOpponent)return json({error:'partial'},503);
            return json(responses[key]);
          }
        }
        if(p.endsWith('/football/nfl/scoreboard')){await nfl.promise;return json(slate);}
        return json({error:'Unrelated feed disabled in test'},503);
      });
      await page.goto(origin,{waitUntil:'load'});
      const tap=Date.now();
      await page.locator(width<761?'#botbar [data-desk-route="fantasy"]':'#tab-fantasy').click();
      await page.locator('#fbl-hq').click();
      await page.locator('.mhq').waitFor({state:'visible'});
      assert(Date.now()-tap<2500,'saved league must paint without either network gate');
      assert.equal(await page.locator('[data-fantasy-refresh]').isDisabled(),true);
      assert.match(await page.locator('.mhq-page').innerText(),/Waiting for a complete matchup/);
      assert(!/100\.0%/.test(await page.locator('.mhq-page').innerText()));
      nfl.resolve();
      if(width!==320)await page.waitForFunction(()=>document.querySelector('.mhq-page')?.textContent.includes('46.5%'));
      else assert.match(await page.locator('.mhq-page').innerText(),/opponent lineup/);
      core.resolve();
      await page.waitForFunction(()=>fanState.syncStatus?.phase==='details');
      assert.match(await page.locator('.mhq-sub').innerText(),/Pepperoni TDs/);
      assert.match(await page.locator('.mhq-page').innerText(),/46.5%/);
      await page.locator('[data-page="lab"]').click();extras.resolve();
      await page.waitForFunction(()=>fanState.syncStatus?.phase==='ready');
      assert.equal(await page.locator('[data-page="lab"]').getAttribute('aria-selected'),'true');
      const saved=await page.evaluate(()=>localStorage.getItem('sportshub:league:football'));
      assert.equal(JSON.parse(saved).opponent.opponent,'Pepperoni TDs');
      // Repaint the same mount repeatedly, then refresh once with a broken core.
      await page.evaluate(async()=>{for(let i=0;i<5;i++)await paintFootballView();});
      const before=calls.length;failOpponent=true;
      await page.locator('[data-fantasy-refresh]').click();
      await page.waitForFunction(()=>fanState.syncStatus?.phase==='failed');
      const delta=calls.slice(before);
      assert.equal(delta.filter(x=>x==='refresh').length,1);
      assert.equal(delta.filter(x=>x==='roster').length,1);
      assert.equal(await page.evaluate(()=>localStorage.getItem('sportshub:league:football')),saved);
      assert.equal(await page.locator('[data-fantasy-refresh]').isDisabled(),false);
      assert.match(await page.locator('[data-fantasy-sync-status]').innerText(),/last complete matchup is still saved/);
      assert.equal(await page.locator('[data-page="lab"]').getAttribute('aria-selected'),'true');
      // A reload can show the durable snapshot even when every league endpoint fails.
      offline=true;await page.reload({waitUntil:'load'});
      await page.locator('#fbl-hq').click();
      await page.waitForFunction(()=>fanState.syncStatus?.phase==='failed');
      await page.waitForFunction(()=>document.querySelector('.mhq-page')?.textContent.includes('46.5%'));
      assert.match(await page.locator('.mhq-sub').innerText(),/Pepperoni TDs/);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      assert.deepEqual(errors,[]);
      await page.screenshot({path:`/tmp/sports-fantasy-sticky-${width}.png`});
      console.log(JSON.stringify({width,savedBeforeNetwork:true,oldIncompleteGuard:true,coreBeforeDetails:true,oneRefreshPerTap:true,failedRefreshPreserved:true,reloadOffline:true,errors}));
      await context.close();
    }
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
