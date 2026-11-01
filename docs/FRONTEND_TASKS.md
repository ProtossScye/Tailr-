# Frontend task prompts

Paste one at a time into Codex or Claude, in order. Format follows the template in `08_AI_BUILD_RULES.md`. Every prompt ends with the same closing line, included below.

Closing line for all tasks: *Before finishing, run `npm test`, `npm run typecheck` and `npm run build`; summarize changed files; report unresolved assumptions; never claim tests passed unless actually run.*

---

## F1. App shell and navigation

**Task:** Build the responsive app shell and navigation inside `app/(app)/layout.tsx`, with empty-state pages for Dashboard, Slip Assistant, Bet History and Preferences.

**Context:** Everything signed-in lives under `app/(app)/`. The layout already checks the session and has a sign-out button (a `<form action="/auth/sign-out" method="post">`). Keep both behaviours. This is the frame all later screens sit in.

**Read first:** `docs/06_DESIGN_DIRECTION.md`, `docs/08_AI_BUILD_RULES.md` ("First coding task"), `docs/NEXT_STEPS.md`, `app/(app)/layout.tsx`, `app/(app)/dashboard/page.tsx`.

**Acceptance criteria:**
- Routes `/dashboard`, `/slip-assistant`, `/history`, `/preferences` exist, each with a clear empty state and no fake data or charts.
- Navigation works on phone width (bottom or collapsible) and desktop (sidebar or top). Current page is highlighted.
- Sign-out still works and signed-out visitors are still redirected to `/sign-in`.
- Basic component tests for the navigation (add a test setup such as Vitest with Testing Library if needed; keep the existing 360+ tests passing).

**Out of scope:** real data, API calls, AI, sportsbooks, X, Telegram, restyling the auth pages.

---

## F2. Restyle sign-in and sign-up

**Task:** Style `app/(auth)/sign-in`, `app/(auth)/sign-up` and `auth-form.tsx` to match the design direction.

**Context:** These pages are plain on purpose. The logic must not change.

**Read first:** `docs/06_DESIGN_DIRECTION.md`, `app/(auth)/auth-form.tsx`, `app/(auth)/actions.ts`.

**Acceptance criteria:**
- Field names stay `email`, `password` and hidden `next`; the form still uses the `signIn` / `signUp` actions via `useActionState`.
- Error (`role="alert"`) and message (`role="status"`) text is clearly visible; the button shows its pending state.
- Works on phone width; labels are tied to inputs; keyboard usable.

**Out of scope:** changing the actions, adding social sign-in, forgot-password (separate task).

---

## F3. Add Bet form

**Task:** A form at `/history/new` (or a dialog from Bet History) that creates a bet with `POST /api/bets`.

**Context:** This is the core action of the product. The server validates everything and returns every problem at once.

**Read first:** `docs/NEXT_STEPS.md` (API table and rules), `lib/api/types.ts`, `lib/services/types.ts` (`CreateBetInput`), `lib/services/README.md`.

**Acceptance criteria:**
- Fields: currency (NGN or USD), stake, placed date and time, optional bookmaker and notes, 1 to 50 legs (event, selection, optional sport, market, odds).
- The user types a normal amount (for example 5000.50); the code converts it to whole minor units (`500050`) without floating-point error, and the tests prove it.
- Send `placedAt` as an ISO string with a timezone.
- A 400 response shows each `issues[].message` next to its `field` (for example `stakeMinor` next to the stake input; leg problems come as `selections[0].event`, `selections[0].selection`, `selections[0].oddsDecimal` and so on, and a whole-form problem as `input`).
- 401 sends the user to `/sign-in`. Other errors show a friendly message, never raw server text.
- On success the new bet appears in Bet History.

**Out of scope:** settling, editing, slip parsing, OCR, AI.

---

## F4. Bet History

**Task:** List the user's bets at `/history` from `GET /api/bets`.

**Context:** Users check their bets here daily.

**Read first:** `docs/NEXT_STEPS.md`, `lib/api/types.ts` (`BetPageJson`, `BetJson`), `lib/accounting` (`formatMoney`).

**Acceptance criteria:**
- Rows show date, legs summary, stake, status, and net profit when settled (money via `formatMoney`).
- Filters for status and currency; "Load more" using `hasMore` and `offset`.
- Empty state, loading state and error state.
- Pending bets never show a profit figure.

**Out of scope:** settle/edit/delete actions (F5), dashboard stats.

---

## F5. Settle, edit and delete

**Task:** From Bet History, let the user settle a bet as won, lost or void, edit its details, and delete it.

**Context:** A bet that pays back less than its stake must be recorded as **void**, not won. Settling works on any bet, so mistakes can be corrected by settling again.

**Read first:** `docs/NEXT_STEPS.md`, `lib/services/README.md` ("Rules worth knowing"), `docs/STATUS.md` ("Decisions made").

**Acceptance criteria:**
- Settle won asks for the **total return including stake** and sends `grossReturnMinor`; lost and void need no amount.
- Show the server's validation message if a won return is below the stake, and suggest void.
- Edit uses `PATCH`; the result cannot be changed there.
- Delete asks for confirmation. After each action the list updates.

**Out of scope:** re-opening to pending (not supported yet), bulk actions.

---

## F6. Dashboard

**Task:** Build `/dashboard` from `GET /api/dashboard`.

**Context:** Net profit, ROI, win rate and pending are computed on the server. The frontend only displays them.

**Read first:** `docs/NEXT_STEPS.md`, `lib/accounting/README.md`, `lib/api/types.ts` (`DashboardJson`), `docs/06_DESIGN_DIRECTION.md`.

**Acceptance criteria:**
- One block per currency (NGN, USD). Never add them together.
- Show net profit, ROI, win rate, wins/losses/voids, pending count and pending stake.
- `roiPercent` and `winRatePercent` can be `null`: show "n/a", never NaN or 0%.
- Date filter (today, 7 days, 30 days, all time, custom) sends Lagos dates as `from` and `to` (YYYY-MM-DD). Pending is not filtered by date; say so in the UI.
- Empty state for a user with no bets. No fake data.

**Out of scope:** charts beyond simple ones, slip assistant, AI.
