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
  seatedWide:{width:960,height:676,feature:{orientation:'horizontal',offset:338,maskLength:0}},
  seatedDesktop:{width:1280,height:900,feature:{orientation:'horizontal',offset:450,maskLength:0}},
  seatedShort:{width:466,height:677,feature:{orientation:'horizontal',offset:339,maskLength:0}},
  seatedNarrow:{width:390,height:677,feature:{orientation:'horizontal',offset:339,maskLength:0}},
  book:{width:951,height:676,feature:{orientation:'vertical',offset:475,maskLength:0}},
  folded:{width:466,height:677},open:{width:960,height:676},phone:{width:390,height:844},
};
const manualMode=process.env.DUO_MANUAL_ONLY==='1';
// CI's Chromium may expose segments but report continuous posture despite CDP.
// Manual mode validates the user's actual button-driven split independently of native sensors.
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
    const page=await context.newPage(),errors=[];page.setDefaultTimeout(6000);page.setDefaultNavigationTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
    if(manualMode && P.feature && P.feature.orientation==='horizontal') await page.addInitScript(()=>localStorage.setItem('sportshub:duo-mode','on'));
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
      await check('seated Today: live game is featured ABOVE the fold',async()=>{
        const f=await page.evaluate(()=>{const p=document.getElementById('duo-feature');const r=p.getBoundingClientRect();return {hidden:p.hidden,top:r.top,bottom:r.bottom,key:p.querySelector('[data-desk-game]')?.dataset.deskGame};});
        assert.equal(f.hidden,false);assert.equal(f.key,'nfl:9002');assert.ok(f.bottom<=439,`pane bottom ${f.bottom}`);
      });
      await check('seated Today: list and dock live in the bottom half',async()=>{
        const y=await page.evaluate(()=>({top:document.querySelector('.topbar').getBoundingClientRect().top,dock:document.getElementById('botbar').getBoundingClientRect(),h:innerHeight}));
        assert.ok(y.top>=462,`page starts at ${y.top}`);assert.ok(Math.abs(y.dock.bottom-y.h)<=1,`dock bottom ${y.dock.bottom}`);
      });
      await check('seated: no fixed bar sits inside a scrolling ancestor (Safari clips those)',async()=>{
        const bad=await page.evaluate(()=>['ticker','botbar','duo-feature','game-modal'].filter(id=>{for(let n=document.getElementById(id).parentElement;n&&n!==document.documentElement;n=n.parentElement){const o=getComputedStyle(n);if(/(auto|scroll|hidden)/.test(o.overflowY)||o.position==='fixed')return true;}return false;}));
        assert.deepEqual(bad,[]);
      });
      await check('seated Today: ticker on top, page ends at the dock',async()=>{
        const g=await page.evaluate(()=>({tk:document.getElementById('ticker').getBoundingClientRect(),m:document.getElementById('main-content').getBoundingClientRect().bottom,d:document.getElementById('botbar').getBoundingClientRect().top}));
        assert.equal(Math.round(g.tk.top),0);assert.ok(g.tk.height>20);assert.ok(Math.abs(g.m-g.d)<=1,`main ${g.m} dock ${g.d}`);
      });
      await check('seated: the document never scrolls; the bottom half does',async()=>{
        const s=await page.evaluate(()=>{const M=document.getElementById('main-content');M.scrollTop=300;const moved=M.scrollTop;window.scrollTo(0,400);return {moved,win:scrollY,docH:document.documentElement.scrollHeight,h:innerHeight,pane:document.getElementById('duo-feature').getBoundingClientRect().top};});
        assert.ok(s.moved>0,'bottom half scrolls');assert.equal(s.win,0);assert.ok(s.pane<100,'pane stays put');
        await page.evaluate(()=>{document.getElementById('main-content').scrollTop=0;});
      });
      await check('seated: research history remains in list but not in clipped upper preview',async()=>{
        const s=await page.evaluate(()=>{
          const upper=document.querySelector('#duo-feature .desk-game-main');
          const lower=document.querySelector('#desk-agenda .desk-game-main');
          if(!upper||!lower) return {missing:true};
          const displays=[];
          for(const host of [upper,lower]){
            const moves=document.createElement('span');moves.className='desk-moves';moves.textContent='Saved line movements';
            const foot=document.createElement('span');foot.className='desk-read-foot';foot.textContent='Projection';
            host.append(moves,foot);
            displays.push({moves:getComputedStyle(moves).display,foot:getComputedStyle(foot).display});
            moves.remove();foot.remove();
          }
          const p=document.getElementById('duo-feature').getBoundingClientRect();
          const c=document.querySelector('#duo-feature .desk-game').getBoundingClientRect();
          return {displays,contained:c.top>=p.top-1&&c.bottom<=p.bottom+1};
        });
        assert.equal(s.missing,undefined,'game previews exist in both panes');
        assert.equal(s.displays[0].moves,'none');assert.equal(s.displays[0].foot,'none');
        assert.notEqual(s.displays[1].moves,'none');assert.notEqual(s.displays[1].foot,'none');
        assert.equal(s.contained,true,'compact game preview fits the upper pane');
      });
      if(manualMode) await check('manual Duo: selected button and upper game are visible',async()=>{
        const state=await page.evaluate(()=>({
          pressed:document.getElementById('duo-toggle').getAttribute('aria-pressed'),
          active:document.documentElement.dataset.duoPose,
          hidden:document.getElementById('duo-feature')?.hidden
        }));
        assert.deepEqual(state,{pressed:'true',active:'seated',hidden:false});
      });
      await shot(page,'seated-today');
      await check('seated Today: tapping a row swaps the featured game, no report',async()=>{
        await page.locator('#desk-agenda [data-desk-game="nfl:9003"]').scrollIntoViewIfNeeded();
        await page.locator('#desk-agenda [data-desk-game="nfl:9003"]').click();
        await page.waitForFunction(()=>document.querySelector('#duo-feature [data-desk-game]')?.dataset.deskGame==='nfl:9003',null,{timeout:3000}).catch(()=>{});
        const s=await page.evaluate(()=>({key:document.querySelector('#duo-feature [data-desk-game]')?.dataset.deskGame,modal:document.getElementById('game-modal').classList.contains('hidden')}));
        assert.equal(s.key,'nfl:9003');assert.equal(s.modal,true);
      });
      await check('seated Today: tapping the featured card opens its report across the top half',async()=>{
        await page.locator('#duo-feature [data-desk-game]').click();
        await page.waitForTimeout(600);
        const m=await page.evaluate(()=>{const g=document.getElementById('game-modal');const card=g.querySelector('.modal-card');const c=card.getBoundingClientRect();card.scrollTop=200;return {open:!g.classList.contains('hidden'),bottom:c.bottom,left:c.left,right:c.right,w:innerWidth,scrolls:card.scrollHeight<=card.clientHeight||card.scrollTop>0};});
        assert.equal(m.open,true);assert.ok(m.bottom<=439,`report bottom ${m.bottom}`);assert.equal(Math.round(m.left),0);assert.equal(Math.round(m.right),m.w);assert.equal(m.scrolls,true);
      });
      await shot(page,'seated-report');
      await page.evaluate(()=>document.getElementById('modal-x')?.click());
      await check('seated Models: featured game stays on top, page scrolls below above the slim dock',async()=>{
        await page.locator('#botbar [data-desk-route]').nth(1).click();
        await page.waitForFunction(()=>document.body.dataset.deskPanel!=='home',null,{timeout:3000}).catch(()=>{});await page.waitForTimeout(400);
        const d=await page.evaluate(()=>{const b=document.getElementById('botbar').getBoundingClientRect();const m=document.getElementById('main-content');const r=m.getBoundingClientRect();const f=document.getElementById('duo-feature');const fr=f.getBoundingClientRect();m.scrollTop=200;return {top:b.top,bottom:b.bottom,h:innerHeight,mTop:r.top,mBottom:r.bottom,y:scrollY,fHidden:f.hidden,fBottom:fr.bottom,fGame:!!f.querySelector('.desk-game')};});
        assert.ok(d.h-d.top<=80,`dock height ${d.h-d.top}`);assert.equal(Math.round(d.bottom),d.h);
        assert.equal(d.fHidden,false);assert.equal(d.fGame,true);assert.ok(d.fBottom<=439,`pane bottom ${d.fBottom}`);
        assert.ok(d.mTop>=462,`page starts below the fold ${d.mTop}`);assert.ok(d.mBottom<=d.top+1);assert.equal(d.y,0);
        await page.evaluate(()=>{document.getElementById('main-content').scrollTop=0;});
      });
      await shot(page,'seated-models');
      await check('seated: no sideways overflow',()=>noOverflow(page));
      await check('seated: no page errors',async()=>assert.deepEqual(errors,[]));
      await context.close();}
    // A detected stacked fold must use the split layout above the ordinary
    // phone breakpoint too, with live ticker and reports in the top half.
    for(const name of ['seatedWide','seatedDesktop','seatedShort','seatedNarrow']){
      const {page,context,errors}=await open(name),P=poses[name],edge=P.feature.offset;
      await check(`${name}: visible split, dock and top ticker at wide widths`,async()=>{
        const s=await page.evaluate(()=>{
          const rect=id=>document.getElementById(id).getBoundingClientRect();
          const f=document.getElementById('duo-feature'),main=document.getElementById('main-content');
          main.scrollTop=200;
          return {pose:document.documentElement.dataset.duoPose,f:rect('duo-feature'),ticker:rect('ticker'),
            main:rect('main-content'),dock:rect('botbar'),rail:getComputedStyle(document.getElementById('tabs')).display,
            featureDisplay:getComputedStyle(f).display,scrolled:main.scrollTop,win:scrollY};
        });
        assert.equal(s.pose,'seated');assert.notEqual(s.featureDisplay,'none');assert.equal(s.rail,'none');
        assert.equal(s.ticker.top,0);assert.ok(s.ticker.height>20);assert.ok(s.f.top>=s.ticker.bottom-1);
        assert.ok(s.f.bottom<=edge-11);assert.ok(s.main.top>=edge+12);assert.ok(s.main.height>80);
        assert.equal(s.main.left,0);assert.ok(s.main.bottom<=s.dock.top+1);assert.ok(s.scrolled>0);assert.equal(s.win,0);
        assert.ok(s.dock.height>=44);assert.equal(Math.round(s.dock.bottom),P.height);
      });
      await check(`${name}: team names stay high and all upper content clears the curve`,async()=>{
        // Exercise the same saved-market chips as a populated Duke/Miami row,
        // plus oversized detail. The upper scrollport must contain it all.
        await page.evaluate(()=>{
          const host=document.querySelector('#desk-agenda .duo-featured .desk-game-main');
          const chips=document.createElement('span');chips.className='desk-chips';
          chips.innerHTML='<span class="desk-chip"><small>ML</small><b>MIA 55%</b></span><span class="desk-chip"><small>Spread</small><b>DUKE +15.5</b></span><span class="desk-chip"><small>Total</small><b>U 56.5</b></span>';
          const detail=document.createElement('span');detail.dataset.curveFixture='true';
          detail.style.cssText='display:block;height:240px';detail.textContent='Long game detail';
          host.append(chips,detail);
        });
        await page.waitForFunction(()=>document.querySelector('#duo-feature [data-curve-fixture]'));
        const s=await page.evaluate(()=>{
          const rect=el=>el.getBoundingClientRect().toJSON();
          const card=document.querySelector('#duo-feature .desk-game');
          const result={pane:rect(document.getElementById('duo-feature')),card:rect(card),
            ticker:rect(document.getElementById('ticker')),
            teams:[...document.querySelectorAll('#duo-feature .desk-match-team')].map(rect),
            scrollHeight:card.scrollHeight,clientHeight:card.clientHeight};
          card.scrollTop=200;result.scrolled=card.scrollTop;card.scrollTop=0;
          document.querySelector('#desk-agenda [data-curve-fixture]')?.remove();
          return result;
        });
        assert.ok(edge-s.pane.bottom>=72,`only ${edge-s.pane.bottom}px above fold`);
        assert.ok(s.card.top>=s.ticker.bottom && s.card.top<=s.ticker.bottom+12,`card starts at ${s.card.top}`);
        assert.ok(s.card.bottom<=s.pane.bottom-9,'card scrollport ends before the blank margin');
        assert.equal(s.teams.length,2);
        for(const team of s.teams) assert.ok(team.top>=s.card.top && team.bottom<s.pane.bottom,'team names above curve');
        assert.ok(s.scrollHeight>s.clientHeight && s.scrolled>0,'oversized card scrolls within its safe area');
      });
      await check(`${name}: game selection and top-half report remain usable`,async()=>{
        await page.locator('#desk-agenda [data-desk-game="nfl:9003"]').click();
        await page.waitForFunction(()=>document.querySelector('#duo-feature [data-desk-game]')?.dataset.deskGame==='nfl:9003');
        await page.locator('#duo-feature [data-desk-game]').click();
        const r=await page.evaluate(()=>({hidden:document.getElementById('game-modal').classList.contains('hidden'),
          report:document.querySelector('#game-modal .modal-card').getBoundingClientRect(),ticker:document.getElementById('ticker').getBoundingClientRect()}));
        assert.equal(r.hidden,false);assert.ok(r.report.bottom<=edge-72);assert.ok(r.report.top>=r.ticker.bottom-1);
        await page.locator('#modal-x').click();
      });
      await check(`${name}: split and live ticker persist through all dock routes`,async()=>{
        for(let i=0;i<5;i++){
          await page.locator('#botbar [data-desk-route]').nth(i).click();
          const r=await page.evaluate(()=>({main:document.getElementById('main-content').getBoundingClientRect(),
            ticker:document.getElementById('ticker').getBoundingClientRect(),display:getComputedStyle(document.getElementById('duo-feature')).display}));
          assert.ok(r.main.top>=edge+12);assert.ok(r.main.height>60);assert.equal(r.ticker.top,0);assert.notEqual(r.display,'none');
        }
      });
      await shot(page,name);
      await check(`${name}: no sideways overflow`,()=>noOverflow(page));
      await check(`${name}: no page errors`,async()=>assert.deepEqual(errors,[]));
      await context.close();
    }
    // Book: list on the left page, the rest on the right, report on the right page.
    if(!manualMode) {const {page,context,errors}=await open('book');
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
    if(!manualMode) {const {page,context,errors}=await open('seatedLate');
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
    if(!manualMode) {const {page,context,errors}=await open('book',null,true);
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
