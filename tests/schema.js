#!/usr/bin/env node
/* Does schema.sql actually hold up — and does the app agree with it?
   ------------------------------------------------------------------
   🚨 This is the ONLY component with no browser coverage, and it is the one
   that will run in production for twenty relatives. The sandbox has no
   Postgres SERVER, so this cannot prove behaviour — but it can prove the
   two things that would otherwise fail silently on the family's phones:

   1. It PARSES, function bodies included, under libpg_query — the same
      parser Postgres itself uses. A syntax error in a PL/pgSQL body is
      invisible to any amount of reading and would only surface when the
      commissioner pasted it into the SQL editor.
   2. Every RPC the app calls exists, with EXACTLY the argument names the
      app sends. PostgREST resolves a function by its named arguments, so a
      single renamed parameter is not a type error anywhere — it is a 404
      at the moment a relative taps a team, and nothing in the browser
      suite can see it because the sandbox never reaches Supabase.

   Needs the `pglast` python package (`pip install pglast`). If it is not
   installed this suite says so and skips rather than pretending to pass. */
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const DIR = path.dirname(__dirname);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

const sql = fs.readFileSync(path.join(DIR, 'schema.sql'), 'utf8');
const js = fs.readFileSync(path.join(DIR, 'survivor.js'), 'utf8');

// ---- what the app asks the database for -------------------------------
console.log('\n— every RPC the app calls, and the arguments it sends —');
const calls = [];
for (const m of js.matchAll(/_rpc\(\s*'([a-z_]+)'\s*,\s*\{([^}]*)\}/g)) {
  calls.push({ fn: m[1], args: [...m[2].matchAll(/([a-z_0-9]+)\s*:/g)].map((a) => a[1]).sort() });
}
ok(calls.length >= 10, `${calls.length} RPC call sites found in survivor.js`);

let py = '';
try {
  py = execFileSync('python3', ['-c', `
import json, sys
try: import pglast
except ImportError: print(json.dumps({'skip': 1})); sys.exit(0)
from pglast import parser
sql = open(${JSON.stringify(path.join(DIR, 'schema.sql'))}).read()
tree = pglast.parse_sql(sql)
fns, bodybad = {}, []
for st in tree:
    s = st.stmt
    if s.__class__.__name__ != 'CreateFunctionStmt': continue
    name = '.'.join(x.sval for x in s.funcname)
    lang = next((o.arg.sval for o in s.options if o.defname == 'language'), None)
    args = [p.name for p in (s.parameters or []) if p.name]
    defr = any(o.defname == 'security' for o in s.options)
    fns[name] = {'args': sorted(args), 'lang': lang, 'definer': defr}
    if lang == 'plpgsql':
        frag = sql[st.stmt_location: st.stmt_location + (st.stmt_len or 0)]
        try: parser.parse_plpgsql_json(frag)
        except Exception as e: bodybad.append(name + ': ' + str(e))
grants = [st.stmt for st in tree if st.stmt.__class__.__name__ == 'GrantStmt']
granted = set()
for g in grants:
    if not g.is_grant: continue
    for o in (g.objects or []):
        try: granted.add('.'.join(x.sval for x in o.objname))
        except Exception: pass
print(json.dumps({'fns': fns, 'bodybad': bodybad, 'granted': sorted(granted),
                  'stmts': len(tree)}))
`], { encoding: 'utf8', cwd: DIR });
} catch (e) {
  console.log('  ✗ could not run the Postgres parser: ' + (e.stderr || e.message).split('\n')[0]);
  console.log('\n0 passed, 1 failed\n'); process.exit(1);
}
const r = JSON.parse(py.trim().split('\n').pop());
if (r.skip) {
  console.log('  · pglast is not installed — `pip install pglast` to check the SQL.');
  console.log('    Skipping rather than passing: a suite that measures nothing is worse than one that fails.');
  console.log('\n0 passed, 0 failed\n'); process.exit(0);
}

console.log('\n— it parses, bodies included —');
ok(r.stmts >= 30, `${r.stmts} statements parse under libpg_query (the parser Postgres itself uses)`);
ok(r.bodybad.length === 0, `every PL/pgSQL body parses${r.bodybad.length ? ' — ' + r.bodybad[0] : ''}`);

console.log('\n— the app and the database agree on names —');
for (const c of calls) {
  const f = r.fns[c.fn];
  if (!f) { ok(false, `${c.fn} is defined in schema.sql`); continue; }
  ok(true, `${c.fn} exists`);
  const missing = c.args.filter((a) => !f.args.includes(a));
  const extra = f.args.filter((a) => !c.args.includes(a));
  ok(missing.length === 0 && extra.length === 0,
    `  and takes exactly what the app sends (${c.args.join(', ') || 'no args'})` +
    (missing.length ? ` — DB is missing ${missing.join(', ')}` : '') +
    (extra.length ? ` — app never sends ${extra.join(', ')}` : ''));
}

console.log('\n— the anon key can reach them, and only them —');
for (const c of [...new Set(calls.map((x) => x.fn))]) {
  ok(r.granted.includes(c), `${c} is granted to the anon role — otherwise the app gets a 403`);
}
// Every write must go through a function, never at the table (the no-repeat
// rule is a UNIQUE constraint enforced there, and direct writes bypass it).
ok(/revoke\s+all\s+on\s+picks\s+from\s+anon/i.test(sql), 'picks is revoked from anon — writes can only go through submit_pick');
ok(/create\s+or\s+replace\s+view\s+players_public/i.test(sql), 'players_public exists');
ok(!/select\s+\*\s+from\s+players\b/i.test(sql.split('players_public')[1] || ''),
   'and it does not select * — the token column must never be readable');

console.log('\n— the guards the fixes depend on are actually in the SQL —');
ok(/\bkickoff\b/.test(sql), 'picks carries a kickoff column');
const sp = sql.slice(sql.indexOf('function submit_pick'), sql.indexOf('function admin_add_player'));
ok(/p_kickoff\s+is\s+null/i.test(sp), 'submit_pick refuses a pick with no kickoff (that is the bye rule)');
ok(/now\(\)/i.test(sp), 'and refuses one whose game has already started');
const asp = sql.slice(sql.indexOf('function admin_set_pick'));
ok(/now\(\)/i.test(asp), 'admin_set_pick is held to the same deadline — the commissioner is not exempt');
ok(/unique/i.test(sql), 'the no-repeat rule is a UNIQUE constraint, not a UI check');

// SECURITY DEFINER: these read or write rows the anon role cannot touch.
for (const n of ['submit_pick', 'claim_player', 'whoami', 'join_league']) {
  ok(r.fns[n] && r.fns[n].definer, `${n} is SECURITY DEFINER`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
