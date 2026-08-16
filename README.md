# Life Dashboard

Life Dashboard is a personal command center for your day, your week, and your habits — a mobile-first, single-user web app with a dark editorial look and a gold accent. Five tabs (**Today**, **Week**, **Trends**, **Streaks**, **Track**) turn the metrics you care about — deep work, sleep, steps, phone pickups, mood, and anything custom you add — into sparklines, scorecards, streaks, and plain-language correlations like "on days your sleep is higher, your deep work tends to be higher too." It runs entirely on your machine: a local Next.js server and a single SQLite file. No cloud account, no signup, no monthly fee — just your data, on your computer. Add it to your phone's home screen and it launches like a native app.

## Requirements

- Windows 10
- [Node.js](https://nodejs.org/) 18 or later (this project is verified on Node 24)
- npm (comes bundled with Node)
- Git Bash — optional, only needed if you prefer a bash shell over PowerShell for the commands below

## Quick start

```bash
cd C:\Projects\life-dashboard
npm install
npm run dev
```

Then open **http://localhost:3000**.

On the very first run, Life Dashboard seeds 30 days of realistic sample data automatically — so Today, Week, Trends, and Streaks all have something to show you immediately, with no setup required. Your data lives in `data/life-dashboard.db` (a single SQLite file, gitignored) and survives server restarts.

**Once you start logging for real, clear the sample data**: Track → Your data → **Clear all logged history**. It deletes every entry but keeps your metrics, so your streaks and correlations reflect only you. Until you do, the numbers on your dashboard are partly generated.

## Everyday use

**Logging.** The Today tab has a stepper for each active metric. Above them is a strip of the last seven days — tap any day to log or correct it, so forgetting to open the app on Tuesday doesn't cost you Tuesday. A dot under a day means it already has at least one entry, which makes gaps in the week obvious at a glance. Streaks are forgiving about *today* specifically: an unlogged today doesn't break a run, but a logged miss does.

**Steppers or form.** The log card has a **Steppers / Form** toggle. Steppers suit nudging deep work by half an hour; the form suits typing `9336` steps or `2.4` hours of screen time. The form arrives **pre-filled** with whatever that day already holds — a Shortcut import, a Google Calendar sync, or an earlier manual entry — so it is a correction pass over what synced, not a blank slate. Leave a field empty to leave that day untouched, then **Save all** writes everything in one go.

**Reading the trends.** The Trends tab opens with a written summary — the strongest correlation, the biggest mover versus last week, how many goals your 7-day average is meeting, your longest current streak, and any metric logged too rarely to be trusted. It is plain arithmetic over your own entries, not a model, so the same data always produces the same words.

**Changing what you track.** Track → each metric row has **Edit** (emoji, name, goal, direction) and, inside that, **Delete**. The distinction matters:

- The **switch** stops tracking a metric but keeps all of its history. This is what you want almost always.
- **Delete** permanently removes the metric *and every entry ever logged against it*. It asks first, and it cannot be undone.

**Adding your own.** Track → *Add your own*. Type a name and an emoji is chosen for you from a keyword list (`Meditation` → 🧘, `Cold plunge` → 🧊); override it if you'd rather. New metrics appear across every tab immediately.

## Backing up and restoring

Track → **Your data**:

- **Export data (JSON)** downloads everything — metrics and entries — as `life-dashboard-export.json`.
- **Restore from a file** reads that file back. Two modes:
  - **Merge** (default) upserts: anything the file doesn't mention is left alone, anything it does is overwritten.
  - **Replace** wipes metrics and entries first, so the result is exactly the file.
- **Clear all logged history** deletes every entry and timeline event, keeping your metric definitions.

Restores are all-or-nothing. Every row is validated before anything is written, and a bad file is rejected with the specific problem (`entries[4].date must be a YYYY-MM-DD string`) rather than partially applied. Export first if you're about to do anything destructive — it's the only undo.

## Install it on your phone

The dashboard is a PWA, so it can live on your home screen and launch without browser chrome.

1. Start the server with `npm run dev:lan` (binds to your LAN, not just localhost).
2. On your phone, open `http://<your-PC-IP>:3000` — run `ipconfig` to find the IP.
3. **iOS**: Share → *Add to Home Screen*. **Android**: menu → *Install app*.

Over the LAN it only works while your PC is running the server and both devices are on the same Wi-Fi. Deploy it (below) and it works from anywhere.

## Deploying it privately

The app is deployed on Vercel and locked behind a single password. There are no user accounts — this is a personal dashboard, so one shared password is the whole auth model.

Set `APP_PASSWORD` (at least 16 characters) in the Vercel project's environment variables, alongside `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. Then:

- Visiting any page without a session redirects to `/login`.
- Signing in sets an httpOnly cookie holding a SHA-256 digest of the password — never the password itself.
- API routes answer with a JSON `401` rather than login HTML, so a failed fetch surfaces a real error.
- **`POST /api/health-import` is deliberately exempt.** The iOS Shortcut can't sign in, and that route already authenticates with `HEALTH_IMPORT_TOKEN`.

There is no logout button. The cookie is derived from the password, so changing `APP_PASSWORD` in Vercel signs every device out at once — which is the revocation you actually want if a phone goes missing.

On localhost an unset `APP_PASSWORD` means no gate at all, because typing a password to use the dev server buys nothing. On a deployment, an unset or too-short password is treated as a misconfiguration and every request returns `503` instead of quietly serving your data to the internet.

> Don't use Vercel Authentication for this app. It blocks the Apple Health webhook outright (a Shortcut can't complete an SSO flow), and iOS gives home-screen PWAs their own cookie jar, so the sign-in bounces out to Safari and loops.

## Running the tests

```bash
npm test
```

424 tests cover the logic that's easy to break silently: correlation math and its 8-paired-points floor, streak rules, direction-aware deltas, local-date arithmetic across DST and leap days, ISO week numbering (including 53-week years), health-payload matching and duration parsing, tolerant JSON repair, OAuth error classification, token verification, session-token derivation, and import validation.

```bash
npm run test:coverage
```

Enforces 80% coverage on `lib/` (currently ~99% of statements). `npm run typecheck` runs TypeScript with no emit.

> **Note:** don't run `npm run build` while `npm run dev` is running — they share the `.next` directory, and the build will leave the dev server serving 500s with `MODULE_NOT_FOUND`. If that happens, stop the server, delete `.next`, and start again. Your data is untouched; it lives in `data/`.

## Connecting Google Calendar + Gmail (from scratch)

This is the centerpiece of Phase 2: real calendar events in your Timeline, automatic Deep Work logging from your meetings, and a live inbox count — all read-only, all pulled directly from Google's APIs (no third-party middleman).

If you've never opened Google Cloud Console before, follow every step below in order. It takes about 10 minutes the first time.

### Step 1 — Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and sign in with your Google account.
2. Click the project selector at the top of the page (it may say **Select a project**) → **New Project**.
3. Name it something memorable, like `Life Dashboard` → **Create**.
4. Once it's created, make sure it's selected in the project selector at the top — every step below happens inside this project.

### Step 2 — Enable the Google Calendar API and Gmail API

1. In the left sidebar (or the search bar at the top), go to **APIs & Services → Library**.
2. Search for **Google Calendar API** → click it → click **Enable**.
3. Go back to the Library, search for **Gmail API** → click it → click **Enable**.

You need both, enabled one at a time.

### Step 3 — Configure the OAuth consent screen

1. Go to **APIs & Services → OAuth consent screen**.
2. Choose User Type **External** → **Create**.
3. Fill in the required fields:
   - **App name**: `Life Dashboard`
   - **User support email**: your email
   - **Developer contact email**: your email
4. On the **Scopes** screen, you can skip adding scopes here — the app requests Calendar and Gmail read access at runtime when you connect. (If you'd rather add them explicitly, add Calendar `readonly` and Gmail `readonly`.)
5. On the **Test users** screen, click **Add Users** and add **your own Google account email**. This step is required — while the app is in "Testing" status, Google blocks sign-in for any account that isn't on this list, including yours.
6. Save.

> **Publish the app, or reconnect every 7 days.** While the consent screen sits in **Testing**, Google expires every refresh token after **7 days**. The connection works, then silently stops, and the Track tab shows **Reconnect needed** with `invalid_grant` as the underlying cause. To stop it recurring, go to **OAuth consent screen → Publishing status → Publish app** and confirm. Because the only scopes here are Calendar and Gmail *readonly* — both "sensitive" but not "restricted" — publishing does **not** require Google's verification review for personal use; you'll see an "unverified app" interstitial at consent, and **Advanced → Go to Life Dashboard (unsafe)** proceeds past it. Tokens then last until you revoke them. If you'd rather stay in Testing, that's fine too — just expect to click **Reconnect Google** weekly.

### Step 4 — Create OAuth credentials

1. Go to **APIs & Services → Credentials**.
2. Click **Create Credentials → OAuth client ID**.
3. Application type: **Web application**. Give it any name (e.g., `Life Dashboard Web`).
4. Under **Authorized redirect URIs**, click **Add URI** and enter exactly:
   ```
   http://localhost:3000/api/auth/google/callback
   ```
5. Click **Create**.
6. Copy the **Client ID** and **Client secret** shown in the dialog — you'll need both in the next step.

### Step 5 — Add the credentials to the app

Create a file named `.env.local` in the project root (`C:\Projects\life-dashboard\.env.local`) and add:

```
GOOGLE_CLIENT_ID=your-client-id-here
GOOGLE_CLIENT_SECRET=your-client-secret-here
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

`GOOGLE_REDIRECT_URI` must match the Authorized redirect URI you entered in Step 4 **byte-for-byte** — same `http://`, same port, no trailing slash. A mismatch here is the single most common setup error (see [Troubleshooting](#troubleshooting) below).

Two optional variables you can add to the same file:

```
TOKEN_ENCRYPTION_KEY=a-base64-32-byte-key
NEXT_PUBLIC_USER_NAME=Your Name
```

- **`TOKEN_ENCRYPTION_KEY`** — a base64-encoded 32-byte key used to encrypt your stored Google OAuth tokens at rest. If you skip it, tokens are still stored only locally inside the gitignored `data/` folder, just unencrypted. To generate one, run:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ```
  Paste the output as the value of `TOKEN_ENCRYPTION_KEY`.
- **`NEXT_PUBLIC_USER_NAME`** — your first name, used in the Today tab greeting ("Good morning, *Name*"). Defaults to a generic greeting if omitted.

### Step 6 — Restart the dev server

Environment variables are only read at startup, so stop `npm run dev` (Ctrl+C) and run it again:

```bash
npm run dev
```

### Step 7 — Connect your account inside the app

1. Open the app and go to the **Track** tab → **Connectors**.
2. Click **Connect Google**. You'll be redirected to Google's consent screen.
3. Because the app is still in "Testing" status in Google Cloud (not published/verified), you'll see a warning screen: **"Google hasn't verified this app."** This is expected — it's your own app, talking to your own Google account.
4. Click **Advanced → Go to Life Dashboard (unsafe)**, then grant Calendar and Gmail read access.
5. You'll be redirected back to the app, and the connector now shows **Connected**.

### Step 8 — Sync

Click **Sync now** in the Connectors panel. This pulls today's calendar events into the Timeline, auto-logs Deep Work hours from any event whose title matches deep work / focus / writing / build, and shows today's inbox count as a badge in the header.

## What the Google sync does

- **Today's calendar events** → appear in the Today tab's Timeline, with time, title, and duration.
- **Events matching `/deep work|focus|writing|build/i`** in the title → their durations are summed and written as today's Deep Work entry automatically.
- **Today's Gmail inbox thread count** → shown as a badge in the header.

The scopes requested are **read-only**: Calendar `readonly` and Gmail `readonly`. Life Dashboard never sends email, never modifies your calendar, and never deletes or labels anything. It uses Gmail's full `readonly` scope rather than the more restrictive `metadata` scope because Gmail blocks date-filtered search queries (like "today's threads") under the metadata-only scope — `readonly` is the minimum scope that supports the query this app needs.

### When the connection expires

Calendar and Gmail share one OAuth token, so when that token stops working both stop at once. Rather than reporting the same protocol error twice, the connector recognises this case and shows a single state:

| Connector shows | What it means |
|---|---|
| **Connected** (green) | A refresh token is stored and the last sync succeeded. |
| **Reconnect needed** (gold) | The stored token can no longer be refreshed — click **Reconnect Google**. The card explains *why*, quoting Google's own reason, and keeps showing when the last successful sync was so you can tell a token that lapsed this morning from one that has been dead a week. |
| **Error** (red) | Something reconnecting won't fix, such as a `TOKEN_ENCRYPTION_KEY` that no longer decrypts the stored token. |

"Reconnect needed" is raised by an expired or revoked grant (`invalid_grant`), by credentials that Google no longer recognises (`invalid_client` — check `.env.local`), or by a stored token that has no refresh token at all, which cannot survive its first hour. A failed sync never advances the "last synced" timestamp, so the card can't show a fresh sync time next to stale data.

The most common cause by far is the 7-day Testing-mode expiry — see the note in [Step 3](#step-3--configure-the-oauth-consent-screen).

## Connecting Apple Health (iOS Shortcut)

Apple HealthKit has no cloud API — health data never leaves your iPhone unless something on the phone itself sends it. So instead of an OAuth connector, Life Dashboard exposes a webhook (`POST /api/health-import`) and an iOS Shortcut on your phone reads today's Health samples and posts them to your PC each morning. Once it's set up, any metric the Shortcut sends gets matched and logged automatically — no more manually stepping through Log Today for steps and sleep.

### Get your import token

1. In the app, go to **⚙ Track → Connectors → Apple Health**.
2. Copy the **bearer token** and the **import URL** shown there. You'll paste both into the Shortcut below.

### Networking note

**Against the deployed app, there is nothing to configure.** The URL shown in the Connectors panel is a public HTTPS address, so the Shortcut works from anywhere — on cellular, away from home, with your PC switched off. Copy it and skip to the next section.

The rest of this only applies when you point the Shortcut at a dev server on your PC. The Shortcut runs on your iPhone, so `http://localhost:3000` won't work — "localhost" on the phone means the phone:

1. Put your iPhone and your PC on the **same Wi-Fi network**.
2. Start the server with `npm run dev:lan` instead of `npm run dev`, which binds to all interfaces rather than just `localhost`.
3. Find your PC's IPv4 address with `ipconfig` — something like `192.168.1.42`.
4. The Shortcut's URL is then `http://<PC-IP>:3000/api/health-import`.
5. If it can't connect, allow Node.js through **Windows Defender Firewall** for **Private networks**.

The [manual paste fallback](#manual-paste-fallback) works without any of this.

### Build the Shortcut

These steps assume you have the **Shortcuts** app on your iPhone (it comes pre-installed on iOS).

1. Open Shortcuts → tap **+** to create a **New Shortcut**.
2. Add a **Find Health Samples** action. Set the sample type to **Steps**, filtered to **Today**. Follow it with a **Calculate Statistics** action set to **Sum**, and set the result to a variable named `Steps`.
3. Add another **Find Health Samples** action. Set the sample type to **Sleep Analysis**, filtered to **last night**, with the result expressed in **hours**. Set this to a variable named `Sleep`.
4. Add a **Text** action containing the JSON body, with the `Steps` and `Sleep` variables inserted inline where the brackets are:
   ```json
   {"steps": [Steps], "sleep": [Sleep]}
   ```
5. Add a **Get Contents of URL** action:
   - **URL**: `http://<PC-IP>:3000/api/health-import`
   - **Method**: `POST`
   - **Headers**: `Authorization` = `Bearer <your token>`, and `Content-Type` = `application/json`
   - **Request Body**: `JSON` (or `File`/Text, set to the output of the **Text** action from step 4)
6. Optionally add a **Show Result** action afterward to confirm the response when you run it manually.

### Add your Journal mood (State of Mind)

When you tap a face in the **Journal** app's daily reflection — or use **Log your State of Mind** in the Health app — iOS writes a **State of Mind** sample to HealthKit. Shortcuts can read it, so your mood rating rides in on the same webhook as steps and sleep and feeds the **Mood** metric (🙂, goal ≥ 7/10), which is set up for you.

**The scale is the thing to know.** HealthKit doesn't store the face you tapped; it stores **valence**, a number from **-1.0** (very unpleasant) to **+1.0** (very pleasant). That is not a 1–10 score — posted raw, a perfectly neutral day (valence `0`) would land as 0/10, the worst day on record. So the app converts it for you, and **which key you use decides how the number is read**:

| You send | Interpreted as | Stored |
|---|---|---|
| `{"stateOfMind": 0.6}` | valence, -1 → +1 | Mood **8.2** /10 |
| `{"stateOfMind": 0}` | valence | Mood **5.5** /10 |
| `{"stateOfMind": -1}` | valence | Mood **1** /10 |
| `{"mood": 8}` | a 1–10 score already | Mood **8** /10 |

Add these actions to the Shortcut you built above:

1. Add a **Find State of Mind Samples** action (Shortcuts → search "State of Mind"). Set **Date** to **Today**. If you keep both daily reflections and momentary check-ins, filter **Kind** to **Daily** to get just the Journal reflection — otherwise leave it, and several check-ins in one day are averaged for you.
2. Follow it with **Get Details of State of Mind** → **Valence**, and set the result to a variable named `Mood`.
3. Extend the **Text** action's JSON with the new variable:
   ```json
   {"steps": [Steps], "sleep": [Sleep], "stateOfMind": [Mood]}
   ```

That's it — the **Get Contents of URL** action is unchanged.

Three things make this forgiving, because the exact Shortcuts actions differ between iOS versions:

- **Labels work too.** If your Shortcut yields the label rather than the number, send it as-is — `{"stateOfMind": "Very Pleasant"}` — and any of the seven ratings (`Very Unpleasant` … `Very Pleasant`) is accepted, in any casing or spacing.
- **Lists are averaged.** `Find State of Mind Samples` returns a *list*. If you pass it straight through — `{"stateOfMind": [0.2, 0.6]}` — the mean is used, so you don't need a **Calculate Statistics** action for a day with several check-ins.
- **A wrong scale is refused, not guessed.** Sending `{"stateOfMind": 8}` imports nothing and reports `state of mind must be a valence between -1 and 1` in the `ignored` list, rather than quietly recording a bogus perfect day. If you genuinely want to log a 1–10 number, use the `mood` key.

Every converted value explains itself in the response — `"note": "valence 0.6 → 8.2/10"` — and the same note appears in the Connectors panel after a manual import, so a number you didn't expect is always traceable back to what your phone actually sent.

**No Journal entry that day?** Nothing is sent and nothing is written — the metric has no value for that date, which counts as "not logged" rather than as a zero. Averages and correlations skip unlogged days entirely, so a gap never drags the numbers down. Streaks are stricter: an unlogged *past* day breaks the streak exactly as a missed goal would, though an unlogged **today** doesn't (it's skipped until you log it). If you keep a Mood streak, log the day in Journal before midnight.

### Automate it

A Shortcut you have to tap every morning isn't really automatic — this last step is what makes the sync hands-off:

1. In the Shortcuts app, go to **Automation → +** → **Create Personal Automation**.
2. Choose **Time of Day**, set it to your preferred morning time (e.g., 7:00 AM), and set it to repeat daily.
3. Set the action to **Run Shortcut**, and select the Shortcut you just built.
4. Turn **off** "Ask Before Running."

With "Ask Before Running" off, the Shortcut fires silently each morning and your dashboard has fresh steps and sleep data waiting before you even open it.

### Payload format

The webhook accepts JSON shaped like:

```json
{"date": "YYYY-MM-DD", "steps": 9336, "sleep": 7.6}
```

- `date` is optional and defaults to today.
- Every other key is matched against your metrics' **names and ids**, case/space/separator-insensitively — so `"steps"`, `"Steps"`, `"deep work"`, `"deep_work"`, and `"deepWork"` all match the same metric.
- Values can be numbers or numeric strings (e.g., `"9336"` works the same as `9336`).
- For metrics measured in **hours or minutes**, written durations are accepted too — `"3h 24m"`, `"3:24"`, `"204m"`, `"3 hours 24 minutes"` — and converted into the metric's own unit. This is what lets you type Screen Time and Sleep exactly as iOS displays them. Bare numbers are unaffected and still mean the metric's unit.
- Keys that don't match any metric, or whose value isn't numeric, are skipped rather than rejected. The response lists what was imported and what was ignored, so you can see exactly what happened.
- **`stateOfMind` is the one special key.** Its value is an Apple valence in `-1 … +1` (or one of the seven labels, or a list of either) and is converted onto the **Mood** metric's 1–10 scale — see [Add your Journal mood](#add-your-journal-mood-state-of-mind). `valence`, `moodValence`, `journalMood`, and `stateOfMindValence` are accepted as aliases. Converted values carry a `note` in the response showing the arithmetic.

### Manual paste fallback

You don't need the Shortcut (or even an iPhone) to use this connector. In **⚙ Track → Connectors → Apple Health**, there's a paste box — paste JSON like:

```json
{"steps": 9336, "sleep": 7.6}
```

and click **Import**. This is the fastest way to test the payload format, or to log a one-off day without setting up networking at all.

The box is forgiving about how the text arrives: curly quotes from a copy-paste, non-breaking spaces from a phone keyboard, a stray ` ``` ` code fence, and a trailing comma are all repaired automatically, and the result line says which of them it had to fix. Well-formed JSON is never altered — the strict parse is always tried first. Anything it genuinely can't read is reported with the position and the name of the offending character, rather than a bare "invalid JSON".

## Screen Time, and what cannot be automated

**Screen Time has no API.** Not a REST endpoint, not a HealthKit sample type, not a Shortcuts action. Apple exposes it only through the `DeviceActivity` and `FamilyControls` frameworks, which are available to native iOS apps, run inside a privacy sandbox that forbids sending the numbers off-device, and are unreachable from a web app or a Shortcut. Even Apple's own `DeviceActivityReport` renders usage inside a sandboxed view that cannot pass the figures back to the app hosting it. No amount of work on this dashboard changes that.

So *reading* the number stays manual — but that's the only manual part. [The Shortcut below](#logging-screen-time-with-one-tap) opens Screen Time, prompts you, and posts what you type, in the format your phone already displays it.

**Apple Health cannot be read by a web page either.** HealthKit is on-device only. Mobile Safari has no access to it under any circumstance. The iOS Shortcut exists precisely because it is the one sanctioned way to get HealthKit data out — the Shortcut reads Health locally and *pushes* to the webhook. Nothing pulls.

So the split is:

| Source | How it gets in |
|---|---|
| Google Calendar / Gmail | Real OAuth sync, fully automatic, works from the phone browser |
| Apple Health (steps, sleep) | iOS Shortcut pushes to the webhook on a morning schedule |
| Apple Journal (State of Mind → Mood) | Same Shortcut — HealthKit valence, converted to the 1–10 Mood scale |
| Screen Time | Semi-manual — a Shortcut opens Settings, prompts you, and posts what you type |
| Oura / Whoop / Fitbit | Not built, but these have real cloud APIs and would be proper connectors |

A **Screen Time** metric (📱, goal ≤ 3h/day) is set up for you. Reading the number is the only part that can't be automated — everything after it can, using the Shortcut below.

### Logging Screen Time with one tap

This Shortcut can't read Screen Time (nothing can), so it **asks you for the number and posts it**. You read one figure and type it; the Shortcut does the rest.

> **Don't add an "Open App → Settings" action.** An earlier version of these instructions did, on the theory that it saved you a tap. It doesn't: it throws you out of whatever you were doing, drops you at the *root* of Settings rather than at Screen Time, and leaves the text prompt floating over the wrong screen while you go hunting for the number. Read the figure first, then run the Shortcut. The widget below makes that a glance.

**Part 0 — put the number where you can see it**

Do this once, and you never need to open Settings for it again:

1. On your iPhone, long-press an empty part of the Home Screen until the icons jiggle.
2. Tap the **+** in the top-left corner.
3. Search for `Screen Time` and tap it.
4. Swipe to the widget size you want and tap **Add Widget**.
5. Tap **Done**. Today's total is now on your Home Screen, updated automatically.

**Part 1 — build the Shortcut**

Four actions, and you never type a brace or a quote. That matters: hand-building the JSON in a **Text** action is what invites curly quotes, missing variables, and stray characters. Letting Shortcuts build the body removes the whole class of problem.

1. On your iPhone, open the **Shortcuts** app.
2. Tap the **+** in the top-right corner to create a new shortcut.
3. Tap **Add Action**. Search for `Ask for Input` and tap it.
4. Tap the text next to **Prompt** and type: `Screen Time today?`
5. On the same action, check **Input Type** is **Text** — not Number. This is what lets you type `3h 24m` rather than converting it to a decimal in your head.
6. Tap **Add Action**. Search for `Get Contents of URL` and tap it.
7. Paste your webhook URL into the **URL** field. Get it from the app: **⚙ Track → Connectors → Apple Health → Webhook URL → Copy**.
8. Tap the **▸** arrow on that action to expand its options.
9. Tap **Method** and change it from `GET` to **POST**.
10. Tap **Headers**, then **Add new header**. Key: `Authorization`. Value: the word `Bearer`, one space, then your token from **⚙ Track → Connectors → Apple Health → Bearer token → Copy**. It must read `Bearer abc123…`.
11. Tap **Request Body** and choose **Form**. (Form, not JSON — see the note below.)
12. Tap **Add new field**. Leave its type as **Text**.
13. For the field's **Key**, type: `screenTime`
14. Tap the field's **Value** box, then tap **Provided Input** in the suggestion bar above the keyboard so it inserts as a blue token. **Do not type the words** — if the value shows as plain text rather than a blue capsule, the import says so and nothing is logged.

> **Why Form rather than JSON.** The endpoint accepts both, and JSON is the more obvious choice — but in the Shortcuts UI the JSON body editor hides the value behind a field-type picker and will happily keep an empty Value box, which posts `{"screenTime": ""}` and imports nothing. The Form editor is a flat list of key/value rows where the variable drops straight in. If your JSON body keeps coming back `empty value`, switch the body type to Form and re-add the field; nothing on the server side changes.
15. Tap the shortcut's name at the top, choose **Rename**, and call it `Log Screen Time`.
16. Tap **Done** in the top-right.

Shortcuts sets `Content-Type` itself from the body type you picked, so there is no second header to add.

**Part 2 — test it, and see what the server says**

17. Look at the **Screen Time widget** on your Home Screen and note today's total, e.g. `3h 24m`. (No widget? **Settings → Screen Time → See All App & Website Activity**; the big number at the top of the **Day** tab.)
18. Tap your **Log Screen Time** shortcut. A text box appears asking `Screen Time today?` and nothing else happens — it does not navigate anywhere.
19. Type the number exactly as shown, e.g. `3h 24m`, and tap **Done**.
20. Open Life Dashboard → **Today**. Screen Time should read **3.4h**.

**If it didn't land**, add one action and run it again — this is the fastest way to see the cause:

21. In the Shortcut, tap **Add Action**, search for `Quick Look`, and add it at the very end (after Get Contents of URL).
22. Run the Shortcut again. Quick Look shows the server's reply verbatim, which names the problem rather than just failing:
    - `"imported":[{"metricId":"screen-time","value":3.4}]` — it worked.
    - `no matching metric` — the Screen Time metric isn't in your database; check **⚙ Track**.
    - `empty value — the Shortcut sent this key with nothing in it` — step 14: the variable is missing from the Value box.
    - `received the words "Provided Input" instead of a number` — step 14: you typed the variable's name instead of inserting the blue token.
    - `could not read "…" as a duration` — the text isn't a recognised form; see the table below.
    - `Invalid or missing bearer token` — step 10: the header value is wrong, or you rotated the token since.
23. Once it works, delete the **Quick Look** action (swipe left on it → **Delete**) so the Shortcut runs silently.

**Part 3 — get reminded each evening**

24. In the Shortcuts app, tap the **Automation** tab at the bottom.
25. Tap **+** in the top-right, then tap **Time of Day**.
26. Set the time to **9:00 PM**, choose **Daily**, and tap **Next**.
27. Tap **Run Shortcut**, then select **Log Screen Time**.
28. Leave **Ask Before Running** turned **on** for this one — unlike the morning health sync, this Shortcut needs you present to type the number, so a silent 9pm run would do nothing.
29. Tap **Done**.

**What the app accepts for Screen Time.** Any of these work, so you can type whatever's on screen without converting anything:

| You type | Stored |
|---|---|
| `3h 24m` | 3.4h |
| `3h24m` · `3 hours 24 minutes` · `3hr 24min` · `3 hr, 24 min` | 3.4h |
| `3:24` | 3.4h |
| `204m` | 3.4h |
| `3.4` | 3.4h |

The same parsing applies to any metric measured in hours or minutes, so Sleep takes `7h 36m` too. Anything it can't read — `about three hours` — is reported in the response's `ignored` list rather than guessed at or silently dropped.

**Prefer no Shortcut at all?** Use the **Form** toggle on the Today tab: open Settings → Screen Time, read the daily number, and type it alongside everything else. The seven-day strip means you can backfill several days at once on a Sunday rather than remembering nightly.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| **`redirect_uri_mismatch`** error from Google | The redirect URI in Google Cloud Console must be **byte-for-byte identical** to `GOOGLE_REDIRECT_URI` in `.env.local` — same scheme (`http://`), same host, same port, no trailing slash. Re-check both values side by side. |
| **"Access blocked: Life Dashboard has not completed the Google verification process"** | You haven't added your Google account as a **Test user** (OAuth consent screen → Test users → Add Users), or you're signing in with a different account than the one you added. Add yourself, or use **Advanced → Go to Life Dashboard (unsafe)** to proceed anyway. |
| Connector shows **"Google not configured"** | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` are missing from `.env.local`, or you edited `.env.local` without restarting `npm run dev` afterward. Env vars load once, at startup. |
| Connector shows **Reconnect needed**, or a sync reports `invalid_grant` | The stored refresh token is dead, so Calendar and Gmail both stop together. Click **Reconnect Google** in Track → Connectors — no need to redo the Google Cloud setup. If it keeps coming back every week, your OAuth consent screen is still in **Testing**, where Google expires refresh tokens after 7 days; **publish the app** to stop it ([Step 3](#step-3--configure-the-oauth-consent-screen)). Other causes: you revoked access at [myaccount.google.com → Security → Third-party apps](https://myaccount.google.com/permissions), you changed your Google password, or the token went unused for six months. |
| Sync reports `invalid_client` | Not a token problem — Google doesn't recognise the app's credentials. `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env.local` no longer match the OAuth client in Google Cloud Console (or the client was deleted). Fix the values and restart the server; reconnecting alone won't help. |
| Connector shows a red **Error** status | Something reconnecting won't fix — most often a `TOKEN_ENCRYPTION_KEY` that no longer decrypts the stored token (it changed, or was lost). Restore the old key, or click **Disconnect** and then **Connect Google** to store a fresh token under the current key. |
| **"That isn't valid JSON"** in the paste box | Almost always a character you can't see. Copying from a web page or chat brings **curly quotes** (`“ ”`) instead of straight ones, and phone keyboards insert **non-breaking spaces** that look exactly like spaces. Both are rejected by JSON. The app now repairs these automatically and lists what it fixed under the result — if you still get this error, the message names the position and the offending character. Retype the line by hand using straight `"` quotes rather than pasting it again. |
| **`no matching metric`** against `screenTime` | The Screen Time metric isn't in your database — this is not a formatting problem, and no amount of retyping the duration will fix it. Open **⚙ Track** and look for **Screen Time** in the metric list. If it's absent, you're running a build from before it was added: pull the latest code and restart the server (deployed, redeploy). The metric is created automatically on the next startup. If you deleted it on purpose, re-add it in Track → Add your own: name `Screen Time`, unit **hours**, goal **at most** `3`. |
| **`could not read "…" as a duration`** | The text couldn't be parsed. Use one of the accepted forms — `3h 24m`, `3 hr, 24 min`, `3:24`, `204m`, or `3.4`. Phrases like `about 3 hours` are refused rather than guessed at, on purpose. |
| **`empty value — the Shortcut sent this key with nothing in it`** | The Shortcut posted the key with no value. Open the Shortcut, expand **Get Contents of URL → Request Body**, and check the field's **Value** box holds the **Provided Input** variable as a blue token. An empty Value box sends an empty string. |
| **`received the words "Provided Input" instead of a number`** | The variable's *name* was typed as plain text rather than inserted as a token. Clear the Value box, then tap **Provided Input** in the suggestion bar above the keyboard — it should appear as a blue capsule, not as letters you can edit character by character. |
| **`"9h" looks like a duration, but … is measured in count`** | You sent a duration to a metric that isn't measured in time. Either send a plain number, or change the metric's unit to hours in **⚙ Track**. |
| Mood didn't update from Journal | Check the `ignored` list in the response. `state of mind must be a valence between -1 and 1` means the Shortcut sent a 1–10 score under the `stateOfMind` key — either send the raw **Valence** detail, or switch the key to `mood`. `no Mood metric` means the Mood metric was deleted; re-add it in Track (name it `Mood`, score out of 10). Also confirm the Journal entry exists for that date — Health → Browse → State of Mind. |
| Inbox count isn't updating | Click **Sync now** manually. The count reflects threads from the current local day as of the last sync, not live. |
| **401 Invalid or missing bearer token** from the health import webhook | The token in the Shortcut's `Authorization` header doesn't match the one shown in Track → Connectors → Apple Health. Recopy it from the app. If you rotated the token, update the Shortcut's header value too. |
| Shortcut can't connect / times out | You're probably still pointing at `localhost`, which doesn't resolve from the phone. Use the PC's LAN IP instead (run `ipconfig`), make sure the server is running with `npm run dev:lan` (not `npm run dev`), confirm both devices are on the same Wi-Fi network, and allow Node through Windows Defender Firewall for Private networks. |
| Health data didn't appear on the dashboard | Check the `ignored` list in the webhook's response (or in the manual paste box's result). A key that doesn't match any metric's name or id is silently skipped, not imported. Also note that an inactive metric can still receive imported data — it just won't show on Today/Week/Trends until you re-activate it in Track. |

Connector errors are shown verbatim in the Track tab by design — if something goes wrong, you'll see the real error message there rather than a silent failure.

## Data & privacy

- Run locally, nothing leaves your machine except your own calls to Google's OAuth and API endpoints. Deployed, the data lives in your Turso database and the app is reachable only with the app password.
- The GitHub repository is private, and the deployment is gated — see [Deploying it privately](#deploying-it-privately).
- OAuth tokens are stored server-side — in the gitignored `data/` folder locally, in Turso when deployed — encrypted at rest if you set `TOKEN_ENCRYPTION_KEY`, otherwise plain text. Set the key on any deployment.
- You can export all of your data at any time as a JSON file, and restore it just as easily — see [Backing up and restoring](#backing-up-and-restoring).
- Disconnecting Google in the Connectors panel removes the stored tokens immediately.
- The health-import webhook is the one endpoint reachable from another device on your network. It requires a bearer token, compared in constant time, and you can rotate it at any time from Track → Connectors → Apple Health, which invalidates the old one immediately.

## Roadmap

- **Future wearables** (Oura, Whoop, Fitbit) have real cloud APIs, so they can be added as proper OAuth server-side connectors — the `oauth_tokens` table plus the per-connector status pattern means a new provider is just a new `/api/auth/<provider>` route and a sync function.
- ~~**Hosted deployment.**~~ Done. The storage layer runs on `@libsql/client`, which drives a local SQLite file in development and a remote [Turso](https://turso.tech) database in production from the same code path — so the same code runs on Vercel's read-only filesystem. See [Deploying it privately](#deploying-it-privately) and `.env.local.example`.
