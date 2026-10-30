# Status and handoff

Last updated: 2026-10-30. Update this at the end of every work session.

## Done

- **Calculation engine** in `lib/accounting/`: net profit per bet, settled P/L, ROI, win rate, pending totals, Lagos calendar-day ranges, `formatMoney` / `formatPercent` display helpers. 103 tests. Verified under five server timezones, and four deliberately broken versions were all caught by the tests.
- **Supabase project** created: "Tailr", Ireland (`eu-west-1`), Postgres 17. URL: `https://lyikzuysmzalkhubtcut.supabase.co` (not a secret).
- **Backend step 1, database tables**: `profiles`, `bets`, `bet_selections` applied to the project (migration `20261030093541_create_tracker_tables`, file in `supabase/migrations/`). Row-level security is ON for all three tables.
- **34 schema tests** (`supabase/tests/schema.test.ts`) run every migration on an in-memory Postgres (PGlite) and prove the constraints accept good data and reject bad data. Four deliberately broken versions of the migration were all caught. 137 tests in total pass, strict typecheck clean.
- Supabase's security advisor shows only the expected "RLS enabled, no policy" notice (see Next); its performance advisor shows only "unused index" notices, which is normal on empty tables.
- Project pack committed under `docs/`.

## Decisions made (copy into `10_DECISIONS_AND_RISKS.md` when it exists)

- Money is **integer minor units** (kobo, cents). Currencies: **NGN and USD**. Never floats. Currencies are never added into one total (no exchange rate in V1).
- **Void** bets: net profit 0, excluded from the ROI denominator and win rate.
- **Pending** bets: excluded from P/L, ROI and win rate; reported separately and not filtered by date range.
- ROI and win rate are `null` (shown as "n/a"), never NaN, when the denominator is 0.
- Date filters use **settlement date**, half-open `[start, end)`. Lagos is UTC+1 with no daylight saving.
- **No cash-out** and **no partial/half-win returns** in V1: a "won" bet returning less than its stake is rejected by both the engine and the database. Revisit if handicap bets need partial returns.
- Nothing is rounded inside calculations; rounding happens only in the display helpers.
- **Net profit is not stored** in the database. It is always derived by `lib/accounting` from stake and gross return, so there is one source of truth. (`05_DATA_MODEL.md` lists `net_profit` and decimal money fields; the schema as built supersedes it.)
- Region: Supabase has no African region, so the project is in Ireland.

## Schema as built

| Table | Purpose | Notes |
| --- | --- | --- |
| `profiles` | One row per user | `id` = auth user id, optional `display_name` |
| `bets` | Bets the user says they placed | `stake_minor` and `gross_return_minor` are bigint minor units, capped at the JS safe integer; `currency` NGN or USD; `status` pending, won, lost or void; `provenance` is always `user_reported` |
| `bet_selections` | Legs of a bet | `event` and `selection` required; `sport`, `market_type`, `odds_decimal` optional |

Database rules that mirror the engine: pending has no settlement date or return; won needs a settlement date and a return at least equal to the stake; lost and void need a settlement date and no return; settled time cannot be before placed time. Deleting a user deletes their profile, bets and legs. `slip_draft_id` on `bets` is deliberately left out until slip tables exist.

## Next

1. **Backend**, remaining steps in order:
   - **Sign-in:** Supabase Auth sign-up and sign-in, plus automatically creating a `profiles` row for each new user.
   - **Privacy rules:** row-level security policies on all three tables. RLS is already ON, but with no policies the API denies everything, so nothing works for real users until these are added.
   - **Cross-user access tests:** prove user A cannot read, edit or delete user B's bets or legs. The schema test setup already stubs `auth.uid()` so these can run locally.
   - **Services:** `createBet`, `updateBet`, `settleBet`, `deleteBet`, `getDashboardStats` (calls `lib/accounting`). Keep logic in services, not in route handlers or components, so Telegram and X can reuse them later.
   - **API layer:** thin server actions or route handlers that validate input and call the services.
2. **Frontend shell** (suggested owner: app shell and forms): responsive shell, navigation, empty states for Dashboard, Slip Assistant, Bet History, Preferences. No fake data or charts. See "First coding task" in `08_AI_BUILD_RULES.md`.
3. Connect them one feature at a time: sign-in, add bet, history, settle bet, dashboard.

Do not start the slip parser or any AI work until the tracker works end to end.

## How to change the database

1. Add a new file to `supabase/migrations/` named `YYYYMMDDHHMMSS_what_it_does.sql`. Never edit a migration that has already been applied.
2. Add or update tests in `supabase/tests/`, then run `npm test`. The tests apply every migration in order on an in-memory Postgres.
3. Apply it to the Supabase project (through the Supabase connector in a Claude session, or the Supabase CLI), then check the project's security advisor.
4. If Supabase records a different version number than the filename, rename the file to match.

## Open questions

- Can a "won" bet pay out less than its stake (e.g. half-win on a handicap)? Both the engine and the database currently reject that.

## Repo notes

- The Next.js app is not scaffolded yet. `package.json` and `tsconfig.json` at the root are only for running the engine and schema tests. When the app is created, merge Vitest and TypeScript into the app's own config rather than keeping two copies.
- Real secrets go in `.env.local` (gitignored). Variable names are in `.env.example`. Only the project URL and the publishable key (`sb_publishable_...`) may appear in browser code. The secret key (`sb_secret_...`) stays server-side and never goes in git or chat.
- Work on short branches (e.g. `feat/auth`) and open a pull request into `main`.
