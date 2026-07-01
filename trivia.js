'use strict';
/* Sports Trivia Lab — standalone Labs page for Sports-Hub.
 * Pure client-side, no backend. NFL-first, plus MLB / NBA / College.
 * Centerpiece is a seeded Daily Challenge (same 10 for everyone, per day).
 * Facts are hand-authored and were accurate as of the 2024–25 seasons. */

// --- tiny helpers ---------------------------------------------------------
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// seeded PRNG so the Daily Challenge is identical for a given date
function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function seededRng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const shuffleWith = (arr, rng) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const rrng = () => Math.random();

// --- categories -----------------------------------------------------------
const CATS = [
  { k: 'nfl', label: 'NFL History', emoji: '🏈' },
  { k: 'sb', label: 'Super Bowl', emoji: '🏆' },
  { k: 'eagles', label: 'Eagles', emoji: '🦅' },
  { k: 'mlb', label: 'MLB', emoji: '⚾' },
  { k: 'nba', label: 'NBA', emoji: '🏀' },
  { k: 'cfb', label: 'College', emoji: '🎓' },
];
const catLabel = (k) => (CATS.find((c) => c.k === k) || { label: k }).label;

// --- question bank (q, a=correct, w=[3 wrong], c=category, ex=fun fact) ----
const Q = [
  // ===== NFL history & records =====
  { c: 'nfl', q: 'How many teams are in the NFL?', a: '32', w: ['30', '31', '34'] },
  { c: 'nfl', q: 'Who is the NFL’s all-time leader in career passing yards?', a: 'Tom Brady', w: ['Drew Brees', 'Peyton Manning', 'Brett Favre'], ex: 'Brady finished with more than 89,000 career passing yards.' },
  { c: 'nfl', q: 'Who holds the NFL career rushing yards record?', a: 'Emmitt Smith', w: ['Walter Payton', 'Barry Sanders', 'Frank Gore'], ex: 'Emmitt Smith ran for 18,355 yards.' },
  { c: 'nfl', q: 'Who set the single-season record with 55 passing touchdowns (2013)?', a: 'Peyton Manning', w: ['Tom Brady', 'Patrick Mahomes', 'Aaron Rodgers'] },
  { c: 'nfl', q: 'Which receiver holds the career records for receptions, yards, and TDs?', a: 'Jerry Rice', w: ['Randy Moss', 'Larry Fitzgerald', 'Terrell Owens'] },
  { c: 'nfl', q: 'Who holds the official career sack record (200)?', a: 'Bruce Smith', w: ['Reggie White', 'Kevin Greene', 'Deacon Jones'], ex: 'Reggie White is second with 198.' },
  { c: 'nfl', q: 'How many players from one team are on the field during a play?', a: '11', w: ['10', '12', '9'] },
  { c: 'nfl', q: 'The “Frozen Tundra” is the nickname for which stadium?', a: 'Lambeau Field', w: ['Soldier Field', 'Arrowhead Stadium', 'Gillette Stadium'] },
  { c: 'nfl', q: 'Which team completed a perfect season capped by a Super Bowl win?', a: '1972 Miami Dolphins', w: ['2007 New England Patriots', '1985 Chicago Bears', '1998 Denver Broncos'], ex: 'The ’72 Dolphins went 17–0 — still the only perfect season.' },
  { c: 'nfl', q: 'Which team is nicknamed “America’s Team”?', a: 'Dallas Cowboys', w: ['Green Bay Packers', 'Pittsburgh Steelers', 'New England Patriots'] },
  { c: 'nfl', q: 'The “Immaculate Reception” belongs to which franchise?', a: 'Pittsburgh Steelers', w: ['Oakland Raiders', 'Dallas Cowboys', 'Green Bay Packers'] },
  { c: 'nfl', q: 'How many yards separate the goal lines on an NFL field?', a: '100', w: ['120', '110', '90'] },
  { c: 'nfl', q: 'Lawrence Taylor revolutionized play at which position?', a: 'Linebacker', w: ['Quarterback', 'Cornerback', 'Running back'] },
  { c: 'nfl', q: 'Who was the No. 1 overall pick in the 2024 NFL Draft?', a: 'Caleb Williams', w: ['Jayden Daniels', 'Drake Maye', 'Marvin Harrison Jr.'] },
  { c: 'nfl', q: 'Who won a record five NFL MVP awards?', a: 'Peyton Manning', w: ['Aaron Rodgers', 'Tom Brady', 'Brett Favre'] },
  { c: 'nfl', q: 'Which back set the single-game rushing record with 296 yards?', a: 'Adrian Peterson', w: ['Jamal Lewis', 'Walter Payton', 'Jerome Harrison'] },
  { c: 'nfl', q: 'A safety is worth how many points?', a: '2', w: ['1', '3', '6'] },
  { c: 'nfl', q: 'The Vince Lombardi Trophy is awarded to the winner of what?', a: 'The Super Bowl', w: ['The Pro Bowl', 'The AFC Championship', 'The NFL Draft'] },
  { c: 'nfl', q: 'What do the initials NFL stand for?', a: 'National Football League', w: ['National Franchise League', 'North American Football League', 'National Field League'] },
  { c: 'nfl', q: 'Which quarterback has the most career touchdown passes?', a: 'Tom Brady', w: ['Drew Brees', 'Peyton Manning', 'Aaron Rodgers'] },

  // ===== Super Bowl =====
  { c: 'sb', q: 'Who won Super Bowl LIX in February 2025?', a: 'Philadelphia Eagles', w: ['Kansas City Chiefs', 'San Francisco 49ers', 'Buffalo Bills'], ex: 'The Eagles routed the Chiefs 40–22.' },
  { c: 'sb', q: 'Who was named MVP of Super Bowl LIX?', a: 'Jalen Hurts', w: ['Saquon Barkley', 'Patrick Mahomes', 'A.J. Brown'] },
  { c: 'sb', q: 'Which quarterback has the most Super Bowl wins?', a: 'Tom Brady', w: ['Joe Montana', 'Terry Bradshaw', 'Patrick Mahomes'], ex: 'Brady won seven.' },
  { c: 'sb', q: 'Which team has appeared in the most Super Bowls?', a: 'New England Patriots', w: ['Dallas Cowboys', 'Pittsburgh Steelers', 'Denver Broncos'] },
  { c: 'sb', q: 'Whose famous guarantee came true in Super Bowl III?', a: 'Joe Namath', w: ['Johnny Unitas', 'Bart Starr', 'Roger Staubach'] },
  { c: 'sb', q: 'David Tyree’s “Helmet Catch” helped which team win the Super Bowl?', a: 'New York Giants', w: ['New York Jets', 'Philadelphia Eagles', 'Dallas Cowboys'], ex: 'It upset the previously undefeated 2007 Patriots.' },
  { c: 'sb', q: 'Which team did the Eagles beat to win Super Bowl LII?', a: 'New England Patriots', w: ['Atlanta Falcons', 'Kansas City Chiefs', 'Los Angeles Rams'] },
  { c: 'sb', q: 'Who was MVP of Super Bowl LVII (2023)?', a: 'Patrick Mahomes', w: ['Jalen Hurts', 'Travis Kelce', 'Nick Bolton'] },
  { c: 'sb', q: 'Which team won back-to-back titles in Super Bowls LVII and LVIII?', a: 'Kansas City Chiefs', w: ['Philadelphia Eagles', 'San Francisco 49ers', 'Los Angeles Rams'] },
  { c: 'sb', q: 'Super Bowl 50 broke tradition by using what on its logo?', a: 'The Arabic numeral “50”', w: ['The Roman numeral “L”', 'Only team logos', 'No number at all'] },
  { c: 'sb', q: 'In what year was the first Super Bowl played?', a: '1967', w: ['1966', '1970', '1960'] },
  { c: 'sb', q: 'The “Philly Special” trick play featured a TD caught by which QB?', a: 'Nick Foles', w: ['Carson Wentz', 'Jalen Hurts', 'Donovan McNabb'] },
  { c: 'sb', q: 'The Super Bowl championship trophy is named after which coach?', a: 'Vince Lombardi', w: ['George Halas', 'Tom Landry', 'Chuck Noll'] },

  // ===== Eagles =====
  { c: 'eagles', q: 'In what year did the Eagles win their first Super Bowl?', a: '2018', w: ['2005', '2011', '2021'], ex: 'They beat the Patriots in Super Bowl LII (Feb 2018).' },
  { c: 'eagles', q: 'What is the Eagles’ primary color?', a: 'Midnight green', w: ['Kelly green', 'Navy blue', 'Teal'] },
  { c: 'eagles', q: 'Where do the Eagles play their home games?', a: 'Lincoln Financial Field', w: ['Veterans Stadium', 'MetLife Stadium', 'Soldier Field'] },
  { c: 'eagles', q: 'What is the Eagles’ fight song?', a: 'Fly, Eagles Fly', w: ['Go Birds', 'Green Machine', 'Eagles Anthem'] },
  { c: 'eagles', q: 'Which running back powered the Eagles’ 2024 title season?', a: 'Saquon Barkley', w: ['Miles Sanders', 'LeSean McCoy', 'D’Andre Swift'], ex: 'Barkley signed in 2024 and had a monster year.' },
  { c: 'eagles', q: 'Hall of Famer Reggie White played which position for the Eagles?', a: 'Defensive end', w: ['Linebacker', 'Cornerback', 'Running back'], ex: 'He was known as “The Minister of Defense.”' },
  { c: 'eagles', q: 'Which QB led the Eagles to Super Bowl XXXIX (2005)?', a: 'Donovan McNabb', w: ['Randall Cunningham', 'Michael Vick', 'Nick Foles'] },
  { c: 'eagles', q: 'Which division do the Eagles play in?', a: 'NFC East', w: ['NFC North', 'NFC South', 'AFC East'] },
  { c: 'eagles', q: 'What is the name of the Eagles’ mascot?', a: 'Swoop', w: ['Franklin', 'Big Red', 'Talon'] },
  { c: 'eagles', q: 'Which coach led the Eagles to their first Super Bowl title (LII)?', a: 'Doug Pederson', w: ['Andy Reid', 'Nick Sirianni', 'Chip Kelly'] },
  { c: 'eagles', q: 'Eagles Hall of Famer Brian Dawkins played which position?', a: 'Safety', w: ['Cornerback', 'Linebacker', 'Wide receiver'] },
  { c: 'eagles', q: 'Which coach led the Eagles to the Super Bowl LIX championship?', a: 'Nick Sirianni', w: ['Doug Pederson', 'Andy Reid', 'Kellen Moore'] },
  { c: 'eagles', q: 'The Eagles’ fierce in-state rival plays in which city?', a: 'Pittsburgh', w: ['Baltimore', 'Cleveland', 'Buffalo'], ex: 'The Steelers–Eagles “Battle of Pennsylvania.”' },

  // ===== MLB =====
  { c: 'mlb', q: 'How many games are in a standard MLB regular season?', a: '162', w: ['154', '160', '144'] },
  { c: 'mlb', q: 'Who holds the MLB career home run record?', a: 'Barry Bonds', w: ['Hank Aaron', 'Babe Ruth', 'Albert Pujols'], ex: 'Bonds hit 762.' },
  { c: 'mlb', q: 'Who broke Major League Baseball’s color barrier in 1947?', a: 'Jackie Robinson', w: ['Larry Doby', 'Willie Mays', 'Satchel Paige'] },
  { c: 'mlb', q: 'Which team won the 2024 World Series?', a: 'Los Angeles Dodgers', w: ['New York Yankees', 'Texas Rangers', 'Houston Astros'] },
  { c: 'mlb', q: 'The “Green Monster” is a wall at which ballpark?', a: 'Fenway Park', w: ['Wrigley Field', 'Yankee Stadium', 'Camden Yards'] },
  { c: 'mlb', q: 'Who is MLB’s all-time strikeout leader (pitcher)?', a: 'Nolan Ryan', w: ['Randy Johnson', 'Roger Clemens', 'Steve Carlton'], ex: 'Ryan struck out 5,714 batters.' },
  { c: 'mlb', q: 'Who holds the single-season home run record (73)?', a: 'Barry Bonds', w: ['Mark McGwire', 'Sammy Sosa', 'Aaron Judge'] },
  { c: 'mlb', q: 'Which franchise has won the most World Series titles?', a: 'New York Yankees', w: ['St. Louis Cardinals', 'Boston Red Sox', 'Los Angeles Dodgers'], ex: 'The Yankees have 27.' },
  { c: 'mlb', q: 'Cal Ripken Jr. is famous for a record streak of what?', a: 'Consecutive games played', w: ['Home runs', 'Stolen bases', 'Strikeouts'], ex: '2,632 straight games.' },
  { c: 'mlb', q: 'How many outs are in a half-inning?', a: '3', w: ['2', '4', '1'] },
  { c: 'mlb', q: 'What does the stat “RBI” stand for?', a: 'Run Batted In', w: ['Runs Before Innings', 'Runner Base Index', 'Return Ball In'] },
  { c: 'mlb', q: 'Which Red Sox slugger was nicknamed “Big Papi”?', a: 'David Ortiz', w: ['Manny Ramirez', 'Ted Williams', 'Mo Vaughn'] },
  { c: 'mlb', q: 'The Red Sox ended an 86-year title drought by winning in which year?', a: '2004', w: ['2007', '2013', '1986'] },
  { c: 'mlb', q: 'A pitcher who retires all 27 batters faced throws a what?', a: 'Perfect game', w: ['No-hitter only', 'Shutout', 'Complete save'] },
  { c: 'mlb', q: 'How many players from one team are on the field on defense?', a: '9', w: ['8', '10', '11'] },
  { c: 'mlb', q: 'Which number, retired league-wide, honors Jackie Robinson?', a: '42', w: ['24', '3', '21'] },

  // ===== NBA =====
  { c: 'nba', q: 'Who is the NBA’s all-time leading scorer?', a: 'LeBron James', w: ['Kareem Abdul-Jabbar', 'Kobe Bryant', 'Michael Jordan'], ex: 'LeBron passed Kareem in 2023.' },
  { c: 'nba', q: 'A made shot from beyond the arc is worth how many points?', a: '3', w: ['2', '4', '1'] },
  { c: 'nba', q: 'Which franchise has won the most NBA championships?', a: 'Boston Celtics', w: ['Los Angeles Lakers', 'Chicago Bulls', 'Golden State Warriors'], ex: 'Their 2024 title made it 18.' },
  { c: 'nba', q: 'Who won the 2024 NBA Finals?', a: 'Boston Celtics', w: ['Dallas Mavericks', 'Denver Nuggets', 'Miami Heat'] },
  { c: 'nba', q: 'How many NBA titles did Michael Jordan win with the Bulls?', a: '6', w: ['5', '7', '4'] },
  { c: 'nba', q: 'Who scored an NBA-record 100 points in a single game?', a: 'Wilt Chamberlain', w: ['Kobe Bryant', 'Michael Jordan', 'David Thompson'], ex: 'Kobe’s 81 is second-most.' },
  { c: 'nba', q: 'How many players per team are on the court at once?', a: '5', w: ['6', '4', '7'] },
  { c: 'nba', q: 'The NBA MVP trophy is now named after which player?', a: 'Michael Jordan', w: ['Bill Russell', 'Kareem Abdul-Jabbar', 'Magic Johnson'] },
  { c: 'nba', q: 'Which player is nicknamed “The Greek Freak”?', a: 'Giannis Antetokounmpo', w: ['Nikola Jokić', 'Luka Dončić', 'Joel Embiid'] },
  { c: 'nba', q: 'How high is an NBA rim above the floor?', a: '10 feet', w: ['9 feet', '11 feet', '12 feet'] },
  { c: 'nba', q: 'Stephen Curry has spent his career with which team?', a: 'Golden State Warriors', w: ['Los Angeles Lakers', 'Sacramento Kings', 'Phoenix Suns'] },
  { c: 'nba', q: 'The NBA Finals MVP trophy is named after which legend?', a: 'Bill Russell', w: ['Michael Jordan', 'Wilt Chamberlain', 'Larry Bird'] },
  { c: 'nba', q: 'Which team did “Showtime” refer to in the 1980s?', a: 'Los Angeles Lakers', w: ['Boston Celtics', 'Detroit Pistons', 'Philadelphia 76ers'] },
  { c: 'nba', q: 'How many quarters are in an NBA game?', a: '4', w: ['2', '3', '5'] },

  // ===== College =====
  { c: 'cfb', q: 'The Heisman Trophy honors the top player in which sport?', a: 'College football', w: ['College basketball', 'College baseball', 'NFL rookies'] },
  { c: 'cfb', q: '“March Madness” refers to which event?', a: 'The NCAA basketball tournament', w: ['The College Football Playoff', 'The MLB playoffs', 'The NHL playoffs'] },
  { c: 'cfb', q: 'With the First Four, how many teams make the men’s NCAA tournament?', a: '68', w: ['64', '65', '72'] },
  { c: 'cfb', q: '“Roll Tide” is the rallying cry of which school?', a: 'Alabama', w: ['Georgia', 'Ohio State', 'LSU'] },
  { c: 'cfb', q: 'The Rose Bowl is played in which state?', a: 'California', w: ['Texas', 'Florida', 'Arizona'] },
  { c: 'cfb', q: '“The Big House” is the stadium of which university?', a: 'Michigan', w: ['Ohio State', 'Penn State', 'Texas'] },
  { c: 'cfb', q: 'College football’s champion is now decided by the what?', a: 'College Football Playoff', w: ['BCS', 'AP poll only', 'A bowl committee'] },
  { c: 'cfb', q: '“Touchdown Jesus” overlooks the stadium at which school?', a: 'Notre Dame', w: ['USC', 'Michigan', 'Alabama'] },
  { c: 'cfb', q: 'What does the SEC conference name stand for?', a: 'Southeastern Conference', w: ['Southern Elite Conference', 'South East Collegiate', 'Sunbelt East Conference'] },
  { c: 'cfb', q: '“The Granddaddy of Them All” nickname belongs to which bowl?', a: 'Rose Bowl', w: ['Sugar Bowl', 'Orange Bowl', 'Cotton Bowl'] },
  { c: 'cfb', q: 'Which school’s teams are the Buckeyes?', a: 'Ohio State', w: ['Michigan', 'Oregon', 'Penn State'] },
  { c: 'cfb', q: 'Duke is a storied blue-blood program primarily in which sport?', a: 'Basketball', w: ['Football', 'Baseball', 'Hockey'] },
  { c: 'cfb', q: 'The Army–Navy Game is a famous rivalry in which sport?', a: 'College football', w: ['College basketball', 'College hockey', 'College lacrosse'] },
  { c: 'cfb', q: 'How many points is a touchdown worth (before the extra point)?', a: '6', w: ['5', '7', '3'] },
];

// --- persistence ----------------------------------------------------------
const K_LIFE = 'trivialab:life';   // {played, correct, total, bestStreak}
const K_BEST = 'trivialab:best';   // {catKey: bestScore}
const K_DAILY = 'trivialab:daily'; // {'YYYY-MM-DD': {score, correct, total}}
const readJSON = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (_) { return d; } };
const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dailyStreak(map) {
  let n = 0;
  const d = new Date();
  for (;;) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (map[key]) { n++; d.setDate(d.getDate() - 1); } else break;
  }
  return n;
}

// --- quiz construction ----------------------------------------------------
// Returns [{q, choices, answer (index), cat, ex}]
function makeQuestion(item, rng) {
  const choices = shuffleWith([item.a, ...item.w], rng);
  return { q: item.q, choices, answer: choices.indexOf(item.a), cat: item.c, ex: item.ex || '' };
}
function buildFromPool(pool, count, rng) {
  const order = shuffleWith(pool.map((_, i) => i), rng).slice(0, count);
  return order.map((i) => makeQuestion(pool[i], rng));
}

// --- state ----------------------------------------------------------------
let S = null; // {mode:'daily'|'cat', cat, qs:[], idx, score, streak, bestStreak, correct, picks:[], locked}

// ==========================================================================
// HOME
// ==========================================================================
function showHome() {
  $('#quiz').hidden = true;
  $('#results').hidden = true;
  const home = $('#home');
  home.hidden = false;

  const life = readJSON(K_LIFE, { played: 0, correct: 0, total: 0, bestStreak: 0 });
  const best = readJSON(K_BEST, {});
  const daily = readJSON(K_DAILY, {});
  const acc = life.total ? Math.round((life.correct / life.total) * 100) : 0;
  const streak = dailyStreak(daily);
  const today = todayStr();
  const doneToday = daily[today];

  home.innerHTML = `
    <div class="stat-strip">
      <div class="stat"><span class="stat-n">${life.played}</span><span class="stat-l">Quizzes</span></div>
      <div class="stat"><span class="stat-n">${acc}%</span><span class="stat-l">Accuracy</span></div>
      <div class="stat"><span class="stat-n">🔥 ${streak}</span><span class="stat-l">Day streak</span></div>
      <div class="stat"><span class="stat-n">${life.bestStreak}</span><span class="stat-l">Best run</span></div>
    </div>

    <div class="daily-card">
      <div class="daily-badge">🗓️ Daily Challenge</div>
      <div class="daily-title">Today’s 10 — ${today}</div>
      <div class="daily-sub">${doneToday
        ? `✅ Done today: <b>${doneToday.correct}/${doneToday.total}</b> · ${doneToday.score.toLocaleString()} pts`
        : 'Same 10 questions for everyone today. Keep your streak alive.'}</div>
      <button id="daily-btn" class="ds-btn primary">${doneToday ? 'Replay today’s set' : 'Play the Daily Challenge'}</button>
    </div>

    <h2 class="ds-h sec">Free play by category</h2>
    <div class="cat-grid">
      ${CATS.map((c) => {
        const n = Q.filter((x) => x.c === c.k).length;
        const b = best[c.k];
        return `<button class="cat-card" data-cat="${c.k}">
          <span class="cat-emoji">${c.emoji}</span>
          <span class="cat-name">${c.label}</span>
          <span class="cat-meta">${n} questions${b ? ` · best ${b.toLocaleString()}` : ''}</span>
        </button>`;
      }).join('')}
      <button class="cat-card mixed" data-cat="mixed">
        <span class="cat-emoji">🎲</span>
        <span class="cat-name">Mixed</span>
        <span class="cat-meta">All ${Q.length} questions</span>
      </button>
    </div>
    <p class="ds-note">${Q.length} hand-written questions across NFL, MLB, NBA and college. Facts were accurate as of the 2024–25 seasons. A sandbox to build on.</p>`;

  $('#daily-btn').onclick = startDaily;
  home.querySelectorAll('.cat-card').forEach((b) => (b.onclick = () => startCategory(b.dataset.cat)));
}

// ==========================================================================
// START MODES
// ==========================================================================
function startDaily() {
  const rng = seededRng(hashStr('daily-' + todayStr()));
  const qs = buildFromPool(Q, 10, rng);
  S = { mode: 'daily', cat: 'mixed', qs, idx: 0, score: 0, streak: 0, bestStreak: 0, correct: 0, picks: [], locked: false };
  showQuiz();
}
function startCategory(cat) {
  const pool = cat === 'mixed' ? Q : Q.filter((x) => x.c === cat);
  const count = Math.min(cat === 'mixed' ? 12 : 10, pool.length);
  const qs = buildFromPool(pool, count, rrng);
  S = { mode: 'cat', cat, qs, idx: 0, score: 0, streak: 0, bestStreak: 0, correct: 0, picks: [], locked: false };
  showQuiz();
}

// ==========================================================================
// QUIZ
// ==========================================================================
function showQuiz() { $('#home').hidden = true; $('#results').hidden = true; $('#quiz').hidden = false; renderQuestion(); }

function renderQuestion() {
  const q = S.qs[S.idx];
  const total = S.qs.length;
  const pct = Math.round((S.idx / total) * 100);
  const mult = S.streak >= 5 ? 2 : S.streak >= 3 ? 1.5 : 1;
  $('#quiz').innerHTML = `
    <div class="q-top">
      <button id="q-quit" class="ds-btn ghost small">✕ Quit</button>
      <div class="q-progress"><div class="q-progress-fill" style="width:${pct}%"></div></div>
      <div class="q-score">${S.score.toLocaleString()} pts</div>
    </div>
    <div class="q-meta">
      <span class="q-count">Question ${S.idx + 1} / ${total}</span>
      <span class="q-tag">${S.mode === 'daily' ? '🗓️ Daily' : CATS.find((c) => c.k === S.cat)?.emoji || '🎲'} ${S.mode === 'daily' ? 'Challenge' : catLabel(S.cat)}</span>
      <span class="q-streak ${S.streak >= 3 ? 'hot' : ''}">🔥 ${S.streak}${mult > 1 ? ` · ${mult}×` : ''}</span>
    </div>
    <div class="q-card">
      <div class="q-cat">${(CATS.find((c) => c.k === q.cat) || {}).emoji || ''} ${catLabel(q.cat)}</div>
      <h2 class="q-text">${esc(q.q)}</h2>
      <div class="q-opts">${q.choices.map((ch, i) => `<button class="opt" data-i="${i}">${esc(ch)}</button>`).join('')}</div>
      <div id="q-feedback" class="q-feedback" hidden></div>
    </div>`;
  $('#q-quit').onclick = () => { if (confirm('Quit this quiz? Progress won’t be saved.')) showHome(); };
  $('#quiz').querySelectorAll('.opt').forEach((b) => (b.onclick = () => answer(+b.dataset.i)));
}

function answer(i) {
  if (S.locked) return;
  S.locked = true;
  const q = S.qs[S.idx];
  const correct = i === q.answer;
  S.picks.push({ q: q.q, chosen: q.choices[i], correct: q.choices[q.answer], right: correct });

  let gained = 0;
  if (correct) {
    S.streak++;
    S.bestStreak = Math.max(S.bestStreak, S.streak);
    S.correct++;
    const mult = S.streak >= 5 ? 2 : S.streak >= 3 ? 1.5 : 1;
    gained = Math.round(100 * mult);
    S.score += gained;
  } else {
    S.streak = 0;
  }

  const opts = $('#quiz').querySelectorAll('.opt');
  opts.forEach((b, bi) => {
    b.disabled = true;
    if (bi === q.answer) b.classList.add('right');
    else if (bi === i) b.classList.add('wrong');
  });
  const fb = $('#q-feedback');
  fb.hidden = false;
  fb.className = 'q-feedback ' + (correct ? 'ok' : 'no');
  const last = S.idx === S.qs.length - 1;
  fb.innerHTML = `
    <div class="fb-line">${correct ? `✅ Correct <span class="fb-pts">+${gained}</span>` : `❌ Answer: <b>${esc(q.choices[q.answer])}</b>`}</div>
    ${q.ex ? `<div class="fb-ex">${esc(q.ex)}</div>` : ''}
    <button id="q-next" class="ds-btn primary">${last ? 'See results →' : 'Next →'}</button>`;
  $('#q-next').onclick = next;
}

function next() {
  if (S.idx < S.qs.length - 1) { S.idx++; S.locked = false; renderQuestion(); }
  else showResults();
}

// ==========================================================================
// RESULTS
// ==========================================================================
function showResults() {
  // persist
  const life = readJSON(K_LIFE, { played: 0, correct: 0, total: 0, bestStreak: 0 });
  life.played++; life.correct += S.correct; life.total += S.qs.length;
  life.bestStreak = Math.max(life.bestStreak || 0, S.bestStreak);
  writeJSON(K_LIFE, life);

  if (S.mode === 'cat') {
    const best = readJSON(K_BEST, {});
    if (!best[S.cat] || S.score > best[S.cat]) best[S.cat] = S.score;
    writeJSON(K_BEST, best);
  } else {
    const daily = readJSON(K_DAILY, {});
    const t = todayStr();
    if (!daily[t] || S.score > daily[t].score) daily[t] = { score: S.score, correct: S.correct, total: S.qs.length };
    writeJSON(K_DAILY, daily);
  }

  const acc = Math.round((S.correct / S.qs.length) * 100);
  const grade = acc >= 90 ? '🏆 Hall of Famer' : acc >= 70 ? '⭐ Pro Bowler' : acc >= 50 ? '👍 Starter' : '🪑 Practice squad';
  $('#home').hidden = true; $('#quiz').hidden = true;
  const r = $('#results');
  r.hidden = false;
  r.innerHTML = `
    <div class="res-card">
      <div class="res-grade">${grade}</div>
      <div class="res-score">${S.score.toLocaleString()}<span>pts</span></div>
      <div class="res-line">${S.correct} / ${S.qs.length} correct · ${acc}% · best run 🔥 ${S.bestStreak}</div>
      ${S.mode === 'daily' ? `<div class="res-daily">🗓️ Daily Challenge logged for ${todayStr()} — 🔥 ${dailyStreak(readJSON(K_DAILY, {}))}-day streak</div>` : ''}
      <div class="res-actions">
        <button id="res-again" class="ds-btn primary">Play again</button>
        <button id="res-home" class="ds-btn">Back to categories</button>
      </div>
    </div>
    <h3 class="ds-h sec">Review</h3>
    <div class="review">
      ${S.picks.map((p, i) => `
        <div class="rev-row ${p.right ? 'ok' : 'no'}">
          <span class="rev-i">${i + 1}</span>
          <div class="rev-body">
            <div class="rev-q">${esc(p.q)}</div>
            <div class="rev-a">${p.right ? `✅ ${esc(p.correct)}` : `❌ You: ${esc(p.chosen)} · ✅ ${esc(p.correct)}`}</div>
          </div>
        </div>`).join('')}
    </div>`;
  $('#res-again').onclick = () => (S.mode === 'daily' ? startDaily() : startCategory(S.cat));
  $('#res-home').onclick = showHome;
}

// --- boot -----------------------------------------------------------------
showHome();
