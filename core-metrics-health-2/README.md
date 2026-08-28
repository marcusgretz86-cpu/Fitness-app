# Core Metrics Health

A personal training, fuel, and protocol tracker. This is a standalone Vite + React
project — no more Claude.ai sandbox restrictions, so localStorage, Open Food Facts,
and any other real network calls work normally here.

## What's already set up

- Data (workouts, meals, meds, labs, custom foods, home layout) persists to
  localStorage always, and syncs to a real Netlify Database scoped to your
  own signed-in account once you configure it (see "Set up Netlify Database +
  Identity" below) — same data on web and the native app, private to you.
- PWA manifest + icons are configured, so it can be installed to a phone home screen.
- The Open Food Facts search will work here (it's blocked only inside Claude.ai).
- The AI food estimate needs one extra step outside Claude.ai — see "AI estimate"
  below.
- A multi-device health sync bridge (Apple Health / Health Connect) is built and
  ready to wire up once you build the native app — see "Native app + multi-device
  health sync" below. This is what lets Garmin, Renpho, and anything else that
  already syncs to Apple Health/Health Connect flow into this app through one
  connection instead of a separate integration per device.

## Set up Netlify Database + Identity (real accounts)

Without this, the app still works fine — it just stores data in this browser's
localStorage only, with no sign-in. This section only matters once you've
actually deployed the app on Netlify (see "Deploy" below) — Identity and
Database are both features of a live Netlify site, not something you fully
set up before deploying.

**This app switched from Supabase to Netlify Database + Netlify Identity.**
If you're wondering why: no real reason to prefer one over the other
technically, it was a direct choice to consolidate everything (hosting,
functions, database, auth) onto one platform instead of two. The trade-off
worth knowing: Supabase enforced per-account data isolation at the database
level (Row Level Security) — Netlify Database doesn't have an equivalent
built-in binding to Netlify Identity, so that isolation is now enforced in
`netlify/functions/app-state.js` instead. Every query in that file is
manually scoped by user ID. That's still secure if the code stays correct,
but it depends on that code staying correct, rather than the database
refusing bad queries on its own — a real difference, not just a wording one.
See the comments at the top of that file before changing it.

1. Deploy this project to Netlify first (see "Deploy" below) — Identity and
   Database are both provisioned per-site from your Netlify dashboard.
2. In your Netlify site dashboard: **Site configuration → Identity → Enable
   Identity**.
3. Still in Identity settings, under **Registration**, you can leave it as
   "Open" (anyone can sign up) or switch to "Invite only" depending on who
   you want using this. Email confirmation is on by default — real
   confirmation emails get sent.
4. In your Netlify site dashboard: **Site configuration → Database → Add a
   database**. This provisions a Postgres database (via Neon under the hood)
   and automatically sets a `NETLIFY_DATABASE_URL` environment variable for
   your site — you don't need to copy this value anywhere yourself.
5. Run the schema once: in the Database section of your dashboard, find the
   SQL/query runner, paste in the contents of `netlify/db/schema.sql` from
   this repo, and run it. This creates the one table the app reads/writes to.
6. For local development (`npm run dev`) specifically: copy `.env.example`
   to `.env` and fill in `VITE_NETLIFY_IDENTITY_URL` with your deployed
   site's URL (Identity needs a real Netlify domain to talk to — it can't
   fully work purely on `localhost`). `NETLIFY_DATABASE_URL` does NOT go in
   this file — Netlify Functions read it directly from the deployed
   environment, and local function testing needs the Netlify CLI (`netlify
   dev`) rather than plain `npm run dev` to have access to it at all.
7. Redeploy (or restart `netlify dev` locally) so everything picks up the
   new database and Identity configuration.

That's it — the app now shows a sign-in/create-account screen (Netlify's own
hosted widget, not a custom form built into this app), and every screen's
data reads and writes through `useNetlifyState`, scoped to whoever's signed
in.

## Run it locally

You'll need [Node.js](https://nodejs.org) installed (v18 or later).

1. Open a terminal in this folder.
2. Install dependencies:
   ```
   npm install
   ```
3. Start the dev server:
   ```
   npm run dev
   ```
4. Open the URL it prints (usually `http://localhost:5173`) in your browser.

## Deploy it for real (Vercel)

1. Create a free account at [vercel.com](https://vercel.com) if you don't have one.
2. Push this folder to a GitHub repo:
   ```
   git init
   git add .
   git commit -m "Core Metrics Health"
   ```
   Then create a new repo on GitHub and follow its instructions to push (or use
   GitHub Desktop if you prefer a GUI).
3. In Vercel, click **Add New → Project**, pick your GitHub repo.
4. Vercel auto-detects Vite — leave the default build settings and click **Deploy**.
5. You'll get a real URL like `core-metrics-health.vercel.app`.

Netlify works the same way if you'd rather use that instead.

## Install it on your phone (Add to Home Screen)

Once deployed:

- **iPhone:** open the Vercel URL in Safari → tap the Share icon → **Add to Home
  Screen**.
- **Android:** open the URL in Chrome → tap the **⋮** menu → **Add to Home Screen**
  (or you may see an automatic "Install app" banner).

It'll open full-screen with its own icon, like a native app.

## Native app + multi-device health sync (Apple Health / Health Connect)

This is the real fix for "how do I get my Garmin/Renpho/etc data in here" —
instead of building and paying for a separate integration per device, this
reads from Apple Health (iOS) and Health Connect (Android), which most fitness
devices and apps already sync into for free. One bridge, many devices.

**The real tradeoff: this only works from a native app, not a website.**
Apple and Google don't allow websites to read this data — only apps installed
through Xcode/Android Studio. The good news is Capacitor wraps this exact
React project into a real native app without rewriting it.

### What you need

- **A Mac, for the iOS build.** Xcode only runs on macOS — there's no way
  around this for building/testing an iOS app. If you don't have one: cloud
  Mac rental services (MacinCloud, MacStadium) or a CI service like
  [Codemagic](https://codemagic.io) can build it without you owning a Mac,
  but it's more setup. Android's build tooling (Android Studio) runs on
  Windows/Mac/Linux, so the Android side doesn't have this constraint.
- **A free Apple ID** to start (lets you build and run on your own phone via
  Xcode). An Apple Developer account ($99/year) is only required if you want
  the app to keep working without reconnecting it to Xcode every 7 days, or
  if you ever want to distribute it beyond your own device.
- **Netlify Database + Identity set up first** (previous section) — HealthKit data needs
  somewhere to land that both your phone and any other device can read.

### Build steps

1. Install Capacitor's iOS/Android platforms (already in `package.json`, just
   needs the native projects generated):
   ```
   npx cap add ios
   npx cap add android
   ```
   This creates real `ios/` and `android/` folders with native Xcode/Android
   Studio projects — commit them to your repo, they're meant to be checked in.
2. Build the web app and copy it into the native projects:
   ```
   npm run build
   npx cap sync
   ```
   Run this again any time you change the app and want the native version
   updated.
3. **iOS:** `npm run cap:ios` opens the project in Xcode.
   - Select your project in the sidebar → **Signing & Capabilities** → sign in
     with your Apple ID → click **+ Capability** → add **HealthKit**.
   - In `ios/App/App/Info.plist`, add:
     ```xml
     <key>NSHealthShareUsageDescription</key>
     <string>Core Metrics Health reads your health data to show it alongside your training and protocol.</string>
     ```
   - Plug in your iPhone (or use a Simulator, though HealthKit needs a real
     device for real data), select it as the run target, and click **Run**.
4. **Android:** `npm run cap:android` opens the project in Android Studio.
   - Health Connect needs to be installed on the test device (it's built into
     Android 14+, or installable from the Play Store on older versions).
   - Run the app the same way as any Android Studio project — select your
     device, click Run.
5. In the app, go to **Labs** → **Apple Health / Health Connect** card → **Sync**.
   The OS will show its own permission screen the first time — approve the
   data types you want shared. After that, tapping Sync pulls your latest
   weight/body fat/muscle mass into Labs and recent workouts into Train.

### An important honesty note on this specific piece

The code in `src/lib/healthkit.js` was written directly against the
`@capgo/capacitor-health` plugin's published documentation, but **I was not
able to test it against a real device or a real Xcode/Android build** — there
was no way to run a native mobile build in the environment it was written in.
The core methods it uses (`isAvailable`, `requestAuthorization`,
`queryAggregated`) are stable and well-documented, but if something errors on
a specific field name when you actually run this, check the current plugin
docs at [capgo.app/docs/plugins/health](https://capgo.app/docs/plugins/health/)
against that file rather than assuming the whole approach is broken — it's
most likely one field name that's shifted since this was written, not the
underlying logic.

Also worth knowing: HealthKit/Health Connect have no "recovery score" or
"strain score" — those are proprietary to platforms like Whoop. This bridge
pulls real values only (weight, body fat %, HRV, resting heart rate, sleep
duration, workouts) and does not invent numbers to fill fields it has no real
data for.

## Renpho smart scale sync (unofficial, direct)

The Labs tab has a "Renpho Smart Scale" card that pulls your latest weigh-in
automatically instead of typing it in by hand.

**Read this before setting it up.** Renpho has no official public developer
API. This integration uses [`renpho-api`](https://github.com/danvaneijck/renpho-api),
a community-built, reverse-engineered Python client that logs into your Renpho
account directly. That means:

- It could break without warning if Renpho changes their app — it isn't
  sanctioned by Renpho and nobody is contractually obligated to keep it working.
- It logs in using your actual Renpho email and password, stored as environment
  variables on your own backend. They're never sent to the browser or committed
  to your repo, but you're trusting whoever hosts your deployment (you) with them.
- Automated access like this may not strictly comply with Renpho's Terms of
  Service, even using your own account. Low real-world risk for a personal
  project, but worth knowing.

If that's an acceptable tradeoff for free, automatic sync, here's the setup:

1. In Vercel: Project → Settings → Environment Variables, add:
   - `RENPHO_EMAIL` — the email you log into the Renpho app with
   - `RENPHO_PASSWORD` — the password you log into the Renpho app with
2. Redeploy. Vercel will detect `api/renpho-latest.py` and `api/requirements.txt`
   automatically and provision a Python function alongside your Node ones — no
   extra config needed.
3. In the app, Labs → tap "Sync latest reading." It logs into Renpho, pulls
   your most recent measurement, and shows a checklist to review before
   saving — nothing saves automatically without you seeing it first.

**If the field mapping looks wrong:** the underlying library's exact field
names can vary a little by scale model. Open `api/renpho-latest.py` and check
the `find_first(...)` calls in `map_measurement()` — add whatever field name
your account actually returns (you can see it by temporarily returning the
raw `latest` dict instead of the mapped one, and checking Vercel's function
logs).

**Prefer not to deal with any of that?** Manual entry in Labs → Log scan takes
the same fields and a few seconds a day, with none of the above tradeoffs.

## AI food estimate — one extra step outside Claude.ai

Inside Claude.ai, the "AI estimate" button in food search works automatically. Once
deployed elsewhere, it won't — `api.anthropic.com` requires a real API key, and that
key must never be embedded in client-side code (anyone could steal it from the
browser).

To keep this feature working:

1. Get an API key from [console.anthropic.com](https://console.anthropic.com).
2. Add a small backend endpoint (a Vercel Serverless Function is the easiest fit,
   since you're already on Vercel) that holds the key server-side and forwards the
   request to Anthropic.
3. In `src/App.jsx`, find the `askAI` function and point its `fetch` call at your
   own endpoint instead of `https://api.anthropic.com/v1/messages` directly.

Everything else in the app works without this step — it only affects that one
fallback search option.

## Known limitations right now

- Cross-device sync (Netlify Database) and multi-device health sync (Apple Health/Health
  Connect) are both built, but require the setup steps above — neither is "on"
  by default, since both need your own accounts/credentials.
- The Overall tab's "Recovery %" and "Strain" scores are still simulated demo
  data. HealthKit/Health Connect don't provide equivalents for those — they're
  proprietary to specific platforms (Whoop, in this case) — so real HRV, resting
  heart rate, and sleep duration are available through the new sync, but those
  two specific composite scores are not, and this app doesn't fabricate them.
- The native app (Capacitor) hasn't been built or tested on a real device as
  part of this project — see the honesty note in the section above.
- The Coach chat, AI food estimate, and PDF/scan reader all still need the
  backend-proxy step described below once deployed outside Claude.ai.
