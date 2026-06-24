# Life Dashboard

Life Dashboard is a personal command center for your day, your week, and your habits — a mobile-first, single-user web app with a dark editorial look and a gold accent. Five tabs (**Today**, **Week**, **Trends**, **Streaks**, **Track**) turn the metrics you care about — deep work, sleep, steps, phone pickups, and anything custom you add — into sparklines, scorecards, streaks, and plain-language correlations like "on days your sleep is higher, your deep work tends to be higher too." It runs entirely on your machine: a local Next.js server and a single SQLite file. No cloud account, no signup, no monthly fee — just your data, on your computer.

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

On the very first run, Life Dashboard seeds 30 days of realistic sample data automatically — so Today, Week, Trends, and Streaks all have something to show you immediately, with no setup required. Your data lives in `data/life-dashboard.db` (a single SQLite file, gitignored) and survives server restarts. To start over with a clean slate, stop the server and delete that file; it will be re-seeded the next time you run `npm run dev`.

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

## Connecting Apple Health (iOS Shortcut)

Apple HealthKit has no cloud API — health data never leaves your iPhone unless something on the phone itself sends it. So instead of an OAuth connector, Life Dashboard exposes a webhook (`POST /api/health-import`) and an iOS Shortcut on your phone reads today's Health samples and posts them to your PC each morning. Once it's set up, any metric the Shortcut sends gets matched and logged automatically — no more manually stepping through Log Today for steps and sleep.

### Get your import token

1. In the app, go to **⚙ Track → Connectors → Apple Health**.
2. Copy the **bearer token** and the **import URL** shown there. You'll paste both into the Shortcut below.

### Networking note (important)

The Shortcut runs on your iPhone, not on the PC — so `http://localhost:3000` won't work; "localhost" on the phone means the phone itself, which isn't running a server. Your phone needs to reach your PC over Wi-Fi instead:

1. Make sure your iPhone and your PC are on the **same Wi-Fi network**.
2. Start the server with `npm run dev:lan` instead of `npm run dev` — this binds the dev server to all network interfaces instead of just `localhost`, so other devices on the network can reach it.
3. Find your PC's local IP address. Open PowerShell or Command Prompt and run:
   ```
   ipconfig
   ```
   Look for the **IPv4 Address** under your active adapter (Wi-Fi or Ethernet) — something like `192.168.1.42`.
4. Your Shortcut's URL will be `http://<PC-IP>:3000/api/health-import` — for example, `http://192.168.1.42:3000/api/health-import`.
5. If the Shortcut can't connect, allow Node.js through **Windows Defender Firewall** for **Private networks** (Windows will usually prompt for this the first time the dev server accepts an outside connection — accept it).

If you'd rather skip networking setup entirely, the [manual paste fallback](#manual-paste-fallback) below works without any of this — it just requires you to open the Health app and copy numbers in yourself.

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
- Keys that don't match any metric, or whose value isn't numeric, are skipped rather than rejected. The response lists what was imported and what was ignored, so you can see exactly what happened.

### Manual paste fallback

You don't need the Shortcut (or even an iPhone) to use this connector. In **⚙ Track → Connectors → Apple Health**, there's a paste box — paste JSON like:

```json
{"steps": 9336, "sleep": 7.6}
```

and click **Import**. This is the fastest way to test the payload format, or to log a one-off day without setting up networking at all.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| **`redirect_uri_mismatch`** error from Google | The redirect URI in Google Cloud Console must be **byte-for-byte identical** to `GOOGLE_REDIRECT_URI` in `.env.local` — same scheme (`http://`), same host, same port, no trailing slash. Re-check both values side by side. |
| **"Access blocked: Life Dashboard has not completed the Google verification process"** | You haven't added your Google account as a **Test user** (OAuth consent screen → Test users → Add Users), or you're signing in with a different account than the one you added. Add yourself, or use **Advanced → Go to Life Dashboard (unsafe)** to proceed anyway. |
| Connector shows **"Google not configured"** | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` are missing from `.env.local`, or you edited `.env.local` without restarting `npm run dev` afterward. Env vars load once, at startup. |
| Connector shows a **token expired / error** status | Your OAuth token expired or was revoked. Go to Track → Connectors and click **Connect Google** again to re-authorize — no need to redo the Google Cloud setup. |
| Inbox count isn't updating | Click **Sync now** manually. The count reflects threads from the current local day as of the last sync, not live. |
| **401 Invalid or missing bearer token** from the health import webhook | The token in the Shortcut's `Authorization` header doesn't match the one shown in Track → Connectors → Apple Health. Recopy it from the app. If you rotated the token, update the Shortcut's header value too. |
| Shortcut can't connect / times out | You're probably still pointing at `localhost`, which doesn't resolve from the phone. Use the PC's LAN IP instead (run `ipconfig`), make sure the server is running with `npm run dev:lan` (not `npm run dev`), confirm both devices are on the same Wi-Fi network, and allow Node through Windows Defender Firewall for Private networks. |
| Health data didn't appear on the dashboard | Check the `ignored` list in the webhook's response (or in the manual paste box's result). A key that doesn't match any metric's name or id is silently skipped, not imported. Also note that an inactive metric can still receive imported data — it just won't show on Today/Week/Trends until you re-activate it in Track. |

Connector errors are shown verbatim in the Track tab by design — if something goes wrong, you'll see the real error message there rather than a silent failure.

## Data & privacy

- Everything runs locally. There is no cloud backend and no third-party server in the loop besides Google's own OAuth and API endpoints, which you're calling directly.
- OAuth tokens are stored server-side inside the gitignored `data/` folder — encrypted at rest if you set `TOKEN_ENCRYPTION_KEY`, otherwise stored in plain text but still local-only and never committed to git.
- You can export all of your data at any time as a JSON file using the **Export** button in the Track tab.
- Disconnecting Google in the Connectors panel removes the stored tokens immediately.

## Roadmap

- **Phase 3: Apple Health**, via an iOS Shortcut that posts steps and sleep data to a local webhook — no cloud API exists for HealthKit, so this is the only viable automation path. See [Connecting Apple Health](#connecting-apple-health-ios-shortcut) above.
- **Future wearables** (Oura, Whoop, Fitbit) have real cloud APIs, so they can be added as proper OAuth server-side connectors — the connector layer built in Phase 2 (the `oauth_tokens` table plus the per-connector status pattern) already supports a new provider being just a new `/api/auth/<provider>` route and a sync function.
