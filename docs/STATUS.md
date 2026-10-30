# Status and handoff

Last updated: 2026-10-30. Update this at the end of every work session.

## Done

- **Calculation engine** in `lib/accounting/`: net profit per bet, settled P/L, ROI, win rate, pending totals, Lagos calendar-day ranges, `formatMoney` / `formatPercent` display helpers. 103 tests. Verified under five server timezones, and four deliberately broken versions were all caught by the tests.
- **Supabase project** created: "Tailr", Ireland (`eu-west-1`), Postgres 17. URL: `https://lyikzuysmzalkhubtcut.supabase.co` (not a secret).
- **Backend step 1, database tables**: `profiles`, `bets`, `bet_selections` (migration `20261030093541_create_tracker_tables`).
- **Backend steps 2 to 4, sign-in data, privacy rules and access tests** (migration `20261030095322_add_signup_profile_and_privacy_rules`):
  - A `profiles` row is created automatically for every new sign-up (trigger on `auth.users`).
  - 10 row-level security policies: a signed-in user can only read or change their own profile, bets and bet legs. Signed-out visitors (`anon`) can touch nothing.
  - Least-privilege grants: users cannot create or delete profiles and can only edit the display name.
- **181 tests pass** (103 engine, 34 schema, 44 access tests) with a clean strict typecheck. The schema and access tests run every migration on an in-memory Postgres (PGlite) with Supabase's pieces stubbed (`supabase/tests/helpers.ts`).
- **Break-tested:** 17 deliberate weakenings of the privacy rules, grants and sign-up trigger were all caught. The first round caught only 10 of 17, which exposed that tests with a `WHERE` clause cannot tell whether update and delete rules work (the read rules hide other people's rows anyway). Tests for statements with no `WHERE` clause were added, and all 17 are now caught.
- **Live check on the real project:** a two-user test was run on Supabase and rolled back (no data left behind). Results: each user sees only their own bets, legs and profile; cannot edit, hand over, add to or delete the other's rows; signed-out visitors are blocked. Supabase's security advisor shows no findings; its performance advisor shows only "unused index" notices, which is normal before there is data.
- Project pack committed under `docs/`.

## Decisions made (copy into `10_DECISIONS_AND_RISKS.md` when it exists)

- Money is **integer minor units** (kobo, cents). Currencies: **NGN and USD**. Never floats. Currencies are never added into one total (no exchange rate in V1).
- **Void** bets: net profit 0, excluded from the ROI denominator and win rate.
- **Pending** bets: excluded from P/L, ROI and win rate; reported separately and not filtered by date range.
- ROI and win rate are `null` (shown as "n/a"), never NaN, when the denominator is 0.
- Date filters use **settlement date**, half-open `[start, end)`. Lagos is UTC+1 with no daylight saving.
- **No cash-out. No partial or half-win returns** (decided 2026-10-30): a bet that pays back less than its stake is recorded as void. A "won" bet returning less than its stake is rejected by both the engine and the database.
- Nothing is rounded inside calculations; rounding happens only in the display helpers.
- **Net profit is not stored** in the database. It is always derived by `lib/accounting` from stake and gross return, so there is one source of truth. (`05_DATA_MODEL.md` lists `net_profit` and decimal money fields; the schema as built supersedes it.)
- Region: Supabase has no African region, so the project is in Ireland.
- Privacy is enforced in the database (row-level security), not only in app code, so every interface (web, Telegram, X) gets the same protection.

## Schema as built

| Table | Purpose | Notes |
| --- | --- | --- |
| `profiles` | One row per user | `id` = auth user id, optional `display_name`. Created by trigger on sign-up; users can edit only `display_name` |
| `bets` | Bets the user says they placed | `stake_minor` and `gross_return_minor` are bigint minor units, capped at the JS safe integer; `currency` NGN or USD; `status` pending, won, lost or void; `provenance` is always `user_reported` |
| `bet_selections` | Legs of a bet | `event` and `selection` required; `sport`, `market_type`, `odds_decimal` optional. Owned through the parent bet |

Database rules that mirror the engine: pending has no settlement date or return; won needs a settlement date and a return at least equal to the stake; lost and void need a settlement date and no return; settled time cannot be before placed time. Deleting a user deletes their profile, bets and legs. `slip_draft_id` on `bets` is deliberately left out until slip tables exist.

## Next

1. **Backend**, remaining steps in order:
   - **Services:** `createBet`, `updateBet`, `settleBet`, `deleteBet`, `getDashboardStats` (calls `lib/accounting`). Keep logic in services, not in route handlers or components, so Telegram and X can reuse them later. Services must call the database as the signed-in user (publishable key plus the user's session) so row-level security applies. Use the secret key only for trusted server jobs.
   - **API layer:** thin server actions or route handlers that validate input and call the services.
2. **Frontend shell** (suggested owner: app shell and forms): responsive shell, navigation, empty states for Dashboard, Slip Assistant, Bet History, Preferences. No fake data or charts. See "First coding task" in `08_AI_BUILD_RULES.md`.
3. Connect them one feature at a time: sign-in, add bet, history, settle bet, dashboard.
4. Before real users sign up, review the Supabase Auth settings in the dashboard (email sign-up and confirmation, password strength, site URL and redirect URLs).

Do not start the slip parser or any AI work until the tracker works end to end.

## How to change the database

1. Add a new file to `supabase/migrations/` named `YYYYMMDDHHMMSS_what_it_does.sql`. Never edit a migration that has already been applied.
2. Every new table needs row-level security turned on, policies, and cases in `supabase/tests/rls.test.ts` that prove one user cannot touch another's rows. Include statements with no `WHERE` clause.
3. Run `npm test`. The tests apply every migration in order on an in-memory Postgres.
4. Apply it to the Supabase project (through the Supabase connector in a Claude session, or the Supabase CLI), then check the project's security advisor.
5. If Supabase records a different version number than the filename, rename the file to match.

## Open questions

- A "won" bet that returns exactly its stake is currently accepted and counts as a win with zero profit (and counts in win rate). Since a bet that returns only the stake is effectively void, should it be required to return strictly more than the stake? Not urgent; the change is one line in the engine and one in the database.

## Repo notes

- The Next.js app is not scaffolded yet. `package.json` and `tsconfig.json` at the root are only for running the engine and schema tests. When the app is created, merge Vitest and TypeScript into the app's own config rather than keeping two copies.
- Real secrets go in `.env.local` (gitignored). Variable names are in `.env.example`. Only the project URL and the publishable key (`sb_publishable_...`) may appear in browser code. The secret key (`sb_secret_...`) stays server-side and never goes in git or chat.
- Work on short branches (e.g. `feat/bet-services`) and open a pull request into `main`.
