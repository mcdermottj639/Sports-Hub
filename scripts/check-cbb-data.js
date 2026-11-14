/* Reject incomplete refreshes before they can replace published model evidence. */
const fs=require('node:fs'),assert=require('node:assert/strict');
const d=JSON.parse(fs.readFileSync(process.argv[2]||'data/cbb-history.json','utf8')),now=Date.now();
assert.equal(d.schema,1);assert.ok(d.coverage.teams>=350);assert.ok(Object.keys(d.teams).length===d.coverage.teams);
assert.ok(now-Date.parse(d.generatedAt)<36*3600e3&&Date.parse(d.generatedAt)<=now+60000);
const today=new Date().toISOString().slice(0,10);assert.equal(d.coverage.through,today);
assert.ok(d.games.length>10000);assert.equal(new Set(d.games.map(g=>g[0])).size,d.games.length);
for(const g of d.games){assert.ok(d.teams[g[3]]&&d.teams[g[4]]);assert.ok(g[3]!==g[4]);assert.ok(Number.isFinite(Date.parse(g[1]))&&Date.parse(g[1])<now);assert.ok([g[5],g[6]].every(v=>typeof v==='number'&&v>0&&v<250));assert.ok(g[5]!==g[6]);assert.equal(typeof g[7],'boolean');assert.equal(typeof g[8],'boolean');assert.equal(typeof g[9],'boolean');}
for(const [year,n] of Object.entries(d.coverage.seasonGames))assert.equal(n,d.games.filter(g=>g[2]===Number(year)).length);
console.log(`CBB data valid: ${d.games.length} finals, ${d.coverage.teams} teams, through ${d.coverage.through}`);
