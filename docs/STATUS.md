# Status and handoff

Last updated: 2026-11-01 (API layer and sign-in added). Update this at the end of every work session.

## Done

- **Calculation engine** in `lib/accounting/`: net profit per bet, settled P/L, ROI, win rate, pending totals, Lagos calendar-day ranges, `formatMoney` / `formatPercent` display helpers. 103 tests. Verified under five server timezones, and four deliberately broken versions were all caught by the tests.
- **Supabase project** created: "Tailr", Ireland (`eu-west-1`), Postgres 17. URL: `https://lyikzuysmzalkhubtcut.supabase.co` (not a secret).
- **Backend step 1, database tables**: `profiles`, `bets`, `bet_selections` (migration `20261030093541_create_tracker_tables`).
- **Backend steps 2 to 4, sign-in data, privacy rules and access tests** (migration `20261030095322_add_signup_profile_and_privacy_rules`):
  - A `profiles` row is created automatically for every new sign-up (trigger on `auth.users`).
  - 10 row-level security policies: a signed-in user can only read or change their own profile, bets and bet legs. Signed-out visitors (`anon`) can touch nothing.
  - Least-privilege grants: users cannot create or delete profiles and can only edit the display name.
  - 44 cross-user access tests, including statements with no `WHERE` clause (the only real test of the update and delete rules).
- **Backend step 5, bet services** (`lib/services/`, see its README; migration `20261031193554_add_bet_write_functions`):
  - `createBet`, `getBet`, `listBets`, `updateBet`, `settleBet`, `deleteBet`, `getDashboardStats`.
  - Two database functions, `create_bet` and `update_bet`, so a bet and its legs are saved together or not at all. They run as the signed-in user (not the database owner), take the owner from the session never from the input, and always create bets as pending.
  - Hand-written input validation that reports every problem at once, field by field, ready for forms.
  - `lib/services/supabase-repository.ts` connects the services to Supabase.
- **363 tests pass** with a clean strict typecheck: 103 engine, 34 schema, 44 access, 20 database functions, 43 services, 74 validation, 17 paging, 28 API handlers. The database tests run every migration on an in-memory Postgres (PGlite) with Supabase's pieces stubbed (`supabase/tests/helpers.ts`), and the services run the real SQL under the signed-in role.
- **Break-tested:** 17 deliberate weakenings of the privacy rules and 24 of the services and new functions are all caught. Both rounds first missed something (10 of 17, then 23 of 24), and each gap got a new test: update and delete rules need no-`WHERE` tests, and "is there a next page" needs a test where the last page is exactly full.
- **Bug found and fixed while testing:** JavaScript quietly turns `2026-02-30` into March 2, which would have saved a bet on the wrong day. Impossible dates are now rejected.
- **Live check on the real project** (rolled back, no data left behind): two users each created bets; one cannot edit or overwrite the other's bet or legs; owner, status and return cannot be smuggled in; a bad leg rolls back everything; signed-out visitors cannot call the functions. Supabase's security advisor shows no findings.
- **Backend step 6, API layer and sign-in** (Next.js 16 app, `@supabase/ssr`):
  - Sign-up, sign-in, sign-out and email-confirm routes (`app/(auth)`, `app/auth/*`); plain unstyled pages. `proxy.ts` (Next 16's name for middleware) refreshes the session and sends signed-out visitors to `/sign-in`. Sessions are verified with `getClaims()`, never `getSession()`.
  - JSON routes under `app/api/`: `GET/POST /api/bets`, `GET/PATCH/DELETE /api/bets/:id`, `POST /api/bets/:id/settle`, `GET /api/dashboard`. Logic is in `lib/api/handlers.ts` as `(deps, Request) => Response`; route files only look up the session. Response and error shapes are in `lib/api/types.ts`.
  - 401 when signed out, 400 with per-field `issues`, 404 for missing or someone else's bet (identical), masked 500. JSON bodies must be `application/json` and under 256 KB.
  - Protected placeholder area `app/(app)/` for the frontend shell.
  - 28 handler tests on the real SQL and privacy rules; 18 deliberate breaks all caught (one was missed at first, the body-size limit, because another rule also rejected the test input; the test now isolates it).
  - `next build` succeeds. Checked on a local production server: signed-out API calls get 401 JSON, `/dashboard` redirects to `/sign-in`, sign-out by GET is refused (405).
- Project pack committed under `docs/`.

## Decisions made (copy into `10_DECISIONS_AND_RISKS.md` when it exists)

- Money is **integer minor units** (kobo, cents). Currencies: **NGN and USD**. Never floats. Currencies are never added into one total (no exchange rate in V1).
- **Void** bets: net profit 0, excluded from the ROI denominator and win rate.
- **Pending** bets: excluded from P/L, ROI and win rate; reported separately and not filtered by date range.
- ROI and win rate are `null` (shown as "n/a"), never NaN, when the denominator is 0.
- Date filters use **settlement date**, half-open `[start, end)`. Lagos is UTC+1 with no daylight saving.
- **No cash-out. No partial or half-win returns** (decided 2026-10-30): a bet that pays back less than its stake is recorded as void. A "won" bet returning less than its stake is rejected by the engine, the database and the service (which tells the user to record it as void).
- Nothing is rounded inside calculations; rounding happens only in the display helpers.
- **Net profit is not stored** in the database. It is always derived by `lib/accounting` from stake and gross return, so there is one source of truth. (`05_DATA_MODEL.md` lists `net_profit` and decimal money fields; the schema as built supersedes it.)
- Region: Supabase has no African region, so the project is in Ireland.
- Privacy is enforced in the database (row-level security), not only in app code, so every interface (web, Telegram, X) gets the same protection.
- **Service rules** (my choices, easy to change): a bet needs 1 to 50 legs; dates must carry a timezone; placement and settlement times cannot be more than 5 minutes in the future; odds are rounded to 3 decimals; text fields are trimmed and blanks become empty; `updateBet` cannot change the result (use `settleBet`); `settleBet` works on any bet so mistakes can be corrected; a won bet's stake cannot be raised above its return.
- The dashboard reads every bet page by page and checks the total, because Supabase returns at most 1,000 rows per request without saying it stopped early.

## Schema as built

| Table | Purpose | Notes |
| --- | --- | --- |
| `profiles` | One row per user | `id` = auth user id, optional `display_name`. Created by trigger on sign-up; users can edit only `display_name` |
| `bets` | Bets the user says they placed | `stake_minor` and `gross_return_minor` are bigint minor units, capped at the JS safe integer; `currency` NGN or USD; `status` pending, won, lost or void; `provenance` is always `user_reported` |
| `bet_selections` | Legs of a bet | `event` and `selection` required; `sport`, `market_type`, `odds_decimal` optional. Owned through the parent bet |

| Function | Purpose |
| --- | --- |
| `create_bet(p_bet, p_selections)` | Creates a pending bet and its legs atomically; owner from the session |
| `update_bet(p_id, p_patch, p_selections)` | Updates the keys present (null clears) and optionally replaces legs, atomically; returns false for a bet that is missing or not the caller's |

Database rules that mirror the engine: pending has no settlement date or return; won needs a settlement date and a return at least equal to the stake; lost and void need a settlement date and no return; settled time cannot be before placed time. Deleting a user deletes their profile, bets and legs. `slip_draft_id` on `bets` is deliberately left out until slip tables exist.

## Next

Follow [`NEXT_STEPS.md`](NEXT_STEPS.md) (backend and frontend steps) and [`FRONTEND_TASKS.md`](FRONTEND_TASKS.md) (prompts F1 to F6). Before anything else: set up `.env.local` and the Supabase Auth settings ([`SUPABASE_AUTH_CHECKLIST.md`](SUPABASE_AUTH_CHECKLIST.md)), then run the live check in NEXT_STEPS B2.

Do not start the slip parser or any AI work until the tracker works end to end.

## Not verified yet

- - `lib/services/supabase-repository.ts` type-checks and mirrors the test repository, and the two SQL functions it calls were checked live. But it has **not been run through the real supabase-js client against the live API**, and neither has sign-in itself: the build environment cannot reach Supabase. Do the live check in NEXT_STEPS B2 (create, list, settle, dashboard, second user sees nothing). Pay attention to the embedded `bet_selections(*)` select and the `count: "exact"` paging.
- Email confirmation and the sign-in pages have only been built and compiled, not clicked through against real Supabase Auth.
- `npm audit` reports dev-only findings in Vitest 2.x and its dependencies (esbuild, tinypool). They do not ship in the app; upgrading Vitest to a current major is a small separate task.

## Not built yet

- "Bets placed" counts by placement date (the data model mentions it; the engine only filters by settlement date).
- Re-opening a settled bet back to pending (a settled bet can be re-settled as won, lost or void, but not made pending again).

## How to change the database

1. Add a new file to `supabase/migrations/` named `YYYYMMDDHHMMSS_what_it_does.sql`. Never edit a migration that has already been applied.
2. Every new table needs row-level security turned on, policies, and cases in `supabase/tests/rls.test.ts` that prove one user cannot touch another's rows. Include statements with no `WHERE` clause. Functions that write for users should be `security invoker` and take the owner from `auth.uid()`.
3. Run `npm test`. The tests apply every migration in order on an in-memory Postgres.
4. Apply it to the Supabase project (through the Supabase connector in a Claude session, or the Supabase CLI), then check the project's security advisor.
5. If Supabase records a different version number than the filename, rename the file to match.

## Open questions

- A "won" bet that returns exactly its stake is currently accepted and counts as a win with zero profit (and counts in win rate). Since a bet that returns only the stake is effectively void, should it be required to return strictly more than the stake? Not urgent; the change is one line each in the engine, the database and the service.

## Repo notes

- The Next.js app lives at the repo root together with the engine and tests (one `package.json`, one `tsconfig.json`). TypeScript is kept on 5.x on purpose.
- Real secrets go in `.env.local` (gitignored). Variable names are in `.env.example`. Only the project URL and the publishable key (`sb_publishable_...`) may appear in browser code. The secret key (`sb_secret_...`) stays server-side and never goes in git or chat.
- Work on short branches (e.g. `feat/api-layer`) and open a pull request into `main`.
