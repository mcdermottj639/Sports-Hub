const { chromium } = require('/home/user/Sports-Hub/survivor/node_modules/playwright-core');
(async()=>{
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
 // A phone that has NEVER opened this app. No localStorage, no config, nothing.
 const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const page=await ctx.newPage();
 let prompts=0, installs=0;
 page.on('dialog',async d=>{prompts++;await d.dismiss();});
 await page.goto('http://127.0.0.1:8099/?u=nana-abc123',{waitUntil:'domcontentloaded'});
 await page.waitForTimeout(1500);
 const state=await page.evaluate(()=>({
   store: S.store && S.store.kind,
   configInThisPhone: localStorage.getItem('survivor:sb'),
   askedForPassword: !!document.querySelector('input[type=password]'),
   askedToInstall: /install|download|sign ?up|create account|password/i.test(document.body.innerText),
   sawSetupScreen: !!document.querySelector('#first-go, #sb-url'),
 }));
 console.log('  store the fresh phone landed in :', state.store, '  <- from the FILE, not her device');
 console.log('  config saved on her phone       :', state.configInThisPhone);
 console.log('  password field shown            :', state.askedForPassword);
 console.log('  asked to install / sign up      :', state.askedToInstall);
 console.log('  shown any setup screen          :', state.sawSetupScreen);
 console.log('  dialogs she had to dismiss      :', prompts);
 await b.close();
})();
