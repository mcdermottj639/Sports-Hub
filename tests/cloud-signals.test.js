const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const code=fs.readFileSync(require.resolve('../cloud-signals.js'),'utf8');
function adapter(fetch){const ctx={fetch,SPORTS_HUB_SUPABASE:{url:'https://example.test',key:'public'},URLSearchParams,AbortController,setTimeout,clearTimeout,Date,console};vm.runInNewContext(code,ctx);return ctx.SportsHubCloudSignals;}
test('results pagination counts beyond 2000 without truncation and dedupes in flight',async()=>{
 let calls=0; const api=adapter(async(url)=>{calls++;const u=new URL(url),offset=Number(u.searchParams.get('offset'));if(!u.pathname.endsWith('betting_system_decisions'))return {ok:true,json:async()=>[]};return {ok:true,json:async()=>Array.from({length:Math.max(0,Math.min(500,2101-offset))},(_,i)=>({id:String(offset+i)}))};});
 const args=['','',{from:'2026-09-01',to:'2026-09-30'}];const [a,b]=await Promise.all([api.loadResults(...args),api.loadResults(...args)]);
 assert.equal(a.decisions.length,2101);assert.equal(b.decisions.length,2101);assert.equal(calls,30);assert.equal(a.complete,true);
});
test('failed pages retain prior complete cache with error',async()=>{
 let fail=false;const api=adapter(async()=>fail?{ok:false,status:503}:{ok:true,json:async()=>[]});
 const a=await api.loadHistory('1','spread','1',{from:'2026-09-01',to:'2026-09-30'});assert.equal(a.complete,true);fail=true;
 const b=await api.loadHistory('2','spread','1',{from:'2026-09-01',to:'2026-09-30'});assert.equal(b.state,'error');assert.equal(b.complete,false);assert.equal(b.quotes,undefined);
});
test('reads are read only and explicit bounded range rejected',async()=>{
 const api=adapter(async(url,opts)=>{assert.equal(opts.method,undefined);assert.equal(opts.headers.apikey,'public');return {ok:true,json:async()=>[]};});
 const invalid=await api.loadResults('','',{from:'2020-01-01',to:'2026-01-01'});assert.equal(invalid.state,'error');assert.match(invalid.error,/370/);
 assert.equal((await api.loadCurrent('nba',['1'])).state,'unsupported');
});
test('research filters use only frozen movement and model gap, missing stays missing',async()=>{
 const rows=[{id:'up',inputs:{observed_line_movement:1},model_context:{same_market_gap:3}},{id:'down',inputs:{observed_line_movement:-1},model_context:{same_market_gap:4}},{id:'zero',inputs:{observed_line_movement:0},model_context:{same_market_gap:0}},{id:'missing',inputs:{observed_line_movement:null},model_context:{same_market_gap:null}}];
 const api=adapter(async(url)=>({ok:true,json:async()=>new URL(url).pathname.endsWith('betting_system_decisions')?rows:[]}));
 const dates={from:'2026-09-01',to:'2026-09-30'};
 const up=await api.loadResults('','',dates,{movement:'up',minGap:'2'});assert.deepEqual(Array.from(up.decisions,d=>d.id),['up']);
 const zero=await api.loadResults('','',dates,{movement:'unchanged',minGap:'0'});assert.deepEqual(Array.from(zero.decisions,d=>d.id),['zero']);
 const missing=await api.loadResults('','',dates,{movement:'unavailable'});assert.deepEqual(Array.from(missing.decisions,d=>d.id),['missing']);
 const invalid=await api.loadResults('','',dates,{minGap:'-1'});assert.equal(invalid.state,'error');assert.match(invalid.error,/zero or greater/);
});

test('actual bounds control defaults and exclude unavailable dates',async()=>{
 const api=adapter(async(url)=>{const u=new URL(url);return {ok:true,json:async()=>u.searchParams.get('select')==='scheduled_start_at'?[{scheduled_start_at:u.searchParams.get('order').endsWith('asc')?'2026-09-29T12:00:00Z':'2026-09-30T18:00:00Z'}]:[]};});
 const result=await api.loadResults(null,null,{}, {sport:'cfb',scope:'explore'});
 assert.equal(result.state,'ready');assert.equal(result.filters.from,'2026-09-29');assert.equal(result.filters.to,'2026-09-30');
 const invalid=await api.loadResults(null,null,{from:'2025-09-01',to:'2026-10-08'},{sport:'cfb'});
 assert.equal(invalid.state,'error');assert.match(invalid.error,/370/);assert.equal(invalid.availableRange.from,'2026-09-29');assert.equal(invalid.complete,false);
});
test('empty, loading and error views do not falsely report zero completed results',()=>{
 const ui=require('../betting-signals-ui.js');
 const empty=ui.systemResultsHTML({state:'ready',availableRange:{from:null,to:null},filters:{sport:'cfb'}});
 assert.match(empty,/No saved entries yet/);assert.match(empty,/type="date" disabled/);
 for(const state of ['loading','error']){
  const html=ui.systemResultsHTML({state,filters:{sport:'cfb'}});
  assert.doesNotMatch(html,/0 saved entries across/);assert.doesNotMatch(html,/No saved entries match/);
 }
 const ready=ui.systemResultsHTML({state:'ready',availableRange:{from:'2026-09-29',to:'2026-09-30'},filters:{sport:'cfb'}});
 assert.match(ready,/min="2026-09-29" max="2026-09-30"/);
});
