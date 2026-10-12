// Usage: node scripts/validate-nfl-ppp-shadow.js saved-ai-predictions.json
// Export model_version=football-research-nfl-ppp-v1; retain complete snapshots.
const fs=require('node:fs'),P=require('../supabase/functions/_shared/nfl-ppp-shadow.js');
const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
console.log(JSON.stringify(P.evaluate(Array.isArray(input)?input:input.rows),null,2));
