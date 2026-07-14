'use strict';
/* Sports Trivia Lab — standalone Labs page for Sports-Hub.
 * Pure client-side, no backend. NFL-first, plus MLB / NBA / College.
 * Centerpiece is a seeded Daily Challenge (same 10 for everyone, per day).
 * Facts are hand-authored and were accurate as of the 2024–25 seasons. */

// --- tiny helpers ---------------------------------------------------------
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// OpenTDB returns HTML-entity-encoded text (e.g. &quot;, &#039;). Decode via a
// detached <textarea> (never inserted, so nothing executes); render still esc()s.
const _decEl = document.createElement('textarea');
const decodeHTML = (s) => { _decEl.innerHTML = String(s == null ? '' : s); return _decEl.value; };
let pendingNotice = ''; // one-shot banner shown on the next quiz's first question

// seeded PRNG so the Daily Challenge is identical for a given date
function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function seededRng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const shuffleWith = (arr, rng) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const rrng = () => Math.random();

// --- categories -----------------------------------------------------------
const CATS = [
  { k: 'nfl', label: 'NFL History', emoji: '🏈' },
  { k: 'draft', label: 'NFL Draft', emoji: '📋' },
  { k: 'sb', label: 'Super Bowl', emoji: '🏆' },
  { k: 'eagles', label: 'Eagles', emoji: '🦅' },
  { k: 'mlb', label: 'MLB', emoji: '⚾' },
  { k: 'nba', label: 'NBA', emoji: '🏀' },
  { k: 'cfb', label: 'College', emoji: '🎓' },
];
const catLabel = (k) => (CATS.find((c) => c.k === k) || { label: k }).label;

// --- question bank --------------------------------------------------------
// { q, a=correct, w=[3 wrong], c=category, d=difficulty (2 hard / 3 elite), ex=fact }
// Deep-cut, gameshow-hard trivia — records, specific moments, and obscurities.
const Q = [
  // ===== NFL history & records =====
  { c: 'nfl', d: 3, q: 'Who holds the record for most rushing yards in a single Super Bowl (204)?', a: 'Timmy Smith', w: ['Marcus Allen', 'John Riggins', 'Terrell Davis'], ex: 'Rookie Timmy Smith ran for 204 in Super Bowl XXII — and was out of the league within two years.' },
  { c: 'nfl', d: 2, q: 'Who set the single-season rushing record with 2,105 yards (1984)?', a: 'Eric Dickerson', w: ['Adrian Peterson', 'Barry Sanders', 'Derrick Henry'] },
  { c: 'nfl', d: 3, q: 'Who is the NFL’s all-time leader in career interceptions (81)?', a: 'Paul Krause', w: ['Rod Woodson', 'Emlen Tunnell', 'Ronnie Lott'] },
  { c: 'nfl', d: 2, q: 'Who broke Johnny Unitas’ mark with 54 straight games throwing a TD pass?', a: 'Drew Brees', w: ['Tom Brady', 'Peyton Manning', 'Aaron Rodgers'] },
  { c: 'nfl', d: 2, q: 'Who kicked the longest field goal in NFL history (66 yards)?', a: 'Justin Tucker', w: ['Matt Prater', 'Brett Maher', 'Harrison Butker'] },
  { c: 'nfl', d: 3, q: 'Who holds the single-game receiving record with 336 yards (1989)?', a: 'Flipper Anderson', w: ['Calvin Johnson', 'Stephone Paige', 'Jerry Rice'] },
  { c: 'nfl', d: 3, q: 'Who is the only player to win Super Bowl MVP while on the losing team?', a: 'Chuck Howley', w: ['Jake Scott', 'Harvey Martin', 'Randy White'], ex: 'The Cowboys LB won it in Super Bowl V despite a loss to Baltimore.' },
  { c: 'nfl', d: 2, q: 'Who was the first player to win the AP MVP by unanimous vote (2010)?', a: 'Tom Brady', w: ['Peyton Manning', 'Aaron Rodgers', 'Lamar Jackson'] },
  { c: 'nfl', d: 2, q: 'Who holds the record for most career rushing touchdowns (164)?', a: 'Emmitt Smith', w: ['LaDainian Tomlinson', 'Marcus Allen', 'Walter Payton'] },
  { c: 'nfl', d: 2, q: 'The “Purple People Eaters” were the fearsome defensive line of which team?', a: 'Minnesota Vikings', w: ['Chicago Bears', 'Los Angeles Rams', 'Pittsburgh Steelers'] },
  { c: 'nfl', d: 2, q: 'The “Tuck Rule” playoff game was between the Patriots and which team?', a: 'Oakland Raiders', w: ['New York Jets', 'Tennessee Titans', 'Pittsburgh Steelers'] },
  { c: 'nfl', d: 2, q: 'The “Minneapolis Miracle” walk-off (2017 playoffs) eliminated which team?', a: 'New Orleans Saints', w: ['Philadelphia Eagles', 'Atlanta Falcons', 'Green Bay Packers'] },
  { c: 'nfl', d: 3, q: 'Who led the NFL in rushing a record eight times?', a: 'Jim Brown', w: ['Barry Sanders', 'Walter Payton', 'Emmitt Smith'] },
  { c: 'nfl', d: 2, q: 'Undrafted and once a grocery-store stocker, which QB won Super Bowl XXXIV MVP?', a: 'Kurt Warner', w: ['Trent Green', 'Rich Gannon', 'Jake Delhomme'] },
  { c: 'nfl', d: 3, q: 'The “Hail Mary” term was coined by which QB after a 1975 playoff game?', a: 'Roger Staubach', w: ['Fran Tarkenton', 'Ken Stabler', 'Terry Bradshaw'] },
  { c: 'nfl', d: 2, q: 'The “Steel Curtain” was the nickname for which team’s defense?', a: 'Pittsburgh Steelers', w: ['Baltimore Ravens', 'Chicago Bears', 'Minnesota Vikings'] },
  { c: 'nfl', d: 2, q: 'The “Music City Miracle” kickoff-return lateral beat which team?', a: 'Buffalo Bills', w: ['Indianapolis Colts', 'New York Jets', 'Jacksonville Jaguars'] },

  // ===== Super Bowl =====
  { c: 'sb', d: 2, q: 'Which team lost four consecutive Super Bowls?', a: 'Buffalo Bills', w: ['Minnesota Vikings', 'Denver Broncos', 'Dallas Cowboys'], ex: 'Buffalo lost SB XXV–XXVIII.' },
  { c: 'sb', d: 2, q: 'Who was named MVP of Super Bowl I?', a: 'Bart Starr', w: ['Max McGee', 'Jim Taylor', 'Willie Wood'] },
  { c: 'sb', d: 3, q: 'On the “Philly Special,” who threw the touchdown pass to Nick Foles?', a: 'Trey Burton', w: ['Corey Clement', 'Zach Ertz', 'Nelson Agholor'] },
  { c: 'sb', d: 2, q: 'Whose goal-line interception sealed Super Bowl XLIX for New England?', a: 'Malcolm Butler', w: ['Darrelle Revis', 'Devin McCourty', 'Patrick Chung'] },
  { c: 'sb', d: 2, q: 'Which team blew a 28–3 lead in the Super Bowl?', a: 'Atlanta Falcons', w: ['Carolina Panthers', 'Denver Broncos', 'San Diego Chargers'], ex: 'The Patriots stormed back in Super Bowl LI.' },
  { c: 'sb', d: 2, q: 'Who holds the record for most passing yards in one Super Bowl (505)?', a: 'Tom Brady', w: ['Kurt Warner', 'Patrick Mahomes', 'Joe Montana'], ex: 'Brady threw for 505 in Super Bowl LII — and lost.' },
  { c: 'sb', d: 3, q: 'James Harrison’s 100-yard interception-return TD came in which Super Bowl?', a: 'XLIII', w: ['XL', 'XLV', 'XLVII'] },
  { c: 'sb', d: 2, q: 'Who has the most Super Bowl wins as a head coach (6)?', a: 'Bill Belichick', w: ['Chuck Noll', 'Bill Walsh', 'Vince Lombardi'] },
  { c: 'sb', d: 2, q: 'Who won a record five Super Bowl MVP awards?', a: 'Tom Brady', w: ['Joe Montana', 'Terry Bradshaw', 'Eli Manning'] },
  { c: 'sb', d: 2, q: 'Which QB threw the pass on David Tyree’s “Helmet Catch”?', a: 'Eli Manning', w: ['Kurt Warner', 'Phil Simms', 'Jeff Hostetler'] },

  // ===== Eagles =====
  { c: 'eagles', d: 2, q: 'Whom did the Eagles select 2nd overall in the 2016 draft?', a: 'Carson Wentz', w: ['Jared Goff', 'Marcus Mariota', 'Dak Prescott'] },
  { c: 'eagles', d: 2, q: 'Which Eagle strip-sacked Tom Brady late in Super Bowl LII?', a: 'Brandon Graham', w: ['Fletcher Cox', 'Derek Barnett', 'Chris Long'] },
  { c: 'eagles', d: 3, q: 'The Eagles’ 1990 “Body Bag Game” was a rout of which team?', a: 'Washington', w: ['Dallas Cowboys', 'New York Giants', 'Chicago Bears'], ex: 'Buddy Ryan’s Eagles knocked so many players out that Washington finished with a running back at QB.' },
  { c: 'eagles', d: 2, q: 'Who set the Eagles’ single-season rushing record in 2024?', a: 'Saquon Barkley', w: ['LeSean McCoy', 'Brian Westbrook', 'Wilbert Montgomery'], ex: 'Barkley topped 2,000 yards, blowing past LeSean McCoy’s old franchise mark.' },
  { c: 'eagles', d: 3, q: 'Who caught the “4th-and-26” conversion in the 2004 playoffs vs. Green Bay?', a: 'Freddie Mitchell', w: ['Todd Pinkston', 'Brian Westbrook', 'Chad Lewis'] },
  { c: 'eagles', d: 2, q: 'Reggie White left the Eagles in 1993 to sign with which team?', a: 'Green Bay Packers', w: ['Carolina Panthers', 'San Francisco 49ers', 'Dallas Cowboys'] },
  { c: 'eagles', d: 3, q: 'Which QB started Super Bowl XV for the Eagles (a loss to the Raiders)?', a: 'Ron Jaworski', w: ['Randall Cunningham', 'Roman Gabriel', 'Norm Snead'] },
  { c: 'eagles', d: 3, q: 'What jersey number did Brian Dawkins wear for the Eagles?', a: '20', w: ['24', '36', '4'] },
  { c: 'eagles', d: 2, q: 'In which round did the Eagles draft Jalen Hurts in 2020?', a: '2nd round', w: ['1st round', '3rd round', '4th round'] },
  { c: 'eagles', d: 3, q: 'How many pre-Super Bowl NFL championships did the Eagles win (1948, 1949, 1960)?', a: '3', w: ['1', '2', '4'] },
  { c: 'eagles', d: 2, q: 'In what year did the Eagles draft Donovan McNabb 2nd overall?', a: '1999', w: ['1998', '2000', '2001'] },
  { c: 'eagles', d: 2, q: 'Philadelphia fans infamously booed and threw snowballs at whom in 1968?', a: 'Santa Claus', w: ['The referees', 'The opposing coach', 'The team owner'] },

  // ===== MLB =====
  { c: 'mlb', d: 2, q: 'Who set the single-season hits record with 262 (2004)?', a: 'Ichiro Suzuki', w: ['George Sisler', 'Pete Rose', 'Rogers Hornsby'] },
  { c: 'mlb', d: 2, q: 'Who was the last MLB player to hit .400 in a season?', a: 'Ted Williams', w: ['Tony Gwynn', 'Rod Carew', 'George Brett'], ex: 'Williams hit .406 in 1941.' },
  { c: 'mlb', d: 2, q: 'Who is MLB’s all-time hits leader (4,256)?', a: 'Pete Rose', w: ['Ty Cobb', 'Hank Aaron', 'Stan Musial'] },
  { c: 'mlb', d: 2, q: 'Who threw a record seven career no-hitters?', a: 'Nolan Ryan', w: ['Sandy Koufax', 'Randy Johnson', 'Bob Feller'] },
  { c: 'mlb', d: 3, q: 'Who stole a single-season record 130 bases (1982)?', a: 'Rickey Henderson', w: ['Lou Brock', 'Vince Coleman', 'Ty Cobb'] },
  { c: 'mlb', d: 2, q: 'Who is MLB’s all-time RBI leader (2,297)?', a: 'Hank Aaron', w: ['Babe Ruth', 'Alex Rodriguez', 'Albert Pujols'] },
  { c: 'mlb', d: 2, q: 'Whose career total of 511 pitching wins is considered unbreakable?', a: 'Cy Young', w: ['Walter Johnson', 'Christy Mathewson', 'Warren Spahn'] },
  { c: 'mlb', d: 3, q: 'Who won the American League Triple Crown in 1967?', a: 'Carl Yastrzemski', w: ['Ted Williams', 'Jim Rice', 'Wade Boggs'] },
  { c: 'mlb', d: 3, q: 'Who caught Don Larsen’s perfect game in the 1956 World Series?', a: 'Yogi Berra', w: ['Roy Campanella', 'Elston Howard', 'Bill Dickey'] },
  { c: 'mlb', d: 2, q: 'Who won a record seven Cy Young Awards?', a: 'Roger Clemens', w: ['Randy Johnson', 'Greg Maddux', 'Steve Carlton'] },
  { c: 'mlb', d: 3, q: 'Whose 1988 walk-off World Series home run (off Dennis Eckersley) is legendary?', a: 'Kirk Gibson', w: ['Joe Carter', 'Bill Mazeroski', 'Carlton Fisk'], ex: 'The hobbled Dodger limped around the bases.' },
  { c: 'mlb', d: 3, q: 'Who holds the single-season walks record (232 in 2004)?', a: 'Barry Bonds', w: ['Babe Ruth', 'Ted Williams', 'Rickey Henderson'] },

  // ===== NBA =====
  { c: 'nba', d: 2, q: 'Who scored 81 points in a game — the most in the modern (post-2000) era?', a: 'Kobe Bryant', w: ['Devin Booker', 'Donovan Mitchell', 'Damian Lillard'] },
  { c: 'nba', d: 2, q: 'Who is the NBA’s all-time career assists leader (15,806)?', a: 'John Stockton', w: ['Jason Kidd', 'Chris Paul', 'Magic Johnson'] },
  { c: 'nba', d: 3, q: 'Who holds the single-season scoring average record (50.4 ppg)?', a: 'Wilt Chamberlain', w: ['Michael Jordan', 'Elgin Baylor', 'Kobe Bryant'] },
  { c: 'nba', d: 2, q: 'Who was drafted 1st overall in 1984, ahead of Michael Jordan at No. 3?', a: 'Hakeem Olajuwon', w: ['Sam Bowie', 'Charles Barkley', 'Patrick Ewing'], ex: 'Sam Bowie went 2nd — right before Jordan.' },
  { c: 'nba', d: 2, q: 'Which team posted a record 73–9 regular season?', a: 'Golden State Warriors', w: ['1995–96 Chicago Bulls', '1985–86 Boston Celtics', '1971–72 Lakers'] },
  { c: 'nba', d: 3, q: 'Who grabbed a single-game record 55 rebounds?', a: 'Wilt Chamberlain', w: ['Bill Russell', 'Dennis Rodman', 'Moses Malone'] },
  { c: 'nba', d: 2, q: 'Ray Allen’s clutch corner three in the 2013 Finals saved which team?', a: 'Miami Heat', w: ['Boston Celtics', 'Milwaukee Bucks', 'San Antonio Spurs'] },
  { c: 'nba', d: 3, q: 'Who won the very first NBA MVP award (1956)?', a: 'Bob Pettit', w: ['Bill Russell', 'George Mikan', 'Bob Cousy'] },
  { c: 'nba', d: 2, q: 'The “Malice at the Palace” brawl involved the Pacers and which team?', a: 'Detroit Pistons', w: ['New York Knicks', 'Chicago Bulls', 'Miami Heat'] },
  { c: 'nba', d: 2, q: 'Who won a record 11 NBA championships as a player?', a: 'Bill Russell', w: ['Sam Jones', 'Kareem Abdul-Jabbar', 'Robert Horry'] },
  { c: 'nba', d: 3, q: 'Which team drafted Kobe Bryant in 1996 before trading him to the Lakers?', a: 'Charlotte Hornets', w: ['Los Angeles Clippers', 'New Jersey Nets', 'Vancouver Grizzlies'] },
  { c: 'nba', d: 2, q: 'What was Kareem Abdul-Jabbar’s signature unblockable shot called?', a: 'The skyhook', w: ['The dream shake', 'The fadeaway', 'The finger roll'] },
  { c: 'nba', d: 3, q: 'Who is the shortest player in NBA history, at 5-foot-3?', a: 'Muggsy Bogues', w: ['Spud Webb', 'Earl Boykins', 'Nate Robinson'] },

  // ===== College =====
  { c: 'cfb', d: 2, q: 'Who is the only two-time Heisman Trophy winner?', a: 'Archie Griffin', w: ['Tim Tebow', 'Herschel Walker', 'Reggie Bush'], ex: 'Ohio State’s Griffin won in 1974 and 1975.' },
  { c: 'cfb', d: 2, q: 'The “Fab Five” freshman class played basketball for which school?', a: 'Michigan', w: ['Duke', 'UNLV', 'Kansas'] },
  { c: 'cfb', d: 3, q: 'Which Wisconsin back won the 1999 Heisman and set the FBS rushing record?', a: 'Ron Dayne', w: ['Montee Ball', 'Melvin Gordon', 'Anthony Davis'] },
  { c: 'cfb', d: 3, q: '“The Play” — a 5-lateral kickoff return through the band (1982) — was Cal vs. whom?', a: 'Stanford', w: ['USC', 'Oregon', 'UCLA'] },
  { c: 'cfb', d: 2, q: 'Christian Laettner’s buzzer-beater in the 1992 tournament beat which team?', a: 'Kentucky', w: ['UNLV', 'Michigan', 'Indiana'] },
  { c: 'cfb', d: 2, q: 'Which school has won the most men’s NCAA basketball titles (11)?', a: 'UCLA', w: ['Kentucky', 'North Carolina', 'Duke'] },
  { c: 'cfb', d: 2, q: 'Who coached UCLA during its run of 10 titles in 12 years?', a: 'John Wooden', w: ['Dean Smith', 'Adolph Rupp', 'Bob Knight'] },
  { c: 'cfb', d: 2, q: 'Who won the first-ever College Football Playoff title (2014 season)?', a: 'Ohio State', w: ['Oregon', 'Alabama', 'Florida State'] },
  { c: 'cfb', d: 2, q: 'The “12th Man” tradition belongs to which university?', a: 'Texas A&M', w: ['Iowa', 'Clemson', 'Auburn'] },
  { c: 'cfb', d: 3, q: 'Who won the 1988 Heisman as an Oklahoma State running back?', a: 'Barry Sanders', w: ['Thurman Thomas', 'Bo Jackson', 'Herschel Walker'] },
  { c: 'cfb', d: 2, q: 'How many total college football national titles has Nick Saban won?', a: '7', w: ['6', '5', '8'], ex: 'One at LSU (2003) and six at Alabama.' },
  { c: 'cfb', d: 2, q: 'Who coached the Nebraska teams that won three titles in the 1990s?', a: 'Tom Osborne', w: ['Bob Devaney', 'Frank Solich', 'Bo Pelini'] },

  // ===== NFL Draft =====
  { c: 'draft', d: 2, q: 'Who was selected with the No. 199 pick in the 2000 NFL Draft?', a: 'Tom Brady', w: ['Marc Bulger', 'Tim Rattay', 'Giovanni Carmazzi'], ex: 'Six QBs went before Brady, the sixth QB taken that year.' },
  { c: 'draft', d: 2, q: 'Who was the No. 1 overall pick in 1998, taken just ahead of Ryan Leaf?', a: 'Peyton Manning', w: ['Ryan Leaf', 'Charlie Batch', 'Brian Griese'] },
  { c: 'draft', d: 3, q: 'Ryan Leaf, one of the biggest busts ever, was drafted 2nd overall in 1998 by whom?', a: 'San Diego Chargers', w: ['Indianapolis Colts', 'Arizona Cardinals', 'Cincinnati Bengals'] },
  { c: 'draft', d: 2, q: 'Who was the No. 1 overall pick in the 2025 NFL Draft?', a: 'Cam Ward', w: ['Travis Hunter', 'Abdul Carter', 'Shedeur Sanders'], ex: 'The Titans took the Miami QB first.' },
  { c: 'draft', d: 3, q: 'Bo Jackson was the No. 1 overall pick in 1986 by which team (he refused to sign)?', a: 'Tampa Bay Buccaneers', w: ['Los Angeles Raiders', 'Kansas City Chiefs', 'Atlanta Falcons'] },
  { c: 'draft', d: 2, q: 'Aaron Rodgers famously slid to which pick in the 2005 draft?', a: '24th (Green Bay)', w: ['12th', '18th', '32nd'] },
  { c: 'draft', d: 2, q: 'Which “Mr. Irrelevant” (last pick, 2022) became a 49ers starting QB?', a: 'Brock Purdy', w: ['Bailey Zappe', 'Sam Howell', 'Desmond Ridder'] },
  { c: 'draft', d: 3, q: 'How many QBs from the famed 1983 draft class reached the Hall of Fame?', a: '3', w: ['2', '4', '1'], ex: 'John Elway, Jim Kelly and Dan Marino.' },
  { c: 'draft', d: 2, q: 'Which team drafted Dan Marino late in the 1983 first round (27th)?', a: 'Miami Dolphins', w: ['Buffalo Bills', 'Denver Broncos', 'Kansas City Chiefs'] },
  { c: 'draft', d: 3, q: 'Eli Manning refused to play for which team that drafted him 1st overall in 2004?', a: 'San Diego Chargers', w: ['Cleveland Browns', 'Oakland Raiders', 'Arizona Cardinals'], ex: 'He was traded to the Giants for Philip Rivers.' },
  { c: 'draft', d: 2, q: 'Who was the No. 1 overall pick in 2021, taken by Jacksonville?', a: 'Trevor Lawrence', w: ['Zach Wilson', 'Trey Lance', 'Justin Fields'] },
  { c: 'draft', d: 2, q: 'Who was the No. 1 overall pick in 2023, taken by Carolina?', a: 'Bryce Young', w: ['C.J. Stroud', 'Anthony Richardson', 'Will Anderson Jr.'] },
  { c: 'draft', d: 3, q: 'Who was the very first pick in the first-ever NFL Draft (1936)?', a: 'Jay Berwanger', w: ['Sammy Baugh', 'Sid Luckman', 'Byron White'], ex: 'Berwanger, the first Heisman winner, never played a down in the NFL.' },
  { c: 'draft', d: 3, q: 'Marvin Harrison Jr. was drafted 4th overall in 2024 by which team?', a: 'Arizona Cardinals', w: ['Los Angeles Chargers', 'New York Giants', 'Tennessee Titans'] },
  { c: 'draft', d: 2, q: 'How many rounds are in the modern NFL Draft?', a: '7', w: ['6', '8', '5'] },
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
  return { q: item.q, choices, answer: choices.indexOf(item.a), cat: item.c, d: item.d || 2, ex: item.ex || '' };
}
function buildFromPool(pool, count, rng) {
  const order = shuffleWith(pool.map((_, i) => i), rng).slice(0, count);
  return order.map((i) => makeQuestion(pool[i], rng));
}

// difficulty → points + pill (curated bank uses d2 HARD / d3 ELITE; live OpenTDB
// questions carry an easy/medium/hard `diff`, scored EASY 50 / MEDIUM 100 / HARD 150)
function diffInfo(q) {
  if (q.diff) {
    if (q.diff === 'easy') return { base: 50, label: 'EASY', cls: 'd1' };
    if (q.diff === 'hard') return { base: 150, label: 'HARD', cls: 'd3' };
    return { base: 100, label: 'MEDIUM', cls: 'd2' };
  }
  return q.d === 3 ? { base: 150, label: 'ELITE', cls: 'd3' } : { base: 100, label: 'HARD', cls: 'd2' };
}

// --- live questions (OpenTDB, category 21 = Sports) -----------------------
// Adapts an OpenTDB result to our internal question shape. Same {q, choices,
// answer, cat, ex} contract as makeQuestion, plus diff/catName/emoji for display.
function makeLiveQuestion(r) {
  if (!r || !r.question || r.correct_answer == null || !Array.isArray(r.incorrect_answers) || !r.incorrect_answers.length) return null;
  const a = decodeHTML(r.correct_answer);
  const wrong = r.incorrect_answers.map(decodeHTML);
  const choices = shuffleWith([a, ...wrong], rrng);
  const catName = decodeHTML(r.category || 'Sports').replace(/^Sports:\s*/i, '');
  return { q: decodeHTML(r.question), choices, answer: choices.indexOf(a), cat: 'live', catName, emoji: '🌍', diff: r.difficulty || 'medium', d: r.difficulty === 'hard' ? 3 : (r.difficulty === 'easy' ? 1 : 2), ex: '' };
}

// --- keyword classification -----------------------------------------------
// OpenTDB has ONE flat "Sports" category (id 21) — no per-sport tag. So we
// best-effort route each question into one of our category keys by keyword,
// or null (non-American-sport → only shows in the 🌍 Sports Mix bag). This is
// deliberately fuzzy: a small, casual pool, so treat it as a bonus, not depth.
function classifyLive(text) {
  const t = ' ' + String(text || '').toLowerCase() + ' ';
  const has = (re) => re.test(t);
  // College spans all college sports → its own bucket, checked first.
  if (has(/\bncaa\b|college football|college basketball|heisman|collegiate/)) return 'cfb';
  // American-football family
  if (has(/\bnfl\b|super\s?bowl|quarterback|touchdown|gridiron|\bafc\b|\bnfc\b|american football/)) {
    if (has(/super\s?bowl/)) return 'sb';
    if (has(/philadelphia eagles|\beagles\b/)) return 'eagles';
    if (has(/\bnfl draft\b|draft(ed|s)?\b/)) return 'draft';
    return 'nfl';
  }
  if (has(/\bmlb\b|baseball|home run|world series|major league|\binnings?\b/)) return 'mlb';
  if (has(/\bnba\b|basketball|slam dunk|\bthree-pointer\b/)) return 'nba';
  return null;
}

// --- live pool cache (harvested from OpenTDB across visits) ----------------
const K_OTDB = 'trivialab:otdb';        // { pool:[{h,question,correct_answer,incorrect_answers,difficulty,category,k}], ts }
const HARVEST_MIN_MS = 20000;           // don't re-fetch more than once per 20s
const MAX_POOL = 800;
const loadOTDB = () => readJSON(K_OTDB, { pool: [], ts: 0 });
const saveOTDB = (c) => writeJSON(K_OTDB, c);
const livePoolLen = () => (loadOTDB().pool || []).length;

function mergeResults(cache, results) {
  cache.pool = cache.pool || [];
  const seen = new Set(cache.pool.map((x) => x.h));
  for (const r of results) {
    if (!r || !r.question || r.correct_answer == null || !Array.isArray(r.incorrect_answers) || !r.incorrect_answers.length) continue;
    const h = hashStr(r.question);
    if (seen.has(h)) continue;
    seen.add(h);
    cache.pool.push({
      h, question: r.question, correct_answer: r.correct_answer, incorrect_answers: r.incorrect_answers,
      difficulty: r.difficulty || 'medium', category: r.category || 'Sports',
      k: classifyLive(decodeHTML(r.question) + ' ' + decodeHTML(r.correct_answer)),
    });
  }
  if (cache.pool.length > MAX_POOL) cache.pool = cache.pool.slice(-MAX_POOL);
}

// One tokenless fetch of 50 (no key, browser-direct — OpenTDB sends permissive
// CORS), deduped into the cache. Time-guarded unless force=true. Never throws;
// sets cache.error ('rate'|'net'|'empty') so callers can message + fall back.
async function harvestOTDB(force) {
  const cache = loadOTDB();
  cache.error = null;
  if (!force && cache.ts && Date.now() - cache.ts < HARVEST_MIN_MS) return cache;
  let data;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 9000);
    const res = await fetch('https://opentdb.com/api.php?amount=50&category=21&type=multiple', { signal: ctrl.signal });
    clearTimeout(to);
    if (!res.ok) { cache.error = 'net'; return cache; }
    data = await res.json();
  } catch (e) { cache.error = 'net'; return cache; }
  if (data && data.response_code === 5) { cache.error = 'rate'; return cache; }
  if (!data || data.response_code !== 0 || !Array.isArray(data.results) || !data.results.length) { cache.error = 'empty'; return cache; }
  mergeResults(cache, data.results);
  cache.ts = Date.now();
  saveOTDB(cache);
  return cache;
}
// grow the pool in the background (guarded, no UI change)
const warmLiveBg = () => { harvestOTDB().catch(() => {}); };
// live questions available for a category from the current cache
function liveForCategory(cat) {
  const pool = loadOTDB().pool || [];
  return cat === 'mixed' ? pool : pool.filter((x) => x.k === cat);
}
function liveCountsByCat() {
  const m = {};
  for (const x of (loadOTDB().pool || [])) if (x.k) m[x.k] = (m[x.k] || 0) + 1;
  return m;
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
  const liveCounts = liveCountsByCat();
  const livePool = livePoolLen();
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
        const lc = liveCounts[c.k] || 0;
        return `<button class="cat-card" data-cat="${c.k}">
          <span class="cat-emoji">${c.emoji}</span>
          <span class="cat-name">${c.label}</span>
          <span class="cat-meta">${n} questions${lc ? ` <span class="cat-live-pill">+${lc} 🌍</span>` : ''}${b ? ` · best ${b.toLocaleString()}` : ''}</span>
        </button>`;
      }).join('')}
      <button class="cat-card mixed" data-cat="mixed">
        <span class="cat-emoji">🎲</span>
        <span class="cat-name">Mixed</span>
        <span class="cat-meta">All ${Q.length} questions${livePool ? ` <span class="cat-live-pill">+${livePool} 🌍</span>` : ''}</span>
      </button>
      <button class="cat-card live" data-live="1">
        <span class="cat-live-badge">LIVE</span>
        <span class="cat-emoji">🌍</span>
        <span class="cat-name">Sports Mix</span>
        <span class="cat-meta">${livePool ? `${livePool} loaded` : 'Fresh from OpenTDB'}${best.live ? ` · best ${best.live.toLocaleString()}` : ''}</span>
      </button>
      <button class="cat-card iq" data-iq="1">
        <span class="cat-live-badge red">● LIVE</span>
        <span class="cat-emoji">🔴</span>
        <span class="cat-name">Sports IQ</span>
        <span class="cat-meta">Today’s real scores${best.liveiq ? ` · best ${best.liveiq.toLocaleString()}` : ''}</span>
      </button>
    </div>
    <p class="ds-note">${Q.length} hand-written questions across NFL, MLB, NBA and college (accurate as of the 2024–25 seasons). Each category also blends in <b>🌍 live questions</b> pulled from <a href="https://opentdb.com" target="_blank" rel="noopener">OpenTDB</a> (CC BY-SA 4.0) — no key, straight to your browser — sorted into sports by keyword, so they're a casual bonus on top of the curated deep cuts. The pool grows as you play. <b>🔴 Sports IQ</b> is different — it builds a quiz on the fly from <b>real ESPN scores</b> of the last day's games, so it's never the same twice. A sandbox to build on.</p>`;

  $('#daily-btn').onclick = startDaily;
  home.querySelectorAll('.cat-card').forEach((b) => (b.onclick = () => (b.dataset.iq ? startLiveIQ() : b.dataset.live ? startSportsMix() : startCategory(b.dataset.cat))));
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
const LIVE_BLEND = 4; // up to N live OpenTDB questions mixed into a category quiz

function startCategory(cat) {
  const curated = cat === 'mixed' ? Q : Q.filter((x) => x.c === cat);
  const count = Math.min(cat === 'mixed' ? 12 : 10, curated.length);
  let qs = buildFromPool(curated, count, rrng);
  // blend in any cached live questions classified into this category (each stays
  // visibly tagged 🌍 via makeLiveQuestion, so it's clear which are live)
  const live = liveForCategory(cat);
  if (live.length) {
    const add = shuffleWith(live, rrng).slice(0, LIVE_BLEND).map(makeLiveQuestion).filter(Boolean);
    if (add.length) qs = shuffleWith([...qs, ...add], rrng);
  }
  S = { mode: 'cat', cat, qs, idx: 0, score: 0, streak: 0, bestStreak: 0, correct: 0, picks: [], locked: false };
  warmLiveBg(); // keep growing the pool for next time
  showQuiz();
}

// 🌍 Sports Mix — the all-sports live bag from OpenTDB (any bucket incl. soccer/
// cricket). Serves from the harvested cache; only hits the network when the pool
// is thin. Falls back to the local Mixed set (with a note) on failure.
async function startSportsMix() {
  let cache = loadOTDB();
  if ((cache.pool || []).length < 10) {
    showLoading('Pulling live questions from OpenTDB…');
    cache = await harvestOTDB(true);
  }
  const pool = cache.pool || [];
  const qs = shuffleWith(pool, rrng).slice(0, Math.min(12, pool.length)).map(makeLiveQuestion).filter(Boolean);
  if (qs.length >= 5 || (qs.length && pool.length < 10)) {
    S = { mode: 'live', cat: 'live', qs, idx: 0, score: 0, streak: 0, bestStreak: 0, correct: 0, picks: [], locked: false };
    warmLiveBg();
    showQuiz();
    return;
  }
  liveFallback(cache.error === 'rate'
    ? 'OpenTDB is rate-limiting (1 request / 5s) — playing the local bank instead. Try again in a few seconds.'
    : 'Couldn’t reach OpenTDB right now — playing the local bank instead.');
}
function liveFallback(msg) { pendingNotice = msg; startCategory('mixed'); }

// ==========================================================================
// 🔴 LIVE SPORTS IQ — questions generated on the fly from ESPN's real scores
// ==========================================================================
// No question bank: we read recent finished games straight from ESPN's public
// scoreboard feeds (permissive CORS, same as the main app) and synthesize MC
// questions with real distractors. Always fresh, self-maintaining. All parsing
// is defensive — a generator that can't build a clean question just skips it.
const ESPN_SITE = 'https://site.api.espn.com/apis/site/v2/sports';
const IQ_SPORTS = [
  { path: 'baseball/mlb', label: 'MLB', unit: 'runs' },
  { path: 'football/nfl', label: 'NFL', unit: 'points' },
  { path: 'basketball/nba', label: 'NBA', unit: 'points' },
];
const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

async function espnScoreboard(path, dates) {
  const url = `${ESPN_SITE}/${path}/scoreboard${dates ? `?dates=${dates}` : ''}`;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return [];
    const d = await res.json();
    return Array.isArray(d.events) ? d.events : [];
  } catch (e) { return []; }
  finally { clearTimeout(to); }
}

// ESPN event → a flat, finished-game record (or null if not usable)
function normGame(ev) {
  try {
    const comp = ev && ev.competitions && ev.competitions[0];
    if (!comp || !Array.isArray(comp.competitors) || comp.competitors.length !== 2) return null;
    const st = (comp.status || ev.status || {}).type || {};
    if (!(st.completed || st.state === 'post')) return null;
    const c0 = comp.competitors[0], c1 = comp.competitors[1];
    const n0 = (c0.team || {}).displayName, n1 = (c1.team || {}).displayName;
    const s0 = parseInt(c0.score, 10), s1 = parseInt(c1.score, 10);
    if (!n0 || !n1 || Number.isNaN(s0) || Number.isNaN(s1)) return null;
    const home = c0.homeAway === 'home' ? c0 : c1;
    const away = c0.homeAway === 'home' ? c1 : c0;
    let winner = c0.winner ? n0 : c1.winner ? n1 : (s0 !== s1 ? (s0 > s1 ? n0 : n1) : null);
    return {
      t0: n0, t1: n1, s0, s1, total: s0 + s1, winner,
      home: (home.team || {}).displayName, away: (away.team || {}).displayName,
      hs: parseInt(home.score, 10), as: parseInt(away.score, 10),
    };
  } catch (e) { return null; }
}

// build one Live-IQ question in our internal shape (or null if <3 distractors)
function iqQ(q, correct, wrongs, diff) {
  const cs = String(correct);
  const uniqW = [...new Set(wrongs.map(String).filter((w) => w && w !== cs))].slice(0, 3);
  if (uniqW.length < 3) return null;
  const choices = shuffleWith([cs, ...uniqW], rrng);
  return { q, choices, answer: choices.indexOf(cs), cat: 'liveiq', catName: 'Live Sports IQ', emoji: '🔴', diff: diff || 'medium', ex: '' };
}
const uniqNums = (correct, cands) => { const out = []; for (const n of cands) { if (n >= 0 && n !== correct && !out.includes(n)) out.push(n); if (out.length === 3) break; } return out; };

function genFromGames(games, sp) {
  const qs = [];
  if (!games.length) return qs;
  const teams = [...new Set(games.flatMap((g) => [g.t0, g.t1]))];
  for (const g of games) {
    if (g.winner) {
      const loser = g.winner === g.t0 ? g.t1 : g.t0;
      const w = [loser, ...shuffleWith(teams.filter((t) => t !== g.winner && t !== loser), rrng)].slice(0, 3);
      const q = iqQ(`Who won this ${sp.label} game — ${g.away} @ ${g.home}?`, g.winner, w, 'easy');
      if (q) qs.push(q);
    }
    { // combined total
      const w = uniqNums(g.total, [g.total + 1, g.total - 1, g.total + 2, g.total - 2, g.total + 3]).map(String);
      const q = iqQ(`How many total ${sp.unit} were scored — ${g.away} @ ${g.home}?`, String(g.total), w, 'medium');
      if (q) qs.push(q);
    }
    { // exact final score
      const correct = `${g.away} ${g.as}, ${g.home} ${g.hs}`;
      const alts = [
        `${g.away} ${g.as}, ${g.home} ${g.hs + 1}`,
        `${g.away} ${g.as + 1}, ${g.home} ${g.hs}`,
        `${g.away} ${Math.max(0, g.as - 1)}, ${g.home} ${g.hs}`,
        `${g.away} ${g.hs}, ${g.home} ${g.as}`,
      ];
      const q = iqQ(`What was the final score — ${g.away} @ ${g.home}?`, correct, alts, 'hard');
      if (q) qs.push(q);
    }
  }
  // highest-scoring team (only if there's a clear, unique leader)
  const scores = games.flatMap((g) => [{ team: g.t0, s: g.s0 }, { team: g.t1, s: g.s1 }]);
  if (teams.length >= 4 && scores.length) {
    const max = Math.max(...scores.map((x) => x.s));
    const atMax = scores.filter((x) => x.s === max);
    if (atMax.length === 1) {
      const w = shuffleWith(teams.filter((t) => t !== atMax[0].team), rrng).slice(0, 3);
      const q = iqQ(`Which team put up the most ${sp.unit} (${max}) in a recent ${sp.label} game?`, atMax[0].team, w, 'hard');
      if (q) qs.push(q);
    }
  }
  return qs;
}

async function buildLiveIQ() {
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  const range = `${ymd(yest)}-${ymd(today)}`;
  const packs = await Promise.all(IQ_SPORTS.map((sp) =>
    espnScoreboard(sp.path, range).then((evs) => ({ sp, evs })).catch(() => ({ sp, evs: [] }))));
  const out = [];
  for (const { sp, evs } of packs) {
    const games = evs.map(normGame).filter(Boolean);
    out.push(...genFromGames(games, sp));
  }
  return out.filter(Boolean);
}

// 🔴 Live Sports IQ — real scores from the last day, turned into a quiz.
async function startLiveIQ() {
  showLoading('Reading today’s real scores from ESPN…');
  let pool = [];
  try { pool = await buildLiveIQ(); } catch (e) { pool = []; }
  if (pool.length < 5) {
    liveFallback('Not enough live sports data right now (off-season / no finished games) — playing the local bank instead.');
    return;
  }
  const qs = shuffleWith(pool, rrng).slice(0, 10);
  S = { mode: 'liveiq', cat: 'liveiq', qs, idx: 0, score: 0, streak: 0, bestStreak: 0, correct: 0, picks: [], locked: false };
  showQuiz();
}

function showLoading(msg) {
  $('#home').hidden = true; $('#results').hidden = true;
  const quiz = $('#quiz'); quiz.hidden = false;
  quiz.innerHTML = `
    <div class="q-card load-card">
      <div class="load-dots"><span></span><span></span><span></span></div>
      <div class="load-msg">${esc(msg)}</div>
      <button id="load-cancel" class="ds-btn ghost small">✕ Cancel</button>
    </div>`;
  $('#load-cancel').onclick = showHome;
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
  const tagEmoji = S.mode === 'daily' ? '🗓️' : S.mode === 'live' ? '🌍' : S.mode === 'liveiq' ? '🔴' : (CATS.find((c) => c.k === S.cat)?.emoji || '🎲');
  const tagLabel = S.mode === 'daily' ? 'Daily Challenge' : S.mode === 'live' ? 'Sports Mix (live)' : S.mode === 'liveiq' ? 'Live Sports IQ' : catLabel(S.cat);
  const di = diffInfo(q);
  const notice = pendingNotice; pendingNotice = '';
  $('#quiz').innerHTML = `
    ${notice ? `<div class="live-note">ℹ️ ${esc(notice)}</div>` : ''}
    <div class="q-top">
      <button id="q-quit" class="ds-btn ghost small">✕ Quit</button>
      <div class="q-progress"><div class="q-progress-fill" style="width:${pct}%"></div></div>
      <div class="q-score">${S.score.toLocaleString()} pts</div>
    </div>
    <div class="q-meta">
      <span class="q-count">Question ${S.idx + 1} / ${total}</span>
      <span class="q-tag">${tagEmoji} ${tagLabel}</span>
      <span class="q-streak ${S.streak >= 3 ? 'hot' : ''}">🔥 ${S.streak}${mult > 1 ? ` · ${mult}×` : ''}</span>
    </div>
    <div class="q-card">
      <div class="q-cat">${q.emoji || (CATS.find((c) => c.k === q.cat) || {}).emoji || ''} ${esc(q.catName || catLabel(q.cat))} <span class="q-diff ${di.cls}">${di.label} · ${di.base}</span></div>
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
    const base = diffInfo(q).base; // harder questions are worth more
    gained = Math.round(base * mult);
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

  if (S.mode === 'daily') {
    const daily = readJSON(K_DAILY, {});
    const t = todayStr();
    if (!daily[t] || S.score > daily[t].score) daily[t] = { score: S.score, correct: S.correct, total: S.qs.length };
    writeJSON(K_DAILY, daily);
  } else { // 'cat' and 'live' both track a per-key best
    const best = readJSON(K_BEST, {});
    if (!best[S.cat] || S.score > best[S.cat]) best[S.cat] = S.score;
    writeJSON(K_BEST, best);
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
      ${S.mode === 'live' ? `<div class="res-credit">🌍 Live questions via <a href="https://opentdb.com" target="_blank" rel="noopener">OpenTDB</a> · CC BY-SA 4.0</div>` : ''}
      ${S.mode === 'liveiq' ? `<div class="res-credit">🔴 Generated from real ESPN scores</div>` : ''}
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
  $('#res-again').onclick = () => (S.mode === 'daily' ? startDaily() : S.mode === 'live' ? startSportsMix() : S.mode === 'liveiq' ? startLiveIQ() : startCategory(S.cat));
  $('#res-home').onclick = showHome;
}

// --- boot -----------------------------------------------------------------
showHome();
// Warm the live pool in the background; if it grew and we're still on the home
// screen, re-render so the "+N 🌍" counts appear. One-shot, so no render loop.
(function warmLiveOnce() {
  const before = livePoolLen();
  harvestOTDB().then(() => { if (livePoolLen() > before && !$('#home').hidden) showHome(); }).catch(() => {});
})();
