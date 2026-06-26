// ===========================================================================
// SportsHub Fantasy — Scriptable Home Screen widget
// Shows your baseball fantasy matchup (Duran Duran): verdict, record, and the
// category-by-category score, pulled from your Railway backend (same one the
// Sports-Hub web app uses). No keys/secrets on the phone — the backend holds
// the ESPN cookies. Works as small / medium / large; medium recommended.
//
// To tweak: change SPORT to "football" once that league is configured.
// ===========================================================================

const API = "https://sports-hub-production.up.railway.app";
const SPORT = "baseball";
const APP_URL = "https://mcdermottj639.github.io/Sports-Hub/"; // tap widget -> open app

// palette (matches the web app)
const BG1 = new Color("#16211F"), BG2 = new Color("#0B1311");
const GREEN = new Color("#3AD29F"), GOLD = new Color("#FFD166"), RED = new Color("#FF6B6B");
const WHITE = Color.white(), MUTED = new Color("#8A9A95");

// --- helpers ---------------------------------------------------------------
async function getJSON(path) {
  try {
    const r = new Request(API + path);
    r.timeoutInterval = 15;
    return await r.loadJSON();
  } catch (e) {
    return null;
  }
}

// Format a category value like the app does (ERA/WHIP -> 2dp, rate -> .XXX).
function fmtCat(cat, v) {
  if (v == null || v === "") return "–";
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  const c = String(cat).toUpperCase();
  if (/ERA|WHIP/.test(c)) return n.toFixed(2);
  if (/AVG|OBP|SLG|OPS|PCT/.test(c)) return n.toFixed(3).replace(/^0(?=\.)/, "");
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
const fmtScore = (v) => (v == null ? "–" : (Number.isInteger(Number(v)) ? String(v) : Number(v).toFixed(1)));
function recStr(r) {
  if (!r || (r.wins == null && r.losses == null)) return "";
  return `${r.wins || 0}-${r.losses || 0}${r.ties ? "-" + r.ties : ""}`;
}

// --- fetch -----------------------------------------------------------------
const family = config.widgetFamily || "medium";
const [matchup, roster] = await Promise.all([
  getJSON(`/api/fantasy/${SPORT}/matchup`),
  getJSON(`/api/fantasy/${SPORT}/roster`),
]);

// --- build widget ----------------------------------------------------------
const w = new ListWidget();
const grad = new LinearGradient();
grad.colors = [BG1, BG2];
grad.locations = [0, 1];
w.backgroundGradient = grad;
w.url = APP_URL;
w.setPadding(10, 14, 10, 14);

// header: team name + record
const teamName = (matchup && matchup.me && matchup.me.team) || (roster && roster.team) || "My Team";
const head = w.addStack();
head.centerAlignContent();
const nm = head.addText(teamName);
nm.font = Font.boldSystemFont(family === "small" ? 13 : 15);
nm.textColor = WHITE;
nm.lineLimit = 1;
const rec = recStr(roster && roster.record);
if (rec) {
  head.addSpacer();
  const rt = head.addText(rec);
  rt.font = Font.mediumSystemFont(12);
  rt.textColor = MUTED;
}
w.addSpacer(6);

// body
if (!matchup || !matchup.me) {
  const t = w.addText("Couldn't reach your league.");
  t.font = Font.systemFont(12); t.textColor = MUTED;
  const t2 = w.addText("Tap to open the app, or try again later.");
  t2.font = Font.systemFont(10); t2.textColor = MUTED;
} else if (!matchup.categories || !matchup.categories.length) {
  // points league or no active matchup this week
  const t = w.addText(matchup.note || "No active category matchup.");
  t.font = Font.systemFont(12); t.textColor = MUTED;
  if (matchup.me.score != null) {
    w.addSpacer(4);
    const s = w.addText(`${fmtScore(matchup.me.score)} – ${fmtScore(matchup.opponent && matchup.opponent.score)}`);
    s.font = Font.boldSystemFont(22); s.textColor = WHITE;
  }
} else {
  const won = matchup.me.catsWon || 0;
  const lost = (matchup.opponent && matchup.opponent.catsWon) || 0;
  const tied = matchup.tied || 0;
  const verdict = won > lost ? `Leading ${won}–${lost}` : won < lost ? `Trailing ${won}–${lost}` : `Tied ${won}–${lost}`;
  const vcolor = won > lost ? GREEN : won < lost ? RED : GOLD;

  const vrow = w.addStack();
  vrow.centerAlignContent();
  const vt = vrow.addText(verdict);
  vt.font = Font.boldSystemFont(family === "small" ? 16 : 19);
  vt.textColor = vcolor;
  if (tied) {
    vrow.addSpacer(6);
    const tt = vrow.addText(`${tied} tied`);
    tt.font = Font.systemFont(11); tt.textColor = MUTED;
  }
  vrow.addSpacer();
  if (family !== "small" && matchup.opponent) {
    const opp = vrow.addText(`vs ${matchup.opponent.team}`);
    opp.font = Font.systemFont(11); opp.textColor = MUTED; opp.lineLimit = 1;
  }

  // category grid (medium/large only — small has no room)
  if (family !== "small") {
    const perRow = family === "large" ? 5 : 4;
    const maxCells = family === "large" ? 15 : 8;
    const cats = matchup.categories.slice(0, maxCells);
    const cellW = family === "large" ? 84 : 78;
    const cellH = family === "large" ? 40 : 34;

    w.addSpacer(8);
    let row;
    cats.forEach((c, i) => {
      if (i % perRow === 0) {
        if (i > 0) w.addSpacer(5);
        row = w.addStack();
        row.spacing = 6;
      }
      const res = (c.result || "").toUpperCase();
      const cell = row.addStack();
      cell.layoutVertically();
      cell.size = new Size(cellW, cellH);
      cell.cornerRadius = 8;
      cell.setPadding(4, 6, 4, 6);
      cell.backgroundColor = res === "WIN" ? new Color("#3AD29F", 0.14)
        : res === "LOSS" ? new Color("#FF6B6B", 0.12)
        : new Color("#FFFFFF", 0.05);
      const cn = cell.addText(String(c.cat).toUpperCase());
      cn.font = Font.boldSystemFont(9); cn.textColor = MUTED; cn.lineLimit = 1;
      const vals = cell.addStack();
      vals.centerAlignContent(); vals.spacing = 4;
      const me = vals.addText(fmtCat(c.cat, c.me));
      me.font = Font.boldSystemFont(12);
      me.textColor = res === "WIN" ? GREEN : res === "LOSS" ? RED : WHITE;
      const op = vals.addText(fmtCat(c.cat, c.opp));
      op.font = Font.systemFont(11); op.textColor = MUTED;
    });
    if (matchup.categories.length > maxCells) {
      w.addSpacer(4);
      const more = w.addText(`+${matchup.categories.length - maxCells} more categories`);
      more.font = Font.systemFont(9); more.textColor = MUTED;
    }
  }
}

// footer: last-updated timestamp (large only — medium has no spare height)
if (family === "large") {
  w.addSpacer(6);
  const df = new DateFormatter();
  df.dateFormat = "h:mm a";
  const foot = w.addText(`Updated ${df.string(new Date())}`);
  foot.font = Font.systemFont(9);
  foot.textColor = MUTED;
}

// refresh roughly every 30 min (iOS decides the exact timing)
w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);

// present
if (config.runsInWidget) {
  Script.setWidget(w);
} else {
  if (family === "small") w.presentSmall();
  else if (family === "large") w.presentLarge();
  else w.presentMedium();
}
Script.complete();
