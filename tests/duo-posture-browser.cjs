// Optional browser regression for the v372 iPhone Duo half-fold layouts.
// PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome node tests/duo-posture-browser.cjs
// Chrome emulates the fold with CDP Emulation.setDeviceMetricsOverride
// displayFeature, which drives window.viewport.segments (the same API Safari
// 27.1 exposes behind its feature flag). Feeds other than a stub NFL
// scoreboard are disabled. Screenshots go to $DUO_SHOTS when set.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),shots=process.env.DUO_SHOTS;
const now=Date.now(),iso=ms=>new Date(ms).toISOString();
const team=(abbr,name)=>({id:abbr,abbreviation:abbr,displayName:name,shortDisplayName:name,name});
const ev=(id,state,detail,date,away,home,as,hs)=>({id,date:iso(date),season:{year:2026,type:2},week:{number:11},
  status:{type:{state,shortDetail:detail,completed:state==='post'}},
  competitions:[{date:iso(date),competitors:[{homeAway:'home',score:hs,team:home},{homeAway:'away',score:as,team:away}],odds:[{details:'NYG -2.5',overUnder:41.5}]}]});
const slate={week:{number:11},season:{type:2,year:2026},events:[
  ev('9001','post','Final',now-86400000,team('BUF','Bills'),team('MIA','Dolphins'),'24','17'),
  ev('9002','in','2nd 4:12',now-3600000,team('WSH','Commanders'),team('NYG','Giants'),'10','13'),
  ev('9003','pre','Sun 1:00 PM',now+86400000,team('PHI','Eagles'),team('DAL','Cowboys'),'0','0'),
  ev('9004','pre','Sun 4:25 PM',now+90000000,team('KC','Chiefs'),team('LV','Raiders'),'0','0'),
]};
const poses={
  seatedLate:{width:676,height:900},
  seated:{width:676,height:900,feature:{orientation:'horizontal',offset:450,maskLength:0}},
  book:{width:951,height:676,feature:{orientation:'vertical',offset:475,maskLength:0}},
  folded:{width:466,height:677},open:{width:960,height:676},phone:{width:390,height:844},
};
(async()=>{
  const server=http.createServer((req,res)=>{
    const file=path.join(root,new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
    if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',({html:'text/html',js:'application/javascript',css:'text/css',json:'application/json',webmanifest:'application/manifest+json'})[file.split('.').pop()]||'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
  const failures=[];
  const open=async(name,hash='',noJsSegments=false)=>{
    const P=poses[name],mobile=P.width<761;
    const context=await browser.newContext({viewport:{width:P.width,height:P.height},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    if(noJsSegments)await page.addInitScript(()=>{try{delete window.viewport;Object.defineProperty(window,'viewport',{value:undefined,configurable:true});delete window.viewport;}catch(e){}});
    await page.route('**/*',route=>{
      const u=new URL(route.request().url());
      if(u.origin===origin)return route.continue();
      if(u.pathname.endsWith('/football/nfl/scoreboard'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(slate)});
      if(/fonts\.(googleapis|gstatic)/.test(u.hostname))return route.fulfill({status:200,body:''});
      return route.fulfill({status:503,contentType:'application/json',body:'{"error":"disabled in test"}'});
    });
    // Playwright's own screenshot emulation drops this override, so shot()
    // re-applies it afterwards (fold).
    const fold=P.feature?async()=>{
      const cdp=await context.newCDPSession(page);
      await cdp.send('Emulation.setDeviceMetricsOverride',{width:P.width,height:P.height,deviceScaleFactor:2,mobile,displayFeature:P.feature});
      await cdp.send('Emulation.setDevicePostureOverride',{posture:{type:'folded'}});
    }:async()=>{};
    page.fold=fold;await fold();
    await page.goto(origin+'/'+(hash||''),{waitUntil:'load'});
    await page.waitForTimeout(1800);
    return {page,context,errors};
  };
  const shot=async(page,name)=>{if(shots){fs.mkdirSync(shots,{recursive:true});await page.screenshot({path:path.join(shots,name+'.png')});await page.fold();await page.waitForTimeout(400);}};
  const check=async(label,fn)=>{try{await fn();console.log('ok  ',label);}catch(e){failures.push(label);console.log('FAIL',label,'—',e.message);}};
  const noOverflow=async page=>{const o=await page.evaluate(()=>({s:document.documentElement.scrollWidth,w:innerWidth}));assert.ok(o.s<=o.w,`scrollWidth ${o.s} > ${o.w}`);};
  try{
    // Seated: featured game above the fold, list + dock below.
    {const {page,context,errors}=await open('seated');
      await check('seated: pose detected from two stacked segments',async()=>{
        const a=await page.evaluate(()=>({pose:document.documentElement.dataset.duoPose,top:getComputedStyle(document.documentElement).getPropertyValue('--fold-top').trim(),bottom:getComputedStyle(document.documentElement).getPropertyValue('--fold-bottom').trim()}));
        assert.equal(a.pose,'seated');assert.equal(a.top,'438px');assert.equal(a.bottom,'462px');
      });
      await check('seated Today: live game is featured BELOW the fold',async()=>{
        const f=await page.evaluate(()=>{const p=document.getElementById('duo-feature');const r=p.getBoundingClientRect();return {hidden:p.hidden,top:r.top,bottom:r.bottom,h:innerHeight,key:p.querySelector('[data-desk-game]')?.dataset.deskGame};});
        assert.equal(f.hidden,false);assert.equal(f.key,'nfl:9002');assert.ok(f.top>=462,`pane top ${f.top}`);assert.ok(f.bottom<=f.h);
      });
      await check('seated Today: list and dock live in the top half',async()=>{
        const y=await page.evaluate(()=>({row:document.querySelector('#desk-agenda .desk-game').getBoundingClientRect().top,dock:document.getElementById('botbar').getBoundingClientRect().bottom,body:document.body.getBoundingClientRect().bottom,dockTop:document.getElementById('botbar').getBoundingClientRect().top}));
        assert.ok(y.row<438,`first row at ${y.row}`);assert.ok(y.dock<=439,`dock bottom ${y.dock}`);assert.ok(y.body<=y.dockTop+1,`page ${y.body} under dock ${y.dockTop}`);
      });
      await check('seated: the document never scrolls; the top half does',async()=>{
        const s=await page.evaluate(()=>{document.body.scrollTop=300;const moved=document.body.scrollTop;window.scrollTo(0,400);return {moved,win:scrollY,docH:document.documentElement.scrollHeight,h:innerHeight,pane:document.getElementById('duo-feature').getBoundingClientRect().top};});
        assert.ok(s.moved>0,'top half scrolls');assert.equal(s.win,0);assert.ok(s.pane>=462,'pane stays put');
        await page.evaluate(()=>{document.body.scrollTop=0;});
      });
      await shot(page,'seated-today');
      await check('seated Today: tapping a row swaps the featured game, no report',async()=>{
        await page.locator('#desk-agenda [data-desk-game="nfl:9003"]').scrollIntoViewIfNeeded();
        await page.locator('#desk-agenda [data-desk-game="nfl:9003"]').click();
        await page.waitForFunction(()=>document.querySelector('#duo-feature [data-desk-game]')?.dataset.deskGame==='nfl:9003',null,{timeout:3000}).catch(()=>{});
        const s=await page.evaluate(()=>({key:document.querySelector('#duo-feature [data-desk-game]')?.dataset.deskGame,modal:document.getElementById('game-modal').classList.contains('hidden')}));
        assert.equal(s.key,'nfl:9003');assert.equal(s.modal,true);
      });
      await check('seated Today: tapping the featured card (bottom) opens its report across the top half',async()=>{
        await page.locator('#duo-feature [data-desk-game]').click();
        await page.waitForTimeout(600);
        const m=await page.evaluate(()=>{const g=document.getElementById('game-modal');const card=g.querySelector('.modal-card');const c=card.getBoundingClientRect();card.scrollTop=200;return {open:!g.classList.contains('hidden'),bottom:c.bottom,left:c.left,right:c.right,w:innerWidth,scrolls:card.scrollHeight<=card.clientHeight||card.scrollTop>0};});
        assert.equal(m.open,true);assert.ok(m.bottom<=439,`report bottom ${m.bottom}`);assert.equal(Math.round(m.left),0);assert.equal(Math.round(m.right),m.w);assert.equal(m.scrolls,true);
      });
      await shot(page,'seated-report');
      await page.evaluate(()=>document.getElementById('modal-x')?.click());
      await check('seated Models: page above the fold, dock is a deck below it',async()=>{
        await page.locator('#botbar [data-desk-route]').nth(1).click();
        await page.waitForFunction(()=>document.body.dataset.deskPanel!=='home',null,{timeout:3000}).catch(()=>{});await page.waitForTimeout(300);
        const d=await page.evaluate(()=>{const b=document.getElementById('botbar').getBoundingClientRect();return {top:b.top,bottom:b.bottom,h:innerHeight,feature:!document.getElementById('duo-feature')||document.getElementById('duo-feature').hidden};});
        assert.equal(Math.round(d.top),438);assert.equal(Math.round(d.bottom),d.h);assert.equal(d.feature,true);
      });
      await shot(page,'seated-models');
      await check('seated: no sideways overflow',()=>noOverflow(page));
      await check('seated: no page errors',async()=>assert.deepEqual(errors,[]));
      await context.close();}
    // Book: list on the left page, the rest on the right, report on the right page.
    {const {page,context,errors}=await open('book');
      await check('book: pose detected from side-by-side segments',async()=>{
        const p=await page.evaluate(()=>document.documentElement.dataset.duoPose);assert.equal(p,'book');
      });
      await check('book Today: games list ends before the fold; rest starts after it',async()=>{
        const g=await page.evaluate(()=>{const a=document.querySelector('#home .desk-agenda-card').getBoundingClientRect();const s=document.querySelector('#home .desk-stats').getBoundingClientRect();return {aRight:a.right,sLeft:s.left,sRight:s.right,w:innerWidth};});
        assert.ok(g.aRight<=463,`list right ${g.aRight}`);assert.ok(g.sLeft>=487,`right page starts ${g.sLeft}`);assert.ok(g.sRight<=g.w);
      });
      await shot(page,'book-today');
      await check('book: report opens on the right page; left page stays tappable',async()=>{
        await page.locator('#desk-agenda [data-desk-game="nfl:9002"]').click();await page.waitForTimeout(600);
        const m=await page.evaluate(()=>{const g=document.getElementById('game-modal');const r=g.getBoundingClientRect();const hit=document.elementFromPoint(200,400);return {open:!g.classList.contains('hidden'),left:r.left,leftHit:!g.contains(hit)};});
        assert.equal(m.open,true);assert.ok(m.left>=487,`report left ${m.left}`);assert.equal(m.leftHit,true);
      });
      await shot(page,'book-report');
      await check('book: no sideways overflow',()=>noOverflow(page));
      await check('book: no page errors',async()=>assert.deepEqual(errors,[]));
      await context.close();}
    // v373: the phone opens flat and is folded LATER, with no viewport resize.
    {const {page,context,errors}=await open('seatedLate');
      await check('late fold: starts flat',async()=>{
        assert.equal(await page.evaluate(()=>document.documentElement.dataset.duoPose),undefined);
      });
      const cdp=await context.newCDPSession(page);
      await cdp.send('Emulation.setDevicePostureOverride',{posture:{type:'folded'}});
      await cdp.send('Emulation.setDeviceMetricsOverride',{width:676,height:900,deviceScaleFactor:2,mobile:true,displayFeature:{orientation:'horizontal',offset:450,maskLength:0}});
      await check('late fold: pose picked up within 2s, no reload',async()=>{
        await page.waitForFunction(()=>document.documentElement.dataset.duoPose==='seated',null,{timeout:2500});
      });
      await check('late fold: readout names the pose',async()=>{
        const t=await page.evaluate(()=>document.getElementById('duo-diag')?.textContent||'');
        assert.match(t,/seated/);
      });
      await cdp.send('Emulation.setDeviceMetricsOverride',{width:676,height:900,deviceScaleFactor:2,mobile:true});
      await cdp.send('Emulation.setDevicePostureOverride',{posture:{type:'continuous'}});
      await check('late fold: unfolding clears it again',async()=>{
        await page.waitForFunction(()=>!document.documentElement.dataset.duoPose,null,{timeout:2500});
      });
      await check('late fold: no page errors',async()=>assert.deepEqual(errors,[]));
      await context.close();}
    // v373: only the CSS half of the API (no window.viewport) still works.
    {const {page,context,errors}=await open('book',null,true);
      await check('css-only: book pose from media queries + env()',async()=>{
        const s=await page.evaluate(()=>({pose:document.documentElement.dataset.duoPose,vp:'viewport' in window,diag:document.getElementById('duo-diag')?.textContent||''}));
        assert.equal(s.vp,false);assert.equal(s.pose,'book');assert.match(s.diag,/css/);
      });
      await check('css-only: no page errors',async()=>assert.deepEqual(errors,[]));
      await context.close();}
    // Flat screens: nothing from v372 applies.
    for(const name of ['folded','open','phone']){
      const {page,context,errors}=await open(name);
      await check(`${name}: no pose, no featured pane`,async()=>{
        const s=await page.evaluate(()=>({pose:document.documentElement.dataset.duoPose,pane:document.getElementById('duo-feature'),pt:getComputedStyle(document.body).paddingTop}));
        assert.equal(s.pose,undefined);assert.ok(!s.pane||s.pane.hidden);
      });
      await check(`${name}: no sideways overflow`,()=>noOverflow(page));
      await check(`${name}: no page errors`,async()=>assert.deepEqual(errors,[]));
      await context.close();
    }
  }finally{await browser.close();server.close();}
  if(failures.length){console.log(`\n${failures.length} failed`);process.exit(1);}
  console.log('\nall duo posture checks passed');
})();
