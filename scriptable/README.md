# Scriptable widgets

Optional iOS Home Screen widgets for Sports-Hub, built with
[Scriptable](https://scriptable.app) (free). These are **companion scripts** —
they are NOT part of the static web app and don't deploy with GitHub Pages.
They run on the phone and read the same data sources the app uses.

iOS Home Screen widgets can only be made by a native app; a PWA can't create
them. Scriptable is the no–App-Store path: you write JavaScript that renders a
real widget. Unlike the browser, Scriptable makes native HTTP requests, so it
has **no CORS limits** and can call the backend directly.

## `SportsHubFantasy.js` — fantasy matchup

Shows the owner's baseball fantasy team (currently "Duran Duran"): team name +
record, a Leading/Trailing/Tied verdict, and the category-by-category score
(your value vs opponent), color-coded by who's winning each category.

- **Data source:** the Railway backend (`/api/fantasy/baseball/matchup` +
  `/roster`) — the same one the web app's Fantasy tab uses. The ESPN cookies
  live ONLY in Railway env vars, so **no keys or secrets are on the phone**.
- **Refresh:** ~every 30 min, on iOS's schedule (the backend caches 5 min, so
  it's never more than ~30 min stale). It's a glance, not real-time.
- **Tap:** opens the web app (`w.url = APP_URL`).
- **Sizes:** medium (recommended — fits 8 categories) or large (all categories
  + a last-updated timestamp). Small shows just the verdict.
- **Football:** change `const SPORT = "baseball"` to `"football"` once that
  league is configured on the backend.

### Install (one-time, on the phone)

1. Install **Scriptable** from the App Store.
2. Open Scriptable → **+** → paste in `SportsHubFantasy.js` → name it
   `Sports hub`. Tap **▶** to preview.
3. Long-press the Home Screen → **+** → **Scriptable** → choose **Medium** →
   add it → long-press the widget → **Edit Widget**.
4. Set **Script** = `Sports hub`. Leave **When Interacting** = **Open App**
   (the script supplies its own tap URL, so this opens the hub site). Leave
   **Parameter** blank.
5. Allow network access on first run.

If the header looks clipped, the content is too tall for the chosen size —
shrink the cells (`cellH`) or use a larger widget.
