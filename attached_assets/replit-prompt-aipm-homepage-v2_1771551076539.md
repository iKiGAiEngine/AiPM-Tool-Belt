# AiPM Home Page Redesign — Full Replit Agent Prompt

## OBJECTIVE
Replace the existing AiPM home page with a new split-screen two-column layout. The entire page must fit within a standard 1920×1080 viewport with zero vertical scrolling. Keep all existing tool links, routing, and authentication logic intact — only the layout and visual design change.

---

## PAGE STRUCTURE OVERVIEW

```
┌─────────────────────────────────────────────────────┐
│  NAV BAR (full width, 48px tall)                    │
├─────────────────────────────────────────────────────┤
│  HERO (full width, compact — ~80px tall)            │
├──────────────────────┬──────────────────────────────┤
│                      │                              │
│   LEFT COLUMN        │   RIGHT COLUMN               │
│   Tool Tiles         │   Proposal Log HUD           │
│   (50% width)        │   (50% width)                │
│                      │                              │
│                      │                              │
└──────────────────────┴──────────────────────────────┘
```

The page uses `display:flex; flex-direction:column; height:100vh; overflow:hidden` on `<body>` so nothing scrolls.

---

## DESIGN TOKENS (CSS variables — do not change these values)

```css
:root {
  --gold: #C9A84C;
  --gold-dim: #8B6E2A;
  --bg: #0E0E0E;
  --bg2: #161616;
  --bg3: #1E1E1E;
  --bg4: #252525;
  --border: #2A2A2A;
  --text: #FFFFFF;
  --text-dim: #888888;
  --win: #3DAA6A;
}
```

Fonts: `Rajdhani` (headings, labels, badges) and `DM Sans` (body text). Both already loaded via Google Fonts.

---

## SECTION 1 — NAV BAR

No changes to the existing nav bar. Keep as-is including the hex logo, brand name, user menu, and logout button. Height: 48–56px. Background: `var(--bg2)`. Bottom border: `1px solid var(--border)`. `flex-shrink: 0`.

---

## SECTION 2 — HERO (compact)

Full-width, centered, `flex-shrink: 0`. Reduce padding significantly so it takes no more than ~80px of vertical space total.

```
padding: 14px 24px 10px
```

Elements inside (top to bottom):
1. `<h1>` — "**AiPM** Tool Belt" — Rajdhani, 28px, weight 700, letter-spacing 1px. "AiPM" in `var(--gold)`, "Tool Belt" in white.
2. Gold rule line — `width: 260px`, height `1px`, `background: linear-gradient(90deg, transparent, var(--gold), transparent)`, margin `6px auto 8px`
3. Eyebrow — "YOUR AI ASSISTED DIGITAL PM" — Rajdhani, 9px, weight 600, letter-spacing 3px, uppercase, color `var(--text-dim)`

No subtitle paragraph below the eyebrow. Remove it if present to save space.

---

## SECTION 3 — MAIN LAYOUT (two columns, fills remaining height)

```css
.main-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  padding: 12px 20px 16px;
  flex: 1;
  min-height: 0;
  align-items: start;
  overflow: hidden;
}
```

### LEFT COLUMN — Tool Tiles

```css
.tools-col {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  align-content: start;
}
```

**Use whatever tools/links currently exist in the Replit home page.** Mirror the exact tool names, descriptions, icons, href links, and disabled states from the current implementation. Do not invent or change any tool names, routes, or descriptions. Just apply the new visual style below to each tile.

**Tool tile visual style (apply to every tile):**

```css
.tool-card {
  position: relative;
  overflow: hidden;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 16px 10px 14px;
  cursor: pointer;
  text-decoration: none;
  color: inherit;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 8px;
  aspect-ratio: 1 / 1;
  transition: border-color .2s, transform .2s, box-shadow .2s;
}
/* Gold top bar */
.tool-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--gold-dim), var(--gold), var(--gold-dim));
}
.tool-card:hover {
  border-color: rgba(201,168,76,0.3);
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(0,0,0,0.4);
}
/* Icon circle */
.tool-icon {
  width: 38px; height: 38px;
  border-radius: 50%;
  background: rgba(201,168,76,0.1);
  display: flex; align-items: center; justify-content: center;
  font-size: 16px;
  transition: background .2s;
  flex-shrink: 0;
}
.tool-card:hover .tool-icon { background: rgba(201,168,76,0.2); }
/* Tool name */
.tool-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 3px;
}
/* Tool description */
.tool-desc {
  font-size: 10px;
  color: var(--text-dim);
  line-height: 1.35;
}
/* Coming Soon badge */
.csb {
  font-family: 'Rajdhani', sans-serif;
  font-size: 7px; font-weight: 700;
  letter-spacing: 2px; text-transform: uppercase;
  color: var(--gold);
  border: 1px solid rgba(201,168,76,0.4);
  border-radius: 3px;
  padding: 1px 5px;
  margin-bottom: 3px;
  display: inline-block;
}
/* Disabled tile */
.tool-card.disabled { opacity: .5; cursor: default; }
.tool-card.disabled:hover { transform: none; box-shadow: none; }
```

Each tile HTML structure:
```html
<a class="tool-card" href="/tools/[route]">
  <div class="tool-icon">[emoji or svg icon]</div>
  <div class="tool-text">
    <div class="tool-name">[Tool Name]</div>
    <div class="tool-desc">[Short description]</div>
  </div>
</a>
```

For disabled/coming soon tiles:
```html
<a class="tool-card disabled">
  <div class="tool-icon">[icon]</div>
  <div class="tool-text">
    <div class="csb">Coming Soon</div>
    <div class="tool-name">[Tool Name]</div>
    <div class="tool-desc">[Short description]</div>
  </div>
</a>
```

---

### RIGHT COLUMN — Proposal Log HUD

```css
.hud-col {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 48px - 80px - 28px); /* viewport minus nav, hero, padding */
  min-height: 400px;
}
```

The HUD card is a flex column that fills the full right column height. The header is pinned at top, footer pinned at bottom, and the scrollable bid list fills the middle.

---

#### HUD CARD WRAPPER

```css
.pl-card {
  position: relative;
  overflow: hidden;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 12px;
  color: inherit;
  display: flex;
  flex-direction: column;
  flex: 1;
  transition: border-color .3s, box-shadow .3s;
  cursor: pointer;
}
/* Gold top bar */
.pl-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--gold-dim), var(--gold), var(--gold-dim));
  z-index: 2;
}
.pl-card:hover {
  border-color: rgba(201,168,76,0.4);
  box-shadow: 0 8px 40px rgba(0,0,0,0.5), 0 0 60px rgba(201,168,76,0.06);
}
/* Radial glow on hover */
.pl-glow {
  position: absolute; inset: 0;
  background: radial-gradient(ellipse at 50% 0%, rgba(201,168,76,0.06), transparent 65%);
  opacity: 0; transition: opacity .4s; pointer-events: none;
}
.pl-card:hover .pl-glow { opacity: 1; }
```

Clicking anywhere on the card navigates to `/tools/proposal-log`. Use `onclick="window.location='/tools/proposal-log'"` or the equivalent router push in React. Do not use an `<a>` tag wrapper as it conflicts with inner `<a>` folder links.

---

#### HUD CARD HEADER (pinned top, flex-shrink: 0)

```css
.pl-header {
  padding: 14px 20px 12px;
  display: flex; align-items: center; justify-content: space-between;
  border-bottom: 1px solid var(--border);
  position: relative; z-index: 1;
  flex-shrink: 0;
}
.pl-header-left { display: flex; align-items: center; gap: 12px; }
.pl-icon {
  width: 40px; height: 40px; border-radius: 10px; flex-shrink: 0;
  background: rgba(201,168,76,0.12);
  border: 1px solid rgba(201,168,76,0.25);
  display: flex; align-items: center; justify-content: center;
  font-size: 18px;
  transition: background .3s, border-color .3s;
}
.pl-card:hover .pl-icon { background: rgba(201,168,76,0.2); border-color: rgba(201,168,76,0.45); }
.pl-title { font-size: 15px; font-weight: 600; color: var(--text); margin-bottom: 1px; }
.pl-sub { font-size: 11px; color: var(--text-dim); }
.pl-header-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
/* Estimator initials badge */
.pl-badge {
  font-family: 'Rajdhani', sans-serif; font-size: 13px; font-weight: 700;
  letter-spacing: 1px; color: var(--gold);
  background: rgba(201,168,76,0.1); border: 1px solid rgba(201,168,76,0.3);
  border-radius: 6px; padding: 4px 10px;
}
/* Open button */
.pl-open {
  font-family: 'Rajdhani', sans-serif; font-size: 10px; font-weight: 700;
  letter-spacing: 1.5px; text-transform: uppercase; color: var(--gold);
  border: 1px solid rgba(201,168,76,0.3); border-radius: 6px;
  padding: 6px 12px; transition: all .2s; white-space: nowrap;
}
.pl-card:hover .pl-open { background: rgba(201,168,76,0.1); border-color: rgba(201,168,76,0.6); }
```

Header HTML:
```html
<div class="pl-header">
  <div class="pl-header-left">
    <div class="pl-icon">📋</div>
    <div>
      <div class="pl-title">Proposal Log</div>
      <div class="pl-sub">Your active bids · personalized view</div>
    </div>
  </div>
  <div class="pl-header-right">
    <div class="pl-badge">[ESTIMATOR INITIALS from auth]</div>
    <div class="pl-open">Open →</div>
  </div>
</div>
```

The estimator initials badge should pull from the logged-in user session (e.g. `user.initials` or `user.name` first+last initials). Fall back to "HK" if unavailable.

---

#### HUD SCROLLABLE BODY (flex: 1, fills middle)

```css
.pl-hud-wrap {
  position: relative; z-index: 1;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
/* Fade gradient at bottom to hint scrollability */
.pl-hud-wrap::after {
  content: '';
  position: absolute; bottom: 0; left: 0; right: 0;
  height: 28px;
  background: linear-gradient(transparent, var(--bg2));
  pointer-events: none; z-index: 3;
}
.pl-hud {
  height: 100%;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(201,168,76,0.3) transparent;
}
.pl-hud::-webkit-scrollbar { width: 3px; }
.pl-hud::-webkit-scrollbar-track { background: transparent; }
.pl-hud::-webkit-scrollbar-thumb { background: rgba(201,168,76,0.35); }
```

---

#### HUD SECTION BLOCKS

Each of the 3 sections (Newly Assigned, Due This Week, Active Pipeline) uses this identical structure. No borders between sections.

```css
.hud-block { border-bottom: none; }
.hud-head {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 20px 5px;
}
.hud-block:first-child .hud-head { padding-top: 8px; }

/* Section label */
.hud-label {
  font-family: 'Rajdhani', sans-serif; font-size: 11px; font-weight: 700;
  letter-spacing: 2px; text-transform: uppercase;
  display: flex; align-items: center; gap: 6px;
  white-space: nowrap; flex-shrink: 0;
}
.lbl-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; }

/* Newly Assigned = gold pulsing dot */
.lbl-new { color: #C9A84C; }
.lbl-new .lbl-dot { background: #C9A84C; animation: pdot 2.5s ease infinite; }

/* Due This Week = red dot */
.lbl-hot { color: #E05050; }
.lbl-hot .lbl-dot { background: #E05050; }

/* Active Pipeline = muted blue-gray dot */
.lbl-pipe { color: #8899AA; }
.lbl-pipe .lbl-dot { background: #8899AA; }

@keyframes pdot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: .3; transform: scale(.5); }
}

/* Horizontal rule between label and count */
.hud-rule { flex: 1; height: 1px; background: var(--border); }

/* Bid count */
.hud-count {
  font-family: 'Rajdhani', sans-serif; font-size: 11px; font-weight: 700;
  color: var(--text-dim); white-space: nowrap; flex-shrink: 0;
}
```

Section header HTML (same for all three, only class and text differ):
```html
<div class="hud-head">
  <div class="hud-label lbl-new">  <!-- or lbl-hot / lbl-pipe -->
    <div class="lbl-dot"></div>Newly Assigned
  </div>
  <div class="hud-rule"></div>
  <div class="hud-count" id="cnt-new">2 bids</div>
</div>
```

---

#### BID ROWS

All rows across all 3 sections share the same base CSS. No left border accents, no background fills.

```css
.hud-rows { display: flex; flex-direction: column; padding: 2px 0 10px; }

/* Standard row — 3 columns: [name] [folder] [due pill] */
.bid-row {
  display: grid;
  grid-template-columns: 1fr 24px 72px;
  align-items: center;
  gap: 8px;
  padding: 6px 20px;
  background: transparent;
  transition: background .15s, transform .2s;
}
.bid-row:hover { background: rgba(255,255,255,0.03); }
.pl-card:hover .bid-row { transform: translateX(2px); }

/* Newly Assigned rows only — 4 columns: [name] [ack btn] [folder] [due pill] */
.r-new { grid-template-columns: 1fr 26px 24px 72px; }
```

**Project name cell:**
```css
.bid-name {
  font-size: 14px; font-weight: 500;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  min-width: 0;
}
```

**Folder button (opens SharePoint/network path, does NOT navigate the page):**
```css
.bid-folder {
  display: flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 3px;
  background: rgba(201,168,76,0.08);
  border: 1px solid rgba(201,168,76,0.15);
  font-size: 11px; cursor: pointer; text-decoration: none;
  color: var(--text-dim);
  transition: all .15s; justify-self: center;
}
.bid-folder:hover {
  border-color: rgba(201,168,76,0.5);
  background: rgba(201,168,76,0.15);
  color: #C9A84C;
}
```
Use `onclick="event.stopPropagation()"` on folder buttons to prevent the card's navigate-to-proposal-log click from firing. The folder link opens the project folder URL in a new tab.

**Due date pill:**
```css
.bid-due {
  width: 72px;
  font-family: 'Rajdhani', sans-serif; font-weight: 700;
  padding: 3px 5px; border-radius: 3px;
  text-align: center; line-height: 1.25;
  display: flex; flex-direction: column; align-items: center;
  justify-self: center;
}
.bid-due .dd { font-size: 13px; }   /* date: e.g. "Tomorrow" or "14/03" */
.bid-due .bd { font-size: 11px; opacity: .6; }  /* business days: e.g. "1 bd" */

/* Urgency color variants */
.d-hot  { color: #E05050; border: 1px solid rgba(192,57,43,0.4); }   /* 1–2 bd */
.d-warm { color: #E09050; border: 1px solid rgba(224,123,0,0.35); }  /* 3–4 bd */
.d-dim  { color: var(--text-dim); border: 1px solid rgba(255,255,255,0.07); } /* 5+ bd */
```

Due pill HTML:
```html
<div class="bid-due d-hot">
  <span class="dd">Tomorrow</span>
  <span class="bd">1 bd</span>
</div>
```

**Acknowledge button (Newly Assigned rows only, column 2):**
```css
.ack-btn {
  width: 24px; height: 24px; border-radius: 4px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.1);
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; cursor: pointer; color: var(--text-dim);
  user-select: none; transition: all .2s; justify-self: center;
}
.ack-btn:hover {
  background: rgba(61,170,106,0.15);
  border-color: rgba(61,170,106,0.5);
  color: #3DAA6A;
  transform: scale(1.1);
}
```

**Acknowledge behavior (JavaScript):**

When a user clicks the ✓ button on a Newly Assigned row:
1. The button flashes green (`background: rgba(61,170,106,0.2)`, `color: #3DAA6A`)
2. After 300ms: animate the row out — `opacity → 0`, `max-height → 0`, `padding → 0` over 450ms
3. After animation completes: remove the row from the DOM
4. Update the section count badge to reflect the new count (e.g. "1 bid" or "0 bids")
5. When count reaches 0: clear the row list entirely (no "All acknowledged" message — leave it empty so the section collapses)
6. The ack button must call `event.stopPropagation()` to prevent the card from navigating to proposal log

```javascript
function ack(e, rowId, countId, listId) {
  e.preventDefault();
  e.stopPropagation();
  const row = document.getElementById(rowId);
  if (!row) return;
  const btn = row.querySelector('.ack-btn');
  btn.style.background = 'rgba(61,170,106,0.2)';
  btn.style.borderColor = 'rgba(61,170,106,0.5)';
  btn.style.color = '#3DAA6A';
  setTimeout(() => {
    row.style.transition = 'opacity .3s, max-height .4s .1s, padding .3s, margin .3s';
    row.style.opacity = '0';
    row.style.maxHeight = '0';
    row.style.paddingTop = '0';
    row.style.paddingBottom = '0';
    row.style.marginTop = '0';
    setTimeout(() => {
      row.remove();
      const list = document.getElementById(listId);
      const rem = list ? list.querySelectorAll('.bid-row').length : 0;
      const cEl = document.getElementById(countId);
      if (cEl) cEl.textContent = rem + ' bid' + (rem !== 1 ? 's' : '');
      if (list && rem === 0) list.innerHTML = '';
    }, 450);
  }, 300);
}
```

---

#### THE THREE SECTIONS IN ORDER

**Section 1 — Newly Assigned** (gold label, pulsing dot)
- Shows bids assigned to the logged-in estimator that have not yet been acknowledged
- Rows use `.r-new` grid (4 columns) with ack button in column 2
- Due pill uses `.d-dim` (these are new assignments, not urgency-coded)
- Section id: `id="new-list"`, count id: `id="cnt-new"`

**Section 2 — Due This Week** (red label)
- Shows bids due within the next 7 business days assigned to the logged-in estimator
- Rows use standard 3-column grid (no ack button)
- Due pill color: `.d-hot` for 1–2 bd, `.d-warm` for 3–4 bd, `.d-dim` for 5–7 bd
- Date display: show "Tomorrow" if 1 bd, otherwise show day abbreviation + date e.g. "Thu 20/02"
- Business day count below date e.g. "3 bd"

**Section 3 — Active Pipeline** (blue-gray label)
- Shows all other active bids assigned to the logged-in estimator (beyond 7 bd)
- Rows use standard 3-column grid (no ack button)
- All due pills use `.d-dim`

---

#### HUD CARD FOOTER (pinned bottom, flex-shrink: 0)

```css
.pl-footer {
  padding: 10px 20px 12px;
  border-top: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between;
  position: relative; z-index: 1;
  flex-shrink: 0;
}
.pl-footer-note { font-size: 10px; color: var(--text-dim); }
.pl-footer-cta {
  font-family: 'Rajdhani', sans-serif; font-size: 11px; font-weight: 700;
  letter-spacing: 1px; color: #C9A84C;
  display: flex; align-items: center; gap: 4px; transition: gap .2s;
}
.pl-card:hover .pl-footer-cta { gap: 8px; }
```

Footer HTML:
```html
<div class="pl-footer">
  <div class="pl-footer-note">Your bids only &nbsp;·&nbsp; 📁 opens folder &nbsp;·&nbsp; ✓ to acknowledge</div>
  <div class="pl-footer-cta">Open Full Log <span>→</span></div>
</div>
```

---

## SECTION 4 — NO-SCROLL GUARANTEE

Apply the following to ensure the page never scrolls vertically on a standard 1080p screen:

```css
html, body {
  height: 100%;
  overflow: hidden;
}
body {
  display: flex;
  flex-direction: column;
}
.main-layout {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.hud-col {
  height: calc(100vh - 48px - 80px - 28px);
  min-height: 0;
}
.pl-hud-wrap {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.pl-hud {
  height: 100%;
  overflow-y: auto; /* only the bid list scrolls, not the page */
}
```

---

## SECTION 5 — RESPONSIVE FALLBACK (mobile)

```css
@media (max-width: 720px) {
  html, body { overflow: auto; }
  .main-layout {
    grid-template-columns: 1fr;
    overflow: visible;
  }
  .hud-col { height: auto; }
  .pl-hud { max-height: 360px; height: auto; }
}
```

---

## SECTION 6 — ANIMATIONS

```css
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: none; }
}
.page-hero   { animation: fadeUp .35s ease both; }
.hud-col     { animation: fadeUp .35s ease .08s both; }
.tool-card:nth-child(1) { animation: fadeUp .3s ease .05s both; }
.tool-card:nth-child(2) { animation: fadeUp .3s ease .09s both; }
.tool-card:nth-child(3) { animation: fadeUp .3s ease .13s both; }
.tool-card:nth-child(4) { animation: fadeUp .3s ease .17s both; }
.tool-card:nth-child(5) { animation: fadeUp .3s ease .21s both; }
```

---

## WHAT NOT TO CHANGE

- Do not modify any existing API endpoints, authentication logic, or session handling
- Do not change any tool routes or href values — use whatever routes currently exist in the Replit project
- Do not change the Proposal Log tool itself (`/tools/proposal-log`) — only the home page HUD widget
- Do not change the nav bar component
- Preserve all existing React context, state management, and data fetching for the proposal log HUD data
EOF