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
const prefs = () => Object.assign({ unit: 'lb', autoRest: true, sound: true }, readJSON(K_PREFS, {}));
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
  return `<div class="wk-ex" data-ex="${esc(id)}">
    <div class="wk-ex-top">
      <div class="wk-ex-n">${esc(ex.n)}</div>
      <div class="wk-ex-r">${esc(ex.reps)}</div>
    </div>
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
  return `<div class="wk-blk">${items.map((x) => `
    <div class="wk-ex">
      <div class="wk-ex-top"><div class="wk-ex-n">${esc(x.n)}</div><div class="wk-ex-r">${esc(x.reps)}</div></div>
      ${x.cue ? `<div class="wk-ex-alt">${esc(x.cue)}</div>` : ''}
    </div>`).join('')}</div>`;
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
  return { total: log.length, thisWeek, streak, last };
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
      <div class="wk-stat"><b>${st.total}</b><span>Sessions</span></div>
      <div class="wk-stat"><b>${st.streak}</b><span>Week streak</span></div>
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
      <button class="wk-chip" type="button" data-go="history">📈 History &amp; loads</button>
      <button class="wk-chip" type="button" id="unit-toggle">⚖️ Units: ${esc(prefs().unit)}</button>
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

  $('#summary').innerHTML = `
    <div class="wk-res">
      <div class="g">${grade}</div>
      <div class="n">${fmtClock(entry.dur)}<span>elapsed</span></div>
      <div class="l">${entry.sets} of ${setsTotal(s)} sets · ${esc(s.day.n)}${entry.vol ? ` · ${entry.vol.toLocaleString()} ${esc(entry.unit)} moved` : ''}</div>
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
