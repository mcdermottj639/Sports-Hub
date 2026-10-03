// Usage: node scripts/validate-nfl-prospective.js saved-research-rows.json
const fs=require('node:fs'),V=require('../supabase/functions/_shared/nfl-validation.js');
const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
console.log(JSON.stringify(V.evaluate(Array.isArray(input)?input:input.rows),null,2));
