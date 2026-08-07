'use strict';
/* Workout Lab — standalone Labs page for Sports-Hub.
 *
 * A 3-day training split (chest & triceps / back & biceps / legs & shoulders)
 * built around the owner's own 30-minute dumbbell-and-kettlebell format:
 * short warm-up, three timed blocks (superset, superset, circuit), cooldown.
 *
 * Two things this adds on top of a written plan:
 *   1. Every muscle the 3-day split leaves out gets an explicit "gap fix"
 *      block (see BLOCK.gap + the Coverage map) instead of being ignored.
 *   2. A guided session: block-by-block, tappable sets, a rest timer, and
 *      per-exercise load logging so progressive overload is actually visible
 *      ("last time: 45 lb").
 *
 * Pure client-side. No backend, no accounts — everything lives in
 * localStorage on this device (see the K_* keys below).
 */

// --- tiny helpers ---------------------------------------------------------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

const pad2 = (n) => String(n).padStart(2, '0');
const fmtClock = (sec) => `${Math.floor(sec / 60)}:${pad2(Math.max(0, Math.round(sec)) % 60)}`;
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const shortDate = (s) => {
  const [y, m, d] = String(s).split('-').map(Number);
  if (!y) return s;
  // Anchor at noon so the label can't slip a day across a timezone boundary.
  return new Date(y, m - 1, d, 12).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const daysAgo = (s) => {
  const [y, m, d] = String(s).split('-').map(Number);
  if (!y) return 999;
  return Math.round((new Date().setHours(12, 0, 0, 0) - new Date(y, m - 1, d, 12).getTime()) / 86400000);
};

// --- storage --------------------------------------------------------------
const K_LOG = 'workoutlab:log';      // [{ d, key, dur, sets, vol, unit }]  newest last
const K_LAST = 'workoutlab:last';    // { exerciseId: { w, d } }  last load used
const K_PREFS = 'workoutlab:prefs';  // { unit, autoRest, sound }
const readJSON = (k, fb) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; } catch (e) { return fb; } };
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const prefs = () => Object.assign({ unit: 'lb', autoRest: true, sound: true, vis: true }, readJSON(K_PREFS, {}));
const setPref = (k, v) => { const p = prefs(); p[k] = v; writeJSON(K_PREFS, p); };

// ==========================================================================
// THE PROGRAM
// ==========================================================================
/* Shape:
 *   day  = { k, n, sub, emoji, color, mins, focus, warmup[], blocks[], cooldown[] }
 *   block= { id, name, mins, style, rounds, rest (sec), note, gap, why, ex[] }
 *   ex   = { n, reps, load, cue, alts[] }
 *
 * `load: true` means the exercise gets a weight field in a session (so it can
 * be tracked week to week). Bodyweight/holds don't.
 *
 * `gap: true` marks a block that exists specifically because the owner's
 * 3-day split doesn't cover that muscle anywhere else — see COVERAGE.
 */
const PLAN = {
  push: {
    k: 'push', n: 'Chest & Triceps', sub: 'Day 1 · Push', emoji: '💪',
    color: 'var(--wk-push)', mins: 33,
    focus: ['Chest', 'Triceps', 'Front delts (indirect)', 'Core (gap fix)'],
    intro: 'Your original session, tightened up — same blocks, same 30-minute shape, with a 4-minute core block bolted on the end because nothing else in the week trains the abs directly.',
    warmup: [
      { n: 'Arm circles', reps: '20 each direction' },
      { n: 'Band pull-apart', reps: '15', cue: 'Added to your original warm-up. Thirty seconds of rear-delt and scap work before every pressing session is the cheapest shoulder insurance there is.' },
      { n: 'Light DB press', reps: '10', cue: 'Half the working weight or less. Groove the path, don\'t fatigue anything.' },
      { n: 'Push-ups', reps: '20 total', cue: 'Broken up as needed — this is a warm-up, not a set.' },
    ],
    blocks: [
      {
        id: 'A', name: 'Push power', mins: 9, style: 'Superset', rounds: 3, rest: 60,
        note: 'Heaviest work of the day, so it goes first while you\'re fresh. Run A1 straight into A2, then rest.',
        ex: [
          {
            n: 'DB floor press', reps: '8–10', load: true,
            cue: 'Elbows about 45° from your ribs — not flared to 90°. Upper arms stop when they touch the floor. That hard stop caps shoulder extension, which is why the floor press is the safer default if you don\'t have a bench.',
            alts: ['Bench press (DB or barbell)', 'Push-up with a slow 3-second lower'],
          },
          {
            n: 'Close-grip DB press', reps: '10–12', load: true,
            cue: 'Dumbbells pressed together for the entire set — actively squeezing them into each other is what moves the work onto the triceps. Elbows stay tucked to the ribs.',
            alts: ['Diamond push-up', 'Close-grip barbell bench'],
          },
        ],
      },
      {
        id: 'B', name: 'Angle + stretch', mins: 9, style: 'Superset', rounds: 3, rest: 45,
        note: 'A different chest angle plus the triceps in a lengthened position — the half of each muscle the flat press misses.',
        ex: [
          {
            n: 'Incline DB press', reps: '10–12', load: true,
            cue: 'Set the bench to 30–45°, no higher. Past 45° it quietly becomes a shoulder press. This is the upper-chest work the flat press under-trains.',
            alts: ['Feet-elevated push-up', 'Low-to-high band press'],
          },
          {
            n: 'KB skull crusher', reps: '10–12', load: true,
            cue: 'One bell, both hands on the horns. Lower to the forehead or just past it. Elbows point at the ceiling and stay frozen — only the forearm moves.',
            alts: ['DB skull crusher', 'Bench dip', 'Band overhead extension'],
          },
        ],
      },
      {
        id: 'C', name: 'Finisher', mins: 7, style: 'Circuit', rounds: 3, rest: 20,
        note: 'Minimal rest — this block is for volume and blood flow, not load. Go lighter than feels right.',
        ex: [
          {
            n: 'DB flye', reps: '12', load: true,
            cue: 'Soft elbow, locked at that angle the whole rep — think "hug a barrel." Go light. Stop the descent where the stretch is strong, not where the shoulder complains.',
            alts: ['Band or cable crossover', 'Wide-hand slow push-up'],
          },
          {
            n: 'Overhead KB triceps extension', reps: '12', load: true,
            cue: 'Bell behind the head, elbows in tight and pointed forward. Overhead is the only position that fully stretches the long head of the triceps — the head that adds the most size.',
            alts: ['DB overhead extension', 'Band overhead extension'],
          },
          {
            n: 'Push-ups', reps: 'Max, stop 2 shy of failure',
            cue: 'Ribs down, glutes tight, one straight line from ear to ankle. When the reps visibly slow, you\'re about two out — stop there so round 3 is still worth doing.',
            alts: ['Knee push-up', 'Hands-elevated push-up'],
          },
        ],
      },
      {
        id: 'D', name: 'Gap fix — Core', mins: 4, style: 'Circuit', rounds: 2, rest: 20,
        gap: true,
        why: 'Chest / back / legs covers a lot, but nothing in a 3-day split trains the abs directly. Push day is the lightest on your trunk, so the core work lives here.',
        ex: [
          {
            n: 'Hollow hold', reps: '30 sec',
            cue: 'Low back glued to the floor. The second it lifts, tuck your knees in until it doesn\'t — a short lever done right beats a long lever done badly.',
            alts: ['Dead bug — 10/side'],
          },
          {
            n: 'Hanging or lying leg raise', reps: '12',
            cue: 'Curl the pelvis up at the top instead of just swinging the legs. Lower slower than you lift.',
            alts: ['Reverse crunch', 'Knee tuck'],
          },
          {
            n: 'KB or DB Russian twist', reps: '20 total', load: true,
            cue: 'Rotate from the ribs, not the arms — the weight follows your chest. Heels can stay down.',
            alts: ['Pallof press — 10/side', 'Cable woodchop'],
          },
        ],
      },
    ],
    cooldown: [
      { n: 'Doorway chest stretch', reps: '30 sec/side' },
      { n: 'Overhead triceps stretch', reps: '30 sec/side' },
    ],
  },

  pull: {
    k: 'pull', n: 'Back & Biceps', sub: 'Day 2 · Pull', emoji: '🪝',
    color: 'var(--wk-pull)', mins: 33,
    focus: ['Lats & mid-back', 'Biceps', 'Rear delts (gap fix)', 'Grip, forearms & low back (gap fix)'],
    intro: 'The mirror image of Day 1: one heavy vertical/horizontal pull pair, a stretch-position pair, a circuit, then the grip-and-erector work that pulling exposes but never quite trains.',
    warmup: [
      { n: 'Band pull-apart', reps: '20' },
      { n: 'Cat-cow + thoracic rotation', reps: '8 each' },
      { n: 'Dead hang', reps: '20 sec', cue: 'Or a light one-arm row × 10/side if there\'s no bar. Decompresses the shoulder and wakes the grip up.' },
      { n: 'Scap pull-up (or scap push-up)', reps: '10', cue: 'Arms straight, just shrug down and pull the shoulder blades into the back pockets. Teaches the lats to start the rep instead of the arms.' },
    ],
    blocks: [
      {
        id: 'A', name: 'Pull power', mins: 9, style: 'Superset', rounds: 3, rest: 60,
        note: 'One vertical pull, one horizontal pull. Together they cover the back in a way either one alone doesn\'t.',
        ex: [
          {
            n: 'Pull-up or chin-up', reps: '5–8',
            cue: 'Chest toward the bar, not chin over it. Chin-up (palms toward you) if you want more biceps, pull-up (palms away) if you want more lat. Band-assisted reps and slow negatives both count.',
            alts: ['One-arm DB row — 8–10/side (no bar)', 'Band lat pulldown', 'Inverted row under a table'],
          },
          {
            n: 'Bent-over DB row', reps: '8–10', load: true,
            cue: 'Torso about 45°, back flat, pull to the belt line — not up to the chest. Squeeze for a beat at the top before lowering.',
            alts: ['KB gorilla row', 'Chest-supported row on an incline bench'],
          },
        ],
      },
      {
        id: 'B', name: 'Width + stretch', mins: 9, style: 'Superset', rounds: 3, rest: 45,
        note: 'Both of these load the muscle at its longest — the position that drives the most growth per rep.',
        ex: [
          {
            n: 'DB pullover', reps: '10–12', load: true,
            cue: 'Lie along or across a bench (the floor is fine), arms nearly straight, reach back until the lats stretch hard. Keep the ribs pulled down so the low back doesn\'t take over.',
            alts: ['Band straight-arm pulldown', 'Kneeling lat prayer'],
          },
          {
            n: 'Incline or seated DB curl', reps: '10–12', load: true,
            cue: 'Lying back on an incline starts the biceps stretched behind the body — that\'s the version that actually builds them. No swing, no shoulder drive.',
            alts: ['Standing DB curl', 'Band curl', 'Preacher curl'],
          },
        ],
      },
      {
        id: 'C', name: 'Finisher', mins: 7, style: 'Circuit', rounds: 3, rest: 20,
        note: 'Rear delts lead this circuit on purpose — see the note below.',
        ex: [
          {
            n: 'Bent-over rear-delt flye', reps: '15', load: true,
            cue: 'Light — genuinely light. Thumbs angled down, lead with the elbows, stop at shoulder height. The rear delt is the most-skipped head of the shoulder and it sits right here on back day.',
            alts: ['Band face pull', 'Reverse pec-deck', 'Prone Y-raise'],
          },
          {
            n: 'Hammer curl', reps: '12', load: true,
            cue: 'Neutral grip, palms facing each other. Hits the brachialis and the forearm, which a straight-bar curl mostly skips.',
            alts: ['Cross-body hammer curl', 'Band hammer curl'],
          },
          {
            n: 'Inverted row or single-arm DB row', reps: '12', load: true,
            cue: 'Whatever you have access to. Row to the hip, pause, control the way down.',
            alts: ['Band row', 'Renegade row', 'TRX row'],
          },
        ],
      },
      {
        id: 'D', name: 'Gap fix — Grip, forearms & low back', mins: 4, style: 'Circuit', rounds: 2, rest: 30,
        gap: true,
        why: 'Rows and curls hit the forearms indirectly, but grip is usually what fails first and caps everything else. And the spinal erectors get no direct work anywhere in the split — carries and extensions fix both.',
        ex: [
          {
            n: 'Farmer carry', reps: '30–40 sec', load: true,
            cue: 'As heavy as you can hold. Ribs down, shoulders back, walk tall and quiet. No room to walk? Just stand and hold — the grip doesn\'t know the difference.',
            alts: ['Suitcase carry — 20 sec/side', 'Static KB hold'],
          },
          {
            n: 'DB wrist curl + reverse curl', reps: '15 each', load: true,
            cue: 'Light and slow. Full range both directions — the reverse half is the one everybody skips and the one that balances all that curling.',
            alts: ['Plate pinch hold', 'Towel dead hang'],
          },
          {
            n: 'Superman or back extension', reps: '12',
            cue: 'Squeeze the glutes to lift, don\'t crank the neck back. Pause a beat at the top.',
            alts: ['Bird dog — 10/side', 'Light good morning'],
          },
        ],
      },
    ],
    cooldown: [
      { n: 'Lat stretch (hang or doorway)', reps: '30 sec/side' },
      { n: 'Wall biceps + forearm stretch', reps: '30 sec/side' },
      { n: 'Child\'s pose', reps: '30 sec' },
    ],
  },

  legs: {
    k: 'legs', n: 'Legs & Shoulders', sub: 'Day 3 · Legs + Delts', emoji: '🦵',
    color: 'var(--wk-legs)', mins: 36,
    focus: ['Quads & glutes', 'Hamstrings (gap fix)', 'All three delt heads', 'Calves & anti-rotation core (gap fix)'],
    intro: 'The biggest day of the three — legs and shoulders together is a lot of muscle. Eat something first, and if you\'re short on time cut Block C to two rounds rather than skipping the hinge in Block B.',
    warmup: [
      { n: 'Bodyweight squat', reps: '15' },
      { n: 'Leg swings, front & side', reps: '10 each per leg' },
      { n: 'Glute bridge', reps: '15', cue: 'Wakes the glutes up so the squats and RDLs don\'t become all-quad, all-low-back.' },
      { n: 'Band pull-apart + arm circles', reps: '15 each' },
      { n: 'Ankle rock', reps: '10/side', cue: 'Knee travels over the toes, heel stays down. Ankle range is usually what limits squat depth.' },
    ],
    blocks: [
      {
        id: 'A', name: 'Squat + press', mins: 10, style: 'Superset', rounds: 3, rest: 75,
        note: 'The two hardest lifts of the day, paired. Longer rest here — 75 seconds — because these are the ones worth being fresh for.',
        ex: [
          {
            n: 'Goblet squat', reps: '8–10', load: true,
            cue: 'Bell at the chest, elbows tracking inside the knees at the bottom. Sit down between your feet rather than folding forward, heels planted. Go as deep as you can hold a flat back.',
            alts: ['DB front squat', 'Bulgarian split squat — 8/side', 'Bodyweight squat with a 3-second lower'],
          },
          {
            n: 'Standing DB overhead press', reps: '8–10', load: true,
            cue: 'Squeeze the glutes so the ribs don\'t flare and the low back doesn\'t arch. Press slightly back so the bells finish over your ears, not out in front of your face.',
            alts: ['Seated DB press', 'Single-arm KB press', 'Landmine press'],
          },
        ],
      },
      {
        id: 'B', name: 'Hinge + side delts', mins: 9, style: 'Superset', rounds: 3, rest: 45,
        note: 'Both of these are gap fixes hidden inside a normal block — the hamstring hinge and the side delt are the two things "legs and shoulders" days usually miss.',
        ex: [
          {
            n: 'Romanian deadlift (DB or KB)', reps: '10–12', load: true,
            cue: 'Push the hips BACK, don\'t squat down. Bells slide down the thighs, back flat, knees soft but not bending further. Stop when the hamstrings say stop — that end point is the rep, not the floor.',
            alts: ['Single-leg RDL — 8/side', 'KB good morning', 'Hip thrust'],
          },
          {
            n: 'DB lateral raise', reps: '12–15', load: true,
            cue: 'Light. Lead with the elbow, stop at shoulder height, lower slowly. This is the side delt — the head that makes shoulders look wide, and pressing barely touches it.',
            alts: ['Band lateral raise', 'Lean-away single-arm raise', 'Cable lateral raise'],
          },
        ],
      },
      {
        id: 'C', name: 'Unilateral finisher', mins: 8, style: 'Circuit', rounds: 3, rest: 25,
        note: 'One leg at a time exposes the side that\'s been coasting. Expect the second leg to be worse — that\'s the point.',
        ex: [
          {
            n: 'Reverse lunge', reps: '10/leg', load: true,
            cue: 'Step BACK, drop the back knee toward the floor, drive through the front heel to stand. Reverse is far kinder to the knee than stepping forward.',
            alts: ['Split squat', 'Step-up', 'Walking lunge'],
          },
          {
            n: 'KB swing', reps: '15–20', load: true,
            cue: 'A hinge, not a squat — and definitely not a front raise. Snap the hips and let the bell float up to chest height on its own. Shoulders stay packed.',
            alts: ['DB RDL-to-shrug', 'Hip thrust ×15', 'Broad jump ×8'],
          },
          {
            n: 'Rear-delt flye or bent-over Y-raise', reps: '15', load: true,
            cue: 'This finishes all three heads of the shoulder in one day — front from the press, side from the raise, rear right here.',
            alts: ['Band face pull', 'Prone Y-raise'],
          },
        ],
      },
      {
        id: 'D', name: 'Gap fix — Calves & anti-rotation core', mins: 5, style: 'Circuit', rounds: 3, rest: 20,
        gap: true,
        why: '"Legs" in practice almost always means quads and glutes — calves get skipped entirely, and they only respond to high reps with a real stretch. The anti-rotation work protects the low back that the RDLs and swings just loaded.',
        ex: [
          {
            n: 'Standing calf raise', reps: '20', load: true,
            cue: 'Off a step if you have one, DB in hand. Full stretch at the bottom, pause a full beat at the top, slow the whole way. Bouncing is the single reason most people\'s calves never change.',
            alts: ['Single-leg calf raise — 12/side', 'Seated calf raise'],
          },
          {
            n: 'Pallof press or side plank', reps: '10/side or 30 sec/side',
            cue: 'Resist the rotation — that\'s the entire exercise. Nothing should move except your arms.',
            alts: ['Suitcase carry — 20 sec/side', 'Bird dog'],
          },
          {
            n: 'Tibialis raise', reps: '20',
            cue: 'Heels on the floor, back against a wall, pull the toes up toward the shins. Two minutes a week for the front of the shin and your ankles and knees will thank you.',
            alts: ['Heel walk — 20 sec'],
          },
        ],
      },
    ],
    cooldown: [
      { n: 'Couch or standing quad stretch', reps: '30 sec/side' },
      { n: 'Hamstring stretch', reps: '30 sec/side' },
      { n: 'Cross-body shoulder stretch', reps: '30 sec/side' },
      { n: 'Calf stretch on a wall', reps: '30 sec/side' },
    ],
  },
};
const DAY_KEYS = ['push', 'pull', 'legs'];

// --- optional add-on modules ----------------------------------------------
// Short standalone sessions. The first two exist because a 3-day lifting split
// genuinely doesn't cover them; the rest are quality-of-life.
const ADDONS = {
  cardio: {
    k: 'cardio', n: 'Conditioning', sub: 'Add-on · 10 min', emoji: '🫀',
    color: 'var(--wk-addon)', mins: 10, addon: true,
    focus: ['Heart & lungs', 'Work capacity'],
    intro: 'The one thing three days of lifting does not train at all. Do it on an off day, or tack it onto the end of any session. Ten minutes, twice a week, is enough to matter.',
    warmup: [{ n: 'Easy movement', reps: '1 min', cue: 'Walk, easy bike, arm swings. Just get warm.' }],
    blocks: [
      {
        id: 'A', name: 'EMOM — every minute on the minute', mins: 10, style: 'Alternating', rounds: 5, rest: 0,
        note: 'Start a new movement at the top of each minute. Whatever time is left in that minute is your rest — so moving faster earns more rest. Five rounds of the pair = 10 minutes.',
        ex: [
          { n: 'KB swing (odd minutes)', reps: '15', load: true, cue: 'Hips, not arms. If form goes, cut the reps before you cut the standard.', alts: ['DB RDL-to-shrug ×15', 'Jump rope 40 sec'] },
          { n: 'Burpee (even minutes)', reps: '8', cue: 'Step back instead of jumping back if the pace is dying.', alts: ['Mountain climber ×30', 'Row/bike 30 sec hard'] },
        ],
      },
    ],
    cooldown: [{ n: 'Walk it off', reps: '2 min' }],
    alt: 'No interest in an EMOM? A 5 × (30 sec hard / 90 sec easy) bike, row or incline-walk interval does the same job.',
  },
  core: {
    k: 'core', n: 'Core Blitz', sub: 'Add-on · 6 min', emoji: '🎯',
    color: 'var(--wk-addon)', mins: 6, addon: true,
    focus: ['Abs', 'Obliques', 'Anti-rotation'],
    intro: 'Day 1 already carries a core block. This is for the weeks you want more, or for an off day when you want to do something small.',
    warmup: [],
    blocks: [
      {
        id: 'A', name: 'Core circuit', mins: 6, style: 'Circuit', rounds: 3, rest: 30,
        ex: [
          { n: 'Hollow hold', reps: '30 sec', cue: 'Low back flat. Tuck the knees in if it lifts.', alts: ['Dead bug'] },
          { n: 'Side plank', reps: '20 sec/side', cue: 'Stack the hips, push the floor away.', alts: ['Knee side plank'] },
          { n: 'Reverse crunch', reps: '15', cue: 'Curl the pelvis, don\'t just swing the legs.', alts: ['Leg raise'] },
          { n: 'Plank shoulder tap', reps: '20 total', cue: 'Widen the feet so the hips stop rocking.', alts: ['Plank hold 40 sec'] },
        ],
      },
    ],
    cooldown: [{ n: 'Cobra / press-up stretch', reps: '30 sec' }],
  },
  mobility: {
    k: 'mobility', n: 'Mobility & Recovery', sub: 'Add-on · 8 min', emoji: '🧘',
    color: 'var(--wk-addon)', mins: 8, addon: true,
    focus: ['Hips', 'T-spine', 'Shoulders', 'Ankles'],
    intro: 'For the days between sessions. Everything here targets a joint that a dumbbell split tends to stiffen.',
    warmup: [],
    blocks: [
      {
        id: 'A', name: 'Flow', mins: 8, style: 'Circuit', rounds: 2, rest: 0,
        note: 'Move slowly and breathe. No load, no timer pressure.',
        ex: [
          { n: '90/90 hip switch', reps: '10 total', cue: 'Chest tall, knees drive the movement.', alts: ['Seated hip rotation'] },
          { n: 'World\'s greatest stretch', reps: '5/side', cue: 'Elbow to instep, then rotate and reach up.', alts: ['Lunge with rotation'] },
          { n: 'Thoracic opener (side-lying windmill)', reps: '8/side', cue: 'Knees stay stacked, only the top arm travels.', alts: ['Foam roller t-spine extension'] },
          { n: 'Couch stretch', reps: '45 sec/side', cue: 'Squeeze the glute of the stretching side — it turns a hip-flexor stretch into a real one.', alts: ['Kneeling hip flexor stretch'] },
          { n: 'Deep squat hold', reps: '45 sec', cue: 'Elbows inside the knees, gently press out.', alts: ['Assisted squat hold, holding a doorframe'] },
        ],
      },
    ],
    cooldown: [],
  },
  neck: {
    k: 'neck', n: 'Neck & Grip', sub: 'Add-on · 4 min', emoji: '🔩',
    color: 'var(--wk-addon)', mins: 4, addon: true,
    focus: ['Neck', 'Grip', 'Forearms'],
    intro: 'Genuinely optional, and the last thing anybody trains. Worth four minutes a week if you sit at a desk or want the collar of your shirt to fit differently.',
    warmup: [],
    blocks: [
      {
        id: 'A', name: 'Neck + grip', mins: 4, style: 'Circuit', rounds: 2, rest: 20,
        note: 'Neck work is isometric and light. Never load it fast, never force range.',
        ex: [
          { n: 'Neck isometric, 4 directions', reps: '15 sec each', cue: 'Palm on the forehead, back and each side. Push into your own hand — nothing moves.', alts: ['Banded neck flexion/extension'] },
          { n: 'Dead hang', reps: 'Max, stop before the grip fails', alts: ['Towel hang', 'Static DB hold'] },
          { n: 'Plate or DB pinch hold', reps: '25 sec', load: true, alts: ['Farmer carry'] },
        ],
      },
    ],
    cooldown: [],
  },
};
const ADDON_KEYS = ['cardio', 'core', 'mobility', 'neck'];
const getPlan = (k) => PLAN[k] || ADDONS[k] || null;

// --- coverage map ---------------------------------------------------------
// The honest answer to "what body parts did I miss?" — every major muscle,
// where it now lives, and whether the original 3-day request covered it.
//   ok   = your split already had it
//   fix  = it was missing or thin, and the program adds it
//   note = deliberately left out, with the reason
const COVERAGE = [
  { m: 'Chest', s: 'ok', w: 'Day 1 — floor press, incline press, flye. Flat + incline + a stretch movement is full coverage.' },
  { m: 'Triceps', s: 'ok', w: 'Day 1 — close-grip press, KB skull crusher, overhead extension. All three heads, including the long head overhead.' },
  { m: 'Lats & mid-back', s: 'ok', w: 'Day 2 — pull-up, bent-over row, pullover. Vertical + horizontal + a stretch movement.' },
  { m: 'Biceps', s: 'ok', w: 'Day 2 — incline curl, hammer curl.' },
  { m: 'Quads', s: 'ok', w: 'Day 3 — goblet squat, reverse lunge.' },
  { m: 'Front delts', s: 'ok', w: 'Day 3 overhead press, plus everything you press on Day 1. Never actually a problem.' },
  { m: 'Hamstrings', s: 'fix', w: '"Legs day" almost always means squats and lunges, which are quad-dominant. Added the Romanian deadlift as a headline lift in Day 3 Block B — the hinge is the hamstring builder.' },
  { m: 'Glutes', s: 'fix', w: 'Same story. The RDL, reverse lunge and KB swing in Day 3 cover it properly; squats alone don\'t.' },
  { m: 'Side delts', s: 'fix', w: 'Pressing barely trains them, and they\'re the head that actually makes shoulders look wide. Added lateral raises to Day 3 Block B.' },
  { m: 'Rear delts', s: 'fix', w: 'The most-skipped muscle in any push/pull/legs plan. Now in three places: warm-up band pull-aparts, Day 2\'s finisher flye, and Day 3\'s rear-delt flye.' },
  { m: 'Calves', s: 'fix', w: 'Completely absent from your split — squats and lunges do almost nothing for them. Day 3 gap block, 3 × 20 with a pause and a full stretch.' },
  { m: 'Core / abs', s: 'fix', w: 'No direct work anywhere in the original three days. Day 1 gap block (hollow hold, leg raise, twist) plus anti-rotation work on Day 3.' },
  { m: 'Forearms & grip', s: 'fix', w: 'Trained indirectly by every row and curl, but grip is usually what fails first and quietly caps your rows. Day 2 gap block — carries and wrist work.' },
  { m: 'Lower back / erectors', s: 'fix', w: 'Held isometrically in rows and RDLs, never trained directly. Day 2 gap block adds back extensions; the RDL does the rest.' },
  { m: 'Traps', s: 'ok', w: 'Covered well enough by rows, overhead pressing and farmer carries. No separate shrug work needed unless you want it.' },
  { m: 'Neck', s: 'note', w: 'Left out of the three days on purpose — it\'s niche. There\'s a 4-minute Neck & Grip add-on if you want it.' },
  { m: 'Cardio / conditioning', s: 'note', w: 'Not a muscle, but the biggest real gap in a 3-day lifting week. There\'s a 10-minute Conditioning add-on — twice a week on off days is plenty.' },
];

// --- weekly schedule ------------------------------------------------------
// Mon / Wed / Fri, so there's a rest day between every session.
const SCHEDULE = [
  { dy: 'Mon', k: 'push' }, { dy: 'Tue', k: null }, { dy: 'Wed', k: 'pull' },
  { dy: 'Thu', k: null }, { dy: 'Fri', k: 'legs' }, { dy: 'Sat', k: null }, { dy: 'Sun', k: null },
];

// ==========================================================================
// EXERCISE VISUALS
// ==========================================================================
/* Tiny stick-figure "how it looks" diagrams, drawn as inline SVG so there are
 * no image assets to load and both themes work for free (figure strokes use
 * currentColor; weights, bars and bands use the lab accent). Each visual is
 * 1–2 frames; two frames read start → finish with an arrow between them.
 *
 * Frame primitives (coords live in a 95×96 box, ground at y=84):
 *   ['h', x, y]            head (circle)
 *   ['p', x1,y1,x2,y2,…]   body/limb polyline
 *   ['e', x1,y1,…]         equipment line (bar, band, bench) — accent color
 *   ['d', x, y]            dumbbell     ['k', x, y]  kettlebell
 *   ['o', x, y, r]         accent circle outline (plate, motion hint)
 *   ['g', x1,y1,x2,y2]     ground / wall line (muted)
 *
 * Exercises are matched by NAME via VIS_MATCH (first hit wins), so the
 * diagram always shows the primary movement even when `alts` list swaps.
 * Add a new exercise to PLAN → add/reuse a VIS entry + a matcher here.
 */
const VG = ['g', 6, 84, 89, 84]; // the floor

const VIS = {
  // --- lying press family (side view, head at left) -----------------------
  floorpress: { cap: 'On the floor — upper arms stop at the ground, press straight up', f: [
    [VG, ['h', 16, 74], ['p', 23, 78, 52, 78], ['p', 52, 78, 63, 62, 74, 82], ['p', 28, 78, 40, 76, 40, 58], ['d', 40, 53]],
    [VG, ['h', 16, 74], ['p', 23, 78, 52, 78], ['p', 52, 78, 63, 62, 74, 82], ['p', 28, 78, 29, 50], ['d', 29, 45]],
  ] },
  closegrip: { cap: 'Bells squeezed together, elbows tucked to the ribs', f: [
    [VG, ['h', 16, 74], ['p', 23, 78, 52, 78], ['p', 52, 78, 63, 62, 74, 82], ['p', 28, 78, 39, 72, 39, 60], ['d', 36, 56], ['d', 42, 56]],
    [VG, ['h', 16, 74], ['p', 23, 78, 52, 78], ['p', 52, 78, 63, 62, 74, 82], ['p', 28, 78, 29, 50], ['d', 26, 45], ['d', 32, 45]],
  ] },
  inclinepress: { cap: 'Bench at 30–45° — press up and slightly back', f: [
    [VG, ['g', 24, 82, 60, 52], ['h', 64, 44], ['p', 60, 50, 42, 68], ['p', 42, 68, 33, 70, 31, 84], ['p', 58, 52, 68, 62, 72, 54], ['d', 74, 50]],
    [VG, ['g', 24, 82, 60, 52], ['h', 64, 44], ['p', 60, 50, 42, 68], ['p', 42, 68, 33, 70, 31, 84], ['p', 58, 52, 73, 37], ['d', 76, 33]],
  ] },
  skull: { cap: 'Elbows point up and stay frozen — only the forearm moves', f: [
    [VG, ['h', 16, 74], ['p', 23, 78, 52, 78], ['p', 52, 78, 63, 62, 74, 82], ['p', 30, 78, 32, 56, 19, 58], ['k', 15, 59]],
    [VG, ['h', 16, 74], ['p', 23, 78, 52, 78], ['p', 52, 78, 63, 62, 74, 82], ['p', 30, 78, 31, 50], ['k', 31, 44]],
  ] },
  chestflye: { cap: 'Soft elbows locked — "hug a barrel" from wide to together', f: [
    [VG, ['h', 16, 74], ['p', 23, 78, 52, 78], ['p', 52, 78, 63, 62, 74, 82], ['p', 29, 78, 13, 58], ['d', 11, 54], ['p', 29, 78, 45, 58], ['d', 47, 54]],
    [VG, ['h', 16, 74], ['p', 23, 78, 52, 78], ['p', 52, 78, 63, 62, 74, 82], ['p', 29, 78, 26, 50], ['d', 25, 45], ['p', 29, 78, 32, 50], ['d', 33, 45]],
  ] },
  pullover: { cap: 'Nearly-straight arms — deep stretch behind, then over the chest', f: [
    [VG, ['h', 18, 74], ['p', 25, 78, 52, 78], ['p', 52, 78, 63, 62, 74, 82], ['p', 28, 78, 9, 62], ['d', 7, 58]],
    [VG, ['h', 18, 74], ['p', 25, 78, 52, 78], ['p', 52, 78, 63, 62, 74, 82], ['p', 28, 78, 29, 50], ['d', 29, 45]],
  ] },
  legraise: { cap: 'Legs up, curl the pelvis — then lower slower than you lifted', f: [
    [VG, ['h', 16, 74], ['p', 23, 78, 50, 78], ['p', 30, 78, 44, 80], ['p', 50, 78, 52, 50]],
    [VG, ['h', 16, 74], ['p', 23, 78, 50, 78], ['p', 30, 78, 44, 80], ['p', 50, 78, 76, 64]],
  ] },
  hollow: { cap: 'Low back glued to the floor — hold the banana', f: [
    [VG, ['h', 18, 60], ['p', 25, 64, 50, 72], ['p', 50, 72, 78, 56], ['p', 25, 64, 8, 52]],
  ] },
  twist: { cap: 'Lean back, rotate rib cage side to side — the weight follows your chest', f: [
    [VG, ['h', 37, 38], ['p', 41, 44, 50, 66], ['p', 50, 66, 66, 56, 75, 66], ['p', 42, 48, 26, 56], ['d', 23, 58]],
    [VG, ['h', 37, 38], ['p', 41, 44, 50, 66], ['p', 50, 66, 66, 56, 75, 66], ['p', 42, 48, 59, 52], ['d', 62, 53]],
  ] },
  bridge: { cap: 'Heels close, drive the hips up — squeeze at the top', f: [
    [VG, ['h', 13, 76], ['p', 20, 80, 48, 80], ['p', 48, 80, 60, 64], ['p', 60, 64, 60, 84]],
    [VG, ['h', 13, 76], ['p', 20, 80, 52, 60], ['p', 52, 60, 62, 62], ['p', 62, 62, 62, 84]],
  ] },
  superman: { cap: 'Face down — squeeze the glutes to float arms and legs up', f: [
    [VG, ['h', 11, 76], ['p', 18, 80, 76, 80]],
    [VG, ['h', 11, 66], ['p', 19, 72, 46, 79, 72, 72], ['p', 22, 72, 8, 62], ['p', 70, 73, 84, 64]],
  ] },
  cobra: { cap: 'Hips stay down — press the chest up and forward', f: [
    [VG, ['h', 19, 50], ['p', 25, 56, 44, 72, 78, 80], ['p', 25, 58, 23, 82]],
  ] },
  windmill: { cap: 'Side-lying, knees stacked — only the top arm travels', f: [
    [VG, ['h', 12, 72], ['p', 19, 76, 50, 76], ['p', 50, 76, 62, 64, 72, 72], ['p', 23, 76, 25, 54]],
    [VG, ['h', 12, 72], ['p', 19, 76, 50, 76], ['p', 50, 76, 62, 64, 72, 72], ['p', 23, 76, 7, 62]],
  ] },

  // --- plank / push-up family ---------------------------------------------
  pushup: { cap: 'One straight line, ear to ankle — chest to the deck and back', f: [
    [VG, ['h', 18, 46], ['p', 25, 50, 56, 64, 78, 80], ['p', 25, 50, 28, 82]],
    [VG, ['h', 14, 62], ['p', 21, 66, 56, 76, 79, 82], ['p', 21, 66, 12, 74, 22, 82]],
  ] },
  planktap: { cap: 'Feet wide, hips quiet — hand to the opposite shoulder', f: [
    [VG, ['h', 18, 46], ['p', 25, 50, 56, 64, 78, 80], ['p', 25, 50, 28, 82]],
    [VG, ['h', 18, 46], ['p', 25, 50, 56, 64, 78, 80], ['p', 25, 50, 29, 82], ['p', 25, 50, 14, 44]],
  ] },
  sideplank: { cap: 'Hips stacked and lifted — push the floor away', f: [
    [VG, ['h', 17, 56], ['p', 24, 60, 78, 78], ['p', 27, 62, 27, 84], ['p', 26, 60, 31, 44]],
  ] },
  burpee: { cap: 'Chest to deck, then jump tall', f: [
    [VG, ['h', 14, 62], ['p', 21, 66, 56, 76, 79, 82], ['p', 21, 66, 12, 74, 22, 82]],
    [VG, ['h', 44, 16], ['p', 44, 22, 44, 46], ['p', 44, 26, 37, 7], ['p', 44, 26, 51, 7], ['p', 44, 46, 41, 58, 40, 70], ['p', 44, 46, 47, 58, 49, 70]],
  ] },

  // --- hanging / bar family -----------------------------------------------
  pullup: { cap: 'From a dead hang, pull the chest toward the bar', f: [
    [['e', 20, 8, 70, 8], ['h', 44, 26], ['p', 34, 8, 42, 31], ['p', 54, 8, 46, 31], ['p', 44, 32, 44, 56], ['p', 44, 56, 40, 68, 45, 76]],
    [['e', 20, 8, 70, 8], ['h', 44, 13], ['p', 34, 8, 31, 17, 40, 20], ['p', 54, 8, 57, 17, 48, 20], ['p', 44, 20, 44, 44], ['p', 44, 44, 40, 56, 45, 64]],
  ] },
  hang: { cap: 'Arms straight, just hang — let the shoulders decompress', f: [
    [['e', 20, 8, 70, 8], ['h', 44, 28], ['p', 34, 8, 42, 33], ['p', 54, 8, 46, 33], ['p', 44, 34, 44, 60], ['p', 44, 60, 42, 76], ['p', 44, 60, 47, 76]],
  ] },
  invrow: { cap: 'Body straight as a plank — row the chest up to the bar', f: [
    [VG, ['e', 16, 24, 60, 24], ['h', 21, 48], ['p', 27, 52, 56, 66, 79, 80], ['p', 30, 52, 40, 24]],
    [VG, ['e', 16, 24, 60, 24], ['h', 19, 34], ['p', 25, 38, 55, 62, 79, 80], ['p', 28, 38, 36, 24]],
  ] },

  // --- hinge family (side view, facing right) -----------------------------
  row: { cap: 'Flat back at ~45° — pull the bell to the belt line', f: [
    [VG, ['h', 65, 32], ['p', 59, 36, 42, 56], ['p', 42, 56, 44, 70, 42, 84], ['p', 42, 56, 48, 70, 48, 84], ['p', 57, 38, 59, 62], ['d', 59, 66]],
    [VG, ['h', 65, 32], ['p', 59, 36, 42, 56], ['p', 42, 56, 44, 70, 42, 84], ['p', 42, 56, 48, 70, 48, 84], ['p', 57, 38, 52, 50, 45, 56], ['d', 44, 60]],
  ] },
  reardelt: { cap: 'Hinge over, light bells — lead with the elbows out to the sides', f: [
    [VG, ['h', 65, 30], ['p', 59, 34, 42, 54], ['p', 42, 54, 44, 70, 42, 84], ['p', 42, 54, 48, 70, 48, 84], ['p', 57, 36, 57, 58], ['d', 57, 62]],
    [VG, ['h', 65, 30], ['p', 59, 34, 42, 54], ['p', 42, 54, 44, 70, 42, 84], ['p', 42, 54, 48, 70, 48, 84], ['p', 57, 36, 71, 46], ['d', 74, 48], ['p', 57, 36, 43, 44], ['d', 40, 46]],
  ] },
  rdl: { cap: 'Hips push BACK, back flat — bells slide down the thighs', f: [
    [VG, ['h', 45, 14], ['p', 45, 20, 45, 50], ['p', 45, 50, 42, 67, 41, 84], ['p', 45, 50, 49, 67, 50, 84], ['p', 45, 26, 45, 52], ['d', 45, 56]],
    [VG, ['h', 69, 36], ['p', 63, 40, 45, 54], ['p', 45, 54, 47, 69, 45, 84], ['p', 45, 54, 51, 69, 51, 84], ['p', 61, 42, 60, 64], ['d', 60, 68]],
  ] },
  kbswing: { cap: 'A hip snap, not an arm lift — the bell floats to chest height', f: [
    [VG, ['h', 64, 34], ['p', 58, 38, 42, 56], ['p', 42, 56, 45, 70, 43, 84], ['p', 42, 56, 49, 70, 49, 84], ['p', 56, 40, 35, 60], ['k', 31, 63]],
    [VG, ['h', 45, 14], ['p', 45, 20, 45, 50], ['p', 45, 50, 42, 67, 41, 84], ['p', 45, 50, 49, 67, 50, 84], ['p', 45, 28, 66, 26], ['k', 71, 25]],
  ] },

  // --- squat / lunge family ------------------------------------------------
  squat: { cap: 'Bell at the chest — sit down between the heels, chest tall', f: [
    [VG, ['h', 45, 14], ['p', 45, 20, 45, 50], ['p', 45, 50, 42, 67, 41, 84], ['p', 45, 50, 49, 67, 50, 84], ['p', 45, 26, 54, 32, 55, 24], ['k', 58, 21]],
    [VG, ['h', 52, 36], ['p', 52, 42, 42, 60], ['p', 42, 60, 57, 66, 51, 84], ['p', 42, 60, 55, 68, 47, 84], ['p', 51, 44, 61, 50, 62, 42], ['k', 65, 39]],
  ] },
  lunge: { cap: 'Step BACK — the back knee kisses the floor, front heel drives up', f: [
    [VG, ['h', 45, 14], ['p', 45, 20, 45, 50], ['p', 45, 50, 42, 67, 41, 84], ['p', 45, 50, 49, 67, 50, 84]],
    [VG, ['h', 41, 26], ['p', 41, 32, 41, 58], ['p', 41, 58, 45, 70, 45, 84], ['p', 41, 58, 57, 78, 70, 84]],
  ] },
  anklerock: { cap: 'Half-kneel — the knee travels over the toes, heel stays down', f: [
    [VG, ['h', 48, 32], ['p', 48, 38, 48, 60], ['p', 48, 60, 32, 64], ['p', 32, 64, 32, 84], ['p', 48, 60, 62, 82], ['p', 62, 82, 76, 84]],
    [VG, ['h', 43, 30], ['p', 43, 36, 46, 60], ['p', 46, 60, 25, 62], ['p', 25, 62, 31, 84], ['p', 46, 60, 62, 82], ['p', 62, 82, 76, 84]],
  ] },

  // --- standing lifts -------------------------------------------------------
  ohp: { cap: 'Glutes tight so the back can\'t arch — finish over the ears', f: [
    [VG, ['h', 45, 28], ['p', 45, 34, 45, 60], ['p', 45, 60, 42, 72, 41, 84], ['p', 45, 60, 48, 72, 49, 84], ['p', 45, 38, 54, 36], ['d', 57, 33]],
    [VG, ['h', 45, 28], ['p', 45, 34, 45, 60], ['p', 45, 60, 42, 72, 41, 84], ['p', 45, 60, 48, 72, 49, 84], ['p', 45, 38, 52, 24, 52, 10], ['d', 52, 6]],
  ] },
  ohext: { cap: 'Bell behind the head, elbows in — press to lockout overhead', f: [
    [VG, ['h', 45, 28], ['p', 45, 34, 45, 60], ['p', 45, 60, 42, 72, 41, 84], ['p', 45, 60, 48, 72, 49, 84], ['p', 45, 38, 54, 22, 40, 16], ['k', 35, 17]],
    [VG, ['h', 45, 28], ['p', 45, 34, 45, 60], ['p', 45, 60, 42, 72, 41, 84], ['p', 45, 60, 48, 72, 49, 84], ['p', 45, 38, 52, 24, 52, 12], ['k', 52, 7]],
  ] },
  curl: { cap: 'Elbow pinned at your side — curl up, no swing', f: [
    [VG, ['h', 45, 14], ['p', 45, 20, 45, 50], ['p', 45, 50, 42, 67, 41, 84], ['p', 45, 50, 49, 67, 50, 84], ['p', 45, 26, 47, 52], ['d', 47, 56]],
    [VG, ['h', 45, 14], ['p', 45, 20, 45, 50], ['p', 45, 50, 42, 67, 41, 84], ['p', 45, 50, 49, 67, 50, 84], ['p', 45, 26, 48, 42, 38, 32], ['d', 36, 29]],
  ] },
  latraise: { cap: 'Light — lead with the elbows, stop at shoulder height', f: [
    [VG, ['h', 47, 14], ['p', 47, 20, 47, 50], ['p', 47, 50, 41, 67, 39, 84], ['p', 47, 50, 53, 67, 55, 84], ['p', 47, 26, 44, 52], ['d', 44, 56], ['p', 47, 26, 50, 52], ['d', 50, 56]],
    [VG, ['h', 47, 14], ['p', 47, 20, 47, 50], ['p', 47, 50, 41, 67, 39, 84], ['p', 47, 50, 53, 67, 55, 84], ['p', 47, 26, 25, 29], ['d', 21, 29], ['p', 47, 26, 69, 29], ['d', 73, 29]],
  ] },
  carry: { cap: 'Heavy bells, walk tall and quiet — ribs down, shoulders back', f: [
    [VG, ['h', 46, 14], ['p', 46, 20, 46, 50], ['p', 46, 50, 38, 66, 34, 84], ['p', 46, 50, 54, 66, 58, 84], ['p', 46, 26, 43, 54], ['d', 43, 58], ['p', 46, 26, 50, 54], ['d', 50, 58]],
    [VG, ['h', 46, 14], ['p', 46, 20, 46, 50], ['p', 46, 50, 54, 66, 57, 84], ['p', 46, 50, 40, 66, 35, 84], ['p', 46, 26, 43, 54], ['d', 43, 58], ['p', 46, 26, 50, 54], ['d', 50, 58]],
  ] },
  calfraise: { cap: 'Pause tall on the toes — full stretch at the bottom, no bounce', f: [
    [VG, ['h', 46, 18], ['p', 46, 24, 46, 54], ['p', 46, 54, 44, 68, 44, 80], ['p', 44, 80, 54, 84], ['p', 46, 30, 44, 56], ['d', 44, 60]],
    [VG, ['h', 46, 12], ['p', 46, 18, 46, 48], ['p', 46, 48, 44, 62, 44, 74], ['p', 44, 74, 52, 84], ['p', 46, 24, 44, 50], ['d', 44, 54]],
  ] },
  pinch: { cap: 'Plate held flat between fingers and thumb — just don\'t let go', f: [
    [VG, ['h', 45, 14], ['p', 45, 20, 45, 50], ['p', 45, 50, 42, 67, 41, 84], ['p', 45, 50, 49, 67, 50, 84], ['p', 45, 26, 47, 54], ['o', 48, 61, 5]],
  ] },
  wristcurl: { cap: 'Forearm stays on the thigh — only the wrist moves, both directions', f: [
    [VG, ['h', 33, 22], ['p', 35, 28, 40, 52], ['p', 40, 52, 60, 54], ['p', 60, 54, 62, 84], ['p', 36, 32, 52, 46], ['p', 52, 46, 66, 48], ['p', 66, 48, 70, 55], ['d', 71, 58]],
    [VG, ['h', 33, 22], ['p', 35, 28, 40, 52], ['p', 40, 52, 60, 54], ['p', 60, 54, 62, 84], ['p', 36, 32, 52, 46], ['p', 52, 46, 66, 48], ['p', 66, 48, 71, 42], ['d', 72, 39]],
  ] },

  // --- bands / front-view moves --------------------------------------------
  pullapart: { cap: 'Arms straight — stretch the band across the chest', f: [
    [VG, ['h', 47, 14], ['p', 47, 20, 47, 50], ['p', 47, 50, 41, 67, 39, 84], ['p', 47, 50, 53, 67, 55, 84], ['e', 31, 29, 63, 29], ['p', 47, 26, 31, 29], ['p', 47, 26, 63, 29]],
    [VG, ['h', 47, 14], ['p', 47, 20, 47, 50], ['p', 47, 50, 41, 67, 39, 84], ['p', 47, 50, 53, 67, 55, 84], ['e', 14, 24, 80, 24], ['p', 47, 26, 14, 24], ['p', 47, 26, 80, 24]],
  ] },
  pallof: { cap: 'Band anchored to the side — press out and refuse to twist', f: [
    [VG, ['h', 47, 14], ['p', 47, 20, 47, 50], ['p', 47, 50, 41, 67, 39, 84], ['p', 47, 50, 53, 67, 55, 84], ['e', 4, 28, 41, 31], ['p', 47, 26, 41, 31]],
    [VG, ['h', 47, 14], ['p', 47, 20, 47, 50], ['p', 47, 50, 41, 67, 39, 84], ['p', 47, 50, 53, 67, 55, 84], ['e', 4, 28, 67, 31], ['p', 47, 26, 67, 31]],
  ] },
  armcircles: { cap: 'Big slow circles, both directions', f: [
    [VG, ['h', 47, 14], ['p', 47, 20, 47, 50], ['p', 47, 50, 41, 67, 39, 84], ['p', 47, 50, 53, 67, 55, 84], ['p', 47, 26, 21, 26], ['p', 47, 26, 73, 26], ['o', 17, 26, 8], ['o', 77, 26, 8]],
  ] },
  crossbody: { cap: 'Pull the arm across the chest — shoulder stays down', f: [
    [VG, ['h', 47, 14], ['p', 47, 20, 47, 50], ['p', 47, 50, 41, 67, 39, 84], ['p', 47, 50, 53, 67, 55, 84], ['p', 47, 26, 29, 33], ['p', 47, 26, 37, 29]],
  ] },

  // --- legs / feet ----------------------------------------------------------
  legswing: { cap: 'Hold something — swing the leg loose, front to back', f: [
    [VG, ['g', 78, 22, 78, 84], ['h', 46, 16], ['p', 46, 22, 46, 52], ['p', 46, 28, 76, 34], ['p', 46, 52, 46, 68, 45, 84], ['p', 46, 52, 68, 62]],
    [VG, ['g', 78, 22, 78, 84], ['h', 46, 16], ['p', 46, 22, 46, 52], ['p', 46, 28, 76, 34], ['p', 46, 52, 46, 68, 45, 84], ['p', 46, 52, 26, 64]],
  ] },
  tibialis: { cap: 'Back against a wall, heels down — pull the toes up', f: [
    [VG, ['g', 74, 24, 74, 84], ['h', 63, 26], ['p', 65, 32, 70, 54], ['p', 70, 54, 56, 72, 54, 84], ['p', 54, 84, 63, 81]],
    [VG, ['g', 74, 24, 74, 84], ['h', 63, 26], ['p', 65, 32, 70, 54], ['p', 70, 54, 56, 72, 54, 84], ['p', 54, 84, 61, 74]],
  ] },

  // --- floor mobility -------------------------------------------------------
  catcow: { cap: 'On all fours — round the back up, then let it dip. Slow, with breath', f: [
    [VG, ['h', 22, 62], ['p', 28, 64, 30, 84], ['p', 28, 64, 48, 53, 66, 61], ['p', 66, 61, 68, 84]],
    [VG, ['h', 20, 52], ['p', 27, 57, 30, 84], ['p', 27, 57, 48, 68, 66, 58], ['p', 66, 58, 68, 84]],
  ] },
  ninety: { cap: 'Both knees at 90° on the floor — sit tall, then switch sides', f: [
    [VG, ['h', 42, 32], ['p', 42, 38, 42, 66], ['p', 42, 66, 62, 70], ['p', 62, 70, 56, 82], ['p', 42, 66, 26, 70], ['p', 26, 70, 32, 82]],
  ] },
  worlds: { cap: 'Deep lunge, hand inside the foot — then rotate and reach up', f: [
    [VG, ['h', 44, 26], ['p', 44, 32, 42, 56], ['p', 42, 56, 28, 60, 28, 84], ['p', 42, 56, 64, 72, 80, 84], ['p', 44, 36, 24, 80], ['p', 44, 36, 56, 14]],
  ] },
  childs: { cap: 'Sit back toward the heels — arms long, forehead down', f: [
    [VG, ['h', 17, 72], ['p', 24, 74, 54, 66], ['p', 54, 66, 60, 82], ['p', 58, 83, 74, 84], ['p', 24, 76, 8, 80]],
  ] },
  couch: { cap: 'Back foot up the wall, torso tall — squeeze that glute', f: [
    [VG, ['g', 80, 34, 80, 84], ['h', 46, 26], ['p', 46, 32, 48, 58], ['p', 48, 58, 30, 62], ['p', 30, 62, 28, 84], ['p', 48, 58, 62, 82], ['p', 62, 82, 78, 64]],
  ] },

  // --- stretches ------------------------------------------------------------
  doorway: { cap: 'Forearm on the frame — lean gently through the doorway', f: [
    [VG, ['g', 60, 14, 60, 84], ['h', 42, 18], ['p', 42, 24, 40, 52], ['p', 42, 28, 58, 22], ['p', 40, 52, 46, 68, 44, 84], ['p', 40, 52, 36, 68, 34, 84]],
  ] },
  tristretch: { cap: 'Elbow up by the ear, hand down the spine — other hand assists', f: [
    [VG, ['h', 44, 22], ['p', 44, 28, 44, 56], ['p', 44, 56, 41, 70, 40, 84], ['p', 44, 56, 47, 70, 48, 84], ['p', 44, 32, 52, 12, 40, 8], ['p', 44, 32, 53, 16]],
  ] },
  quadstretch: { cap: 'Knees together — pull the heel to your seat', f: [
    [VG, ['h', 44, 14], ['p', 44, 20, 44, 50], ['p', 44, 50, 44, 68, 43, 84], ['p', 44, 50, 50, 66, 44, 55], ['p', 44, 26, 47, 53]],
  ] },
  hamstretch: { cap: 'Hinge and hang toward the toes — soft knees are fine', f: [
    [VG, ['p', 42, 50, 42, 84], ['p', 42, 50, 47, 84], ['p', 42, 50, 62, 60], ['h', 67, 64], ['p', 54, 56, 50, 78]],
  ] },
  calfstretch: { cap: 'Hands on the wall, back leg straight — press that heel down', f: [
    [VG, ['g', 24, 20, 24, 84], ['h', 38, 20], ['p', 38, 26, 44, 52], ['p', 38, 30, 26, 34], ['p', 44, 52, 38, 68, 36, 84], ['p', 44, 52, 58, 70, 64, 84]],
  ] },
  neck: { cap: 'Palm against the head, push into it — nothing actually moves', f: [
    [VG, ['h', 44, 26], ['p', 44, 33, 44, 60], ['p', 44, 60, 41, 72, 40, 84], ['p', 44, 60, 47, 72, 48, 84], ['p', 44, 40, 58, 34, 51, 24]],
  ] },
};

// Ordered name → visual matching. First hit wins, so the specific patterns
// (rear-delt before flye, inverted row before row, wrist curl before curl…)
// must stay above the generic ones.
const VIS_MATCH = [
  [/scap|dead hang|towel hang|lat stretch/, 'hang'],
  [/leg swing/, 'legswing'],
  [/swing/, 'kbswing'],
  [/arm circle/, 'armcircles'],
  [/pull-apart/, 'pullapart'],
  [/floor press|light db press|bench press/, 'floorpress'],
  [/close-grip/, 'closegrip'],
  [/incline db press/, 'inclinepress'],
  [/skull/, 'skull'],
  [/rear-delt|y-raise|face pull/, 'reardelt'],
  [/flye|crossover/, 'chestflye'],
  [/overhead .*extension|triceps extension/, 'ohext'],
  [/triceps stretch/, 'tristretch'],
  [/shoulder tap/, 'planktap'],
  [/push-up/, 'pushup'],
  [/hollow|dead bug/, 'hollow'],
  [/leg raise|reverse crunch|knee tuck/, 'legraise'],
  [/twist/, 'twist'],
  [/pull-up|chin-up|pulldown/, 'pullup'],
  [/inverted row/, 'invrow'],
  [/row/, 'row'],
  [/pullover/, 'pullover'],
  [/wrist curl/, 'wristcurl'],
  [/curl/, 'curl'],
  [/pinch/, 'pinch'],
  [/carry|kb hold|db hold/, 'carry'],
  [/superman|back extension|bird dog/, 'superman'],
  [/goblet|bodyweight squat|front squat|deep squat/, 'squat'],
  [/overhead press|db press|kb press/, 'ohp'],
  [/romanian|rdl|good morning/, 'rdl'],
  [/lateral raise/, 'latraise'],
  [/lunge|split squat|step-up/, 'lunge'],
  [/glute bridge|hip thrust/, 'bridge'],
  [/calf raise/, 'calfraise'],
  [/calf stretch/, 'calfstretch'],
  [/pallof/, 'pallof'],
  [/side plank/, 'sideplank'],
  [/tibialis|heel walk/, 'tibialis'],
  [/burpee|mountain climber/, 'burpee'],
  [/ankle rock/, 'anklerock'],
  [/cat-cow/, 'catcow'],
  [/90\/90/, 'ninety'],
  [/world/, 'worlds'],
  [/windmill|thoracic/, 'windmill'],
  [/couch stretch/, 'couch'],
  [/quad stretch/, 'quadstretch'],
  [/hamstring stretch/, 'hamstretch'],
  [/cross-body/, 'crossbody'],
  [/doorway|wall biceps/, 'doorway'],
  [/child/, 'childs'],
  [/cobra/, 'cobra'],
  [/neck/, 'neck'],
  [/squat/, 'squat'],
];

function visFor(name) {
  if (prefs().vis === false) return null;
  const n = String(name || '').toLowerCase();
  for (const [re, k] of VIS_MATCH) if (re.test(n)) return VIS[k];
  return null;
}

function visPrim(p) {
  const pts = (a) => { const o = []; for (let i = 0; i < a.length; i += 2) o.push(a[i] + ',' + a[i + 1]); return o.join(' '); };
  switch (p[0]) {
    case 'h': return `<circle cx="${p[1]}" cy="${p[2]}" r="6" class="vh"/>`;
    case 'p': return `<polyline points="${pts(p.slice(1))}" class="vp"/>`;
    case 'e': return `<polyline points="${pts(p.slice(1))}" class="veq"/>`;
    case 'g': return `<line x1="${p[1]}" y1="${p[2]}" x2="${p[3]}" y2="${p[4]}" class="vgr"/>`;
    case 'd': return `<circle cx="${p[1]}" cy="${p[2]}" r="4" class="vwt"/>`;
    case 'k': return `<circle cx="${p[1]}" cy="${p[2]}" r="4.5" class="vwt"/><path d="M ${p[1] - 3} ${p[2] - 3} a 4 4 0 0 1 6 0" class="veq"/>`;
    case 'o': return `<circle cx="${p[1]}" cy="${p[2]}" r="${p[3]}" class="veq"/>`;
  }
  return '';
}

function visSVG(v) {
  const frame = (f, tx) => `<g transform="translate(${tx},0)">${f.map(visPrim).join('')}</g>`;
  const two = v.f.length > 1;
  const arrow = '<g class="va"><line x1="98" y1="46" x2="109" y2="46"/><polyline points="104,41 110,46 104,51"/></g>';
  return `<div class="wk-vis"><svg viewBox="0 0 214 96" role="img" aria-label="Movement diagram">${
    two ? frame(v.f[0], 4) + arrow + frame(v.f[1], 115) : frame(v.f[0], 60)
  }</svg>${v.cap ? `<div class="wk-vis-cap">${esc(v.cap)}</div>` : ''}</div>`;
}

// ==========================================================================
// SCREENS
// ==========================================================================
const SCREENS = ['home', 'plan', 'session', 'coverage', 'history', 'summary'];
function show(name) {
  SCREENS.forEach((s) => { const n = $('#' + s); if (n) n.hidden = s !== name; });
  window.scrollTo({ top: 0, behavior: 'auto' });
}

// --- shared renderers -----------------------------------------------------
function exId(dayKey, blockId, i) { return `${dayKey}.${blockId}${i + 1}`.toLowerCase(); }

function cueHTML(ex) {
  if (!ex.cue && !(ex.alts && ex.alts.length)) return '';
  return `<details>
    <summary>Form &amp; swaps</summary>
    <div class="wk-cue">
      ${ex.cue ? esc(ex.cue) : 'No extra notes — just control the weight.'}
      ${ex.alts && ex.alts.length ? `<span class="sw">↔ Swap for: ${ex.alts.map(esc).join(' · ')}</span>` : ''}
    </div>
  </details>`;
}

/** One exercise row. `live` adds the set chips + weight field used in a session. */
function exHTML(ex, id, block, live) {
  const p = prefs();
  const last = readJSON(K_LAST, {})[id];
  const vis = visFor(ex.n);
  return `<div class="wk-ex" data-ex="${esc(id)}">
    <div class="wk-ex-top">
      <div class="wk-ex-n">${esc(ex.n)}</div>
      <div class="wk-ex-r">${esc(ex.reps)}</div>
    </div>
    ${vis ? visSVG(vis) : ''}
    ${live ? `
      <div class="wk-sets">
        ${Array.from({ length: block.rounds || 1 }, (_, r) =>
          `<button class="wk-set" type="button" data-set="${r}">Set ${r + 1}</button>`).join('')}
        ${ex.load ? `<label class="wk-load"><input type="number" inputmode="decimal" step="any" min="0" data-w placeholder="${last ? esc(String(last.w)) : '–'}" aria-label="Weight for ${esc(ex.n)}"><span>${esc(p.unit)}</span></label>` : ''}
      </div>
      ${ex.load && last ? `<div class="wk-last">Last time: <b>${esc(String(last.w))} ${esc(p.unit)}</b> · ${esc(shortDate(last.d))}</div>` : ''}
    ` : ''}
    ${cueHTML(ex)}
  </div>`;
}

function blockHTML(day, block, live) {
  const rest = block.rest ? `${block.rest}s rest` : 'minimal rest';
  return `<div class="wk-blk ${block.gap ? 'gap' : ''}">
    <div class="wk-blk-h">
      <span class="wk-blk-tag">${block.gap ? 'Gap fix' : 'Block ' + esc(block.id)}</span>
      <h3>${esc(block.name.replace(/^Gap fix — /, ''))}</h3>
      <div class="wk-blk-meta">${esc(block.style)} · ${block.rounds} round${block.rounds === 1 ? '' : 's'} · ${esc(rest)} · ~${block.mins} min</div>
    </div>
    ${block.why ? `<div class="wk-blk-why"><strong>Why this is here:</strong> ${esc(block.why)}</div>` : ''}
    ${block.note ? `<p class="wk-blk-note">${esc(block.note)}</p>` : ''}
    ${block.ex.map((ex, i) => exHTML(ex, exId(day.k, block.id, i), block, live)).join('')}
  </div>`;
}

function listHTML(items) {
  if (!items || !items.length) return '';
  return `<div class="wk-blk">${items.map((x) => {
    const vis = visFor(x.n);
    return `
    <div class="wk-ex">
      <div class="wk-ex-top"><div class="wk-ex-n">${esc(x.n)}</div><div class="wk-ex-r">${esc(x.reps)}</div></div>
      ${x.cue ? `<div class="wk-ex-alt">${esc(x.cue)}</div>` : ''}
      ${vis ? `<details><summary>👁 Show me</summary>${visSVG(vis)}</details>` : ''}
    </div>`;
  }).join('')}</div>`;
}

// ==========================================================================
// HOME
// ==========================================================================
function weekStart() { // Monday of the current week, local
  const d = new Date(); d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Which day to do next: the one in the rotation after the most recent log. */
function nextUp() {
  const log = readJSON(K_LOG, []).filter((e) => DAY_KEYS.includes(e.key));
  if (!log.length) return 'push';
  const last = log[log.length - 1];
  // Same day already done today? Point at the next one anyway.
  const i = DAY_KEYS.indexOf(last.key);
  return DAY_KEYS[(i + 1) % DAY_KEYS.length];
}

function stats() {
  const log = readJSON(K_LOG, []);
  const ws = weekStart();
  const thisWeek = log.filter((e) => e.d >= ws && DAY_KEYS.includes(e.key)).length;
  // Training TIME this week — every finished session counts, add-ons included.
  const weekMin = Math.round(log.filter((e) => e.d >= ws).reduce((a, e) => a + (e.dur || 0), 0) / 60);
  const last = log.length ? log[log.length - 1] : null;
  // Streak = consecutive prior weeks (including this one, once it has 3) with
  // all three sessions logged. A partial current week doesn't break it.
  let streak = 0;
  for (let w = 0; w < 52; w++) {
    const d = new Date(); d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - w * 7);
    const s = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const e = new Date(d); e.setDate(e.getDate() + 7);
    const es = `${e.getFullYear()}-${pad2(e.getMonth() + 1)}-${pad2(e.getDate())}`;
    const n = log.filter((x) => x.d >= s && x.d < es && DAY_KEYS.includes(x.key)).length;
    if (n >= 3) streak++;
    else if (w > 0) break; // an incomplete current week is allowed
  }
  return { total: log.length, thisWeek, weekMin, streak, last };
}

function showHome() {
  const st = stats();
  const nk = nextUp();
  const next = PLAN[nk];
  const log = readJSON(K_LOG, []);
  const doneThisWeek = new Set(log.filter((e) => e.d >= weekStart()).map((e) => e.key));

  $('#home').innerHTML = `
    <div class="wk-stats">
      <div class="wk-stat"><b>${st.thisWeek}<span style="font-size:13px;color:var(--muted)">/3</span></b><span>This week</span></div>
      <div class="wk-stat"><b>${st.weekMin}<span style="font-size:13px;color:var(--muted)">m</span></b><span>Time this wk</span></div>
      <div class="wk-stat"><b>${st.total}</b><span>Sessions</span></div>
      <div class="wk-stat"><b>${st.streak}</b><span>Wk streak</span></div>
      <div class="wk-stat"><b>${st.last ? (daysAgo(st.last.d) === 0 ? 'Today' : daysAgo(st.last.d) + 'd') : '–'}</b><span>Last lift</span></div>
    </div>

    <div class="wk-next">
      <div class="kick">Next up</div>
      <h2>${esc(next.emoji)} ${esc(next.n)}</h2>
      <div class="sub">${esc(next.sub)} · ~${next.mins} min · ${next.blocks.length} blocks${st.last ? ` · last session was ${daysAgo(st.last.d) === 0 ? 'today' : daysAgo(st.last.d) === 1 ? 'yesterday' : daysAgo(st.last.d) + ' days ago'}` : ''}</div>
      <div class="row">
        <button class="ds-btn primary" data-start="${nk}">▶︎ Start session</button>
        <button class="ds-btn" data-plan="${nk}">View the plan</button>
      </div>
    </div>

    <h3 class="ds-h sec">The 3-day split</h3>
    <div class="wk-days">
      ${DAY_KEYS.map((k) => {
        const d = PLAN[k];
        return `<button class="wk-day" type="button" data-plan="${k}" style="--dc:${d.color}">
          <span class="em">${esc(d.emoji)}</span>
          <span class="body">
            <span class="t">${esc(d.n)}${doneThisWeek.has(k) ? '<span class="tag done">✓ done</span>' : ''}</span>
            <span class="d">${esc(d.sub)} · ~${d.mins} min · ${esc(d.focus.join(' · '))}</span>
          </span>
          <span class="go">›</span>
        </button>`;
      }).join('')}
    </div>

    <h3 class="ds-h sec">Suggested week</h3>
    <div class="wk-card">
      <p>One rest day between every session — that\'s the whole reason for Mon / Wed / Fri. Hitting each muscle once a week is the low end for growth, so make the sessions count: if you finish a block feeling like you could do another two rounds, the weight was too light.</p>
      <div class="wk-sched">
        ${SCHEDULE.map((s) => `<div><div class="dy">${esc(s.dy)}</div><div class="wt">${s.k ? esc(PLAN[s.k].emoji) : '·'}</div></div>`).join('')}
      </div>
    </div>

    <h3 class="ds-h sec">Add-ons — the stuff 3 days misses</h3>
    <div class="wk-days">
      ${ADDON_KEYS.map((k) => {
        const a = ADDONS[k];
        return `<button class="wk-day" type="button" data-plan="${k}" style="--dc:${a.color}">
          <span class="em">${esc(a.emoji)}</span>
          <span class="body">
            <span class="t">${esc(a.n)}</span>
            <span class="d">${esc(a.sub)} · ${esc(a.focus.join(' · '))}</span>
          </span>
          <span class="go">›</span>
        </button>`;
      }).join('')}
    </div>

    <h3 class="ds-h sec">Reference</h3>
    <div class="wk-chips">
      <button class="wk-chip" type="button" data-go="coverage">🗺️ Muscle coverage map</button>
      <button class="wk-chip" type="button" data-go="history">📈 History, time &amp; loads</button>
      <button class="wk-chip" type="button" id="unit-toggle">⚖️ Units: ${esc(prefs().unit)}</button>
      <button class="wk-chip" type="button" id="vis-toggle">👁 Exercise visuals: ${prefs().vis === false ? 'off' : 'on'}</button>
    </div>

    <p class="ds-note">
      Load guidance, for every block: pick a weight where the last two reps are genuinely hard but your form still holds.
      If you cruise past the top of the rep range, go heavier next round — that\'s the whole progression model, and the
      app remembers what you used last time so you can see it happening.
      <br><br>
      Everything is saved on this device only. Not medical advice — if something hurts in a joint rather than a muscle, stop.
    </p>`;

  $$('#home [data-plan]').forEach((b) => { b.onclick = () => showPlan(b.dataset.plan); });
  $$('#home [data-start]').forEach((b) => { b.onclick = () => startSession(b.dataset.start); });
  $$('#home [data-go]').forEach((b) => { b.onclick = () => (b.dataset.go === 'coverage' ? showCoverage() : showHistory()); });
  const ut = $('#unit-toggle');
  if (ut) ut.onclick = () => { setPref('unit', prefs().unit === 'lb' ? 'kg' : 'lb'); showHome(); };
  const vt = $('#vis-toggle');
  if (vt) vt.onclick = () => { setPref('vis', prefs().vis === false); showHome(); };
  show('home');
}

// ==========================================================================
// PLAN VIEW (read-only)
// ==========================================================================
function showPlan(key) {
  const d = getPlan(key);
  if (!d) return showHome();
  $('#plan').innerHTML = `
    <button class="ds-btn small ghost" id="p-back">‹ Back</button>
    <div class="wk-next" style="margin-top:12px">
      <div class="kick">${esc(d.sub)}</div>
      <h2>${esc(d.emoji)} ${esc(d.n)}</h2>
      <div class="sub">~${d.mins} min · ${esc(d.focus.join(' · '))}</div>
      <div class="row"><button class="ds-btn primary wide" id="p-start">▶︎ Start session</button></div>
    </div>
    ${d.intro ? `<p class="ds-note" style="margin-bottom:4px">${esc(d.intro)}</p>` : ''}

    ${d.warmup && d.warmup.length ? `<h3 class="ds-h sec">Warm-up</h3>${listHTML(d.warmup)}` : ''}

    <h3 class="ds-h sec">The work</h3>
    ${d.blocks.map((b) => blockHTML(d, b, false)).join('')}

    ${d.cooldown && d.cooldown.length ? `<h3 class="ds-h sec">Cooldown</h3>${listHTML(d.cooldown)}` : ''}
    ${d.alt ? `<p class="ds-note">${esc(d.alt)}</p>` : ''}

    <div class="wk-nav"><button class="ds-btn primary" id="p-start2">▶︎ Start session</button></div>`;

  $('#p-back').onclick = showHome;
  $('#p-start').onclick = $('#p-start2').onclick = () => startSession(key);
  show('plan');
}

// ==========================================================================
// SESSION
// ==========================================================================
/* One block per screen. Tap a set chip to log it (which auto-starts the rest
 * timer), type the weight you used, then move to the next block. Nothing is
 * written to storage until the session is finished. */
let SES = null;
let TICK = null;

function startSession(key) {
  const day = getPlan(key);
  if (!day) return showHome();
  SES = {
    key, day, start: Date.now(), bi: 0,
    done: {},           // exerciseId -> [bool per set]
    weight: {},         // exerciseId -> number
    restEnd: 0, restLen: 0,
  };
  day.blocks.forEach((b) => b.ex.forEach((ex, i) => { SES.done[exId(key, b.id, i)] = new Array(b.rounds || 1).fill(false); }));
  if (TICK) clearInterval(TICK);
  TICK = setInterval(tickSession, 1000);
  renderSession();
}

function endSession(save) {
  if (TICK) { clearInterval(TICK); TICK = null; }
  const s = SES; SES = null;
  if (!save || !s) { showHome(); return; }
  saveSession(s);
}

function setsDone(s) {
  return Object.values(s.done).reduce((a, arr) => a + arr.filter(Boolean).length, 0);
}
function setsTotal(s) {
  return Object.values(s.done).reduce((a, arr) => a + arr.length, 0);
}

/** Rough tonnage: weight × sets completed × the midpoint of the rep range. */
function volume(s) {
  let v = 0;
  s.day.blocks.forEach((b) => b.ex.forEach((ex, i) => {
    const id = exId(s.key, b.id, i);
    const w = s.weight[id];
    if (!w || !ex.load) return;
    const nums = String(ex.reps).match(/\d+/g);
    if (!nums) return;
    const reps = nums.length > 1 ? (Number(nums[0]) + Number(nums[1])) / 2 : Number(nums[0]);
    v += w * reps * (s.done[id] || []).filter(Boolean).length;
  }));
  return Math.round(v);
}

function blockDone(s, b) {
  return b.ex.every((ex, i) => (s.done[exId(s.key, b.id, i)] || []).every(Boolean));
}

function renderSession() {
  const s = SES;
  if (!s) return;
  const b = s.day.blocks[s.bi];
  const p = prefs();
  const first = s.bi === 0;
  const last = s.bi === s.day.blocks.length - 1;

  $('#session').innerHTML = `
    <div class="wk-bar">
      <div class="wk-bar-row">
        <div class="wk-clock" id="s-clock">0:00</div>
        <div class="wk-bar-mid">
          <div class="b">${esc(s.day.emoji)} ${esc(s.day.n)} — ${b.gap ? 'Gap fix' : 'Block ' + esc(b.id)}</div>
          <div class="s" id="s-sub">${setsDone(s)} / ${setsTotal(s)} sets · ~${s.day.mins} min planned</div>
        </div>
        <button class="ds-btn small ghost" id="s-quit">Finish</button>
      </div>
      <div class="wk-rest" id="s-rest" hidden>
        <div class="wk-rest-top"><span>Rest</span><span id="s-restn">0:00</span></div>
        <div class="wk-rest-track"><div class="wk-rest-fill" id="s-restfill" style="width:100%"></div></div>
      </div>
    </div>

    <div class="wk-dots">
      ${s.day.blocks.map((x, i) => `<span class="wk-dot ${i === s.bi ? 'on' : blockDone(s, x) ? 'done' : ''}"></span>`).join('')}
    </div>

    ${first && s.day.warmup && s.day.warmup.length ? `
      <details class="wk-warm">
        <summary>Warm-up · ${s.day.warmup.length} moves — do this first</summary>
        ${listHTML(s.day.warmup)}
      </details>` : ''}

    ${blockHTML(s.day, b, true)}

    <div class="wk-nav">
      ${b.rest ? `<button class="ds-btn" id="s-rest-btn">⏱ Rest ${b.rest}s</button>` : ''}
      <button class="ds-btn" id="s-prev" ${first ? 'disabled' : ''}>‹ Prev</button>
      <button class="ds-btn primary" id="s-next">${last ? 'Finish ✓' : 'Next block ›'}</button>
    </div>

    ${last && s.day.cooldown && s.day.cooldown.length ? `
      <h3 class="ds-h sec">Cooldown — before you close this</h3>${listHTML(s.day.cooldown)}` : ''}

    <p class="ds-note">Tap each set as you finish it${p.autoRest && b.rest ? ' — the rest timer starts on its own' : ''}. Weights are saved when you finish the session, and show up as "last time" next week.</p>`;

  // set chips
  $$('#session .wk-set').forEach((btn) => {
    const id = btn.closest('.wk-ex').dataset.ex;
    const idx = Number(btn.dataset.set);
    if (s.done[id] && s.done[id][idx]) btn.classList.add('on');
    btn.onclick = () => {
      const now = !s.done[id][idx];
      s.done[id][idx] = now;
      btn.classList.toggle('on', now);
      const sub = $('#s-sub');
      if (sub) sub.textContent = `${setsDone(s)} / ${setsTotal(s)} sets · ~${s.day.mins} min planned`;
      if (now && prefs().autoRest && b.rest) startRest(b.rest);
      $$('#session .wk-dot').forEach((d, i) => {
        d.classList.toggle('done', i !== s.bi && blockDone(s, s.day.blocks[i]));
      });
    };
  });

  // weight fields
  $$('#session [data-w]').forEach((inp) => {
    const id = inp.closest('.wk-ex').dataset.ex;
    if (s.weight[id] != null) inp.value = s.weight[id];
    inp.oninput = () => {
      const v = parseFloat(inp.value);
      if (isFinite(v) && v >= 0) s.weight[id] = v; else delete s.weight[id];
    };
  });

  $('#s-quit').onclick = () => {
    if (setsDone(s) === 0) { if (confirm('Leave without logging anything?')) endSession(false); return; }
    endSession(true);
  };
  $('#s-prev').onclick = () => { if (s.bi > 0) { s.bi--; renderSession(); } };
  $('#s-next').onclick = () => {
    if (s.bi < s.day.blocks.length - 1) { s.bi++; renderSession(); }
    else endSession(true);
  };
  const rb = $('#s-rest-btn');
  if (rb) rb.onclick = () => startRest(b.rest);

  tickSession();
  show('session');
}

function startRest(sec) {
  if (!SES) return;
  SES.restLen = sec;
  SES.restEnd = Date.now() + sec * 1000;
  tickSession();
}

function tickSession() {
  const s = SES;
  if (!s) return;
  const c = $('#s-clock');
  if (c) c.textContent = fmtClock((Date.now() - s.start) / 1000);

  const box = $('#s-rest');
  if (!box) return;
  if (!s.restEnd) { box.hidden = true; return; }
  const left = (s.restEnd - Date.now()) / 1000;
  if (left <= 0) {
    box.hidden = true;
    s.restEnd = 0;
    beep();
    return;
  }
  box.hidden = false;
  $('#s-restn').textContent = fmtClock(left);
  $('#s-restfill').style.width = `${clamp((left / s.restLen) * 100, 0, 100)}%`;
}

/** Short tone at the end of a rest period. WebAudio only — no asset to load,
 *  and it stays silent if the browser blocks it or the pref is off. */
function beep() {
  try { if (navigator.vibrate) navigator.vibrate(180); } catch (e) {}
  if (!prefs().sound) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.42);
    setTimeout(() => { try { ctx.close(); } catch (e) {} }, 700);
  } catch (e) {}
}

// ==========================================================================
// SAVE + SUMMARY
// ==========================================================================
function saveSession(s) {
  const p = prefs();
  const dur = Math.round((Date.now() - s.start) / 1000);
  const entry = { d: todayStr(), key: s.key, dur, sets: setsDone(s), vol: volume(s), unit: p.unit };

  const log = readJSON(K_LOG, []);
  log.push(entry);
  writeJSON(K_LOG, log.slice(-200));

  // Remember each load so next week's session can show "last time: 45 lb".
  const last = readJSON(K_LAST, {});
  Object.keys(s.weight).forEach((id) => { last[id] = { w: s.weight[id], d: entry.d }; });
  writeJSON(K_LAST, last);

  showSummary(s, entry);
}

function showSummary(s, entry) {
  const pct = setsTotal(s) ? Math.round((entry.sets / setsTotal(s)) * 100) : 0;
  const grade = pct >= 100 ? '🏆 Every set logged' : pct >= 80 ? '💪 Solid session' : pct >= 50 ? '👍 Got the work in' : '✅ Something beats nothing';
  const nk = nextUp();
  // The day's total training time — this session is already in the log, and a
  // second session (an add-on, say) stacks onto the same day.
  const todays = readJSON(K_LOG, []).filter((e) => e.d === entry.d);
  const todayMin = Math.max(1, Math.round(todays.reduce((a, e) => a + (e.dur || 0), 0) / 60));

  $('#summary').innerHTML = `
    <div class="wk-res">
      <div class="g">${grade}</div>
      <div class="n">${fmtClock(entry.dur)}<span>elapsed</span></div>
      <div class="l">${entry.sets} of ${setsTotal(s)} sets · ${esc(s.day.n)}${entry.vol ? ` · ${entry.vol.toLocaleString()} ${esc(entry.unit)} moved` : ''}</div>
      <div class="l" style="margin-top:6px;font-weight:800;color:var(--text)">⏱ ${todayMin} min trained today${todays.length > 1 ? ` across ${todays.length} sessions` : ''} — saved to your history</div>
      <div class="row">
        <button class="ds-btn primary" id="sm-home">Done</button>
        <button class="ds-btn" id="sm-hist">See history</button>
      </div>
    </div>

    ${Object.keys(s.weight).length ? `
      <h3 class="ds-h sec">Loads logged</h3>
      <div class="wk-blk">
        ${s.day.blocks.flatMap((b) => b.ex.map((ex, i) => {
          const id = exId(s.key, b.id, i);
          if (s.weight[id] == null) return '';
          return `<div class="wk-ex"><div class="wk-ex-top">
            <div class="wk-ex-n">${esc(ex.n)}</div>
            <div class="wk-ex-r">${s.weight[id]} ${esc(entry.unit)}</div>
          </div></div>`;
        })).join('')}
      </div>
      <p class="ds-note">These show up as "last time" when this session comes around again. Beat one of them next week — an extra rep or 5 more pounds is a real week.</p>` : ''}

    <h3 class="ds-h sec">Next up</h3>
    <div class="wk-days">
      <button class="wk-day" type="button" id="sm-next" style="--dc:${PLAN[nk].color}">
        <span class="em">${esc(PLAN[nk].emoji)}</span>
        <span class="body"><span class="t">${esc(PLAN[nk].n)}</span><span class="d">${esc(PLAN[nk].sub)} · take a rest day first</span></span>
        <span class="go">›</span>
      </button>
    </div>`;

  $('#sm-home').onclick = showHome;
  $('#sm-hist').onclick = showHistory;
  $('#sm-next').onclick = () => showPlan(nk);
  show('summary');
}

// ==========================================================================
// COVERAGE MAP
// ==========================================================================
function showCoverage() {
  const colors = { ok: 'var(--wk-ok)', fix: 'var(--wk-warn)', note: 'var(--muted)' };
  const labels = { ok: 'Covered', fix: 'Was missing', note: 'Optional' };
  const nFix = COVERAGE.filter((c) => c.s === 'fix').length;

  $('#coverage').innerHTML = `
    <button class="ds-btn small ghost" id="c-back">‹ Back</button>
    <h3 class="ds-h sec" style="margin-top:16px">Muscle coverage map</h3>
    <div class="wk-card" style="margin-bottom:14px">
      <p>Chest &amp; tris / back &amp; bis / legs &amp; shoulders is a sound split — it covers the big movement patterns and every major muscle group you\'d name off the top of your head. But it leaves <strong>${nFix} things</strong> either uncovered or thin, and they\'re the ones that quietly become the limiting factor.</p>
      <p>Rather than adding a fourth day, each of those got folded into the day it belongs on — as a short <strong>gap-fix block</strong> at the end, marked in gold. Three sessions, still 30-something minutes each.</p>
    </div>
    <div class="wk-cov">
      ${COVERAGE.map((c) => `<div class="wk-cov-row" style="--sc:${colors[c.s]}">
        <div class="wk-cov-m">${esc(c.m)}</div>
        <div class="wk-cov-s">${esc(labels[c.s])}</div>
        <div class="wk-cov-w">${esc(c.w)}</div>
      </div>`).join('')}
    </div>
    <p class="ds-note">
      One more thing that isn\'t a muscle: <strong>frequency</strong>. Three days means each muscle gets trained once a week,
      which is the low end of what builds size — the trade-off you accept for a 3-day week. It works, as long as every set is
      close to hard. If you ever add a fourth day, the highest-value one is a second upper-body session, not a second leg day.
    </p>`;
  $('#c-back').onclick = showHome;
  show('coverage');
}

// ==========================================================================
// HISTORY
// ==========================================================================
/** Minutes-per-day bar chart for the last 14 days + week/average totals. */
function timeChartHTML(log) {
  if (!log.length) return '';
  const byDay = {};
  log.forEach((e) => { byDay[e.d] = (byDay[e.d] || 0) + (e.dur || 0); });

  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    days.push({
      wd: d.toLocaleDateString(undefined, { weekday: 'narrow' }),
      min: Math.round((byDay[key] || 0) / 60),
      today: i === 0,
    });
  }
  const max = Math.max(...days.map((x) => x.min), 1);

  const ws = weekStart();
  const lw = new Date(); lw.setHours(12, 0, 0, 0);
  lw.setDate(lw.getDate() - ((lw.getDay() + 6) % 7) - 7);
  const lws = `${lw.getFullYear()}-${pad2(lw.getMonth() + 1)}-${pad2(lw.getDate())}`;
  const sum = (f) => Math.round(log.filter(f).reduce((a, e) => a + (e.dur || 0), 0) / 60);
  const wkMin = sum((e) => e.d >= ws);
  const lwMin = sum((e) => e.d >= lws && e.d < ws);
  const avg = Math.round(log.reduce((a, e) => a + (e.dur || 0), 0) / log.length / 60);

  return `
    <h3 class="ds-h sec">⏱ Time trained</h3>
    <div class="wk-card">
      <div class="wk-time-tots">
        <div><b>${wkMin}m</b><span>this week</span></div>
        <div><b>${lwMin}m</b><span>last week</span></div>
        <div><b>${avg}m</b><span>avg session</span></div>
      </div>
      <div class="wk-tchart">
        ${days.map((x) => `<div class="wk-tcol${x.today ? ' today' : ''}">
          <span class="v">${x.min || ''}</span>
          <div class="bar${x.min ? '' : ' zero'}" style="height:${x.min ? Math.max(8, Math.round((x.min / max) * 58)) : 3}px"></div>
          <span class="d">${esc(x.wd)}</span>
        </div>`).join('')}
      </div>
      <p class="ds-note" style="margin-top:8px">Minutes trained per day, last 14 days. Every session you finish adds its time to that day — add-ons included.</p>
    </div>`;
}

function showHistory() {
  const log = readJSON(K_LOG, []).slice().reverse();
  const last = readJSON(K_LAST, {});
  const p = prefs();

  // Every logged load, grouped by the day it belongs to.
  const loads = [];
  DAY_KEYS.concat(ADDON_KEYS).forEach((k) => {
    const d = getPlan(k);
    d.blocks.forEach((b) => b.ex.forEach((ex, i) => {
      const id = exId(k, b.id, i);
      if (last[id]) loads.push({ day: d, n: ex.n, ...last[id] });
    }));
  });

  $('#history').innerHTML = `
    <button class="ds-btn small ghost" id="h-back">‹ Back</button>
    ${timeChartHTML(readJSON(K_LOG, []))}
    <h3 class="ds-h sec" style="margin-top:16px">Session history</h3>
    ${log.length ? log.map((e) => {
      const d = getPlan(e.key) || { n: e.key, color: 'var(--wk-1)', emoji: '•' };
      return `<div class="wk-hist-row" style="--dc:${d.color}">
        <div class="d">${esc(shortDate(e.d))}</div>
        <div class="t">${esc(d.emoji)} ${esc(d.n)}</div>
        <div class="m">${fmtClock(e.dur)} · ${e.sets} sets${e.vol ? `<br>${e.vol.toLocaleString()} ${esc(e.unit || p.unit)}` : ''}</div>
      </div>`;
    }).join('') : '<div class="wk-card"><p>Nothing logged yet. Finish a session and it lands here.</p></div>'}

    ${loads.length ? `
      <h3 class="ds-h sec">Current loads</h3>
      <div class="wk-blk">
        ${loads.map((l) => `<div class="wk-ex"><div class="wk-ex-top">
          <div class="wk-ex-n">${esc(l.n)}<div class="wk-ex-alt">${esc(l.day.n)} · ${esc(shortDate(l.d))}</div></div>
          <div class="wk-ex-r">${esc(String(l.w))} ${esc(p.unit)}</div>
        </div></div>`).join('')}
      </div>
      <p class="ds-note">These are what the app pre-fills as "last time." Beating one of them — a rep or a few pounds — is what progress actually looks like week to week.</p>` : ''}

    ${log.length ? `<div class="wk-nav"><button class="ds-btn ghost" id="h-clear">Clear all history</button></div>` : ''}`;

  $('#h-back').onclick = showHome;
  const hc = $('#h-clear');
  if (hc) hc.onclick = () => {
    if (!confirm('Delete every logged session and saved load on this device?')) return;
    writeJSON(K_LOG, []); writeJSON(K_LAST, {});
    showHistory();
  };
  show('history');
}

// --- boot -----------------------------------------------------------------
showHome();
