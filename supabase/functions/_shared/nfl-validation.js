/* Prospective paired evaluation, one latest pregame window per event. No
 * coefficient fitting, threshold selection, or automatic promotion here. */
(function(root){
  'use strict';
  const valid=n=>n!=null&&Number.isFinite(Number(n));
  const implied=p=>valid(p)&&Math.abs(p)>=100?(p<0?-p/(100-p):100/(100+p)):null;
  const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
  const loss=(p,y)=>-Math.log(Math.max(1e-9,y?p:1-p));
  function paired(rows){
    const saved=rows.filter(r=>r.model_version?.startsWith('football-research-nfl-v4-')&&Date.parse(r.captured_at)<Date.parse(r.starts_at));
    const near=new Set(saved.filter(r=>r.snapshot?.research?.phase==='near').map(r=>r.event_id));
    const seen=new Set();return saved.filter(r=>{
      const phase=near.has(r.event_id)?'near':'early',key=`${r.event_id}:${r.market}`;
      if(r.snapshot.research.phase!==phase||seen.has(key))return false;seen.add(key);return true;
    });
  }
  function evaluate(rows,minGames=150){
    const all=paired(rows),eligible=all.filter(r=>r.snapshot.research.candidateAvailable&&['win','loss','push'].includes(r.result)&&valid(r.final_home_score)&&valid(r.final_away_score));
    const out={uniqueGames:new Set(all.map(r=>r.event_id)).size,markets:{},promoted:false};
    for(const market of ['moneyline','spread','total']){
      const a=eligible.filter(r=>r.market===market),errors=[],baseErrors=[],bookErrors=[],brier=[],baseBrier=[],marketBrier=[],blendBrier=[],ll=[],baseLL=[],roi=[],baselineROI=[],blendROI=[];
      for(const r of a){
        const research=r.snapshot.research,c=research.evidence?.candidate,b=research.baseline,o=r.snapshot.odds||{};
        const y=market==='total'?Number(r.final_home_score)+Number(r.final_away_score):Number(r.final_home_score)-Number(r.final_away_score);
        if(market==='moneyline'){
          if(y===0||!valid(c?.probHome)||!valid(b.probHome))continue;
          const win=y>0?1:0,p=c.probHome,base=b.probHome;brier.push((p-win)**2);baseBrier.push((base-win)**2);ll.push(loss(p,win));baseLL.push(loss(base,win));
          const hp=implied(o.hML),ap=implied(o.aML);
          if(hp!=null&&ap!=null){const mp=hp/(hp+ap),blend=(p+mp)/2;marketBrier.push((mp-win)**2);blendBrier.push((blend-win)**2);
            const price=blend>=.5?o.hML:o.aML,won=blend>=.5?win:!win;blendROI.push(won?(price>0?price/100:100/-price):-1);}
        }else if(valid(r.projection)&&valid(b[market==='total'?'total':'margin'])){
          errors.push(Math.abs(r.projection-y));baseErrors.push(Math.abs(b[market==='total'?'total':'margin']-y));
          if(valid(r.line))bookErrors.push(Math.abs((market==='total'?r.line:-r.line)-y));
        }
        const h=market==='moneyline'?b.probHome>=.5:market==='spread'?b.margin+Number(r.line)>0:b.total>Number(r.line);
        const bp=market==='moneyline'?(h?o.hML:o.aML):market==='spread'?(h?o.hSpreadPrice:o.aSpreadPrice):(h?o.overPrice:o.underPrice);
        const delta=market==='moneyline'?y:market==='spread'?y+Number(r.line):y-Number(r.line);
        const profit=(won,price)=>price>0?price/100:100/-price;
        if(implied(bp)!=null&&implied(r.price)!=null){roi.push(r.result==='push'?0:r.result==='win'?profit(true,r.price):-1);baselineROI.push(!delta?0:(h?delta>0:delta<0)?profit(true,bp):-1);}
      }
      const count=market==='moneyline'?brier.length:errors.length;
      const deltas=(market==='moneyline'?brier:errors).map((v,i)=>v-(market==='moneyline'?baseBrier:baseErrors)[i]);
      const mean=avg(deltas),se=count>1?Math.sqrt(deltas.reduce((s,v)=>s+(v-mean)**2,0)/(count-1)/count):null;
      const ci=se!=null?[mean-1.96*se,mean+1.96*se]:null;
      out.markets[market]={n:count,candidateMAE:avg(errors),baselineMAE:avg(baseErrors),marketMAE:avg(bookErrors),brier:avg(brier),baselineBrier:avg(baseBrier),logLoss:avg(ll),baselineLogLoss:avg(baseLL),marketBrier:avg(marketBrier),blendBrier:avg(blendBrier),marketProbabilityN:marketBrier.length,blendPolicy:'fixed 50/50 with same-time de-vigged market; research only',blendROI:avg(blendROI),
        candidateROI:avg(roi),baselineROI:avg(baselineROI),pricedN:roi.length,pairedDifference95:ci,
        gate:count<minGames?`Collecting: ${count}/${minGames} unique settled games`:ci&&ci[1]<0?'Forecast improvement detected; review calibration, pricing and source coverage before promotion':'No reliable improvement over current model',
        eligibleForReview:count>=minGames&&ci!=null&&ci[1]<0,promoted:false};
    }
    return out;
  }
  const api={paired,evaluate};root.SportsHubNFLValidation=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);
