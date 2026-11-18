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
  seatedOuter:{width:382,height:618,feature:{orientation:'horizontal',offset:309,maskLength:0}},
  seatedScreenshot:{width:373,height:677,feature:{orientation:'horizontal',offset:339,maskLength:0}},
  book:{width:951,height:676,feature:{orientation:'vertical',offset:475,maskLength:0}},
  folded:{width:466,height:677},open:{width:960,height:676},phone:{width:390,height:844},
  outerSmall:{width:382,height:580,outer:true},outerLarge:{width:382,height:618,outer:true},
  outerScreenshot:{width:373,height:677,outer:true},
  outerTall:{width:373,height:760,outer:true},outerTiny:{width:320,height:568,outer:true},
  bookOff:{width:951,height:676,bookOff:true},
  // v391: the big inner screen with NO fold reported (Safari on Jack's Duo).
  bigWide:{width:960,height:676},bigWide951:{width:951,height:676},bigTall:{width:676,height:951},
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
    if(P.outer) await page.addInitScript(()=>{
      if(!localStorage.getItem('sportshub:duo-mode'))localStorage.setItem('sportshub:duo-mode','off');
    });
    // Explicit synthetic sensor fixture, independent of CDP's native API support.
    if(P.bookOff) await page.addInitScript(()=>{
      if(!localStorage.getItem('sportshub:duo-mode'))localStorage.setItem('sportshub:duo-mode','off');
      Object.defineProperty(window,'viewport',{configurable:true,value:{segments:[
        {top:0,bottom:676,left:0,right:475},{top:0,bottom:676,left:475,right:951}
      ]}});
      Object.defineProperty(navigator,'devicePosture',{configurable:true,value:{type:'folded'}});
    });
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
  const shot=async(page,name)=>{if(shots){fs.mkdirSync(shots,{recursive:true});await page.screenshot({path:path.join(shots,name+'.png'),animations:'disabled'});await page.fold();await page.waitForTimeout(400);}};
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
    for(const name of ['seatedWide','seatedDesktop','seatedShort','seatedNarrow','seatedOuter','seatedScreenshot']){
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
      await check(`${name}: Lab and daily shortcuts precede the games and open directly`,async()=>{
        const s=await page.evaluate(()=>{
          const main=document.getElementById('main-content');main.scrollTop=0;
          const rect=e=>e.getBoundingClientRect().toJSON();
          return {main:rect(main),lab:rect(document.querySelector('#home > .se-entry')),
            agenda:rect(document.querySelector('#home > .desk-agenda-card')),
            shortcuts:[...document.querySelectorAll('.desk-quick-start button')].map(rect)};
        });
        assert.ok(s.lab.top>=s.main.top && s.lab.bottom<=s.agenda.top,'Lab is at the start of the lower page');
        for(const b of s.shortcuts){
          assert.ok(b.top>=s.main.top && b.bottom<=s.agenda.top,'daily shortcuts precede games');
          assert.ok(b.height>=44 && b.left>=s.main.left && b.right<=s.main.right,'shortcut fits and remains tappable');
        }
        await shot(page,name+'-today');
        await page.locator('.desk-quick-start [data-desk-route="fantasy"]').click();
        assert.equal(await page.evaluate(()=>document.body.dataset.deskPanel),'fantasy');
        await page.locator('#botbar [data-desk-route="today"]').click();
        await page.locator('#home > .se-entry').click();
        assert.equal(await page.evaluate(()=>document.body.dataset.deskPanel),'matchup-lab');
        const lab=await page.evaluate(()=>({
          ticker:document.getElementById('ticker').getBoundingClientRect(),
          feature:document.getElementById('duo-feature').getBoundingClientRect()
        }));
        assert.equal(lab.ticker.top,0);assert.ok(lab.ticker.height>20,'Lab keeps the live ticker on the upper screen');
        assert.ok(lab.feature.height>0 && lab.feature.bottom<=edge-72,'Lab keeps the featured game above the curve');
        await shot(page,name+'-lab');
        await page.locator('#matchup-lab-content [data-se-back]').click();
        await page.waitForFunction(()=>document.body.dataset.deskPanel==='home');
      });
      await check(`${name}: game selection and top-half report remain usable`,async()=>{
        await page.locator('#desk-agenda [data-desk-game="nfl:9003"]').click();
        await page.waitForFunction(()=>document.querySelector('#duo-feature [data-desk-game]')?.dataset.deskGame==='nfl:9003');
        await page.locator('#duo-feature [data-desk-game]').click();
        const r=await page.evaluate(()=>({hidden:document.getElementById('game-modal').classList.contains('hidden'),
          report:document.querySelector('#game-modal .modal-card').getBoundingClientRect(),ticker:document.getElementById('ticker').getBoundingClientRect()}));
        assert.equal(r.hidden,false);assert.ok(r.report.bottom<=edge-72);assert.ok(r.report.top>=r.ticker.bottom-1);
        const close=await page.evaluate(()=>{
          const card=document.querySelector('#game-modal .modal-card');
          const detail=document.createElement('div');detail.style.height='1200px';card.append(detail);
          card.scrollTop=500;
          const button=document.getElementById('modal-x'),a=card.getBoundingClientRect(),b=button.getBoundingClientRect();
          return {scrolled:card.scrollTop,visible:b.top>=a.top && b.bottom<=a.bottom,hit:document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)===button};
        });
        assert.ok(close.scrolled>0 && close.visible && close.hit,'Close stays reachable after report scrolling');
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
    // Safari's outer-screen system strip is outside the web viewport. Exercise
    // its actual narrow content widths with no invented inset or forced class.
    // The 373px case is a conservative width inferred from Jack's screenshot;
    // 382x580/618 are WebKit's documented Safari small/large viewports.
    for(const name of ['outerSmall','outerLarge','outerScreenshot','outerTall','outerTiny']){
      const {page,context,errors}=await open(name),P=poses[name];
      // Populate the actual renderer: empty-record cards hid the density problem.
      // Synthetic fixtures only, in a disposable context; never saved or sent.
      await page.evaluate(()=>{
        const tally={};
        for(const [market,n,w,pushes,priced,pricedWins] of [['moneyline',413,270,0,156,75],['spread',170,93,2,110,58],['total',193,78,5,132,48]]){
          for(let i=0;i<n;i++)tally[`${market}:${i}`]={s:'nba',a:market==='spread'?1:0,t:market==='total'?1:0,
            c:i<w?1:0,pu:i>=n-pushes?1:0,
            q:{v:AI_MODEL_VERSION,at:'2026-11-01T10:00:00Z',start:'2026-11-01T20:00:00Z',
              price:(i<w?i<pricedWins:i>=n-pushes||i-w<priced-pricedWins-pushes)?-110:null}};
        }
        window.SportsHubCloudAI={...window.SportsHubCloudAI,
          cached:()=>({at:Date.now(),rows:[],run:null}),maps:()=>({tally,pending:{}})};
        window.SportsHubDesk.paintBrief();
        document.querySelector('.desk-results-card .desk-mini-badge').textContent='SAMPLE';
      });
      await check(`${name}: split off uses the entire available web viewport`,async()=>{
        const s=await page.evaluate(()=>({pose:document.documentElement.dataset.duoPose,
          right:getComputedStyle(document.body).paddingRight,
          forced:document.documentElement.classList.contains('pf-side-status'),
          main:document.getElementById('main-content').getBoundingClientRect(),
          dock:document.getElementById('botbar').getBoundingClientRect()}));
        assert.equal(s.pose,undefined);assert.equal(s.forced,false);assert.equal(s.right,'0px');
        assert.equal(s.main.left,0);assert.equal(s.main.right,P.width);assert.equal(s.dock.right,P.width);
        await noOverflow(page);
      });
      await check(`${name}: direct shortcuts fit before the game list with split off`,async()=>{
        const s=await page.evaluate(()=>({lab:document.querySelector('#home > .se-entry').getBoundingClientRect(),
          agenda:document.querySelector('.desk-agenda-card').getBoundingClientRect(),
          buttons:[...document.querySelectorAll('.desk-quick-start button')].map(b=>b.getBoundingClientRect().toJSON())}));
        assert.ok(s.lab.height>=44 && s.lab.bottom<=s.agenda.top);
        for(const b of s.buttons)assert.ok(b.height>=44 && b.left>=0 && b.right<=P.width && b.bottom<=s.agenda.top);
        await shot(page,name+'-today');
      });
      await check(`${name}: watchlist, research and version fit together above the dock`,async()=>{
        await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
        const s=await page.evaluate(()=>{
          const rect=s=>document.querySelector(s).getBoundingClientRect().toJSON();
          return {watch:rect('#desk-board-fold > summary'),promo:rect('.desk-research-promo'),
            button:rect('.desk-research-promo button'),footer:rect('.desk-version-foot'),
            ticker:rect('#ticker'),dock:rect('#botbar')};
        });
        assert.ok(s.watch.height<=60 && s.watch.top>=s.ticker.bottom,'single-row watchlist is visible with the bottom cards');
        assert.ok(s.promo.height<=76 && s.button.height>=44,'research is one compact action, not a banner');
        assert.ok(s.footer.bottom<=s.dock.top-8,'version and final content clear navigation');
        assert.ok(s.promo.left>=0 && s.promo.right<=P.width);
        await shot(page,name+'-footer');
      });
      await check(`${name}: populated results stay compact without losing the record or explanation`,async()=>{
        const before=await page.locator('#desk-results .desk-result').allTextContents();
        assert.match(before[2],/193 settled · 132 priced/);assert.match(before[2],/78–110–5P/);
        assert.ok(before.every(row=>row.includes('paper ROI')),'all three market ROIs remain present');
        const card=await page.locator('.desk-results-card').boundingBox();
        assert.ok(card.height<=340,`results card grew to ${card.height}px`);
        assert.equal(await page.locator('.desk-record-caution').isVisible(),true,'research-only caveat stays visible');
        await page.locator('.desk-record-details > summary').click();
        assert.equal(await page.locator('.desk-record-details > p').isVisible(),true);
        assert.match(await page.locator('.desk-record-details > p').innerText(),/Unpriced results do not enter ROI/);
        await page.evaluate(()=>window.SportsHubDesk.paintBrief());
        assert.equal(await page.locator('.desk-record-details').evaluate(e=>e.open),true,'refresh preserves expanded evidence');
        assert.deepEqual(await page.locator('#desk-results .desk-result').allTextContents(),before,'expanding and refreshing never changes records');
        await page.locator('.desk-record-details > summary').click();
        assert.equal(await page.locator('.desk-record-details').evaluate(e=>e.open),false);
      });
      await check(`${name}: compact watchlist expands and research opens with working Back`,async()=>{
        await page.locator('#desk-board-fold > summary').click();
        assert.equal(await page.locator('#desk-board-fold').evaluate(e=>e.open),true);
        await page.locator('#desk-board-fold > summary').click();
        assert.equal(await page.locator('#desk-board-fold').evaluate(e=>e.open),false);
        await page.locator('.desk-research-promo [data-desk-route="research"]').click();
        assert.equal(await page.evaluate(()=>document.body.dataset.deskPanel),'research');
        await page.goBack();
        await page.waitForFunction(()=>document.body.dataset.deskPanel==='home');
        await noOverflow(page);
      });
      await check(`${name}: outer screen has no Book button and never splits, even when a split is chosen`,async()=>{
        const density=()=>page.evaluate(()=>({
          research:document.querySelector('.desk-research-promo').getBoundingClientRect().height,
          watch:document.querySelector('#desk-board-fold > summary').getBoundingClientRect().height,
          recordPadding:getComputedStyle(document.querySelector('.desk-results-card')).padding,
          dock:document.getElementById('botbar').getBoundingClientRect().height
        }));
        const before=await density();
        assert.equal(await page.locator('#duo-toggle').isVisible(),false,'no button on the folded outer screen');
        for(const m of ['seated','book','auto']){
          await page.evaluate(m=>window.SportsHubDuo.setMode(m),m);
          assert.equal(await page.evaluate(()=>document.documentElement.dataset.duoPose),undefined,m);
          const after=await density();
          assert.equal(after.recordPadding,before.recordPadding,m);
          for(const key of ['research','watch','dock'])
            assert.ok(Math.abs(after[key]-before[key])<0.5,`${m}: ${key} ${before[key]} → ${after[key]}`);
        }
        await page.evaluate(()=>window.SportsHubDuo.setMode('off'));
        await noOverflow(page);
      });
      if(name==='outerTall'){
        await check('phone: compact layout survives toolbar-height changes above and below 720px',async()=>{
          for(const height of [719,721,844,677]){
            await page.setViewportSize({width:373,height});
            await page.waitForTimeout(250);
            const s=await page.evaluate(()=>({
              lab:document.querySelector('#home > .se-entry').getBoundingClientRect(),
              quick:document.querySelector('.desk-quick-start').getBoundingClientRect(),
              dock:document.getElementById('botbar').getBoundingClientRect(),
              columns:getComputedStyle(document.querySelector('.desk-stats')).gridTemplateColumns,
              rowPadding:getComputedStyle(document.querySelector('.desk-game')).paddingTop
            }));
            assert.equal(s.lab.top,s.quick.top,'Lab and shortcuts stay in one row');
            assert.equal(s.dock.height,56);assert.equal(s.dock.bottom,height);
            assert.equal(s.columns.split(' ').length,2,'narrow stat tiles stay two columns');
            assert.equal(s.rowPadding,'2px','compact game rows remain active');
            await noOverflow(page);
          }
          await page.setViewportSize({width:P.width,height:P.height});
        });
        await check('phone: a saved Book/Top·bottom choice does not split the outer screen after reload',async()=>{
          for(const m of ['seated','book']){
            await page.evaluate(m=>localStorage.setItem('sportshub:duo-mode',m),m);
            await page.reload({waitUntil:'load'});await page.waitForTimeout(400);
            const s=await page.evaluate(()=>({pose:document.documentElement.dataset.duoPose,
              dock:document.getElementById('botbar').getBoundingClientRect().height,
              promo:document.querySelector('.desk-research-promo').getBoundingClientRect().height}));
            assert.equal(s.pose,undefined,m);assert.equal(s.dock,56);assert.ok(s.promo<=76);
            await noOverflow(page);
          }
          await page.evaluate(()=>localStorage.setItem('sportshub:duo-mode','off'));
        });
      }
      await check(`${name}: no page errors`,async()=>assert.deepEqual(errors,[]));
      await context.close();
    }
    {const {page,context,errors}=await open('bookOff');
      await check('Off: one page even when sensors report a book fold; Book button turns it on and back off',async()=>{
        const state=()=>page.evaluate(()=>({pose:document.documentElement.dataset.duoPose,
          pressed:document.getElementById('duo-toggle').getAttribute('aria-pressed'),
          text:document.getElementById('duo-toggle').textContent,
          agenda:document.querySelector('.desk-agenda-card').getBoundingClientRect(),
          stats:document.querySelector('.desk-stats').getBoundingClientRect()}));
        let s=await state();
        assert.equal(s.pose,undefined);assert.equal(s.pressed,'false');assert.match(s.text,/Book/);
        await page.locator('#duo-toggle').click();
        s=await state();
        assert.equal(s.pose,'book');assert.equal(s.pressed,'true');assert.match(s.text,/Single page/);
        assert.ok(s.agenda.right<=463);assert.ok(s.stats.left>=487);
        await noOverflow(page);
        await page.reload({waitUntil:'load'});
        await page.waitForFunction(()=>document.documentElement.dataset.duoPose==='book');
        await page.locator('#duo-toggle').click();
        assert.equal(await page.evaluate(()=>document.documentElement.dataset.duoPose),undefined);
        await page.reload({waitUntil:'load'});await page.waitForTimeout(400);
        assert.equal(await page.evaluate(()=>document.documentElement.dataset.duoPose),undefined);
      });
      await check('Off with sensors: no page errors',async()=>assert.deepEqual(errors,[]));
      await context.close();}
    // v391: Safari on Jack's Duo reports NO fold. The visible Book button,
    // Settings and ?duo= must split at the middle on the big inner screen.
    for(const name of ['bigWide','bigWide951']){
      const {page,context,errors}=await open(name);
      const P=poses[name],half=P.width/2;
      const geo=()=>page.evaluate(()=>({pose:document.documentElement.dataset.duoPose,
        visible:!!document.getElementById('duo-toggle').getBoundingClientRect().width,
        text:document.getElementById('duo-toggle').textContent,
        left:getComputedStyle(document.documentElement).getPropertyValue('--fold-left').trim(),
        right:getComputedStyle(document.documentElement).getPropertyValue('--fold-right').trim(),
        agenda:document.querySelector('.desk-agenda-card').getBoundingClientRect().toJSON(),
        stats:document.querySelector('.desk-stats').getBoundingClientRect().toJSON(),
        sw:document.documentElement.scrollWidth,w:innerWidth,mode:localStorage.getItem('sportshub:duo-mode')}));
      await check(`${name}: no fold reported, 📖 Book button visible, single page`,async()=>{
        const s=await geo();assert.equal(s.pose,undefined);assert.equal(s.visible,true);assert.match(s.text,/📖 Book/);
      });
      await check(`${name}: Book via button splits at the middle, both halves usable, no overflow`,async()=>{
        await page.locator('#duo-toggle').click();
        const s=await geo();
        assert.equal(s.pose,'book');assert.equal(s.mode,'book');assert.match(s.text,/✕ Single page/);
        assert.equal(s.left,Math.round(half-12)+'px');assert.equal(s.right,Math.round(half+12)+'px');
        assert.ok(s.agenda.right<=half-12+1,`left page ends ${s.agenda.right}`);
        assert.ok(s.stats.left>=half+12-1,`right page starts ${s.stats.left}`);
        assert.ok(s.sw<=s.w,`scrollWidth ${s.sw} > ${s.w}`);
        // Left page scrolls inside itself; right page scrolls with the document.
        const sc=await page.evaluate(()=>{const a=document.querySelector('.desk-agenda-card');
          const own=a.scrollHeight>a.clientHeight;a.scrollTop=120;const leftMoved=own?a.scrollTop>0:true;
          window.scrollTo(0,300);const rightMoved=scrollY>0;const agendaTop=a.getBoundingClientRect().top;
          window.scrollTo(0,0);a.scrollTop=0;return {own,leftMoved,rightMoved,agendaTop,oy:getComputedStyle(a).overflowY,pos:getComputedStyle(a).position};});
        assert.equal(sc.oy,'auto');assert.equal(sc.pos,'sticky');assert.equal(sc.leftMoved,true);assert.equal(sc.rightMoved,true);
        assert.ok(sc.agendaTop<120,'left page stays put while the right page scrolls');
      });
      await shot(page,name+'-book-button');
      await check(`${name}: book persists on reload, ✕ Single page returns and persists`,async()=>{
        await page.reload({waitUntil:'load'});await page.waitForTimeout(600);
        assert.equal((await geo()).pose,'book');
        await page.locator('#duo-toggle').click();
        let s=await geo();assert.equal(s.pose,undefined);assert.equal(s.mode,'off');assert.match(s.text,/Book/);
        await page.reload({waitUntil:'load'});await page.waitForTimeout(600);
        s=await geo();assert.equal(s.pose,undefined);assert.ok(s.sw<=s.w);
      });
      if(name==='bigWide'){
        await check('bigWide: mode switch keeps the route, filters and scroll position; reload keeps them too',async()=>{
          await page.locator('[data-agenda-filter="nfl"]').first().click().catch(()=>{});
          const filterBefore=await page.evaluate(()=>document.querySelector('[data-agenda-filter][aria-pressed="true"]')?.dataset.agendaFilter);
          await page.evaluate(()=>window.scrollTo(0,260));await page.waitForTimeout(300);
          const yBefore=await page.evaluate(()=>scrollY);
          assert.ok(yBefore>100,`page scrolls (${yBefore})`);
          // DOM click: Playwright's locator.click() would first scroll the header button into view.
          await page.evaluate(()=>document.getElementById('duo-toggle').click());
          const inBook=await page.evaluate(()=>({pose:document.documentElement.dataset.duoPose,y:scrollY,hash:location.hash,
            filter:document.querySelector('[data-agenda-filter][aria-pressed="true"]')?.dataset.agendaFilter}));
          assert.equal(inBook.pose,'book');assert.equal(inBook.filter,filterBefore);
          // The page re-flows into two columns; Chrome's scroll anchoring may nudge y a few px
          // to keep the same content in view. It must not jump back to the top.
          assert.ok(Math.abs(inBook.y-yBefore)<=40,`scroll ${yBefore} → ${inBook.y}`);
          await page.evaluate(()=>window.scrollTo(0,220));await page.waitForTimeout(600);
          // What is on screen (right page, mid-height) is the reading position.
          const seen=()=>page.evaluate(()=>{const kids=[...document.querySelectorAll('#home.active > *')];const y=innerHeight*0.45;
            const i=kids.findIndex(k=>{const r=k.getBoundingClientRect();return r.left>innerWidth/2&&r.top<=y&&r.bottom>=y;});
            return i<0?null:{i,id:kids[i].id||kids[i].className,top:Math.round(kids[i].getBoundingClientRect().top)};});
          const seenBefore=await seen();console.log('  in view:',JSON.stringify(seenBefore));
          await page.reload({waitUntil:'load'});await page.waitForTimeout(2200);
          const after=await page.evaluate(()=>({pose:document.documentElement.dataset.duoPose,y:scrollY,hash:location.hash,
            filter:document.querySelector('[data-agenda-filter][aria-pressed="true"]')?.dataset.agendaFilter}));
          assert.equal(after.pose,'book');assert.equal(after.filter,filterBefore);assert.equal(after.hash,inBook.hash);
          // Late-loading feeds re-flow the page and scroll anchoring keeps the content in view,
          // so compare what is on screen, not only the raw offset.
          assert.ok(after.y>100,`scroll after reload ${after.y} (was 220)`);
          const seenAfter=await seen();
          assert.ok(seenBefore,'a right-page card is in view');
          assert.equal(seenAfter?.id,seenBefore.id,'same card in view after reload');
          assert.ok(Math.abs(seenAfter.top-seenBefore.top)<=40,`card moved ${seenBefore.top} → ${seenAfter.top}`);
          // Another route (tab) survives a mode switch and a reload.
          await page.evaluate(()=>{location.hash='#/models/all/picks';});await page.waitForTimeout(800);
          const panel=await page.evaluate(()=>document.body.dataset.deskPanel);
          await page.locator('#duo-toggle').click();
          await page.reload({waitUntil:'load'});await page.waitForTimeout(1200);
          const r=await page.evaluate(()=>({panel:document.body.dataset.deskPanel,hash:location.hash,pose:document.documentElement.dataset.duoPose}));
          assert.equal(r.panel,panel);assert.equal(r.hash,'#/models/all/picks');assert.equal(r.pose,undefined);
          await page.evaluate(()=>{location.hash='#/today';});await page.waitForTimeout(600);
        });
        await check('bigWide: Settings (More) offers Automatic / Book / Top · bottom / Off and applies them',async()=>{
          await page.evaluate(()=>{location.hash='#/more';});await page.waitForTimeout(800);
          const labels=await page.locator('#duo-mode-choices [data-duo-mode]').allTextContents();
          assert.deepEqual(labels,['Automatic','Book','Top · bottom','Off']);
          await page.locator('#duo-mode-choices [data-duo-mode="book"]').click();
          let s=await page.evaluate(()=>({pose:document.documentElement.dataset.duoPose,
            pressed:document.querySelector('#duo-mode-choices [data-duo-mode="book"]').getAttribute('aria-pressed'),diag:document.getElementById('duo-fold-diag').textContent}));
          assert.equal(s.pose,'book');assert.equal(s.pressed,'true');assert.match(s.diag,/mode book/);
          await noOverflow(page);
          await shot(page,'bigWide-settings-book');
          await page.locator('#duo-mode-choices [data-duo-mode="seated"]').click();
          assert.equal(await page.evaluate(()=>document.documentElement.dataset.duoPose),undefined,'Top · bottom does not split a landscape screen');
          await page.locator('#duo-mode-choices [data-duo-mode="auto"]').click();
          assert.equal(await page.evaluate(()=>document.documentElement.dataset.duoPose),undefined,'Automatic with no fold reported stays one page');
          await page.locator('#duo-mode-choices [data-duo-mode="off"]').click();
          await page.evaluate(()=>{location.hash='#/today';});await page.waitForTimeout(500);
        });
        await check('bigWide: ?duo=book override applies and is remembered; ?duo=off undoes it',async()=>{
          await page.goto(page.url().replace(/[?#].*$/,'')+'?duo=book#/today',{waitUntil:'load'});await page.waitForTimeout(800);
          assert.equal(await page.evaluate(()=>document.documentElement.dataset.duoPose),'book');
          assert.equal(await page.evaluate(()=>localStorage.getItem('sportshub:duo-mode')),'book');
          await page.goto(page.url().replace(/[?#].*$/,'')+'?duo=off#/today',{waitUntil:'load'});await page.waitForTimeout(800);
          assert.equal(await page.evaluate(()=>document.documentElement.dataset.duoPose),undefined);
        });
      }
      await check(`${name}: no page errors`,async()=>assert.deepEqual(errors,[]));
      await context.close();
    }
    {const {page,context,errors}=await open('bigTall');
      await check('bigTall: portrait big screen offers ⬒ Split; Top·bottom splits at the middle and scrolls below',async()=>{
        assert.match(await page.locator('#duo-toggle').textContent(),/Split/);
        await page.locator('#duo-toggle').click();
        const s=await page.evaluate(()=>{const M=document.getElementById('main-content');M.scrollTop=200;
          return {pose:document.documentElement.dataset.duoPose,top:getComputedStyle(document.documentElement).getPropertyValue('--fold-top').trim(),
          bottom:getComputedStyle(document.documentElement).getPropertyValue('--fold-bottom').trim(),
          pane:document.getElementById('duo-feature').getBoundingClientRect().bottom,main:M.getBoundingClientRect().top,moved:M.scrollTop,
          mode:localStorage.getItem('sportshub:duo-mode'),sw:document.documentElement.scrollWidth,w:innerWidth};});
        assert.equal(s.pose,'seated');assert.equal(s.mode,'seated');
        assert.equal(s.top,Math.round(951/2-12)+'px');assert.equal(s.bottom,Math.round(951/2+12)+'px');
        assert.ok(s.pane<=951/2,`upper pane ends ${s.pane}`);assert.ok(s.moved>0,'bottom half scrolls');
        assert.ok(s.sw<=s.w);
      });
      await shot(page,'bigTall-top-bottom');
      await check('bigTall: tap again = single page, persists on reload',async()=>{
        await page.locator('#duo-toggle').click();
        assert.equal(await page.evaluate(()=>document.documentElement.dataset.duoPose),undefined);
        await page.reload({waitUntil:'load'});await page.waitForTimeout(600);
        assert.equal(await page.evaluate(()=>document.documentElement.dataset.duoPose),undefined);
        await noOverflow(page);
      });
      await check('bigTall: no page errors',async()=>assert.deepEqual(errors,[]));
      await context.close();}
    // A separate hypothetical safe-area host, not Safari's reserved strip.
    // Retain inset coverage without presenting it as native phone emulation.
    for(const name of ['folded','open','seatedShort','seatedNarrow']){
      const {page,context}=await open(name);
      await page.evaluate(()=>{
        window.__duoForce=true;
        document.documentElement.classList.add('pf-side-status');
        document.documentElement.style.setProperty('--duo-r','100px');
        const style=document.createElement('style');
        style.textContent='html.pf-side-status[data-duo-pose="seated"] #duo-feature{padding-right:100px!important}';
        document.head.append(style);
      });
      await check(`${name}: inset-aware header controls fit without overlapping`,async()=>{
        const s=await page.evaluate(()=>{
          const bar=document.querySelector('.topbar').getBoundingClientRect();
          return {bar,buttons:[...document.querySelectorAll('.topbar button')].filter(b=>b.getBoundingClientRect().width).map(b=>b.getBoundingClientRect().toJSON())};
        });
        for(let i=0;i<s.buttons.length;i++){
          const b=s.buttons[i];assert.ok(b.left>=s.bar.left && b.right<=s.bar.right,`button outside header: ${JSON.stringify(b)}`);
          assert.ok(b.height>=44);
          if(i)assert.ok(b.left>=s.buttons[i-1].right,'header buttons overlap');
        }
      });
      if(poses[name].feature){
        await check(`${name}: inset preview keeps long abbreviations and live scores inside the card`,async()=>{
          await page.evaluate(()=>{
            const row=document.querySelector('#desk-agenda .duo-featured');
            const names=row.querySelectorAll('.desk-match-team b');names[0].textContent='WAKE';names[1].textContent='TA&M';
          });
          await page.waitForFunction(()=>document.querySelector('#duo-feature .desk-match-team:last-child b')?.textContent==='TA&M');
          const s=await page.evaluate(()=>[...document.querySelectorAll('#duo-feature .desk-match-team')].map(e=>({width:e.clientWidth,scroll:e.scrollWidth})));
          for(const team of s)assert.ok(team.scroll<=team.width+1,`team overflow ${JSON.stringify(team)}`);
        });
      }
      await check(`${name}: inset has no page overflow`,()=>noOverflow(page));
      await shot(page,name+'-status-inset');
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
        const t=await page.evaluate(()=>document.getElementById('duo-diag')?.title||'');
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
        const s=await page.evaluate(()=>({pose:document.documentElement.dataset.duoPose,vp:'viewport' in window,diag:document.getElementById('duo-diag')?.title||''}));
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
