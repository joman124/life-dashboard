# Life Dashboard — Project Spec

> **Move this file to `C:\Projects\life-dashboard\CLAUDE.md` once the project folder is created.**
> It is the authoritative reference for every build session.

---

## Project overview

A mobile-first personal metrics dashboard ("personal command center") — a real, locally-runnable web app with a backend so integrations actually work. The design replicates the aesthetic of the Perplexity-built "Ben Meer life dashboard": dark editorial feel, gold accent, serif display numerals, phone-first layout.

The reference design is `life-dashboard-v2.jsx` on the Desktop. Treat it as the behavior and visual reference, **not production code** — it used Claude artifact MCP stubs that failed at runtime.

**Project root:** `C:\Projects\life-dashboard`
**Platform:** Windows 10, Git at `C:\Git`, bash at `C:\Git\bin\bash.exe`

---

## Tech stack — decided

| Layer | Choice | Reason |
|---|---|---|
| Frontend + API | **Next.js 14** (App Router) | One repo, one dev server, API routes at `/app/api/`, no CORS config, simpler path to future deployment |
| Database | **better-sqlite3** | Zero-config, single `.db` file, synchronous API, no ORM layer, perfect for a single local user |
| Styling | **Tailwind CSS** with CSS variables for the design tokens | Utility classes for layout, custom properties for the exact color values |
| Google integration | **googleapis** npm package, OAuth 2.0 | Direct API calls, no MCP, no artifact stubs — the only way this actually works |
| Apple Health | **POST webhook** (`/api/health-import`) | HealthKit is on-device only; a webhook + iOS Shortcut is the only viable automation path |

---

## Design system — replicate exactly

### Colors (CSS custom properties)

```css
--bg:          #0E0C08   /* page background */
--card:        #17140E   /* card surface */
--card-inset:  #100E0A   /* nested inset areas */
--hairline:    #272217   /* card borders */
--gold:        #E5A83B   /* primary accent */
--gold-dim:    #8A6A2F   /* muted gold, progress track */
--text:        #EFEAE0   /* primary text */
--muted:       #9C937F   /* secondary text */
--faint:       #6B6354   /* placeholder/tertiary */
--green:       #5BC98C   /* positive delta */
--red:         #E07A6B   /* negative delta */
```

### Typography

- **Display / section headlines / big numbers:** Georgia, "Times New Roman", serif — used for metric values, tab headlines like "What actually moves what", "Choose what you track."
- **Body / UI chrome:** system-ui, -apple-system, sans-serif
- **Eyebrow labels:** 11px, uppercase, 0.14em letter-spacing, `var(--muted)`

### Layout

- Max content width: **480px**, centered
- Designed for 390px viewport width first
- Card radius: **16px**, 1px hairline border (`var(--hairline)`)
- Gold-tinted border (`var(--gold-dim)`) for highlighted/insight cards

### Delta pills

Rounded pills, small font, colored background tint.
- Green (`var(--green)`) + ↗ when direction is "good"
- Red (`var(--red)`) + ↘ when direction is "bad"
- "Good" direction is **metric-specific**: pickups going down = green; sleep going up = green

---

## Data model

### `metrics` table

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | e.g., `deep-work` |
| name | TEXT | e.g., `Deep Work` |
| emoji | TEXT | e.g., `🧠` |
| unit | TEXT | `h` \| `m` \| `count` \| `/10` |
| goal | REAL | numeric target |
| goalDirection | TEXT | `>=` or `<=` |
| step | REAL | stepper increment (e.g., 0.5) |
| max | REAL | stepper max (e.g., 16) |
| active | INTEGER | 0 or 1 |
| category | TEXT | `FOCUS` \| `BODY` \| `MIND` \| `CUSTOM` |
| description | TEXT | shown in Track tab |

### Default metrics (seed on first run)

| Metric | Emoji | Unit | Goal | Direction | Active |
|---|---|---|---|---|---|
| Deep Work | 🧠 | h | 4 | >= | yes |
| Phone Pickups | 📵 | count | 50 | <= | yes |
| Sleep | 😴 | h | 6.5 | >= | yes |
| Steps | 👟 | count | 8000 | >= | yes |
| Energy | ⚡ | /10 | 7 | >= | **no** |

### `entries` table

| Column | Type |
|---|---|
| id | INTEGER PK autoincrement |
| metricId | TEXT FK → metrics.id |
| date | TEXT | `YYYY-MM-DD` |
| value | REAL |

Unique constraint on `(metricId, date)` — upsert on conflict.

### `timeline` table

| Column | Type |
|---|---|
| id | INTEGER PK autoincrement |
| date | TEXT |
| time | TEXT | `HH:MM` |
| title | TEXT |
| detail | TEXT |
| source | TEXT | `calendar` \| `manual` \| null |

### `sync_state` table

| Column | Type |
|---|---|
| key | TEXT PK |
| value | TEXT |

Keys: `last_google_sync`, `today_inbox_count`.

---

## Seed data

On first run (empty DB), seed 30 days of plausible sample data:
- Sleep and deep work correlated strongly positive (r ≈ 0.70+) so Insights and Correlations demonstrate meaningfully on day one
- Phone pickups negatively correlated with deep work
- Steps and energy loosely correlated
- Port the `seed()` function from the reference artifact; the algorithm should produce values that look human, not uniform

---

## Features by tab

### Today

1. **Header:** "Good morning / afternoon / evening, [first name]" · today's date formatted · weekly scorecard badge (gold number circle)
2. **Inbox count:** today's Gmail thread count (from last sync) — small badge in header area
3. **Focus area cards** (one per active metric):
   - Eyebrow: `emoji NAME` (11px uppercase, muted)
   - Delta pill: vs trailing 7-day baseline excluding today (green/red + direction arrow + %)
   - Large serif value with unit
   - 7-day sparkline (gold bars, today highlighted)
   - Goal line text: "Goal ≥ 4.0h" (or ≤)
   - Thin gold progress bar toward goal (capped at 100%)
4. **Insight card** (gold border): auto-generated from the strongest Pearson r in the last 30 days across all active metric pairs with ≥ 8 paired data points. Phrase: "On days when your [A] is higher, your [B] tends to be [higher/lower] too — a pattern to test with intention, not a causal claim."
5. **Log Today:** stepper rows (− value +) per active metric; writes or upserts today's entry on change
6. **Timeline:** list of today's events sorted by time — monospace `HH:MM`, title, gold detail text, source badge when from Calendar

### Week

1. **Scorecard card:**
   - Score = (metrics meeting goal this week / total active metrics) × 100
   - ≥ 75: "Strong week." | ≥ 50: "Solid week — one or two metrics lagging." | else: "Rebuild week — pick one metric to win."
   - Grid of per-metric weekly averages with delta pills (vs previous week)
2. **Per-metric bar charts:**
   - 7 bars (Mon–Sun or trailing 7 days)
   - Today's bar: full `var(--gold)`; others: 35% opacity gold
   - Dashed gold goal line overlaid at goal height
   - "Best: X on {day}" in card header
   - Day-of-week + value labels under bars

### Trends

1. **30-day line chart per active metric:**
   - Gold line on dark card
   - Dashed grid lines
   - Dark tooltip on hover/touch (value + date)
2. **Correlations card — "What actually moves what":**
   - Top 3 metric pairs by |Pearson r| over last 30 days
   - Only pairs with ≥ 8 shared data points qualify
   - Row format: `🧠 Deep Work → 😴 Sleep` · "Strong positive · r = 0.71" · horizontal bar visual (center = 0, bar extends left/right)
   - Footer: "Correlation ≠ causation. These are patterns in your own data."

### Streaks 🔥

Per active metric:
- Flame icon + large serif day count (consecutive days meeting goal; today optional if not yet logged)
- Goal restated: "Goal ≥ 4.0h / day"
- 14-day grid of rounded squares: gold = goal met, dimmed = missed, most recent day full gold

### Track ⚙

1. **Toggle rows:** emoji · name · category eyebrow · description · gold iOS-style toggle. Toggling active immediately updates all other tabs.
2. **Add your own:**
   - Name input (live emoji preview via `autoEmoji`)
   - Unit select: hours / minutes / count / score out of 10
   - Goal direction: "at least" / "at most"
   - Goal number
   - Optional emoji override
   - Add button → inserts into DB, activates immediately
3. **Connectors panel** (see Integrations section)

---

## Emoji auto-assignment

Port `autoEmoji` from the reference file exactly. Keyword → emoji map:

| Keywords | Emoji |
|---|---|
| meditation | 🧘 |
| run | 🏃 |
| walk, steps | 👟 |
| gym | 🏋️ |
| read | 📚 |
| write | ✍️ |
| water | 💧 |
| sleep | 😴 |
| phone | 📵 |
| deep work, focus | 🧠 |
| pray, gratitude | 🙏 |
| cold | 🧊 |
| stretch, yoga | 🤸 |
| meals | 🍽️ |
| sun, outside | ☀️ |
| family | ❤️ |
| money | 💰 |
| learn | 🎓 |
| music | 🎵 |
| code | ⚙️ |
| sales, calls | 📞 |
| energy | ⚡ |
| dog | 🐕 |
| alpaca | 🦙 |

Deterministic fallback rotation (when no keyword matches): `🎯 ✨ 📈 🌱 🧩 🔆`

---

## Integrations

### Google Calendar + Gmail

**Setup (document step-by-step in project README):**

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → create a new project named `life-dashboard`
2. APIs & Services → Enable APIs → enable **Google Calendar API** and **Gmail API**
3. APIs & Services → OAuth consent screen → External → fill in app name (`Life Dashboard`), user support email → save
4. APIs & Services → Credentials → Create credentials → OAuth client ID → Application type: **Web application**
5. Authorized redirect URIs: `http://localhost:3000/api/auth/google/callback`
6. Download the credentials JSON → copy `client_id` and `client_secret` into `.env.local`:

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
GOOGLE_TOKEN_PATH=./data/google_token.json
```

7. In the Track tab → Connectors → "Connect Google" → opens OAuth consent → on approval, tokens stored at `GOOGLE_TOKEN_PATH` (gitignored)

**Scopes:**

```
https://www.googleapis.com/auth/calendar.readonly
https://www.googleapis.com/auth/gmail.readonly
```

**Sync behavior** (runs on `/api/sync/google` POST, also triggered on app load if last sync > 15 min ago):

- Pull today's calendar events → insert/replace rows in `timeline` table with `source = 'calendar'`
- Sum durations of events matching `/deep work|focus|writing|build/i` → upsert today's Deep Work entry
- Count today's Gmail inbox threads → write to `sync_state` as `today_inbox_count`

**Token refresh:** implement standard OAuth refresh flow; catch `invalid_grant` and set connector status to `token_expired`

**Connector status** (visible in Track → Connectors):
- `connected` — last sync timestamp shown
- `token_expired` — "Reconnect" button
- `error` — real error message surfaced (never fail silently)

---

### Apple Health — iOS Shortcut → Webhook

Apple Health has **no cloud API**. HealthKit is on-device only. The only automation path is an iOS Shortcut that POSTs to the local server.

**Endpoint:** `POST /api/health-import`

```json
{
  "date": "2026-06-11",
  "steps": 9336,
  "sleep": 7.6
}
```

- `date` optional, defaults to today
- Keys matched case/space-insensitively against metric `id` and `name`
- Auth: `Authorization: Bearer <HEALTH_IMPORT_TOKEN>` (generated at first run, displayed in Connectors panel, stored in `.env.local`)

**iOS Shortcut recipe (document in README):**

1. Open Shortcuts app → New Shortcut
2. Add action: **Find Health Samples** → Category: Activity, Type: Steps, Date: Today, Aggregate: Sum
3. Add action: **Find Health Samples** → Category: Sleep, Type: In Bed, Date: Yesterday (for last night), Aggregate: Sum Hours
4. Add action: **Text** → build JSON:
   ```
   {"date":"[current date]","steps":[steps result],"sleep":[sleep result]}
   ```
5. Add action: **Get Contents of URL** → URL: `http://<your-local-ip>:3000/api/health-import`, Method: POST, Headers: `Authorization: Bearer <token>`, Body: the Text above
6. Automate this Shortcut to run each morning at 7:00 AM

Note in README: your phone and PC must be on the same WiFi network. Use your PC's local IP (e.g., `192.168.1.x`), not `localhost`.

**Manual fallback:** keep a paste-import textarea in the Connectors panel (accepts the same JSON format).

---

### Cowork morning brief — outbound read feed

Every other connector pulls data in. This one is the only path data takes **out**: the morning brief in Claude Cowork fetches the week so far and today's focus each weekday morning, so the brief opens with the dashboard's read without anyone opening the app.

**Endpoint:** `GET /api/brief`

- Auth: its own read-only bearer token (`brief_read_token` in `sync_state`), presented as `Authorization: Bearer <token>` or `?token=<token>`. The query form is the one that matters — the brief fetches with a tool that cannot set headers.
- **Separate from the Apple Health token on purpose.** That one is a write credential held by a phone; this one is a read credential held by a scheduled task. Different blast radius, different reasons to re-issue, so they rotate independently (`lib/apiToken.ts` holds the shared crypto, `lib/health/token.ts` and `lib/briefToken.ts` pin the keys).
- Exempt in `middleware.ts` for the same reason `/api/health-import` is: it authenticates itself. The exemption is the exact path only — `/api/connectors/brief`, which reveals the token, stays behind the password gate.
- `?format=json` (default) returns the structured payload; `?format=text` returns the same brief as Markdown.
- Records `last_brief_fetch` in `sync_state` on every successful read, so the Connectors panel can tell a task that is quietly failing from one that has not fired yet.

**Window:** the calendar week to date — Monday → today, never a trailing seven days — compared against the **same weekdays** of the previous week. A partial week is reported as partial rather than padded.

**Content** (all derived arithmetic over the user's own entries; no model in the loop):

- per active metric: daily values Monday → today, average vs goal, days at goal, change vs the same days last week, streak, whether today is logged
- at most three focus items, in priority order: widest goal gap (stated as the daily move it takes) → a streak today decides → the correlation lever for that gap → a metric too sparse to analyse. Everything on track ⇒ recommend raising a goal, never invent a worry.
- top correlations, subject to the same ≥ 8 shared-day floor as the rest of the app

**Setup** is a paste, documented step by step in the README and reproduced in the Connectors panel: the panel builds the two `Sections:` lines the morning brief expects, with the token already in the URL.

**Future connectors note:** design the connector layer so adding OAuth-based wearable APIs (Oura Ring, Whoop, Fitbit — all have REST APIs) is a matter of adding a new `/api/auth/<provider>` route and a sync function. Document this pattern but do not implement it now.

---

## Phased build plan

### Phase 1 — Core app + data layer (no integrations)

**Goal:** the app runs, all five tabs work, data persists, custom metrics work.

- [ ] Next.js project scaffold with Tailwind, design tokens as CSS variables
- [ ] better-sqlite3 setup, schema migration on startup, seed function
- [ ] API routes: `GET /api/metrics`, `POST /api/metrics`, `PATCH /api/metrics/[id]`, `GET /api/entries`, `POST /api/entries`, `GET /api/timeline`
- [ ] All five tabs rendering with mock/seeded data
- [ ] Log Today steppers writing to DB
- [ ] Add custom metric (with autoEmoji) in Track tab
- [ ] Toggle active/inactive in Track tab
- [ ] Pearson correlation engine (30-day, ≥ 8 pairs)
- [ ] Streak calculation
- [ ] Delta pills with correct "good direction" logic
- [ ] Acceptance criteria 1, 2, 3, 7

**Done when:** `npm run dev` → all tabs functional on 390px viewport → add "Meditation, minutes, ≥15" → appears everywhere.

---

### Phase 2 — Google OAuth + Calendar/Gmail sync

**Goal:** real calendar events in Timeline, real inbox count, visible connector status.

- [ ] Google OAuth flow (connect, callback, token storage, refresh)
- [ ] `POST /api/sync/google` implementation
- [ ] Connector status UI (connected / token_expired / error with real message)
- [ ] Deep Work auto-entry from calendar event durations
- [ ] Acceptance criteria 4

**Done when:** Google connected → Today tab shows real calendar events in Timeline and real inbox count → disconnect/re-auth cycle works cleanly.

---

### Phase 3 — Apple Health webhook

**Goal:** iOS Shortcut posts health data that appears in the dashboard.

- [ ] `HEALTH_IMPORT_TOKEN` generated at first run, shown in Connectors panel
- [ ] `POST /api/health-import` with bearer auth and case-insensitive key matching
- [ ] Manual paste-import textarea as fallback
- [ ] README section with exact Shortcut recipe
- [ ] Acceptance criteria 5

**Done when:** posting the JSON manually via curl updates the dashboard → Shortcut documented step-by-step.

---

## Acceptance criteria

1. `npm run dev` starts on Windows 10 without manual steps beyond documented Google OAuth setup
2. All five tabs render and function on a 390px-wide viewport
3. Adding custom metric "Meditation, minutes, ≥15" auto-assigns 🧘 and appears in Today, Week, Trends, Streaks, and Correlations once it has data
4. Google sync populates real Timeline and inbox count; readable error states when auth fails (never silent)
5. Documented iOS Shortcut POSTs health data that appears in dashboard within one refresh
6. Correlations never render with fewer than 8 paired data points; update as real data accumulates
7. No data loss across server restarts

---

## Out of scope

- Multi-user auth
- Cloud deployment
- Push notifications
- Native iOS app
- Any feature not listed above

---

## File structure (target)

```
C:\Projects\life-dashboard\
├── CLAUDE.md                  ← this file (moved from Desktop)
├── .env.local                 ← gitignored; holds secrets
├── .gitignore
├── package.json
├── next.config.js
├── tailwind.config.js
├── data/
│   ├── life-dashboard.db      ← SQLite database (gitignored)
│   └── google_token.json      ← OAuth tokens (gitignored)
├── lib/
│   ├── db.ts                  ← better-sqlite3 singleton + schema init
│   ├── seed.ts                ← 30-day seed function
│   ├── correlations.ts        ← Pearson r engine
│   ├── brief.ts               ← week-to-date payload + focus for the Cowork brief
│   ├── apiToken.ts            ← shared bearer-token store (health + brief)
│   ├── briefToken.ts          ← the brief's read-only token key
│   ├── streaks.ts             ← streak calculation
│   ├── autoEmoji.ts           ← keyword → emoji map
│   └── google/
│       ├── auth.ts            ← OAuth flow, token refresh
│       └── sync.ts            ← calendar + gmail sync logic
├── app/
│   ├── layout.tsx             ← root layout, CSS variables
│   ├── page.tsx               ← shell with tab nav
│   ├── globals.css            ← design tokens, base styles
│   ├── api/
│   │   ├── metrics/           ← CRUD routes
│   │   ├── entries/           ← CRUD routes
│   │   ├── timeline/          ← read route
│   │   ├── sync/google/       ← trigger sync
│   │   ├── auth/google/       ← OAuth callback
│   │   └── health-import/     ← Apple Health webhook
│   └── components/
│       ├── tabs/
│       │   ├── Today.tsx
│       │   ├── Week.tsx
│       │   ├── Trends.tsx
│       │   ├── Streaks.tsx
│       │   └── Track.tsx
│       ├── MetricCard.tsx
│       ├── DeltaPill.tsx
│       ├── Sparkline.tsx
│       ├── BarChart.tsx
│       ├── LineChart.tsx
│       ├── StreakGrid.tsx
│       ├── InsightCard.tsx
│       ├── LogToday.tsx
│       ├── Timeline.tsx
│       └── ConnectorPanel.tsx
└── reference/
    └── life-dashboard-v2.jsx  ← original artifact (read-only reference)
```

---

## Big Beet orchestration guidance

This project is built under the **Big Beet** orchestration system. The following rules apply to every build session:

### Orchestration rules

1. **Every session opens with a phase check.** Read this file, identify the current phase, and confirm which acceptance criteria remain unmet before writing any code.
2. **Never collapse multi-domain work into a single agent.** A session that touches the DB schema, a React component, and an API route must delegate each domain to the appropriate specialist agent.
3. **Phase gates are hard stops.** Do not begin Phase 2 work until all Phase 1 acceptance criteria pass. Do not begin Phase 3 until Phase 2 is complete.
4. **Acceptance criteria are verified, not assumed.** Before marking a phase done, run the app and confirm each criterion against the real running server — not just by reading the code.
5. **No scope creep.** If a build session surfaces something useful but out of scope, note it in a `BACKLOG.md` and continue. Do not implement it.
6. **The design system is non-negotiable.** Every color, radius, font, and spacing decision must match the spec above. If a component deviates, fix it before the session ends.
7. **Silent failures are bugs.** Every integration must surface real error states in the UI. `console.log`-only errors do not count.
8. **`.env.local` and `data/` are always gitignored.** Never write secrets or the SQLite file to git.
9. **Anything the user has to do themselves is written as numbered step-by-step directions.** This applies everywhere — chat replies, README sections, error messages that suggest a fix. Never hand back a summary like "set up a Shortcut that reads Screen Time and posts it" or "reconnect Google." Write out every step in order, one action per step, naming the exact app, the exact screen, the exact button or menu item to tap, and what should be on screen when it works. Say where to start ("Open the Shortcuts app"), not just what to achieve. If a step needs a value from somewhere else in the app, say which tab to get it from. If a step is easy to get wrong, say what the wrong result looks like. Assume the user is following along on a phone with the instructions on another screen, and can't infer a missing step.

### Suggested agent delegation

| Domain | Delegate to |
|---|---|
| DB schema, SQL, better-sqlite3 | Backend Architect |
| Next.js API routes | Backend Architect |
| React components, Tailwind, design system | Frontend Developer |
| Pearson r, streak, delta math | AI Engineer or Analytics Reporter |
| Google OAuth, googleapis calls | Security Engineer (for auth) + Backend Architect (for API) |
| iOS Shortcut documentation | Technical Writer |
| README, setup docs | Technical Writer |
| End-to-end acceptance verification | Evidence Collector |

Big Beet coordinates all agents. The user interacts only with Big Beet.

---

*Last updated: 2026-06-11 · Status: Phase 1 not started*
