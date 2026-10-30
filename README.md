# Matchlog

**Your football watching history, gamified.**

Matchlog tracks how much football you actually watch live — not scores, not news,
not fantasy points. You follow teams, competitions, and players; when you watch a
match you record exactly what you watched (full match, a half, or a custom range);
you earn XP proportional to minutes watched; you predict results; you pick your
own Player of the Match; you add friends and see their activity; and you compete
on leaderboards built entirely from real watching activity.

## Data attribution

Football fixture, team, and result data is provided by:

- **[OpenFootball](https://github.com/openfootball)** — Premier League, La Liga, Serie A, Bundesliga, Ligue 1
  ([football.json](https://github.com/openfootball/football.json)), free and public-domain, no API key required.
- **[football-data.org](https://www.football-data.org)** — UEFA Champions League, used under their free-tier API terms.

Attribution is also shown in-app (bottom of the sidebar navigation).

## Architecture

```
React (Vite, TS, Tailwind, TanStack Query)
        │  HTTP + cookies
        ▼
Fastify API (TypeScript)
        │
        ▼
PostgreSQL (Drizzle ORM)
        ▲
        │  idempotent upserts, two SEPARATE sync concerns:
        │
        ├── Fixture sync (schedule/results import)
        │     OpenFootball ──► Premier League, La Liga, Serie A, Bundesliga, Ligue 1
        │     football-data.org ──► UEFA Champions League
        │
        └── Status sync (Phase 3 — keeps status/score current post-import)
              targeted, per-match-urgency polling, configurable cadence
```

- The frontend never talks to any football data source directly and never sees
  any API key or token — it only calls Matchlog's own backend.
- **Fixture sync and status sync are deliberately separate systems.** Fixture
  sync (`npm run sync` / `sync/run.ts fixtures`) imports the season's schedule —
  who plays whom, when. Status sync (`sync/run.ts status`) doesn't import new
  matches at all; it re-checks status/score for matches that already exist, at
  a cadence appropriate to how urgently each one needs it (see "Match status
  sync" below).
- Seasons, competitions, teams, and matches are all database rows — nothing about
  "2026/27" is hard-coded. The active season is *computed from the real clock*
  (`computeCurrentFootballSeason()` in `openfootball-config.ts`), and it
  activates by inserting/flipping a row — never by editing source code.
- XP, prediction points, and watch durations are always calculated
  server-side — the client can submit `startMinute`/`endMinute`, never an XP
  value; friends' XP on the friends leaderboard is the same
  server-authoritative number, never client-submitted.

### Backend structure

```
backend/src/
  app.ts                 Fastify app factory (plugins, routes, error handling)
  server.ts              Entry point
  lib/                    env validation, gamification formulas, zod helpers
  db/
    schema/               Drizzle table definitions (one file per domain)
    migrations/           Generated SQL migrations
    client.ts, migrate.ts, seed.ts, cleanup-demo.ts
  services/               Business logic (auth, watch, prediction, achievements, stats, friends)
  routes/                 Thin Fastify route handlers -> services
  football/
    bulk-provider.ts               Interface for dataset-oriented sources (both current providers)
    provider.ts                    Interface for request-oriented sources (legacy API-Football)
    openfootball-provider.ts       5 domestic leagues, via football.json
    openfootball-cl-provider.ts    Legacy: Champions League via OpenFootball (no 2026-27 data upstream yet; superseded by football-data.org below, kept for when that changes)
    football-data-org-provider.ts  Champions League, via football-data.org
    rate-limiter.ts                Sliding-window limiter (football-data.org free tier: 10 req/min)
    openfootball-sync.service.ts   Fixture-sync orchestrator: fetch -> normalize -> upsert -> report
    match-status-sync.service.ts   Phase 3: status/result sync, separate from fixture sync
    openfootball-config.ts         Competition mapping, season-from-clock computation
    openfootball-ids.ts            Deterministic IDs, DST-aware timezone conversion
    parsers/
      football-json.parser.ts      Zod-validated parser for football.json
      football-txt.parser.ts       Parser for the (legacy) champions-league text format
    api-football-provider.ts       Optional/legacy provider, kept behind the interface
    sync.service.ts                Legacy API-Football sync (not run by default)
  sync/
    run.ts                CLI entry point for `npm run sync` and status sync
    scheduler.ts          Optional always-on cron worker
    process-predictions.ts Scores predictions for newly-finished matches
  tests/                  Vitest unit + integration tests (97 total)
```

### Frontend structure

```
frontend/src/
  api/          typed fetch client + shared types
  context/      AuthContext (session-based auth)
  hooks/        TanStack Query hooks
  components/   MatchCard, WatchModal (duration slider), PredictionForm, PotmPicker, layout
  pages/        Home, Matches, MatchDetail, History, Predictions, Players, Teams,
                Friends, FriendProfile, Leaderboard, Stats, Profile
```

## Tech stack

- **Frontend:** React, TypeScript, Vite, React Router, Tailwind CSS, TanStack Query
- **Backend:** Node.js, TypeScript, Fastify
- **Database:** PostgreSQL + Drizzle ORM (migrations, not ad-hoc SQL)
- **Validation:** Zod (requests, env vars, upstream football data)
- **Auth:** Argon2id password hashing, HTTP-only secure session cookies

## Football data sources

### OpenFootball (default, no key required)

Premier League, La Liga, Serie A, Bundesliga, Ligue 1 —
[football.json](https://github.com/openfootball/football.json), one JSON file
per league-season (e.g. `2026-27/en.1.json`), auto-updated upstream, parsed by
`openfootball-provider.ts`. Nothing to configure.

### football-data.org (Champions League)

Requires a **free** API token:

1. Register at <https://www.football-data.org/client/register> — no cost, no credit card.
2. Copy the token they give you.
3. In `backend/.env`, set:
   ```env
   FOOTBALL_DATA_API_TOKEN=your_token_here
   ```
4. Run the sync (see below).

**Free-tier limitations, stated plainly — not glossed over:**
- **10 requests/minute.** The provider has a built-in rate limiter
  (`rate-limiter.ts`) throttled to 8/min to stay safely under that.
- **Scores are delayed, not real-time.** football-data.org's free tier does
  not provide true live/in-play score updates. Matchlog does **not** claim
  otherwise anywhere in the code, UI, or this README. The status-sync
  architecture (below) is built to use whatever freshness the current
  provider actually offers, and is ready to plug in a genuinely real-time
  provider later without changing the database or frontend.
- Covers 12 competitions on the free tier, Champions League included.

**If `FOOTBALL_DATA_API_TOKEN` is not set:** everything else in the app works
completely normally — the 5 domestic leagues sync and the whole rest of
Matchlog function with zero degradation. Only the Champions League sync step
fails, with a specific, clear error message (`FOOTBALL_DATA_API_TOKEN is not
set...`), reported per-competition rather than crashing the whole sync or any
part of the running app. Verified directly: running `npm run sync` with no
token set imports all 1,752 domestic-league matches successfully and reports
exactly one clear, specific failure for Champions League.

### Why two provider interfaces?

`FootballDataProvider` (`provider.ts`) is request-oriented — one call per
competition/fixture, matching how the legacy API-Football's paid API works.
`BulkFootballDataProvider` (`bulk-provider.ts`) is dataset-oriented — one call
fetches an entire competition's matches, matching how both OpenFootball
(static files) and football-data.org's `/competitions/{code}/matches` endpoint
actually work. **Both current providers implement the same
`BulkFootballDataProvider` interface** — the fixture-sync orchestrator
(`openfootball-sync.service.ts`) takes an *array* of them and doesn't care
which is which; adding a third provider later means writing one new class and
adding it to the array in `sync/run.ts`, nothing else.

### Cross-provider team identity

A club that appears in both a domestic league (OpenFootball) and the
Champions League (football-data.org) — e.g. Arsenal — resolves to **the same
team row**, not a duplicate. Team identity is derived purely from the
normalized club name (`teamExternalId()` in `openfootball-ids.ts`), so
whichever provider syncs a team first "owns" that row, and the other provider
reuses it rather than creating a second one. This matches a real bug found and
fixed during development (see `entity-identity.test.ts`): teams, competitions,
and players all previously had this exact duplicate-row failure mode until
identity was made provider-agnostic and name-based.

### Deterministic vs. real match IDs

OpenFootball doesn't provide stable fixture IDs, so Matchlog derives one:
`hash(source, season, competition, round, home team, away team)` — deliberately
**excluding kickoff date**, because OpenFootball's data is refreshed daily and
does correct fixture dates over time; keying on date would silently create
duplicates every time a date got corrected (this happened in testing — see
`openfootball-ids.test.ts`). football-data.org **does** provide a real,
stable numeric match ID, so its matches use that directly (`fdo:match:{id}`) —
no hashing needed there.

## Match status sync (Phase 3)

Fixture sync imports the schedule. This is a **separate** system
(`match-status-sync.service.ts`, run via `npx tsx src/sync/run.ts status`) that
re-checks status/score for matches that already exist, at a cadence matched to
how urgently each one needs it:

| Bucket | What it covers | Default interval | Env var |
|---|---|---|---|
| **Live** | Kicked off, inside its live window, not yet FINISHED | 10 min | `MATCH_SYNC_LIVE_INTERVAL_MINUTES` |
| **Upcoming** | Not yet kicked off | 6 hours (catches postponements/reschedules) | `MATCH_SYNC_UPCOMING_INTERVAL_MINUTES` |
| **Recently finished** | FINISHED within the last few hours | 15 min (catches late corrections) | `MATCH_SYNC_RECENTLY_FINISHED_INTERVAL_MINUTES` |
| **Stale** | Kicked off longer ago than the live window but still not FINISHED | Same cadence as "upcoming" | (uses `MATCH_SYNC_UPCOMING_INTERVAL_MINUTES`) |

The **stale** bucket exists specifically for the original reported problem —
"some matches finished yesterday but the status hasn't updated." It's checked
at a relaxed cadence (the data source has already been slow once for these, so
hammering it doesn't help), but it *is* checked, rather than being silently
abandoned once a match ages out of the live window.

Two more env vars set the size of the windows themselves:
`MATCH_SYNC_RECENTLY_FINISHED_WINDOW_HOURS` (how long "recently finished"
keeps getting polled, default 6h) and
`MATCH_SYNC_LIVE_WINDOW_HOURS_AFTER_KICKOFF` (how long after kickoff a match
still counts as "in its live window," default 3.5h — covers 90 min + extra
time + a delay buffer).

Each match is refreshed via whichever provider owns its competition (tracked
per-match via `matches.source`), so status sync never needs to know which
provider a given match came from — it looks it up. When a match transitions to
FINISHED, predictions for it are scored automatically in the same run
(`process-predictions.ts`) — this is what makes "prediction points calculated
right after the result is in" true continuously, not just after someone
happens to run a full fixture sync.

Status sync does **not** claim to be real-time. It's an honestly-labeled
polling system whose freshness is bounded by (a) these configurable intervals
and (b) whatever freshness the underlying provider actually offers.

## Demo data isolation

`npm run db:seed` exists for local demo/manual-testing convenience, but:
- it is **never run automatically** — not part of `db:migrate`, `npm run dev`,
  or app startup, only an explicit script you run yourself
- every row it creates is tagged `source: 'DEMO'` and its competitions are
  named `[Demo] Premier League` etc., so they can never be confused with a
  real competition of the same real name even in the same database
- the normal `GET /api/matches` and `GET /api/competitions` feeds filter out
  `source = 'DEMO'` / `isSupported = false` by default

`src/db/cleanup-demo.ts` is a one-off reconciliation script for a database
that already has demo/real data mixed together (this happened during
development when the `source` column was added after some demo rows already
existed) — it safely re-tags and, where nothing else references them, deletes
stale demo rows, while **preserving** any demo match a real user actually has
watch/prediction history against.

## Local setup

### 1. Prerequisites

- Node.js 20+
- PostgreSQL 14+ running locally (or accessible via `DATABASE_URL`)
- No API key needed to run the app or sync the 5 domestic leagues. A free
  football-data.org token is needed only for Champions League — see above.

### 2. Database

```bash
createdb matchlog
createdb matchlog_test   # for running tests
```

### 3. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Open `.env` and fill in:
```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/matchlog
SESSION_SECRET=<any long random string>
FOOTBALL_DATA_API_TOKEN=<optional — only for Champions League, see above>
```

Then:
```bash
npm run db:migrate
npm run sync              # imports real fixtures — domestic leagues always work;
                            # Champions League works once FOOTBALL_DATA_API_TOKEN is set
npm run dev                 # starts the API on :4000
```

No seed step required to get real matches. (`npm run db:seed` is still there
for demo/synthetic data if you want it for local testing — see "Demo data
isolation" above.)

### 4. Frontend

```bash
cd frontend
npm install
npm run dev   # starts on :5173, proxies /api to the backend on :4000
```

Open <http://localhost:5173>. Register a new account, or run `npm run db:seed`
in the backend first for demo accounts `alice@example.com` / `bob@example.com`
(password `password123`) — their demo matches won't appear in the normal feed
per the isolation behavior above; auth/profile/friends work normally for them.

### 5. Keeping data current

```bash
cd backend
npm run sync                      # fixture sync — re-import schedule/results (idempotent)
npx tsx src/sync/run.ts status    # status sync — refresh status/score for existing matches
```

For production, run both on a schedule — see `src/sync/scheduler.ts` for an
always-on cron-based worker, or invoke the CLI commands above from your host's
scheduled-jobs feature.

### 6. Adding a future season

Nothing to change in code. `computeCurrentFootballSeason()` is a pure function
of the current date — once July 2027 arrives it starts pointing at `2027-28`
automatically, and the next `npm run sync` creates the new season row, imports
its fixtures, and activates it, while every previous season's data (and all
watch history) stays exactly where it is.

### 7. Tests

```bash
cd backend
npm test
```

**97 tests**, all passing: gamification math (XP/level/prediction scoring),
auth/watch-tracking/predictions/POTM/database-constraint integration tests,
the friends system (requests, accept/decline/cancel/remove, self-request and
duplicate prevention, profile privacy, activity feed, leaderboard), entity
identity/dedup regression tests (competitions/teams/players), both football
data parsers against real-shaped fixture data, football-data.org match
normalization (regular/extra-time/penalty-shootout scores, full provider
status-enum mapping, undecided-participant handling), fixture-sync
idempotency (including the real date-correction bug found during
development), and the Phase 3 status-sync bucketing/dispatch logic.

## Environment variables

See `backend/.env.example` for the full list with inline documentation. Summary:

```env
# Required
DATABASE_URL=
SESSION_SECRET=

# Optional — Champions League only; everything else works without it
FOOTBALL_DATA_API_TOKEN=
FOOTBALL_DATA_BASE_URL=https://api.football-data.org/v4

# Optional — legacy/unused by default
API_FOOTBALL_KEY=
API_FOOTBALL_BASE_URL=https://v3.football.api-sports.io

# Optional — Phase 3 status-sync cadence, sensible defaults shown in .env.example
MATCH_SYNC_UPCOMING_INTERVAL_MINUTES=360
MATCH_SYNC_LIVE_INTERVAL_MINUTES=10
MATCH_SYNC_RECENTLY_FINISHED_INTERVAL_MINUTES=15
MATCH_SYNC_RECENTLY_FINISHED_WINDOW_HOURS=6
MATCH_SYNC_LIVE_WINDOW_HOURS_AFTER_KICKOFF=3.5
```

`.env` is gitignored and never committed. The token is read only in
`football-data-org-provider.ts`, sent only as a request header to
football-data.org, and never logged, printed, or exposed to the frontend.

## Deployment

```
Frontend  → static host (Vercel, Netlify, etc.), built with `npm run build`
Backend   → Node/Fastify process (Render, Railway, Fly, a VM, etc.)
Postgres  → managed Postgres (Neon, RDS, Railway, Supabase, etc.)
Fixture sync → daily cron (`npm run sync`) — upstream data itself only refreshes once a day
Status sync   → more frequent cron (`npx tsx src/sync/run.ts status`) — every
                5–15 min is reasonable given the configured intervals above
```

Production checklist:
- Set `NODE_ENV=production` (tightens cookie `secure` flag)
- Set a strong, random `SESSION_SECRET`
- Run `npm run db:migrate` as part of your deploy step, not manually
- Point `APP_URL` at your real frontend origin (used for CORS)
- Set `FOOTBALL_DATA_API_TOKEN` if you want Champions League data

## What's implemented vs. known limitations

**Implemented and verified end-to-end against real data:** the full core
loop (auth, follow teams/competitions/players, watch recording with
server-computed XP, history, predictions with kickoff locking, POTM,
streaks/levels/achievements, stats, leaderboards), a real multi-provider
football-data pipeline (1,752 real domestic-league matches confirmed
importing with zero duplicates across repeated syncs), a dedicated Phase 3
status-sync system separate from fixture import, Home-page personalization
(followed teams first, grouped-by-competition general feed, no duplicate
matches), a full friends system (requests, friendships, activity feed,
friends-only leaderboard, privacy-gated profiles), and entity-identity
discipline across competitions/teams/players/matches that was specifically
stress-tested by finding and fixing a real cross-provider duplicate-team bug.

**Known limitations, stated plainly:**
- **football-data.org's free tier is delayed, not real-time.** This is
  documented, not hidden, and the architecture is built so a genuinely
  real-time provider can be swapped in later (new class implementing
  `BulkFootballDataProvider`, one line added to `sync/run.ts`) without
  touching the database schema or frontend.
- **Champions League import requires a free football-data.org token** —
  without one, the app runs completely normally minus Champions League
  fixtures; the sync reports this clearly rather than failing silently or
  faking data.
- **OpenFootball has no lineup/player/live-event data** — Player-of-the-Match
  voting needs a lineup, so it won't have options for OpenFootball-sourced
  matches until a data source with lineups is added; it works fully wherever
  lineup data exists (demo data, and would work for football-data.org matches
  if lineup import were added for that provider — not yet wired in).
- **Kickoff times for far-future fixtures are marked unconfirmed** rather
  than guessed, shown as "time TBC" in the UI — a deliberate accuracy choice.
- Goalscorer predictions have full backend scoring support but a minimal
  frontend surface; push notifications aren't built (both were marked
  optional in the original spec).
- The four smaller cup competitions (FA Cup, Carabao Cup, Copa del Rey,
  Supercopa de España) have no legitimate free data source mapped yet and are
  intentionally left unsupported rather than faked — `npm run sync` lists
  them explicitly as such in its output.
