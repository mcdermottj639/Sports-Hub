/* Descriptive schedule research; never feeds model weights or creates picks. */
(function(root,factory){const api=factory(root);root.SportsHubSituations=api;if(typeof module==='object'&&module.exports)module.exports=api;})(globalThis,function(root){
'use strict';
const zoneGroups={Pacific:'LAR LAC SF SEA LV OAK SD',Mountain:'DEN',Arizona:'ARI',Central:'CHI DAL GB HOU KC MIN NO TEN STL',Eastern:'ATL BAL BUF CAR CIN CLE DET IND JAX JAC MIA NE NYG NYJ PHI PIT TB WAS WSH'};
const zones=Object.fromEntries(Object.entries(zoneGroups).flatMap(([zone,teams])=>teams.split(' ').map(t=>[t,zone])));
const us=new Set(['US','USA','UNITED STATES','UNITED STATES OF AMERICA']);
function international(venue){const country=String(venue?.address?.country||'').trim().toUpperCase();return country? !us.has(country):null;}
function baseZone(abbr){return zones[String(abbr||'').toUpperCase()]||null;}
// Coast travel is scheduled home-base-to-venue travel, not a claim about flight itineraries.
function scheduleContext(g){const v=g.venue||{},intl=international(v),home=baseZone(g.home?.abbr),away=baseZone(g.away?.abbr);
 const state=String(v.address?.state||'').toUpperCase();
 const east=['MA','NY','NJ','PA','MD','VA','NC','SC','GA','FL','OH','MI','IN','MASSACHUSETTS','NEW YORK','NEW JERSEY','PENNSYLVANIA','MARYLAND','VIRGINIA','NORTH CAROLINA','SOUTH CAROLINA','GEORGIA','FLORIDA','OHIO','MICHIGAN','INDIANA'];
 const west=['CA','WA','NV','CALIFORNIA','WASHINGTON','NEVADA'];
 const venueZone=intl===true?null:east.includes(state)?'Eastern':west.includes(state)?'Pacific':g.neutral===false&&intl===false?home:null;
 return {venue_name:v.fullName||null,venue_country:v.address?.country||null,venue_state:v.address?.state||null,international:intl,venue_zone:venueZone,home_base_zone:home,away_base_zone:away,context_version:'situations-v1'};
}
function dimensions(d){const C=root.SportsHubSignalsCore,i=d.inputs||{},x=C.researchDimensions(d),t=x.team;
 const start=i.scheduled_start_at||d.scheduled_start_at,valid=Number.isFinite(Date.parse(start));
 const parts=valid?new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',weekday:'short',hour:'numeric',hourCycle:'h23'}).formatToParts(new Date(start)):[];
 const hour=Number(parts.find(p=>p.type==='hour')?.value),day=parts.find(p=>p.type==='weekday')?.value;
 const abbr=String(i.matchup||'').split(/\s+@\s+/);const tz=t?(i[t+'_base_zone']||((d.sport||i.sport)==='nfl'?baseZone(t==='away'?abbr[0]:abbr[1]):null)):null;
 // Historical non-neutral games can be classified only from known frozen team identities.
 const vz=i.venue_zone||(i.neutral===false&&(d.sport||i.sport)==='nfl'?baseZone(abbr[1]):null);
 const travel=t&&tz&&vz&&i.international!==true?`${tz}:${vz}`:null;
 return {...x,travel,international:typeof i.international==='boolean'?i.international:null,early:valid?day==='Sun'&&hour>=12&&hour<15:null,prime:valid?hour>=19:null,
  returned:t?i[t+'_previous_international']??null:null,previousAway:t?i[t+'_previous_away']??null:null,previousMargin:t?C.number(i[t+'_previous_margin']):null,opponentBye:t?i[(t==='home'?'away':'home')+'_post_bye']??null:null};
}
const known=(v,fn)=>v==null?null:fn(v);
const team=(x,fn)=>x.team?fn():false;
const defs=[
 ['postbye','Rest & byes','Off a bye','Selected team after its verified schedule bye.',x=>team(x,()=>x.bye)],
 ['homebye','Rest & byes','Home after a bye','Non-neutral home team after its verified bye.',x=>x.team==='home'&&x.neutral===false?x.bye:false],
 ['awaybye','Rest & byes','Road after a bye','Away team after its verified bye.',x=>x.team==='away'&&x.neutral===false?x.bye:false],
 ['oppbye','Rest & byes','Facing a rested bye team','Selected team faces an opponent coming off a verified bye.',x=>team(x,()=>x.opponentBye)],
 ['short','Rest & byes','Short week','Selected team has fewer than 7 calendar days between games.',x=>team(x,()=>known(x.rest,v=>v<7))],
 ['long','Rest & byes','10+ days of rest','Extended rest; not automatically classified as a bye.',x=>team(x,()=>known(x.rest,v=>v>=10))],
 ['restedge','Rest & byes','Rest advantage','Selected team has at least 3 more rest days than its opponent.',x=>team(x,()=>known(x.restAdvantage,v=>v>=3))],
 ['restdeficit','Rest & byes','Rest disadvantage','Selected team has at least 3 fewer rest days.',x=>team(x,()=>known(x.restAdvantage,v=>v<=-3))],
 ['westeast','Travel & venues','West Coast → East Coast','Pacific home base to an Eastern venue. Scheduled geography, not actual itinerary.',x=>team(x,()=>known(x.travel,v=>v==='Pacific:Eastern'))],
 ['westearly','Travel & venues','West → East · early Sunday','Pacific home base to an Eastern venue; Sunday kickoff noon–3 PM Eastern.',x=>team(x,()=>known(x.travel,v=>v==='Pacific:Eastern')===false?false:x.travel==null||x.early==null?null:x.travel==='Pacific:Eastern'&&x.early)],
 ['eastwest','Travel & venues','East Coast → West Coast','Eastern home base to a Pacific venue. Scheduled geography, not actual itinerary.',x=>team(x,()=>known(x.travel,v=>v==='Eastern:Pacific'))],
 ['intl','Travel & venues','International games','Game venue is outside the United States. Both designated sides tracked.',x=>x.international],
 ['intlreturn','Travel & venues','Returning from international','Selected team’s previous game was overseas and current venue is in the US.',x=>team(x,()=>x.international===true?false:x.international==null||x.returned==null?null:x.returned)],
 ['roadrepeat','Travel & venues','Consecutive road games','Away now and away in the previous game; excludes known neutral games.',x=>x.team==='away'&&x.neutral===false?x.previousAway:false],
 ['neutral','Travel & venues','Neutral-site games','Designated home team is not playing a normal home game.',x=>x.neutral],
 ['road_dog','Matchups & market','Road underdogs','Non-neutral away team receiving points or priced as the underdog.',x=>x.team==='away'&&x.neutral===false?known(x.category,v=>v==='underdog'):false],
 ['home_dog','Matchups & market','Home underdogs','Non-neutral home team receiving points or priced as the underdog.',x=>x.team==='home'&&x.neutral===false?known(x.category,v=>v==='underdog'):false],
 ['road_fav','Matchups & market','Road favorites','Non-neutral away team favored on the saved line.',x=>x.team==='away'&&x.neutral===false?known(x.category,v=>v==='favorite'):false],
 ['division','Matchups & market','Division matchups','Verified same-division games. Examine both totals directions and team sides.',x=>known(x.division,v=>v==='division')],
 ['nondivision','Matchups & market','Non-division matchups','Verified different-division games.',x=>known(x.division,v=>v==='nondivision')],
 ['prime','Matchups & market','Primetime games','Kickoff at 7 PM Eastern or later.',x=>x.prime],
 ['win','Previous result','After a win','Selected team won its previous completed regular-season game.',x=>team(x,()=>known(x.previousMargin,v=>v>0))],
 ['loss','Previous result','After a loss','Selected team lost its previous completed regular-season game.',x=>team(x,()=>known(x.previousMargin,v=>v<0))],
 ['bigloss','Previous result','After a 14+ point loss','Selected team lost its previous game by at least 14 points.',x=>team(x,()=>known(x.previousMargin,v=>v<=-14))],
 ['bigwin','Previous result','After a 14+ point win','Selected team won its previous game by at least 14 points.',x=>team(x,()=>known(x.previousMargin,v=>v>=14))]
].map(([id,category,name,description,test])=>({id,category,name,description,test}));
function select(rows,id){const def=defs.find(x=>x.id===id);return def?rows.filter(d=>def.test(dimensions(d))===true):rows;}
function coverage(rows,id){const def=defs.find(x=>x.id===id);const matches=select(rows,id),unknown=def?rows.filter(d=>def.test(dimensions(d))==null):[];const count=ds=>new Set(ds.map(d=>[d.sport,d.event_id,d.schedule_instance].join('|'))).size;return {matches,games:count(matches),unknown:count(unknown)};}
return {defs,dimensions,select,coverage,scheduleContext,international,baseZone};
});
