# Bet services

All bet logic lives here, not in route handlers or components, so the web app, Telegram and X share it. Each call acts for ONE signed-in user, and the database enforces privacy on top of this code.

## Use

```ts
import { createClient } from "@supabase/supabase-js";
import { createBet, settleBet, getDashboardStats, createSupabaseBetRepository } from "@/lib/services";

// A client signed in AS THE USER: publishable key + the user's session.
// Never use the secret key here: it bypasses every privacy rule.
const supabase = createClient(url, publishableKey, { global: { headers: { Authorization: `Bearer ${accessToken}` } } });
const deps = { repo: createSupabaseBetRepository(supabase) };

const bet = await createBet(deps, {
  currency: "NGN",
  stakeMinor: 500000, // ₦5,000.00 in kobo
  placedAt: "2026-10-15T12:00:00Z",
  selections: [{ event: "Arsenal vs Chelsea", selection: "Arsenal -1", oddsDecimal: 1.95 }],
});
await settleBet(deps, bet.id, { outcome: "won", grossReturnMinor: 900000 }); // total paid out, stake included
const { byCurrency } = await getDashboardStats(deps); // one summary per currency
```

| Function | What it does |
| --- | --- |
| `createBet` | Adds a **pending** bet with 1 to 50 legs, atomically. Owner, status and return cannot be set. |
| `getBet`, `listBets` | Read the user's bets (newest placed first, filters, paging with `hasMore`). |
| `updateBet` | Edits details; `null` clears an optional field; `selections` replaces all legs. Cannot change the result. |
| `settleBet` | Records won, lost or void. Works on any bet, so a mistake can be corrected. |
| `deleteBet` | Deletes the bet and its legs. |
| `getDashboardStats` | Profit, ROI, win rate and pending totals, by currency, via `lib/accounting`. Optional date range (use `lagosDayRange` / `lagosDateRange`). |

## Errors

- `ValidationError`: input rejected, nothing written. `error.issues` is a list of `{ field, message }` so a form can show every problem at once.
- `NotFoundError`: the bet does not exist **or belongs to someone else** (deliberately identical, so ids cannot be probed).
- `RepositoryError`: the database call failed. `error.code` holds the Postgres/PostgREST code when known.

## Rules worth knowing

- Money is integer minor units (kobo, cents). Dates are `Date` objects or ISO strings **with a timezone**; a zone-less string is rejected because it would be read in the server's timezone.
- Placement and settlement times cannot be more than 5 minutes in the future.
- A bet that pays back less than its stake is recorded as `void`, not `won`.
- Impossible dates such as `2026-02-30` are rejected (JavaScript would quietly turn them into March 2).
- The dashboard reads **every** bet, page by page. Supabase returns at most 1,000 rows per request without saying it stopped early, so the repository also asks for the total and refuses to return incomplete data.

## Tests

- `lib/services/*.test.ts`: validation and paging, pure.
- `supabase/tests/services.test.ts`, `functions.test.ts`: the services and the `create_bet` / `update_bet` database functions run end to end on an in-memory Postgres under the signed-in role, with the real privacy rules. `supabase/tests/pglite-repository.ts` is the test-only repository that mirrors the Supabase one.
