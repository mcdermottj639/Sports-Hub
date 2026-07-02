'use strict';
/* NFL Mock Draft Simulator — standalone Labs page for Sports-Hub.
 * Pure client-side, no backend. The prospect board below is a SAMPLE big board
 * (top prospects hand-listed, deeper rounds generated) — swap in a real board by
 * editing TOP_PROSPECTS. This is a sandbox / test ground, not real draft data. */

// --- tiny DOM helpers -----------------------------------------------------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rnd = (n) => Math.floor(Math.random() * n);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pick = (arr) => arr[rnd(arr.length)];
const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// --- teams ----------------------------------------------------------------
const TEAMS = [
  { abbr: 'ARI', name: 'Arizona Cardinals', color: '#97233F' },
  { abbr: 'ATL', name: 'Atlanta Falcons', color: '#A71930' },
  { abbr: 'BAL', name: 'Baltimore Ravens', color: '#241773' },
  { abbr: 'BUF', name: 'Buffalo Bills', color: '#00338D' },
  { abbr: 'CAR', name: 'Carolina Panthers', color: '#0085CA' },
  { abbr: 'CHI', name: 'Chicago Bears', color: '#0B162A' },
  { abbr: 'CIN', name: 'Cincinnati Bengals', color: '#FB4F14' },
  { abbr: 'CLE', name: 'Cleveland Browns', color: '#311D00' },
  { abbr: 'DAL', name: 'Dallas Cowboys', color: '#041E42' },
  { abbr: 'DEN', name: 'Denver Broncos', color: '#FB4F14' },
  { abbr: 'DET', name: 'Detroit Lions', color: '#0076B6' },
  { abbr: 'GB', name: 'Green Bay Packers', color: '#203731' },
  { abbr: 'HOU', name: 'Houston Texans', color: '#03202F' },
  { abbr: 'IND', name: 'Indianapolis Colts', color: '#002C5F' },
  { abbr: 'JAX', name: 'Jacksonville Jaguars', color: '#006778' },
  { abbr: 'KC', name: 'Kansas City Chiefs', color: '#E31837' },
  { abbr: 'LV', name: 'Las Vegas Raiders', color: '#000000' },
  { abbr: 'LAC', name: 'Los Angeles Chargers', color: '#0080C6' },
  { abbr: 'LAR', name: 'Los Angeles Rams', color: '#003594' },
  { abbr: 'MIA', name: 'Miami Dolphins', color: '#008E97' },
  { abbr: 'MIN', name: 'Minnesota Vikings', color: '#4F2683' },
  { abbr: 'NE', name: 'New England Patriots', color: '#002244' },
  { abbr: 'NO', name: 'New Orleans Saints', color: '#D3BC8D' },
  { abbr: 'NYG', name: 'New York Giants', color: '#0B2265' },
  { abbr: 'NYJ', name: 'New York Jets', color: '#125740' },
  { abbr: 'PHI', name: 'Philadelphia Eagles', color: '#004C54' },
  { abbr: 'PIT', name: 'Pittsburgh Steelers', color: '#FFB612' },
  { abbr: 'SF', name: 'San Francisco 49ers', color: '#AA0000' },
  { abbr: 'SEA', name: 'Seattle Seahawks', color: '#002244' },
  { abbr: 'TB', name: 'Tampa Bay Buccaneers', color: '#D50A0A' },
  { abbr: 'TEN', name: 'Tennessee Titans', color: '#0C2340' },
  { abbr: 'WSH', name: 'Washington Commanders', color: '#5A1414' },
];
const teamBy = Object.fromEntries(TEAMS.map((t) => [t.abbr, t]));
const logoURL = (abbr) => `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png`;

// Base order = 2025 reverse-standings slotting (32 distinct teams). Used for
// rounds 2–7, and for random/custom modes.
const BASE_ORDER = ['TEN', 'CLE', 'NYG', 'NE', 'JAX', 'LV', 'NYJ', 'CAR', 'NO', 'CHI',
  'SF', 'DAL', 'MIA', 'IND', 'ATL', 'ARI', 'CIN', 'SEA', 'TB', 'DEN',
  'PIT', 'LAC', 'GB', 'MIN', 'HOU', 'LAR', 'BAL', 'DET', 'WSH', 'BUF', 'KC', 'PHI'];

// Actual 2025 NFL Draft Round 1 pick order (trades included). Note: NYG and ATL
// each picked twice (traded up); HOU and LAR traded out of round 1, so they're
// absent here — that's real, and the sim handles a team with no R1 pick.
const ACTUAL_2025_R1 = ['TEN', 'JAX', 'NYG', 'NE', 'CLE', 'LV', 'NYJ', 'CAR', 'NO', 'CHI',
  'SF', 'DAL', 'MIA', 'IND', 'ATL', 'ARI', 'CIN', 'SEA', 'TB', 'DEN',
  'PIT', 'LAC', 'GB', 'MIN', 'NYG', 'ATL', 'BAL', 'DET', 'WSH', 'BUF', 'KC', 'PHI'];

// Positional needs drive CPU picks (flavor, not real scouting).
const TEAM_NEEDS = {
  ARI: ['WR', 'EDGE', 'CB', 'IOL'], ATL: ['EDGE', 'DT', 'CB', 'WR'], BAL: ['WR', 'CB', 'EDGE', 'IOL'],
  BUF: ['WR', 'CB', 'DT', 'S'], CAR: ['WR', 'EDGE', 'LB', 'S'], CHI: ['OT', 'EDGE', 'WR', 'DT'],
  CIN: ['IOL', 'DT', 'CB', 'S'], CLE: ['QB', 'OT', 'WR', 'LB'], DAL: ['WR', 'RB', 'DT', 'CB'],
  DEN: ['RB', 'TE', 'EDGE', 'S'], DET: ['EDGE', 'CB', 'WR', 'IOL'], GB: ['CB', 'OT', 'EDGE', 'S'],
  HOU: ['IOL', 'OT', 'WR', 'CB'], IND: ['CB', 'TE', 'EDGE', 'WR'], JAX: ['CB', 'DT', 'OT', 'S'],
  KC: ['OT', 'WR', 'CB', 'DT'], LV: ['QB', 'CB', 'WR', 'OT'], LAC: ['WR', 'DT', 'CB', 'TE'],
  LAR: ['OT', 'CB', 'LB', 'S'], MIA: ['OT', 'IOL', 'S', 'LB'], MIN: ['QB', 'CB', 'IOL', 'DT'],
  NE: ['OT', 'WR', 'EDGE', 'CB'], NO: ['QB', 'OT', 'WR', 'EDGE'], NYG: ['QB', 'WR', 'CB', 'OT'],
  NYJ: ['OT', 'WR', 'S', 'TE'], PHI: ['CB', 'EDGE', 'S', 'LB'], PIT: ['QB', 'WR', 'CB', 'IOL'],
  SF: ['CB', 'IOL', 'EDGE', 'WR'], SEA: ['IOL', 'OT', 'DT', 'LB'], TB: ['LB', 'EDGE', 'S', 'DT'],
  TEN: ['QB', 'OT', 'WR', 'EDGE'], WSH: ['OT', 'CB', 'EDGE', 'WR'],
};

// --- SAMPLE prospect board (top ~70; deeper rounds are generated) ---------
const TOP_PROSPECTS = [
  { name: 'Jaylen Carter', pos: 'QB', school: 'Texas' },
  { name: 'Marcus Boland', pos: 'EDGE', school: 'Georgia' },
  { name: 'Trey Washington', pos: 'WR', school: 'Ohio State' },
  { name: 'Deion Halloway', pos: 'CB', school: 'Alabama' },
  { name: 'Isaiah Prince', pos: 'OT', school: 'Michigan' },
  { name: 'Cam Whitfield', pos: 'QB', school: 'LSU' },
  { name: 'Jordan Mensah', pos: 'DT', school: 'Clemson' },
  { name: 'Tavian Brooks', pos: 'WR', school: 'Oregon' },
  { name: 'Malik Rountree', pos: 'EDGE', school: 'Florida State' },
  { name: 'Elias Vance', pos: 'OT', school: 'Notre Dame' },
  { name: 'DJ Fontaine', pos: 'CB', school: 'Miami' },
  { name: 'Braylon Kidd', pos: 'WR', school: 'Tennessee' },
  { name: 'Nate Ellison', pos: 'LB', school: 'Penn State' },
  { name: 'Kobe Adeyemi', pos: 'DT', school: 'Texas A&M' },
  { name: 'Rashad Coyle', pos: 'S', school: 'Georgia' },
  { name: 'Grant Holloway', pos: 'QB', school: 'Ole Miss' },
  { name: 'Xavier Mumford', pos: 'EDGE', school: 'Alabama' },
  { name: 'Terrance Uzo', pos: 'WR', school: 'USC' },
  { name: 'Colton Reyes', pos: 'IOL', school: 'Oregon' },
  { name: 'Amari Blackwell', pos: 'CB', school: 'Ohio State' },
  { name: 'Devon Achebe', pos: 'DT', school: 'Michigan' },
  { name: 'Josiah Trent', pos: 'TE', school: 'Utah' },
  { name: 'Kellen Ford', pos: 'OT', school: 'Washington' },
  { name: 'Marquise Dunn', pos: 'RB', school: 'Ohio State' },
  { name: 'Zion Cabrera', pos: 'WR', school: 'Texas' },
  { name: 'Bryce Amadi', pos: 'EDGE', school: 'Oklahoma' },
  { name: 'Landon Speight', pos: 'LB', school: 'Georgia' },
  { name: 'Tyrese Okafor', pos: 'CB', school: 'Florida' },
  { name: 'Hank Delgado', pos: 'IOL', school: 'Alabama' },
  { name: 'Roman Vitale', pos: 'S', school: 'Notre Dame' },
  { name: 'Dashawn Priest', pos: 'WR', school: 'LSU' },
  { name: 'Emeka Nwosu', pos: 'DT', school: 'Wisconsin' },
  { name: 'Cole Rutherford', pos: 'QB', school: 'North Carolina' },
  { name: 'Jamal Whitmore', pos: 'EDGE', school: 'Missouri' },
  { name: 'Peyton Salas', pos: 'OT', school: 'Texas' },
  { name: 'Kion Barrett', pos: 'RB', school: 'Alabama' },
  { name: 'Solomon Reed', pos: 'CB', school: 'Kansas State' },
  { name: 'Micah Trujillo', pos: 'WR', school: 'Ole Miss' },
  { name: 'Beau Callahan', pos: 'TE', school: 'Iowa' },
  { name: 'Darius Vann', pos: 'S', school: 'South Carolina' },
  { name: 'Ronin Matsuda', pos: 'IOL', school: 'Oregon' },
  { name: 'Tyshawn Beck', pos: 'LB', school: 'Clemson' },
  { name: 'Elijah Sarpong', pos: 'DT', school: 'Auburn' },
  { name: 'Grayson Poole', pos: 'QB', school: 'Louisville' },
  { name: 'Kaden Mercer', pos: 'WR', school: 'Arizona State' },
  { name: 'Osei Boahen', pos: 'EDGE', school: 'Pittsburgh' },
  { name: 'Wyatt Church', pos: 'OT', school: 'Kansas' },
  { name: 'Jaquan Fields', pos: 'CB', school: 'Louisville' },
  { name: 'Marco Benedetti', pos: 'IOL', school: 'Boston College' },
  { name: 'Tremaine Lott', pos: 'RB', school: 'Miami' },
  { name: 'Dominic Ayala', pos: 'WR', school: 'Florida' },
  { name: 'Bennett Krause', pos: 'S', school: 'Michigan' },
  { name: 'Kwame Osei', pos: 'DT', school: 'Nebraska' },
  { name: 'Hayden Fisk', pos: 'LB', school: 'Iowa' },
  { name: 'Cyrus Nkemdirim', pos: 'EDGE', school: 'TCU' },
  { name: 'Reece Valentine', pos: 'TE', school: 'Georgia' },
  { name: 'Amir Cross', pos: 'CB', school: 'Texas Tech' },
  { name: 'Griffin Locke', pos: 'QB', school: 'Washington State' },
  { name: 'Tavon Reddick', pos: 'WR', school: 'Baylor' },
  { name: 'Sione Latu', pos: 'OT', school: 'BYU' },
  { name: 'Malachi Boone', pos: 'S', school: 'Duke' },
  { name: 'Ivan Petrov', pos: 'IOL', school: 'Stanford' },
  { name: 'Darnell Fuqua', pos: 'RB', school: 'Kansas State' },
  { name: 'Quinton Aldridge', pos: 'DT', school: 'Georgia Tech' },
  { name: 'Lorenzo Rhodes', pos: 'CB', school: 'Ole Miss' },
  { name: 'Trace Whitlock', pos: 'LB', school: 'Wisconsin' },
  { name: 'Ade Sanusi', pos: 'EDGE', school: 'Cincinnati' },
  { name: 'Chase Donnelly', pos: 'WR', school: 'SMU' },
  { name: 'Beckham Royce', pos: 'TE', school: 'Oregon State' },
  { name: 'Nasir Kamau', pos: 'S', school: 'Rutgers' },
  // --- Round 3 range ---
  { name: 'Rondell Pace', pos: 'WR', school: 'Marshall' },
  { name: 'Trey Boykin', pos: 'CB', school: 'Toledo' },
  { name: 'Gus Hartman', pos: 'IOL', school: 'Iowa' },
  { name: 'Demario Fofana', pos: 'EDGE', school: 'UCF' },
  { name: 'Kaleb Sorensen', pos: 'S', school: 'Montana' },
  { name: 'Isaiah Muncy', pos: 'RB', school: 'Memphis' },
  { name: 'Pierre Gaudreau', pos: 'DT', school: 'Louisiana' },
  { name: 'Malik Trammell', pos: 'LB', school: 'Appalachian State' },
  { name: 'Bo Kinsler', pos: 'OT', school: 'Air Force' },
  { name: 'Reggie Vanterpool', pos: 'TE', school: 'Old Dominion' },
  { name: 'Darrius Feld', pos: 'WR', school: 'Western Kentucky' },
  { name: 'Amari Sowell', pos: 'CB', school: 'Tulane' },
  { name: 'Cooper Vandergriff', pos: 'QB', school: 'Nevada' },
  { name: 'Ola Ajayi', pos: 'EDGE', school: 'Coastal Carolina' },
  { name: 'Nick Provenzano', pos: 'IOL', school: 'Rutgers' },
  { name: 'Terrell Batiste', pos: 'S', school: 'Louisiana Tech' },
  { name: 'Junior Okonkwo', pos: 'DT', school: 'Purdue' },
  { name: 'Deshawn Ruffin', pos: 'WR', school: 'South Alabama' },
  { name: 'Colby Reinhart', pos: 'LB', school: 'North Dakota State' },
  { name: 'Emmanuel Diabate', pos: 'OT', school: 'Charlotte' },
  { name: 'Marcus Threadgill', pos: 'RB', school: 'Troy' },
  { name: 'Jaylin Cormier', pos: 'CB', school: 'Southern Miss' },
  { name: 'Brody Ashworth', pos: 'TE', school: 'Kansas State' },
  { name: 'Tavaris Bell', pos: 'WR', school: 'Georgia State' },
  { name: 'Kingsley Obi', pos: 'EDGE', school: 'Bowling Green' },
  { name: 'Roman Sczepanski', pos: 'DT', school: 'Buffalo' },
  // --- Round 4 range ---
  { name: 'Devonte Alvarez', pos: 'S', school: 'New Mexico State' },
  { name: 'Hank Broussard', pos: 'IOL', school: 'Tulsa' },
  { name: 'Silas Nyman', pos: 'LB', school: 'Ball State' },
  { name: 'Rashawn Teel', pos: 'WR', school: 'East Carolina' },
  { name: 'Marlon Pickett', pos: 'CB', school: 'UNLV' },
  { name: 'Bishop Ferrell', pos: 'RB', school: 'Wake Forest' },
  { name: 'Wyatt Slaughter', pos: 'OT', school: 'Wyoming' },
  { name: 'Ephraim Adjei', pos: 'DT', school: 'Temple' },
  { name: 'Cade Rennick', pos: 'EDGE', school: 'Utah State' },
  { name: 'Trevon Sylvester', pos: 'WR', school: 'Middle Tennessee' },
  { name: 'Nolan Prewitt', pos: 'S', school: 'Northwestern' },
  { name: 'Beckett Haines', pos: 'TE', school: 'Cincinnati' },
  { name: 'Idris Balogun', pos: 'IOL', school: 'Houston' },
  { name: 'Dominique Farr', pos: 'CB', school: 'San Diego State' },
  { name: 'Kade Lindstrom', pos: 'LB', school: 'South Dakota State' },
  { name: 'Vince Carrell', pos: 'QB', school: 'Fresno State' },
  { name: 'Marquel Bynum', pos: 'WR', school: 'Liberty' },
  { name: 'Tyree Ogunbowale', pos: 'DT', school: 'Pittsburgh' },
  { name: 'Grant Eisenhauer', pos: 'OT', school: 'Boston College' },
  { name: 'Jaylen Rutledge', pos: 'RB', school: 'James Madison' },
  { name: 'Cordell Yoon', pos: 'CB', school: 'Oregon State' },
  { name: 'Amauri Sene', pos: 'EDGE', school: 'Florida Atlantic' },
  { name: 'Brock Halverson', pos: 'S', school: 'Iowa State' },
  { name: 'Deion Massaquoi', pos: 'WR', school: 'Rice' },
  { name: 'Sam Petroski', pos: 'IOL', school: 'Michigan State' },
  { name: 'Tavian Colston', pos: 'LB', school: 'Arkansas State' },
  { name: 'Rory Kavanagh', pos: 'TE', school: 'Stanford' },
  { name: 'Jamarcus Peele', pos: 'CB', school: 'Louisville' },
  { name: 'Obi Nwachukwu', pos: 'DT', school: 'Kansas' },
  { name: 'Kenyatta Blaylock', pos: 'WR', school: 'Colorado State' },
  { name: 'Fitz Delorme', pos: 'S', school: 'Boise State' },
  { name: 'Prentice Hobbs', pos: 'OT', school: 'Duke' },
  // --- Round 5 range ---
  { name: 'Tyrell Odum', pos: 'RB', school: 'Georgia Southern' },
  { name: 'Marquis Fennell', pos: 'CB', school: 'Baylor' },
  { name: 'Dante Rizzo', pos: 'EDGE', school: 'Syracuse' },
  { name: 'Kavon Ellsworth', pos: 'WR', school: 'Washington State' },
  { name: 'Bryce Tuiloma', pos: 'IOL', school: 'Oregon' },
  { name: 'Nakobe Yancey', pos: 'S', school: 'Ole Miss' },
  { name: 'Roman Dabrowski', pos: 'LB', school: 'Minnesota' },
  { name: 'Ike Osunde', pos: 'DT', school: 'Missouri' },
  { name: 'Cash Winterton', pos: 'OT', school: 'Utah' },
  { name: 'Jelani Rideau', pos: 'WR', school: 'Louisiana' },
  { name: 'Terrance Yaw', pos: 'CB', school: 'Hawaii' },
  { name: 'Beau Litchfield', pos: 'TE', school: 'TCU' },
  { name: 'Dax Comeaux', pos: 'QB', school: 'Tulane' },
  { name: 'Malachi Ude', pos: 'RB', school: 'Illinois' },
  { name: 'Kroy Fenimore', pos: 'EDGE', school: 'Vanderbilt' },
  { name: 'Zaid Hamdan', pos: 'S', school: 'Toledo' },
  { name: 'Ronaldo Cepeda', pos: 'WR', school: 'Florida International' },
  { name: 'Grady Wohlfeil', pos: 'IOL', school: 'Nebraska' },
  { name: 'Devin Achterberg', pos: 'CB', school: 'Wisconsin' },
  { name: 'Sione Fifita', pos: 'LB', school: 'BYU' },
  { name: 'Marcus Delphonse', pos: 'DT', school: 'Cincinnati' },
  { name: 'Reid Hollenbeck', pos: 'OT', school: 'Kansas State' },
  { name: 'Tywan Beauchamp', pos: 'WR', school: 'Coastal Carolina' },
  { name: 'Kellan Dowdy', pos: 'S', school: 'Indiana' },
  { name: 'Josiah Renfroe', pos: 'RB', school: 'Auburn' },
  { name: 'Amir Zellner', pos: 'CB', school: 'Rutgers' },
  { name: 'Ola Bamgbose', pos: 'EDGE', school: 'Charlotte' },
  { name: 'Corbin Hutto', pos: 'TE', school: 'West Virginia' },
  { name: 'Deangelo Prieto', pos: 'WR', school: 'UTSA' },
  { name: 'Blaise Contreras', pos: 'IOL', school: 'Arizona' },
  { name: 'Nash Ferrigno', pos: 'LB', school: 'Pittsburgh' },
  { name: 'Kwesi Baffour', pos: 'DT', school: 'Duke' },
  // --- Round 6 range ---
  { name: 'Tyshon Kalu', pos: 'CB', school: 'Memphis' },
  { name: 'Reef Callender', pos: 'S', school: 'Marshall' },
  { name: 'Manny Okoro', pos: 'WR', school: 'Texas State' },
  { name: 'Grant Sepulveda', pos: 'OT', school: 'San Jose State' },
  { name: 'Deshaun Mabry', pos: 'RB', school: 'Old Dominion' },
  { name: 'Kiante Rollins', pos: 'EDGE', school: 'North Texas' },
  { name: 'Otis Vandenberg', pos: 'IOL', school: 'Iowa State' },
  { name: 'Rashad Poirier', pos: 'LB', school: 'Louisiana Tech' },
  { name: 'Tyree Mwangi', pos: 'DT', school: 'Wyoming' },
  { name: 'Braxton Lemieux', pos: 'WR', school: 'Nevada' },
  { name: 'Jaylon Okwuosa', pos: 'CB', school: 'Akron' },
  { name: 'Cade Bittinger', pos: 'S', school: 'Ball State' },
  { name: 'Truman Alvarado', pos: 'TE', school: 'Fresno State' },
  { name: 'Rocco Santelli', pos: 'QB', school: 'UAB' },
  { name: 'Marquell Toomey', pos: 'WR', school: 'Georgia State' },
  { name: 'Ivan Krasniqi', pos: 'OT', school: 'Temple' },
  { name: 'Demetrius Vo', pos: 'RB', school: 'Hawaii' },
  { name: 'Kelton Broughton', pos: 'CB', school: 'Troy' },
  { name: 'Zane Mikkelson', pos: 'EDGE', school: 'Montana State' },
  { name: 'Parnell Adu', pos: 'IOL', school: 'UCF' },
  { name: 'Devonta Skaggs', pos: 'S', school: 'Louisiana' },
  { name: 'Tariq Benn', pos: 'LB', school: 'South Alabama' },
  { name: 'Chidi Anagonye', pos: 'DT', school: 'Bowling Green' },
  { name: 'Rashon Delacruz', pos: 'WR', school: 'UTEP' },
  { name: 'Beau Villanueva', pos: 'CB', school: 'New Mexico' },
  { name: 'Isaias Montano', pos: 'RB', school: 'Colorado State' },
  { name: 'Kolby Trahan', pos: 'S', school: 'McNeese' },
  { name: 'Tevin Ashford', pos: 'WR', school: 'Jacksonville State' },
  { name: 'Gunnar Sandoval', pos: 'OT', school: 'Idaho' },
  { name: 'Dashiell Mburu', pos: 'LB', school: 'Kent State' },
  { name: 'Lawson Petrowski', pos: 'IOL', school: 'North Dakota State' },
  { name: 'Case Vandermolen', pos: 'TE', school: 'South Dakota' },
  // --- Round 7 range ---
  { name: 'Jaylen Quist', pos: 'CB', school: 'Northern Iowa' },
  { name: 'Terrico Landry', pos: 'WR', school: 'Southeastern Louisiana' },
  { name: 'Nkosi Barrow', pos: 'S', school: 'Delaware' },
  { name: 'Dontae Riggins', pos: 'RB', school: 'Villanova' },
  { name: 'Elom Agbeko', pos: 'EDGE', school: 'Youngstown State' },
  { name: 'Marcus Twombly', pos: 'DT', school: 'Montana' },
  { name: 'Reid Kaczmarek', pos: 'LB', school: 'North Dakota' },
  { name: 'Isaiah Pele', pos: 'IOL', school: 'Weber State' },
  { name: 'Cortez Mally', pos: 'OT', school: 'Sam Houston' },
  { name: 'Dequan Broadus', pos: 'WR', school: 'Alcorn State' },
  { name: 'Malcolm Ferris', pos: 'CB', school: 'Chattanooga' },
  { name: 'Brady Oleson', pos: 'S', school: 'Eastern Washington' },
  { name: 'Kip Vandagriff', pos: 'TE', school: 'Furman' },
  { name: 'Tanner Kessel', pos: 'QB', school: 'Southern Illinois' },
  { name: 'Rahmir Choudhury', pos: 'RB', school: 'Towson' },
  { name: 'Jaylen Ibe', pos: 'WR', school: 'Mercer' },
  { name: 'Osaze Igbinedion', pos: 'EDGE', school: 'Elon' },
  { name: 'Trayvon Mattison', pos: 'CB', school: 'Jackson State' },
  { name: 'Grant Wolterman', pos: 'IOL', school: 'Northern Arizona' },
  { name: 'Kwabena Sarfo', pos: 'DT', school: 'Holy Cross' },
  { name: 'Deonte Fambrough', pos: 'S', school: 'Southern' },
  { name: 'Ledger Mahaffey', pos: 'LB', school: 'Wofford' },
  { name: 'Tyquan Bledsoe', pos: 'WR', school: 'Tennessee State' },
  { name: 'Bjorn Kessler', pos: 'OT', school: 'Portland State' },
  { name: 'Marquez Villalobos', pos: 'CB', school: 'Cal Poly' },
  { name: 'Denzel Achiaa', pos: 'RB', school: 'Bryant' },
  { name: 'Rashard Timmons', pos: 'WR', school: 'Prairie View A&M' },
  { name: 'Kacey Wetzel', pos: 'S', school: 'Illinois State' },
  { name: 'Femi Adenuga', pos: 'EDGE', school: 'Stony Brook' },
  { name: 'Cole Vukovich', pos: 'IOL', school: 'Youngstown State' },
  { name: 'Trell Mangum', pos: 'LB', school: 'Albany' },
  { name: 'Ime Effiong', pos: 'DT', school: 'Maine' },
  // --- Depth / priority-UDFA tier (keeps the board from running dry) ---
  { name: 'Darnell Fritsch', pos: 'WR', school: 'Western Illinois' },
  { name: 'Jaydon Sable', pos: 'CB', school: 'Southern Utah' },
  { name: 'Kellen Marchetti', pos: 'S', school: 'UC Davis' },
  { name: 'Rasul Ndiaye', pos: 'RB', school: 'Lehigh' },
  { name: 'Bronson Kealoha', pos: 'LB', school: 'Idaho State' },
  { name: 'Onyeka Umeh', pos: 'DT', school: 'Fordham' },
  { name: 'Grady Sundberg', pos: 'IOL', school: 'Northern Colorado' },
  { name: 'Wilton Ferreira', pos: 'OT', school: 'Florida A&M' },
  { name: 'Kadeem Rolle', pos: 'EDGE', school: 'Norfolk State' },
  { name: 'Trevonte Ashby', pos: 'WR', school: 'North Carolina A&T' },
  { name: 'Jibril Toure', pos: 'CB', school: 'Sacramento State' },
  { name: 'Beckham Lindqvist', pos: 'TE', school: 'Montana' },
  { name: 'Deshon Cabral', pos: 'S', school: 'Rhode Island' },
  { name: 'Chase Wozniak', pos: 'QB', school: 'North Dakota' },
  { name: 'Rakeem Talley', pos: 'WR', school: 'Grambling' },
  { name: 'Xavier Bui', pos: 'RB', school: 'Cal Poly' },
  { name: 'Tremaine Osborne', pos: 'CB', school: 'Tennessee-Martin' },
  { name: 'Kaeden Frost', pos: 'LB', school: 'Weber State' },
  { name: 'Nnamdi Okorafor', pos: 'DT', school: 'Villanova' },
  { name: 'Beauden Riggs', pos: 'IOL', school: 'South Dakota State' },
  { name: 'Zaccheus Odom', pos: 'S', school: 'Samford' },
  { name: 'Tavian Kellerman', pos: 'WR', school: 'Eastern Kentucky' },
  { name: 'Griff Halstead', pos: 'OT', school: 'Yale' },
  { name: 'Damarion Pou', pos: 'EDGE', school: 'San Diego State' },
  { name: 'Isaias Renner', pos: 'CB', school: 'Drake' },
  { name: 'Kesler Ndong', pos: 'RB', school: 'Duquesne' },
  { name: 'Terrance Villagomez', pos: 'WR', school: 'Hawaii' },
  { name: 'Boone Kittredge', pos: 'S', school: 'New Hampshire' },
  { name: 'Malaki Ferber', pos: 'LB', school: 'Colgate' },
  { name: 'Rocco Panetta', pos: 'IOL', school: 'Villanova' },
  { name: 'Dovid Erlichman', pos: 'TE', school: 'Columbia' },
  { name: 'Jaylen Sowah', pos: 'CB', school: 'Howard' },
  { name: 'Rondel Fashaw', pos: 'WR', school: 'Bethune-Cookman' },
  { name: 'Uche Anozie', pos: 'DT', school: 'Georgetown' },
  { name: 'Kai Brumfield', pos: 'S', school: 'Maine' },
  { name: 'Sterling Maddox', pos: 'OT', school: 'Princeton' },
  { name: 'Deion Ferrante', pos: 'RB', school: 'Merrimack' },
  { name: 'Obi Chikelu', pos: 'EDGE', school: 'Wagner' },
  { name: 'Tyrell Wexler', pos: 'WR', school: 'Monmouth' },
  { name: 'Jamarri Deveaux', pos: 'CB', school: 'Charleston Southern' },
];

// Name / school pools used to generate believable Day-2/Day-3 depth.
const FIRST = ['Aiden', 'Blake', 'Caleb', 'Dante', 'Evan', 'Gage', 'Hunter', 'Ivory', 'Jaden', 'Keon',
  'Landry', 'Miles', 'Noel', 'Omar', 'Preston', 'Quan', 'Rico', 'Silas', 'Tanner', 'Uriah',
  'Vince', 'Wade', 'Xander', 'Yusuf', 'Zaire', 'Brock', 'Cade', 'Deshaun', 'Efe', 'Fabian'];
const LAST = ['Abbott', 'Bello', 'Crenshaw', 'Diallo', 'Escobar', 'Flanagan', 'Guerra', 'Hollis', 'Ibarra', 'Jennings',
  'Kowalski', 'Lansing', 'Mbeki', 'Norwood', 'Ottinger', 'Pruitt', 'Quintero', 'Randle', 'Stovall', 'Tillman',
  'Ugwu', 'Vasquez', 'Whitaker', 'Xiong', 'Yeboah', 'Zamora', 'Bracken', 'Culpepper', 'Delacroix', 'Fenwick'];
const SCHOOLS = ['Georgia', 'Alabama', 'Ohio State', 'Michigan', 'Texas', 'LSU', 'Oregon', 'Penn State', 'Clemson',
  'Notre Dame', 'Florida', 'Tennessee', 'Miami', 'Oklahoma', 'USC', 'Utah', 'Iowa', 'Wisconsin', 'Auburn',
  'Ole Miss', 'Kansas State', 'TCU', 'Louisville', 'Pitt', 'Missouri', 'NC State', 'Arkansas', 'Minnesota'];
const POS_CYCLE = ['WR', 'CB', 'EDGE', 'OT', 'S', 'LB', 'IOL', 'RB', 'DT', 'TE', 'QB', 'CB', 'WR', 'EDGE', 'S'];

// The active board. Defaults to the bundled sample; replaced at runtime by the
// real draft class when the backend (/api/draft/prospects) is reachable.
const DRAFT_API = 'https://sports-hub-production.up.railway.app';
const DRAFT_YEAR = 2026;           // most recent completed draft (pulled live)
const BOARD_CACHE = 'draftsim:board';
let BOARD_DATA = TOP_PROSPECTS;
let boardSource = 'sample';        // 'sample' | 'real'
let boardFailed = false;
let REAL_ORDER = null;             // real round-1 pick order for DRAFT_YEAR, if loaded

// ESPN abbreviations mostly match ours; normalize the few that can differ.
const ABBR_ALIAS = { WAS: 'WSH', JAC: 'JAX', LVR: 'LV', SD: 'LAC', SL: 'LAR', OAK: 'LV', LA: 'LAR' };
const normAbbr = (a) => ABBR_ALIAS[(a || '').toUpperCase()] || (a || '').toUpperCase();

function boardNoteHTML() {
  if (boardSource === 'real') return `Board: <b style="color:var(--accent)">real ${DRAFT_YEAR} NFL Draft class</b> (${BOARD_DATA.length} players, live from ESPN)${REAL_ORDER ? ' — "actual order" is the real ' + DRAFT_YEAR + ' first round' : ''}.`;
  if (boardFailed) return `Board: full 7-round <b>sample</b> big board (${BOARD_DATA.length} placeholders) — couldn't reach the live draft service, so using the sample (with the 2025 order).`;
  return `Board: full 7-round <b>sample</b> big board (${BOARD_DATA.length} placeholders). Trying to load the real ${DRAFT_YEAR} class…`;
}

function applyBoard(prospects, source) {
  if (!Array.isArray(prospects)) return false;
  const clean = prospects.filter((p) => p && p.name).map((p) => ({ name: p.name, pos: p.pos || 'ATH', school: p.school || '' }));
  if (clean.length < 32) return false;
  BOARD_DATA = clean;
  boardSource = source;
  return true;
}
function applyOrder(order) {
  if (Array.isArray(order) && order.length === 32) { REAL_ORDER = order.map(normAbbr); return true; }
  return false;
}
// Instant: use a cached real board + order from a previous visit if we have one.
try {
  const c = JSON.parse(localStorage.getItem(BOARD_CACHE));
  if (c && c.prospects) { applyBoard(c.prospects, 'real'); applyOrder(c.order); }
} catch (_) {}

// Pull the real class in the background; updates the cache + setup note. Only
// affects drafts started AFTER it lands (an in-progress draft keeps its board).
function updateBoardNote() { const n = $('#board-note'); if (n) n.innerHTML = boardNoteHTML(); }

async function refreshRealBoard() {
  try {
    const r = await fetch(`${DRAFT_API}/api/draft/prospects?year=${DRAFT_YEAR}`, { cache: 'no-store' });
    if (!r.ok) throw new Error('bad status');
    const j = await r.json();
    if (applyBoard(j.prospects, 'real')) {
      applyOrder(j.order);
      try { localStorage.setItem(BOARD_CACHE, JSON.stringify({ ts: Date.now(), prospects: BOARD_DATA, order: REAL_ORDER })); } catch (_) {}
      updateBoardNote(); // update the note in place (don't rebuild the form)
    } else { boardFailed = true; updateBoardNote(); }
  } catch (_) { boardFailed = true; updateBoardNote(); } // offline / down → keep bundled board
}

// Build the board for the requested rounds. BOARD_DATA already covers a full
// 7-round class; generation here is only a safety net if it's ever short.
function buildBoard(rounds) {
  const target = rounds * 32 + 24;
  const board = BOARD_DATA.map((p) => ({ ...p }));
  let ci = 0;
  const usedNames = new Set(board.map((p) => p.name));
  while (board.length < target) {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    if (usedNames.has(name)) continue;
    usedNames.add(name);
    board.push({ name, pos: POS_CYCLE[ci++ % POS_CYCLE.length], school: pick(SCHOOLS) });
  }
  board.forEach((p, i) => { p.rank = i + 1; p.drafted = false; p.byOverall = null; });
  return board;
}

// --- Jimmy Johnson trade value chart (exact 1–64, decaying tail) ----------
const JJ = [3000, 2600, 2200, 1800, 1700, 1600, 1500, 1400, 1350, 1300,
  1250, 1200, 1150, 1100, 1050, 1000, 950, 900, 875, 850,
  800, 780, 760, 740, 720, 700, 680, 660, 640, 620,
  600, 590, 580, 560, 550, 540, 530, 520, 510, 500,
  490, 480, 470, 460, 450, 440, 430, 420, 410, 400,
  390, 380, 370, 360, 350, 340, 330, 320, 310, 300,
  292, 284, 276, 270];
const pickValue = (overall) => (overall <= 64 ? JJ[overall - 1] : Math.max(2, Math.round(270 - (overall - 64) * 1.6)));

// --- position grouping for filters ----------------------------------------
const POS_GROUP = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', OT: 'OL', IOL: 'OL', EDGE: 'DL', DT: 'DL', LB: 'LB', CB: 'DB', S: 'DB' };
const FILTERS = ['All', 'QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB'];
const projRound = (rank) => Math.min(7, Math.ceil(rank / 32));

// --- state ----------------------------------------------------------------
const STORE = 'draftsim:v1';
let S = null;               // live draft state
let ui = { filter: 'All', q: '', sideTab: 'picks' };

function serialize() {
  return {
    userTeam: S.userTeam, rounds: S.rounds, order: S.order, mode: S.mode, curr: S.curr,
    board: S.board,
    picks: S.picks.map((p) => ({ overall: p.overall, round: p.round, slot: p.slot, owner: p.owner, origin: p.origin, playerRank: p.player ? p.player.rank : null })),
  };
}
function save() { try { localStorage.setItem(STORE, JSON.stringify(serialize())); } catch (_) {} }
function load() {
  let raw; try { raw = JSON.parse(localStorage.getItem(STORE)); } catch (_) { return false; }
  if (!raw || !raw.board || !raw.picks) return false;
  const byRank = Object.fromEntries(raw.board.map((p) => [p.rank, p]));
  S = {
    userTeam: raw.userTeam, rounds: raw.rounds, order: raw.order, mode: raw.mode, curr: raw.curr,
    board: raw.board,
    picks: raw.picks.map((p) => ({ ...p, player: p.playerRank ? byRank[p.playerRank] : null })),
  };
  return true;
}

// --- draft flow -----------------------------------------------------------
function startDraft(cfg) {
  const picks = [];
  let overall = 1;
  for (let r = 1; r <= cfg.rounds; r++) {
    // "actual" mode: round 1 follows the real pick order (from ESPN if loaded,
    // else the bundled 2025 R1); later rounds use reverse-standings slotting.
    // Other modes use one order throughout.
    const ord = (cfg.mode === 'actual' && r === 1) ? (REAL_ORDER || ACTUAL_2025_R1) : cfg.order;
    ord.forEach((abbr, i) => picks.push({ overall: overall++, round: r, slot: i + 1, owner: abbr, origin: abbr, player: null }));
  }
  S = { userTeam: cfg.userTeam, rounds: cfg.rounds, order: cfg.order, mode: cfg.mode, picks, board: buildBoard(cfg.rounds), curr: 0 };
  save();
  showWarRoom();
}

const currentPick = () => S.picks[S.curr] || null;
const isUserOnClock = () => { const p = currentPick(); return p && p.owner === S.userTeam; };
const available = () => S.board.filter((p) => !p.drafted);

function makePick(pk, player) {
  player.drafted = true;
  player.byOverall = pk.overall;
  pk.player = player;
  S.curr++;
}

// CPU: best-available with a needs nudge and a little noise for variety.
function cpuPick(pk) {
  const needs = TEAM_NEEDS[pk.owner] || [];
  let best = null, bestScore = -1e9;
  for (const p of available()) {
    const score = (300 - p.rank) + (needs.includes(p.pos) ? 12 : 0) + Math.random() * 9;
    if (score > bestScore) { bestScore = score; best = p; }
  }
  if (best) makePick(pk, best);
}

function simOne() {
  const pk = currentPick();
  if (!pk || pk.owner === S.userTeam) return;
  cpuPick(pk);
  save(); renderWarRoom();
  if (!currentPick()) showRecap(); // that was the last pick — roll the recap
}
function simToUser() {
  let guard = 0;
  while (S.curr < S.picks.length && guard++ < 500) {
    const pk = currentPick();
    if (pk.owner === S.userTeam) break;
    cpuPick(pk);
  }
  save(); renderWarRoom();
  if (!currentPick()) showRecap();
}
function userDraft(rank) {
  const pk = currentPick();
  if (!pk || pk.owner !== S.userTeam) return;
  const p = S.board.find((x) => x.rank === rank && !x.drafted);
  if (!p) return;
  makePick(pk, p);
  save(); renderWarRoom();
  if (!currentPick()) showRecap();
}

// --- trades (pick-for-pick) ------------------------------------------------
const getPick = (overall) => S.picks.find((p) => p.overall === overall);
const remainingPicksOf = (abbr) => S.picks.filter((p) => !p.player && p.owner === abbr);

function evaluateTrade(partner, myOveralls, theirOveralls) {
  const myVal = myOveralls.reduce((s, o) => s + pickValue(o), 0);   // what partner receives
  const theirVal = theirOveralls.reduce((s, o) => s + pickValue(o), 0); // what partner gives up
  // CPU accepts if it comes out ahead or close to even (3% tolerance).
  const accept = myOveralls.length > 0 && theirOveralls.length > 0 && myVal >= theirVal * 0.97;
  return { myVal, theirVal, accept };
}
function executeTrade(partner, myOveralls, theirOveralls) {
  myOveralls.forEach((o) => (getPick(o).owner = partner));
  theirOveralls.forEach((o) => (getPick(o).owner = S.userTeam));
  save();
}

// ==========================================================================
// RENDER: setup screen
// ==========================================================================
function showSetup() {
  $('#warroom').hidden = true;
  $('#recap').hidden = true;
  $('#setup').hidden = false;
  const box = $('#setup');
  box.innerHTML = `
    <h2 class="ds-h">Set up your mock draft</h2>
    <div class="setup-grid">
      <label class="fld"><span>Your team</span>
        <select id="cfg-team">${TEAMS.map((t) => `<option value="${t.abbr}"${t.abbr === 'PHI' ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
      </label>
      <label class="fld"><span>Rounds</span>
        <select id="cfg-rounds">${[1, 2, 3, 4, 5, 6, 7].map((r) => `<option value="${r}"${r === 7 ? ' selected' : ''}>${r} round${r > 1 ? 's' : ''}</option>`).join('')}</select>
      </label>
    </div>
    <div class="fld"><span>Draft order</span>
      <div class="ds-radios" id="cfg-order">
        <label><input type="radio" name="order" value="actual" checked> Actual draft order</label>
        <label><input type="radio" name="order" value="random"> Random order</label>
        <label><input type="radio" name="order" value="custom"> Custom order</label>
      </div>
      <p class="ds-note" style="margin-top:8px">"Actual draft order" uses that year's real Round 1 pick order (trades and all — teams that traded up pick twice, teams that traded out sit R1 out). Rounds 2–7 follow reverse-standings order.</p>
    </div>
    <div id="custom-order" class="custom-order" hidden></div>
    <button id="start-btn" class="ds-btn primary">Enter the War Room →</button>
    <p class="ds-note" id="board-note">${boardNoteHTML()}</p>`;

  const customBox = $('#custom-order');
  let customList = [...BASE_ORDER];
  const drawCustom = () => {
    customBox.innerHTML = customList.map((abbr, i) => `
      <div class="co-row">
        <span class="co-pos">${i + 1}</span>
        <span class="co-team">${teamChip(abbr)}</span>
        <span class="co-move">
          <button data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">▲</button>
          <button data-down="${i}" ${i === customList.length - 1 ? 'disabled' : ''} aria-label="Move down">▼</button>
        </span>
      </div>`).join('');
    customBox.querySelectorAll('[data-up]').forEach((b) => (b.onclick = () => { const i = +b.dataset.up; [customList[i - 1], customList[i]] = [customList[i], customList[i - 1]]; drawCustom(); }));
    customBox.querySelectorAll('[data-down]').forEach((b) => (b.onclick = () => { const i = +b.dataset.down; [customList[i + 1], customList[i]] = [customList[i], customList[i + 1]]; drawCustom(); }));
  };

  $('#cfg-order').addEventListener('change', () => {
    const v = box.querySelector('input[name=order]:checked').value;
    customBox.hidden = v !== 'custom';
    if (v === 'custom') { customList = [...BASE_ORDER]; drawCustom(); }
  });

  $('#start-btn').onclick = () => {
    const userTeam = $('#cfg-team').value;
    const rounds = +$('#cfg-rounds').value;
    const mode = box.querySelector('input[name=order]:checked').value;
    let order = [...BASE_ORDER];
    if (mode === 'random') order = shuffle(BASE_ORDER);
    else if (mode === 'custom') order = [...customList];
    startDraft({ userTeam, rounds, order, mode });
  };
}

function teamChip(abbr) {
  const t = teamBy[abbr] || { name: abbr, color: '#444' };
  return `<span class="tchip"><img src="${logoURL(abbr)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'tchip-fb',textContent:'${abbr}',style:'background:${t.color}'}))"><b>${abbr}</b> <span class="tchip-name">${esc(t.name)}</span></span>`;
}

// ==========================================================================
// RENDER: war room
// ==========================================================================
function showWarRoom() {
  $('#setup').hidden = true;
  $('#recap').hidden = true;
  $('#warroom').hidden = false;
  renderWarRoom();
}

function renderWarRoom() {
  renderBar();
  renderBoard();
  renderSide();
}

function renderBar() {
  const bar = $('#wr-bar');
  const pk = currentPick();
  const done = !pk;
  const onClock = isUserOnClock();
  const userT = teamBy[S.userTeam];
  const clockHTML = done
    ? `<div class="clock done">✅ Draft complete <button id="a-recap" class="ds-btn primary">📊 Draft Recap</button></div>`
    : `<div class="clock ${onClock ? 'you' : ''}">
         <div class="clock-lbl">${onClock ? '🟢 YOU ARE ON THE CLOCK' : 'On the clock'}</div>
         <div class="clock-team">${teamChip(pk.owner)}${pk.owner !== pk.origin ? `<span class="via">via ${pk.origin}</span>` : ''}</div>
         <div class="clock-pick">Round ${pk.round} · Pick ${pk.slot} · #${pk.overall} overall</div>
       </div>`;
  bar.innerHTML = `
    <div class="wr-you">
      <div class="wr-you-lbl">Your team</div>
      <div class="wr-you-team" style="border-color:${userT.color}">${teamChip(S.userTeam)}</div>
    </div>
    ${clockHTML}
    <div class="wr-actions">
      <button id="a-sim1" class="ds-btn" ${done || onClock ? 'disabled' : ''}>Sim 1 pick</button>
      <button id="a-simuser" class="ds-btn primary" ${done || onClock ? 'disabled' : ''}>Sim to my pick</button>
      <button id="a-trade" class="ds-btn" ${done ? 'disabled' : ''}>💱 Trade</button>
      <button id="a-restart" class="ds-btn ghost">↻ Restart</button>
    </div>`;
  $('#a-sim1').onclick = simOne;
  $('#a-simuser').onclick = simToUser;
  $('#a-trade').onclick = openTrade;
  $('#a-restart').onclick = () => { if (confirm('Restart the draft and clear this session?')) { localStorage.removeItem(STORE); S = null; showSetup(); } };
  const recapBtn = $('#a-recap');
  if (recapBtn) recapBtn.onclick = showRecap;
}

function renderBoard() {
  const controls = $('#board-controls');
  const onClock = isUserOnClock();
  const hint = !currentPick() ? '' : (onClock ? '' : '<div class="board-hint">Sim to your pick to draft. CPU is on the clock.</div>');
  controls.innerHTML = `
    <div class="board-head">
      <h3>Best Available</h3>
      <input id="board-q" type="search" placeholder="Search player / school…" value="${esc(ui.q)}">
    </div>
    <div class="board-filters">${FILTERS.map((f) => `<button class="fchip ${ui.filter === f ? 'active' : ''}" data-f="${f}">${f}</button>`).join('')}</div>
    ${hint}`;
  controls.querySelector('#board-q').oninput = (e) => { ui.q = e.target.value; renderBoardRows(); };
  controls.querySelectorAll('.fchip').forEach((b) => (b.onclick = () => { ui.filter = b.dataset.f; renderBoard(); }));
  renderBoardRows();
}

function renderBoardRows() {
  const main = $('#board-list');
  const onClock = isUserOnClock();
  const q = ui.q.trim().toLowerCase();
  let list = available();
  if (ui.filter !== 'All') list = list.filter((p) => POS_GROUP[p.pos] === ui.filter);
  if (q) list = list.filter((p) => p.name.toLowerCase().includes(q) || p.school.toLowerCase().includes(q));
  list = list.slice(0, 60);
  if (!list.length) { main.innerHTML = '<div class="ds-empty">No available prospects match.</div>'; return; }
  main.innerHTML = list.map((p) => `
    <div class="prow">
      <span class="prank">${p.rank}</span>
      <span class="pinfo">
        <span class="pname">${esc(p.name)}</span>
        <span class="pmeta"><span class="ppos pos-${POS_GROUP[p.pos]}">${p.pos}</span> ${esc(p.school)} · proj R${projRound(p.rank)}</span>
      </span>
      <button class="ds-btn small draft-btn" data-rank="${p.rank}" ${onClock ? '' : 'disabled'}>Draft</button>
    </div>`).join('');
  main.querySelectorAll('.draft-btn').forEach((b) => (b.onclick = () => userDraft(+b.dataset.rank)));
}

function renderSide() {
  const tabs = $('#side-tabs');
  const T = [['picks', 'Your Picks'], ['log', 'Draft Log'], ['needs', 'Team Needs']];
  tabs.innerHTML = T.map(([k, lbl]) => `<button class="stab ${ui.sideTab === k ? 'active' : ''}" data-t="${k}">${lbl}</button>`).join('');
  tabs.querySelectorAll('.stab').forEach((b) => (b.onclick = () => { ui.sideTab = b.dataset.t; renderSide(); }));
  const c = $('#side-content');
  if (ui.sideTab === 'picks') c.innerHTML = sideYourPicks();
  else if (ui.sideTab === 'log') c.innerHTML = sideLog();
  else c.innerHTML = sideNeeds();
}

function sideYourPicks() {
  const mine = S.picks.filter((p) => p.owner === S.userTeam);
  const made = mine.filter((p) => p.player);
  const upcoming = mine.filter((p) => !p.player);
  const madeHTML = made.length ? made.map((p) => `
    <div class="mypick made">
      <span class="mp-pk">R${p.round} #${p.overall}</span>
      <span class="mp-player"><b>${esc(p.player.name)}</b><span class="pmeta"><span class="ppos pos-${POS_GROUP[p.player.pos]}">${p.player.pos}</span> ${esc(p.player.school)}</span></span>
    </div>`).join('') : '<div class="ds-empty">No picks made yet.</div>';
  const upHTML = upcoming.length ? upcoming.map((p) => `
    <div class="mypick">
      <span class="mp-pk">R${p.round} #${p.overall}</span>
      <span class="mp-player muted">${p.owner !== p.origin ? `acquired via ${p.origin}` : 'your selection'}</span>
    </div>`).join('') : '<div class="ds-empty">No remaining picks.</div>';
  return `<h4 class="side-h">Drafted (${made.length})</h4>${madeHTML}
    <h4 class="side-h">Upcoming (${upcoming.length})</h4>${upHTML}`;
}

function sideLog() {
  const made = S.picks.filter((p) => p.player);
  if (!made.length) return '<div class="ds-empty">No picks yet — sim to get things going.</div>';
  const rev = [...made].reverse();
  return rev.map((p) => `
    <div class="logrow ${p.owner === S.userTeam ? 'mine' : ''}">
      <span class="lg-pk">#${p.overall}</span>
      <span class="lg-team">${p.owner}</span>
      <span class="lg-player"><b>${esc(p.player.name)}</b> <span class="ppos pos-${POS_GROUP[p.player.pos]}">${p.player.pos}</span> <span class="muted">${esc(p.player.school)}</span></span>
    </div>`).join('');
}

function sideNeeds() {
  const needs = TEAM_NEEDS[S.userTeam] || [];
  const myPlayers = S.picks.filter((p) => p.owner === S.userTeam && p.player).map((p) => p.player.pos);
  return `<div class="needs-note">${teamBy[S.userTeam].name} pre-draft needs (sample):</div>
    <div class="needs-list">${needs.map((n) => {
      const filled = myPlayers.includes(n);
      return `<span class="need ${filled ? 'filled' : ''}">${n}${filled ? ' ✓' : ''}</span>`;
    }).join('')}</div>
    <p class="ds-note">✓ = you've drafted at that position. CPU teams weigh their own needs when picking.</p>`;
}

// ==========================================================================
// RENDER: draft recap & grade (shown when the last pick is in)
// ==========================================================================
// Per-pick score: how far a player fell to you (overall − board rank),
// scaled by draft position — a 10-spot steal at #8 is huge, at #200 it's
// noise. Positive = value, negative = reach.
const pickScore01 = (p) => clamp((p.overall - p.player.rank) / (6 + p.overall * 0.15), -2, 2);
const LETTERS = [[93, 'A+'], [88, 'A'], [83, 'A-'], [78, 'B+'], [72, 'B'], [66, 'B-'], [60, 'C+'], [54, 'C'], [48, 'C-'], [42, 'D+'], [36, 'D']];
function letterFor(score) {
  for (const [min, l] of LETTERS) if (score >= min) return l;
  return 'F';
}
const gradeColor = (letter) =>
  letter[0] === 'A' ? 'var(--accent)' : letter[0] === 'B' ? '#8fd14f'
  : letter[0] === 'C' ? 'var(--gold)' : letter[0] === 'D' ? '#ff9f43' : '#ff5a5a';
const VERDICTS = {
  A: 'Elite haul — you beat the board and hit your needs.',
  B: 'Solid draft — real value and a clear plan.',
  C: 'Average day at the podium — some value left on the board.',
  D: 'Rough one — reaches and needs left open.',
  F: 'The war room needs a hard reset.',
};

// Trades leave their fingerprints on the picks (owner vs origin), so the
// ledger is reconstructed from state — no separate trade log needed.
function tradeLedger() {
  const acquired = S.picks.filter((p) => p.owner === S.userTeam && p.origin !== S.userTeam);
  const sent = S.picks.filter((p) => p.origin === S.userTeam && p.owner !== S.userTeam);
  const av = acquired.reduce((s, p) => s + pickValue(p.overall), 0);
  const sv = sent.reduce((s, p) => s + pickValue(p.overall), 0);
  return { acquired, sent, av, sv, net: av - sv, any: acquired.length + sent.length > 0 };
}

function draftGrades() {
  const picks = S.picks.filter((p) => p.owner === S.userTeam && p.player);
  const graded = picks.map((p) => {
    const delta = p.overall - p.player.rank;
    const score = clamp(68 + pickScore01(p) * 16, 0, 100);
    return { p, delta, score, letter: letterFor(score) };
  });
  // Value vs the board — per-pick scores weighted by pick capital (early picks count more).
  let w = 0, ws = 0;
  graded.forEach((g) => { const wt = pickValue(g.p.overall); w += wt; ws += g.score * wt; });
  const valueScore = w ? ws / w : null;
  // Needs — of the needs you COULD have hit with the picks you made, how many did you?
  const needs = TEAM_NEEDS[S.userTeam] || [];
  const got = new Set(picks.map((x) => x.player.pos));
  const filled = needs.filter((n) => got.has(n));
  const chances = Math.min(picks.length, needs.length);
  const needsScore = chances ? clamp((filled.length / chances) * 100, 0, 100) : null;
  // Trades — net Jimmy Johnson chart value, if you made any.
  const trades = tradeLedger();
  const tradeScore = trades.any ? clamp(50 + trades.net / 10, 0, 100) : null;

  const parts = [];
  if (valueScore != null) parts.push([valueScore, trades.any ? 0.55 : 0.7]);
  if (needsScore != null) parts.push([needsScore, trades.any ? 0.25 : 0.3]);
  if (tradeScore != null) parts.push([tradeScore, 0.2]);
  const tw = parts.reduce((s, x) => s + x[1], 0);
  const overall = tw ? parts.reduce((s, x) => s + x[0] * x[1], 0) / tw : 50;
  const letter = letterFor(overall);
  return { picks, graded, valueScore, needs, filled, needsScore, trades, tradeScore, overall, letter };
}

const pickNote = (g) =>
  g.delta >= 5 ? `📈 fell ${g.delta} spots — board #${g.p.player.rank}`
  : g.delta <= -5 ? `📉 reach — ${-g.delta} spots above board #${g.p.player.rank}`
  : '✅ right on the board';

function recapHTML() {
  const G = draftGrades();
  const team = teamBy[S.userTeam] || { name: S.userTeam };
  const grade = (v) => (v == null ? '—' : letterFor(v));
  const bar = (label, v, note) => `
    <div class="rc-bar-row">
      <span class="rc-bar-lbl">${label}</span>
      <span class="rc-bar"><span class="rc-bar-fill" style="width:${v == null ? 0 : Math.round(v)}%;background:${v == null ? 'transparent' : gradeColor(letterFor(v))}"></span></span>
      <span class="rc-bar-grade" style="color:${v == null ? 'var(--muted)' : gradeColor(letterFor(v))}">${grade(v)}</span>
      <span class="rc-bar-note">${note}</span>
    </div>`;

  // header + component bars
  let html = `
    <div class="rc-head">
      <div class="rc-grade" style="border-color:${gradeColor(G.letter)};color:${gradeColor(G.letter)}">${G.letter}</div>
      <div class="rc-head-body">
        <h2 class="ds-h">${esc(team.name)} — Draft Recap</h2>
        <div class="rc-verdict">${VERDICTS[G.letter[0]] || VERDICTS.C}</div>
        <div class="ds-note">${S.rounds} round${S.rounds > 1 ? 's' : ''} · ${G.picks.length} pick${G.picks.length === 1 ? '' : 's'} · board: ${boardSource === 'real' ? `real ${DRAFT_YEAR} class` : 'sample'}</div>
      </div>
    </div>
    <div class="rc-bars">
      ${bar('Value vs board', G.valueScore, G.picks.length ? 'how far players fell to you' : 'no picks made')}
      ${bar('Needs filled', G.needsScore, G.needs.length ? `${G.filled.length} of ${G.needs.length}: ${G.needs.map((n) => G.filled.includes(n) ? `<b class="rc-hit">${n}✓</b>` : n).join(' · ')}` : 'no listed needs')}
      ${bar('Trade value', G.tradeScore, G.trades.any ? `${G.trades.net >= 0 ? '+' : ''}${G.trades.net} chart points net` : 'no trades made')}
    </div>`;

  // callouts: best steal / biggest reach
  const sorted = [...G.graded].sort((a, b) => b.delta - a.delta);
  const steal = sorted[0], reach = sorted[sorted.length - 1];
  const callout = (tag, cls, g) => `
    <div class="rc-callout ${cls}">
      <span class="rc-co-tag">${tag}</span>
      <b>${esc(g.p.player.name)}</b>
      <span class="pmeta"><span class="ppos pos-${POS_GROUP[g.p.player.pos] || 'DB'}">${esc(g.p.player.pos)}</span> R${g.p.round} #${g.p.overall} · board #${g.p.player.rank}</span>
    </div>`;
  const callouts = [];
  if (steal && steal.delta >= 5) callouts.push(callout('💎 Best value', 'steal', steal));
  if (reach && reach !== steal && reach.delta <= -5) callouts.push(callout('😬 Biggest reach', 'reach', reach));
  if (callouts.length) html += `<div class="rc-callouts">${callouts.join('')}</div>`;

  // every pick, graded
  html += `<h3 class="rc-h">Your picks, graded</h3>`;
  html += G.graded.length ? G.graded.map((g) => `
    <div class="rc-pick">
      <span class="rc-pick-grade" style="color:${gradeColor(g.letter)};border-color:${gradeColor(g.letter)}">${g.letter}</span>
      <span class="mp-pk">R${g.p.round} #${g.p.overall}</span>
      <span class="rc-pick-body">
        <b>${esc(g.p.player.name)}</b>
        <span class="pmeta"><span class="ppos pos-${POS_GROUP[g.p.player.pos] || 'DB'}">${esc(g.p.player.pos)}</span> ${esc(g.p.player.school)} · ${pickNote(g)}</span>
      </span>
    </div>`).join('') : '<div class="ds-empty">You made no selections — the grade rides on your trades.</div>';

  // trade ledger
  if (G.trades.any) {
    const led = (list) => list.map((p) => `<span class="rc-tp">R${p.round} #${p.overall} <i>(${pickValue(p.overall)})</i></span>`).join(' ') || '<span class="ds-empty">none</span>';
    html += `<h3 class="rc-h">Trades</h3>
      <div class="rc-trades">
        <div><span class="rc-t-lbl">Acquired</span> ${led(G.trades.acquired)} <b class="rc-hit">${G.trades.av}</b></div>
        <div><span class="rc-t-lbl">Sent away</span> ${led(G.trades.sent)} <b>${G.trades.sv}</b></div>
        <div class="rc-t-net" style="color:${G.trades.net >= 0 ? 'var(--accent)' : '#ff8a8a'}">Net: ${G.trades.net >= 0 ? '+' : ''}${G.trades.net} chart points</div>
      </div>`;
  }

  // position mix
  const mix = {};
  G.picks.forEach((p) => { const g = POS_GROUP[p.player.pos] || p.player.pos; mix[g] = (mix[g] || 0) + 1; });
  if (G.picks.length) {
    html += `<h3 class="rc-h">Position mix</h3><div class="needs-list">${Object.entries(mix).map(([pos, n]) => `<span class="need">${pos}${n > 1 ? ` ×${n}` : ''}</span>`).join('')}</div>`;
  }

  // full draft, round by round
  const byRound = {};
  S.picks.forEach((p) => { (byRound[p.round] = byRound[p.round] || []).push(p); });
  html += `<h3 class="rc-h">Full draft results</h3>` + Object.keys(byRound).map((r) => `
    <details class="rc-round"${r === '1' ? ' open' : ''}><summary>Round ${r}</summary>
      ${byRound[r].map((p) => `
        <div class="logrow ${p.owner === S.userTeam ? 'mine' : ''}">
          <span class="lg-pk">#${p.overall}</span>
          <span class="lg-team">${p.owner}</span>
          <span class="lg-player">${p.player ? `<b>${esc(p.player.name)}</b> <span class="ppos pos-${POS_GROUP[p.player.pos] || 'DB'}">${esc(p.player.pos)}</span> <span class="muted">${esc(p.player.school)}</span>` : '<span class="ds-empty">passed</span>'}</span>
        </div>`).join('')}
    </details>`).join('');

  html += `<div class="rc-actions">
    <button id="recap-back" class="ds-btn">← Back to the war room</button>
    <button id="recap-new" class="ds-btn primary">↻ Start a new draft</button>
  </div>
  <p class="ds-note">Grades weigh board value (how far players fell to you) most, then needs filled, then trade-chart net. For fun — every scout would grade it differently.</p>`;
  return html;
}

function showRecap() {
  $('#setup').hidden = true;
  $('#warroom').hidden = true;
  const box = $('#recap');
  box.hidden = false;
  box.innerHTML = recapHTML();
  $('#recap-back').onclick = showWarRoom;
  $('#recap-new').onclick = () => { if (confirm('Start a new draft and clear this one?')) { localStorage.removeItem(STORE); S = null; showSetup(); } };
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ==========================================================================
// RENDER: trade modal
// ==========================================================================
function openTrade() {
  const modal = $('#trade-modal');
  modal.classList.remove('hidden');
  const partners = TEAMS.filter((t) => t.abbr !== S.userTeam && remainingPicksOf(t.abbr).length);
  let partner = partners[0] ? partners[0].abbr : null;
  const sel = new Set(); // set of overall pick numbers selected (mine + theirs)

  const draw = () => {
    const myPicks = remainingPicksOf(S.userTeam);
    const theirPicks = partner ? remainingPicksOf(partner) : [];
    const mySel = myPicks.filter((p) => sel.has(p.overall)).map((p) => p.overall);
    const theirSel = theirPicks.filter((p) => sel.has(p.overall)).map((p) => p.overall);
    const evalr = evaluateTrade(partner, mySel, theirSel);
    const pickRow = (p) => `<label class="trade-pick"><input type="checkbox" data-o="${p.overall}" ${sel.has(p.overall) ? 'checked' : ''}> <span>R${p.round} · #${p.overall}</span> <span class="tp-val">${pickValue(p.overall)}</span></label>`;
    modal.querySelector('.trade-card').innerHTML = `
      <button class="modal-x" id="trade-x">×</button>
      <h3>Propose a trade</h3>
      <label class="fld"><span>Trade with</span>
        <select id="trade-partner">${partners.map((t) => `<option value="${t.abbr}" ${t.abbr === partner ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
      </label>
      <div class="trade-cols">
        <div class="trade-col">
          <h4>You send${mySel.length ? ` <span class="tp-total">${evalr.myVal}</span>` : ''}</h4>
          <div class="trade-picks">${myPicks.map(pickRow).join('') || '<div class="ds-empty">No picks.</div>'}</div>
        </div>
        <div class="trade-col">
          <h4>You get${theirSel.length ? ` <span class="tp-total">${evalr.theirVal}</span>` : ''}</h4>
          <div class="trade-picks">${theirPicks.map(pickRow).join('') || '<div class="ds-empty">No picks.</div>'}</div>
        </div>
      </div>
      <div class="trade-verdict ${evalr.accept ? 'ok' : 'no'}">
        ${!mySel.length || !theirSel.length ? 'Select picks on both sides.'
          : evalr.accept ? `👍 ${partner} would accept (you send ${evalr.myVal}, get ${evalr.theirVal})`
          : `👎 ${partner} rejects — needs more value (you send ${evalr.myVal}, get ${evalr.theirVal})`}
      </div>
      <div class="trade-actions">
        <button id="trade-propose" class="ds-btn primary" ${evalr.accept ? '' : 'disabled'}>Propose trade</button>
        <button id="trade-cancel" class="ds-btn ghost">Cancel</button>
      </div>`;
    // wire
    modal.querySelector('#trade-x').onclick = closeTrade;
    modal.querySelector('#trade-cancel').onclick = closeTrade;
    modal.querySelector('#trade-partner').onchange = (e) => { partner = e.target.value; sel.clear(); draw(); };
    modal.querySelectorAll('.trade-pick input').forEach((cb) => (cb.onchange = () => {
      const o = +cb.dataset.o; if (cb.checked) sel.add(o); else sel.delete(o); draw();
    }));
    modal.querySelector('#trade-propose').onclick = () => {
      if (!evalr.accept) return;
      executeTrade(partner, mySel, theirSel);
      closeTrade();
      renderWarRoom();
    };
  };
  draw();
}
function closeTrade() { $('#trade-modal').classList.add('hidden'); }

// ==========================================================================
// boot
// ==========================================================================
$('#trade-modal').querySelector('.modal-backdrop').addEventListener('click', closeTrade);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTrade(); });
if (load()) showWarRoom(); else showSetup();
refreshRealBoard(); // fetch the real 2025 class in the background
