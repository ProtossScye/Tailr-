# Status and handoff

Last updated: 2026-10-30. Update this at the end of every work session.

## Done

- **Calculation engine** in `lib/accounting/`: net profit per bet, settled P/L, ROI, win rate, pending totals, Lagos calendar-day ranges, `formatMoney` / `formatPercent` display helpers.
- **103 tests passing**, strict TypeScript check clean. Also verified under five server timezones (UTC, Lagos, New York, Tokyo, Auckland), and four deliberately broken versions of the engine were all caught by the tests.
- Project pack committed under `docs/`.

## Decisions made (copy into `10_DECISIONS_AND_RISKS.md` when it exists)

- Money is **integer minor units** (kobo, cents). Currencies: **NGN and USD**. Never floats. Currencies are never added into one total (no exchange rate in V1).
- **Void** bets: net profit 0, excluded from the ROI denominator and win rate.
- **Pending** bets: excluded from P/L, ROI and win rate; reported separately and not filtered by date range.
- ROI and win rate are `null` (shown as "n/a"), never NaN, when the denominator is 0.
- Date filters use **settlement date**, half-open `[start, end)`. Lagos is UTC+1 with no daylight saving.
- **No cash-out** and **no partial/half-win returns** in V1: a "won" bet returning less than its stake throws an error. Revisit if handicap bets need partial returns.
- Nothing is rounded inside calculations; rounding happens only in the display helpers.

## Next

1. **Backend** (suggested owner: schema, auth, RLS, services):
   - Migrations for `profiles`, `bets`, `bet_selections` only. Use `currency` (NGN | USD), `stake_minor` and `gross_return_minor` as integers, and UTC timestamps for `placed_at` / `settled_at`.
   - Supabase Auth plus row-level security on every user-owned table.
   - **Cross-user access tests** (user A cannot read, edit or delete user B's bets). Write these early.
   - Service layer: `createBet`, `updateBet`, `settleBet`, `deleteBet`, `getDashboardStats` (calls `lib/accounting`). Keep logic in services, not in route handlers or components, so Telegram and X can reuse them later.
2. **Frontend shell** (suggested owner: app shell and forms): responsive shell, navigation, empty states for Dashboard, Slip Assistant, Bet History, Preferences. No fake data or charts. See "First coding task" in `08_AI_BUILD_RULES.md`.
3. Connect them one feature at a time: sign-in, add bet, history, settle bet, dashboard.

Do not start the slip parser or any AI work until the tracker works end to end.

## Open questions

- Can a "won" bet pay out less than its stake (e.g. half-win on a handicap)? The engine currently rejects that.
- Is a Supabase project already created? If not, write the migrations as plain SQL files and run them once the project exists.

## Repo notes

- The Next.js app is not scaffolded yet. `package.json` and `tsconfig.json` at the root are only for running the engine tests. When the app is created, merge Vitest and TypeScript into the app's own config rather than keeping two copies.
- Real secrets go in `.env.local` (gitignored). Add a `.env.example` with variable names only. Only the public Supabase anon key may appear in browser code; the service-role key stays server-side.
- Work on short branches (e.g. `feat/bets-schema`) and open a pull request into `main`.
