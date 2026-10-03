#!/usr/bin/env python3
"""Fit fixed candidate families; select on 2024, report 2025 once.
2025 has been used in previous engine research: this is a chronological holdout
for this fit, not a never-seen organizational test. Promotion requires future rows.
"""
import hashlib,json,sys
from datetime import datetime,timezone
from pathlib import Path
import numpy as np
from sklearn.linear_model import Ridge,LogisticRegression
from sklearn.preprocessing import StandardScaler

ROOT=Path(__file__).resolve().parents[1]
raw=Path(sys.argv[1]).read_bytes(); data=json.loads(raw); rows=data['rows']
train=[r for r in rows if 2018<=r['season']<=2023];valid=[r for r in rows if r['season']==2024];test=[r for r in rows if r['season']==2025]
if min(len(train),len(valid),len(test))<200:raise RuntimeError('Incomplete chronological splits')
families={'core':data['groups']['core'],'qb':data['groups']['core']+data['groups']['quarterback'],'matchup':sum(data['groups'].values(),[])}
report={'version':'football-research-nfl-v4','generatedAt':datetime.now(timezone.utc).isoformat(),'featureHash':hashlib.sha256(raw).hexdigest(),
 'split':{'train':'2018–2023','selection':'2024','holdout':'2025','future':'2026 after deployment'},
 'limitations':['Corrected historical play-by-play is retrospective, not archived pregame source vintages.','Historical QB expectation uses the prior game passer; lineup-change scenarios require prospective validation.','2025 was used by earlier model research; no claim it is an untouched organizational test.','No timestamped historical sportsbook quotes: historical ROI, CLV and market blends are not claimed.','Weather, coaching, non-QB personnel and clutch have zero extra weight pending prospective validation.'],
 'samples':{'train':len(train),'selection':len(valid),'holdout':len(test)},'ablations':{},'holdout':{}}
models={}; residuals={}
for target in ['margin','total','moneyline']:
 candidates=[]
 for family,features in families.items():
  x=np.array([[r['features'][f] for f in features] for r in train]);scaler=StandardScaler().fit(x)
  valid_x=scaler.transform([[r['features'][f] for f in features] for r in valid]);test_x=scaler.transform([[r['features'][f] for f in features] for r in test])
  for alpha in [10,100,1000]:
   if target=='moneyline':
    keep=np.array([r['margin']!=0 for r in train]);y=np.array([r['margin']>0 for r in train]);m=LogisticRegression(C=1/alpha,max_iter=2000).fit(scaler.transform(x)[keep],y[keep]);pred=m.predict_proba(valid_x)[:,1];truth=np.array([r['margin']>0 for r in valid]);mask=np.array([r['margin']!=0 for r in valid]);loss=float(np.mean((pred[mask]-truth[mask])**2))
   else:
    m=Ridge(alpha=alpha).fit(scaler.transform(x),[r[target] for r in train]);pred=m.predict(valid_x);loss=float(np.mean((pred-np.array([r[target] for r in valid]))**2))
   candidates.append((loss,family,alpha,features,scaler,m,pred,test_x))
 report['ablations'][target]=[{'family':c[1],'regularization':c[2],'selectionLoss':c[0]} for c in candidates]
 best=min(candidates,key=lambda c:c[0]);loss,family,alpha,features,scaler,m,pred,test_x=best
 # Freeze the selected training fit. Selection residuals remain out of training.
 coef=np.ravel(m.coef_)/scaler.scale_;intercept=float(np.ravel(np.array(m.intercept_))[0]-np.dot(coef,scaler.mean_))
 models[target]={'features':features,'coefficients':coef.tolist(),'centers':dict(zip(features,scaler.mean_.tolist())),'intercept':intercept,'family':family,'regularization':alpha}
 hp=m.predict_proba(test_x)[:,1] if target=='moneyline' else m.predict(test_x)
 if target=='moneyline':
  mask=np.array([r['margin']!=0 for r in test]);y=np.array([int(r['margin']>0) for r in test])[mask];p=hp[mask];b=np.array([r['baseline']['probHome'] for r in test])[mask]
  metrics=lambda p:{'n':int(len(y)),'brier':float(np.mean((p-y)**2)),'logLoss':float(np.mean(-y*np.log(np.clip(p,1e-6,1-1e-6))-(1-y)*np.log(np.clip(1-p,1e-6,1-1e-6)))),'accuracy':float(np.mean((p>=.5)==y))}
  report['holdout'][target]={'candidate':metrics(p),'baseline':metrics(b)}
 else:
  y=np.array([r[target] for r in test]);b=np.array([r['baseline'][target] for r in test]);metrics=lambda p:{'n':len(y),'mae':float(np.mean(np.abs(p-y))),'rmse':float(np.sqrt(np.mean((p-y)**2)))}
  report['holdout'][target]={'candidate':metrics(hp),'baseline':metrics(b)}
  residuals[target]=sorted(float(r[target]-p) for r,p in zip(valid,pred))
 report['holdout'][target]['selectedFamily']=family
 report['holdout'][target]['regularization']=alpha
config={'version':report['version'],'trainedThrough':'2024-02-12T12:00:00Z','selectedThrough':'2025-02-10T12:00:00Z','featureHash':report['featureHash'],'models':models,'residuals':residuals,
 'validation':report['holdout'], 'promotion':{'eligible':False,'status':'prospective validation required','minUniqueGames':150,'reason':'Historical feature and source availability limitations; no verified prospective betting advantage.'}}
path=ROOT/'supabase/functions/_shared/nfl-football-config.js';path.write_text('// Generated by scripts/fit-nfl-football.py; never refit automatically.\n(function(root){const config='+json.dumps(config,separators=(',',':'))+';root.SportsHubNFLFootballConfig=config;if(typeof module!=="undefined"&&module.exports)module.exports=config;})(globalThis);\n')
(ROOT/'data/nfl-football-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report['holdout'],indent=2))
