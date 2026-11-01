# Next steps, step by step

Backend steps are for the person doing backend; frontend steps are for the person doing the app screens. Backend step B1 must happen first, because the frontend needs it to run.

Rule for both: one short branch per task (`feat/<name>`), open a pull request into `main`, run `npm test` and `npm run typecheck` before pushing.

## What exists now

- Sign-up, sign-in, sign-out pages (plain, unstyled) and a protected `/dashboard` placeholder under `app/(app)/`.
- A JSON API, all signed-in only (see table). Responses are `{ data }` or `{ error: { code, message, issues? } }`. Types for the frontend are in `lib/api/types.ts`.

| Method and path | Does | Success |
| --- | --- | --- |
| `GET /api/bets?status&currency&limit&offset` | List the user's bets, newest placed first | 200 `{ data: { items, limit, offset, hasMore } }` |
| `POST /api/bets` | Add a pending bet | 201 `{ data: bet }` |
| `GET /api/bets/:id` | One bet | 200 |
| `PATCH /api/bets/:id` | Edit details or legs (not the result) | 200 |
| `POST /api/bets/:id/settle` | `{ outcome: "won", grossReturnMinor }`, `{ outcome: "lost" }` or `{ outcome: "void" }` | 200 |
| `DELETE /api/bets/:id` | Delete | 200 `{ data: { deleted: true } }` |
| `GET /api/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD` | Stats per currency (Lagos dates, both ends inclusive; leave both out for all time) | 200 |

Errors: 400 `validation_failed` (with `issues: [{ field, message }]` to show next to form fields), 400 `invalid_json`, 401 `unauthenticated`, 404 `not_found`, 500 `server_error`.
Money is always whole kobo or cents (`500000` = ₦5,000.00). Dates come back as ISO strings. Use `formatMoney` and `formatPercent` from `lib/accounting` to display them.
Requests with a body must send `Content-Type: application/json`.

---

## Backend steps

**B1. Set up your environment (15 minutes)**
1. `npm install`
2. Copy `.env.example` to `.env.local`. Fill in `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the Supabase dashboard (Project Settings → API Keys). Leave `SUPABASE_SECRET_KEY` empty.
3. Work through [`SUPABASE_AUTH_CHECKLIST.md`](SUPABASE_AUTH_CHECKLIST.md).
4. `npm run dev`, then sign up at http://localhost:3000/sign-up.

**B2. Run the live check (the one thing not yet verified)**
`lib/services/supabase-repository.ts` has never run against the real Supabase API. With the dev server running and you signed in, use the browser console on any page of the app:
```js
const j = (r) => r.json();
const post = (u, b) => fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then(j);
const bet = (await post("/api/bets", { currency: "NGN", stakeMinor: 500000, placedAt: new Date().toISOString(), selections: [{ event: "Test", selection: "Home" }] })).data;
console.log(bet);
console.log(await post(`/api/bets/${bet.id}/settle`, { outcome: "won", grossReturnMinor: 900000 }));
console.log(await fetch("/api/bets").then(j));
console.log(await fetch("/api/dashboard").then(j));
```
Check: the bet has its leg, settle gives `netProfitMinor: 400000`, the list shows it, the dashboard shows NGN profit 400000. Then sign up a **second** account in a private window and confirm `/api/bets` returns an empty list there and `/api/bets/<first user's id>` returns 404.
If anything fails, note the error and fix `supabase-repository.ts` (look at the embedded `bet_selections(*)` select and the `count: "exact"` paging first). Delete the test bets afterwards (`DELETE /api/bets/:id`).

**B3. Decide the open question** (see "Open questions" in `STATUS.md`): should a "won" bet that returns exactly its stake count as a win? Tell whoever owns the engine; it is one line each in the engine, database and service.

**B4. Before real users:** switch Confirm email on, add real SMTP, set the real Site URL and redirect URLs, and deploy (Vercel suggested). Add the same two environment variables there.

**B5. Later backend work** (do not start until the tracker works end to end): bet counts by placement date, re-opening a settled bet to pending, then slip tables, the slip parser and AI. See `STATUS.md`.

---

## Frontend steps

Do these in order. Each is one task for Codex or Claude using the prompt in [`FRONTEND_TASKS.md`](FRONTEND_TASKS.md). Do not start a task until the one before it is merged.

1. **F1 App shell and navigation** (empty states only, no fake data).
2. **F2 Restyle sign-in and sign-up** (keep the actions and field names).
3. **F3 Add Bet form** (`POST /api/bets`, shows field errors).
4. **F4 Bet History** (list, filter, load more).
5. **F5 Settle, edit and delete a bet** from History.
6. **F6 Dashboard** (stats per currency, date filter).

Working rules for the frontend:
- Call the `/api` routes. Do not import `lib/services` or Supabase in components, and never use the Supabase secret key.
- Do not store or display money as decimals in code: keep whole minor units, format only at display time.
- Never add NGN and USD together. Show one block per currency.
- If `lib/api/types.ts` is missing a type you need, ask the backend owner to add it rather than writing your own copy.
