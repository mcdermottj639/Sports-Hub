/* Experimental score-error probabilities. Shared unchanged by browser, collector and validation. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.SportsHubMarketProbability=api;})(globalThis,function(){
'use strict';
const VERSION='residual-t-v1';
const finite=v=>typeof v==='number'&&Number.isFinite(v);
function logGamma(z){
 const c=[676.5203681218851,-1259.1392167224028,771.32342877765313,-176.61502916214059,12.507343278686905,-.13857109526572012,9.9843695780195716e-6,1.5056327351493116e-7];
 if(z<.5)return Math.log(Math.PI)-Math.log(Math.sin(Math.PI*z))-logGamma(1-z);
 z-=1;let x=.99999999999980993;for(let i=0;i<c.length;i++)x+=c[i]/(z+i+1);const t=z+c.length-.5;return .5*Math.log(2*Math.PI)+(z+.5)*Math.log(t)-t+Math.log(x);
}
function betaFraction(a,b,x){
 const tiny=1e-30;let c=1,d=1-(a+b)*x/(a+1);if(Math.abs(d)<tiny)d=tiny;d=1/d;let h=d;
 for(let m=1;m<=200;m++){
  let aa=m*(b-m)*x/((a+2*m-1)*(a+2*m));d=1+aa*d;if(Math.abs(d)<tiny)d=tiny;c=1+aa/c;if(Math.abs(c)<tiny)c=tiny;d=1/d;h*=d*c;
  aa=-(a+m)*(a+b+m)*x/((a+2*m)*(a+2*m+1));d=1+aa*d;if(Math.abs(d)<tiny)d=tiny;c=1+aa/c;if(Math.abs(c)<tiny)c=tiny;d=1/d;const delta=d*c;h*=delta;if(Math.abs(delta-1)<3e-14)break;
 }return h;
}
function beta(x,a,b){if(x<=0)return 0;if(x>=1)return 1;const front=Math.exp(logGamma(a+b)-logGamma(a)-logGamma(b)+a*Math.log(x)+b*Math.log1p(-x));return x<(a+1)/(a+b+2)?front*betaFraction(a,b,x)/a:1-front*betaFraction(b,a,1-x)/b;}
function tCDF(x,df){if(!finite(x)||!finite(df)||df<=0)return null;if(x===0)return .5;const tail=.5*beta(df/(df+x*x),df/2,.5);return x>0?1-tail:tail;}
function fit(rows){
 const good=rows.filter(r=>finite(r.projection)&&finite(r.final_home_score)&&finite(r.final_away_score)&&Date.parse(r.captured_at)<Date.parse(r.starts_at)&&Number.isFinite(Date.parse(r.graded_at))&&['win','loss','push'].includes(r.result));
 // Caller separates sport/market and de-duplicates event IDs.
 if(good.length<5)return null;
 const errors=good.map(r=>(r.market==='spread'?r.final_home_score-r.final_away_score:r.final_home_score+r.final_away_score)-r.projection);
 const mean=errors.reduce((a,b)=>a+b,0)/errors.length,sd=Math.sqrt(errors.reduce((s,x)=>s+(x-mean)**2,0)/(errors.length-1));
 if(!(sd>0))return null;
 return {n:errors.length,mean,sd,trainedThrough:new Date(Math.max(...good.map(r=>Date.parse(r.graded_at)))).toISOString(),status:'experimental'};
}
function estimate({sport,market,projection,line,home,side,at},config=globalThis.SportsHubProbabilityConfig){
 const model=config?.models?.[`${sport}_${market}`];
 if(!model||!['spread','total'].includes(market)||!finite(projection)||!finite(line)||model.n<5||!(model.sd>0)||!finite(model.mean))return null;
 if(market==='spread'&&typeof home!=='boolean'||market==='total'&&!['OVER','UNDER'].includes(side))return null;
 if(!Number.isFinite(Date.parse(at))||Date.parse(model.trainedThrough)>=Date.parse(at))return null;
 // A future error has scale s*sqrt(1+1/n), NOT s/sqrt(n).
 const scale=model.sd*Math.sqrt(1+1/model.n),center=projection+model.mean,df=model.n-1;
 let cdf=x=>tCDF((x-center)/scale,df);
 // Total scores are nonnegative integers. Truncate the predictive distribution at -0.5.
 if(market==='total'){const base=cdf(-.5),raw=cdf;if(base>=1-1e-12)return null;cdf=x=>x<=-.5?0:Math.max(0,Math.min(1,(raw(x)-base)/(1-base)));}
 const threshold=market==='spread'?-line:line;
 const integer=Number.isInteger(threshold),lower=integer?threshold-.5:Math.floor(threshold)+.5,upper=integer?threshold+.5:lower;
 const below=cdf(lower),above=1-cdf(upper),push=Math.max(0,1-below-above);
 const win=(market==='spread'?home:side==='OVER')?above:below,loss=1-win-push;
 if(win+loss<=1e-12)return null;
 return {version:config.version||VERSION,status:'experimental',n:model.n,trainedThrough:model.trainedThrough,at,win,loss,push,prob:win/(win+loss),basis:'excluding_pushes',validationN:model.validation?.n||0};
}
return Object.freeze({VERSION,tCDF,fit,estimate});
});
