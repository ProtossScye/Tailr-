# Status and handoff

Last updated: 2026-11-04 (frontend merged; slip tables, slip API, preferences and text parser added). Update this at the end of every work session.

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
- **365 tests pass** with a clean strict typecheck: 103 engine, 34 schema, 44 access, 20 database functions, 43 services, 74 validation, 17 paging, 28 API handlers (the won-bet rule was break-tested in all four places). The database tests run every migration on an in-memory Postgres (PGlite) with Supabase's pieces stubbed (`supabase/tests/helpers.ts`), and the services run the real SQL under the signed-in role.
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
- **Frontend** (merged, PR #1): five-tab app (Home, Bets, Create, Analytics, Profile), bet detail with settle, edit and delete, Add bet form, notifications placeholder. Calls the `/api` routes only. Slip drafts now save to the user's account (step 9).
- **Faster selection entry** (Create and Add bet; no database change, no AI):
  - Sport and market are dropdowns (a native picker on phones) with "Other" for anything else. Markets change with the sport (for example Moneyline and Player props for basketball and American football, Both teams to score for football). A saved value that is not on the list is kept, not lost. Favourite sports come first.
  - A new selection starts on the sport of the one before. One-tap sport chips (sports already on the slip, then favourites) switch between them on a mixed slip. Changing sport keeps the market only if the new sport offers it.
  - "Same event" shortcut: Create has a Same event / New event switch that stays on for a run of picks from one game; Add bet has "Same event as selection N", and changing the first event updates the rest of the run. Only a typing shortcut: saved bets and slips store plain events.
  - When every selection is from one game, a note explains that a same-game multi is priced as a whole by the bookmaker, so the price on the bet slip should be used. The "Use this as total odds" shortcut is hidden in that case.
  - Logic in `lib/client/leg-entry.ts` (22 tests; 8 deliberate breaks, all caught). Clicked through in an iPhone-sized browser on the real Add bet form (signed-in pages cannot be reached without an account, so Create was checked by build and code only). Not done yet: the text reader still needs same-game multi fixes (a "same game multi" label is read as a selection, and the product-of-odds warning is wrong for them).
- **Accounts, landing page and phone app feel** (no database change; needs two Supabase email templates edited, see below):
  - Sign-up asks for email, password and a confirmation, then a 6-digit code emailed to the person (`/verify-email`, with Send a new code). Sign-in sends an unconfirmed account to the same screen. Forgot password (`/forgot-password`) emails a 6-digit code, `/reset-password` takes the code and a new password. Profile has Change password (checks the current password first). Password fields have Show/Hide. The answers never reveal whether an email has an account.
  - `lib/auth/validate.ts` holds the checks (email, password 8 to 72 bytes, code 6 to 10 digits, matching pair) with 34 tests; `isPublicPath` has its own tests.
  - New landing page at `/` (signed-in visitors still go to the dashboard): what Tailr does, a worked profit and ROI example clearly labelled as an example, and what Tailr is not. A one-time `/welcome` screen follows email confirmation: name, three optional first steps, install prompt.
  - Phone: installable (web manifest, icons, iPhone full-screen settings, install help on Welcome and Profile), inputs are 16px so iPhones stop zooming on tap, safe-area padding for notches and the status bar, 44px tap targets, no tap flash or accidental text selection on controls. Checked in an iPhone 13, iPhone SE and Pixel 7 sized browser on every signed-out page: no sideways scrolling, no small inputs. Signed-in screens were checked in the stylesheet only. It is still the website, so it needs an internet connection; a native app is a later project.
  - Supabase email templates: Confirm signup and Reset password must include `{{ .Token }}` (the 6-digit code), otherwise people only get a link. The code length setting should be 6.
- **Phase two, step 13: suggested changes** (no database change, no AI, no new API route):
  - `lib/client/suggest.ts`: plain deterministic code. In Create (Adapt a slip), "Suggest changes" lists selections worth taking out, each with a reason and the trade-off (combined odds before and after). The person accepts or keeps each one, or accepts all; nothing changes until they do, and nothing is saved until they save the slip.
  - Only removals, worked out from what the person entered and their preferences: a repeated pick, a market they avoid, a market outside their preferred list (selections with no market are never flagged), and, once those are settled, the smallest removal (at most 3, never the whole slip) that brings combined odds inside their target range. If odds are below target it only says so, because Tailr never picks a selection or changes odds. A rejected suggestion is not offered again until the panel is closed.
  - 21 engine tests; 9 deliberate breaks, all caught (one was missed at first: a repeated pick in an avoided market was suggested twice; test added).
- **Phase two, step 12: AI adapter** (migration `20261105003927_create_ai_calls`, applied to the live project):
  - Off until `ANTHROPIC_API_KEY` is set on the server (optional `TAILR_AI_MODEL`, `TAILR_AI_TIMEOUT_MS`). The key is never sent to the browser. The provider sits behind a small `AiProvider` interface in `lib/ai/`; the Anthropic implementation is the only one so far.
  - The model must answer through one tool with a fixed schema. The answer is an untrusted draft: it is validated, then grounded in the pasted text (`lib/ai/ground.ts`). Odds, totals, booking codes, bookmakers, sports, markets, events and picks that are not in the text are removed or left blank with a warning. AI reads are never rated "high" and always carry a "Read by AI, check every line" warning. Nothing is saved; the draft is reviewed like the rule-based one.
  - `ai_calls` (read-only for the owner, `anon` has nothing) logs size, model, token counts, latency and outcome, never the text or the answer. `begin_ai_call` and `finish_ai_call` are SECURITY DEFINER on purpose, so people cannot edit their own log; they act only for the signed-in user. Limits: 10 reads an hour and 40 a day per person, failed calls included. The security advisor lists these two functions as a warning for that reason.
  - `POST /api/slips/parse-ai` `{ text }` (401, 400, 429 limit, 502 failed or timed out, 503 not switched on) and `GET /api/ai/status`. Create (Adapt a slip) shows "Read with AI" only when switched on, with a note that the text is sent to an AI service.
  - Tests cover schema validation, grounding (invented odds, fixtures, codes and injected instructions), the provider with a fake network (key never in errors), timeouts, rate limits against the real SQL, and the API.
- **Phase two, step 11: text slip parser** (no database change):
  - `lib/parser/parse-slip-text.ts`: plain deterministic code, not AI. Reads pasted text into selections (event, pick, optional market, optional decimal odds) with a confidence (high, medium, low), the fields the text did not give, the lines it set aside, and warnings. Also reads a named bookmaker, a labelled booking code and a stated total.
  - It reads only what the text says: odds, markets, sports, fixtures and booking codes are never added or looked up. A sport only comes from a header line such as "Football:". American, fractional and comma odds, and odds below 1.00, are refused with a warning, never converted. A bare number like 2.5 or a time like 12.30 is not read as odds. A stated total that does not match the legs is called out. Booking codes always carry a warning that Tailr cannot check them. Output is an untrusted draft.
  - Written test-first: 40+ pasted-slip fixtures (including chatter, hidden instructions, ambiguous and oversized input), "nothing is invented" checks, a 500-case fuzz test, a backtracking speed check, and a round trip with the Create page's own "Copy slip text". Break-tested: 13 deliberate mutations, all caught.
  - `POST /api/slips/parse` `{ text }` (signed-in only, up to 10,000 characters): returns the draft. Saves nothing, does not keep or log the text, touches no stored data (a test fails if the repository is touched).
  - Create (Adapt a slip): Read selections, then a review list. Complete selections are added to the slip in one click; incomplete ones can be filled in by hand; unused lines are shown. Nothing is added until the person clicks. Screenshots are not supported yet.
- **Step 14: small tracker gaps** (no database change):
  - Home shows "N bets placed in this period", counted by placement date and including bets that are still pending. The engine's `placedCount` is the one figure filtered by placement date; profit, ROI and win rate still go by settlement date.
  - A settled bet can go back to pending: `POST /api/bets/{id}/reopen` (no body) clears the settlement time and the return, keeps everything else, and leaves an already pending bet as it is. Another user's or a missing bet is a 404. On the bet page, "Back to pending" opens a confirm sheet first.
  - 20 new tests (engine boundaries, real-SQL service and API tests including another user's bet). Break-tested; one survivor (a bet deleted between read and save) got its own test. The two screens were type-checked and built but not clicked through in a browser.
- **Same-game-multi and parser fixes** (text parser, no database change):
  - "Same Game Multi / Parlay / SGM / SGP" labels are recognised and removed from the event name; a bare player pick under the match is kept (medium confidence, odds missing) only inside a same game multi, and chatter or long lines are still set aside.
  - A same game multi's total is not checked against the product of its legs (the same applies whenever all legs are the same event). Different events with a wrong total still warn.
  - "Combined odds @ 4.50", "Same game multi odds: 4.50", "SGM 4.50" are read as the total. Odds before the match (`1.50 Arsenal vs Chelsea - Arsenal to win`) are read, with a warning to check, and never when it looks like a time (`3.30 pm`, no pick, below 1.00) or when the line states fractional or American odds.
  - "Both teams to score" on its own is now a pick (market "Both teams to score").
  - Break-tested: 17 deliberate weakenings, all caught after adding tests for the survivors; this also caught a real ordering bug in my first version of the leading-odds rule.
- **Screenshot reading** (migration `20261106140221_ai_calls_read_image`, applied to the live project):
  - Create (adapt mode) now has "Choose a screenshot". The picture is shrunk and re-saved as a JPEG in the browser (longest side 2200 px, about 1.5 MB or less, which also strips location data), then sent to `POST /api/slips/parse-image` (multipart, field `image`).
  - The server checks the real bytes (JPEG, PNG or WebP by signature, 3 MB at most, counted while streaming) before using any allowance. The AI only **transcribes** the visible text; that text then goes through the same deterministic parser as pasted text, so nothing is invented. Confidence is capped at "medium", the review always carries "compare every line with the image", and `[unclear]` parts are flagged. The transcribed text fills the paste box, so the person can fix it and re-read.
  - Shares the AI limit with text reads (10 an hour, 40 a day). Nothing from the image or the answer is stored or logged: only size, model, token counts, timing and outcome. Needs `ANTHROPIC_API_KEY`; without it the button is disabled with a plain message.
  - Route sets `maxDuration = 60` (a Vercel plan limit may apply). Handwritten sketches will be much less reliable than a clean screenshot.
  - Verified: 1004 tests (including real-SQL API tests), a real phone-sized Chromium run with the API stubbed (JPEG output, big image shrunk under the target, bad files, 413/429/502 messages, switched-off state), and a mutation round (two survivors found, tests added). **Not verified: real AI output**, as no API key was available here; tests use fake providers.
- **Phase two, step 10: preferences** (migration `20261104074702_create_user_preferences`, applied to the live project):
  - `user_preferences`, one row per user, private (4 policies, `anon` has nothing): favourite sports, preferred markets, avoided markets, slip style (cautious, balanced, ambitious), optional target odds range, explanation level (brief, standard, detailed), and when the person last saved. Rules in the database: at most 20 items of 1 to 80 characters per list, a market cannot be both preferred and avoided, odds at least 1, min not above max.
  - `save_preferences` (SECURITY INVOKER, owner from the session) creates or replaces the row; every field is replaced, so a field left out is cleared. `anon` cannot execute it.
  - `GET /api/preferences` returns the defaults with `saved: false` until something is saved; `PUT` replaces the whole set; `DELETE` removes it ("skip" or start over). Text lists are trimmed and de-duplicated ignoring case.
  - Everything is optional and overridable. A target odds range is a preference to compare a slip against, never a promise. Preferences do not change any bet or draft.
  - Screens: Profile shows a summary and links to a Betting preferences page. Create (adapt mode) starts from the saved range and preferred markets, editable for that slip only; favourite sports come first in the sport list; selections in avoided markets are marked, nothing is removed.
- **Phase two, step 9: slip API** (migration `20261104073128_add_slip_write_functions`, applied to the live project):
  - `create_slip` and `update_slip` (SECURITY INVOKER, owner from the session, 1 to 50 selections, atomic; update replaces selections as a whole and returns false for a missing or someone else's draft). `anon` cannot execute them. `create_bet` now also records `slip_draft_id`.
  - `/api/slips` (GET list with `status`, `limit`, `offset`; POST) and `/api/slips/[id]` (GET, PATCH, DELETE). Same envelope and error codes as bets; a missing or someone else's draft is a 404 "Slip not found". A draft is always created as a manual draft with `user_entered` selections; owner, source and verification cannot be set by the caller. An unnamed draft is named after its first event (+N).
  - `POST /api/bets` accepts optional `slipDraftId`. A missing or someone else's draft is a 400 on `slipDraftId` and no bet is saved. The draft stays a draft; the Add bet form only sends the link after the person confirms they placed it.
  - Create page, Home Drafts tab and Add bet form use the API. Drafts saved on a device before this can be moved to the account with one button; each is removed from the device only after the server has saved it.
- **Phase two, step 8: slip tables** (migration `20261104013151_create_slip_tables`, applied to the live project):
  - `slip_drafts` and `slip_selections`, private per user with the same row-level security pattern as bets (4 policies each, least-privilege grants, `anon` has nothing).
  - A draft is never a bet: there is no "placed" status, and `bets.slip_draft_id` (new, optional) links a bet to the draft it was recorded from only through a foreign key on (draft, owner), so a bet can never point at another user's draft. Deleting a draft keeps the bet and clears the link.
  - Combined odds are not stored (derived from the selections, like net profit). Odds are only what the user entered; `verification_status` defaults to `user_entered`.
  - 73 new tests (constraints, cross-user access including statements with no `WHERE` clause, bet link rules). 17 deliberate weakenings of the rules: 15 caught, and the other 2 (dropping `WITH CHECK` from an update policy) behave identically in Postgres because the `USING` clause is then applied to the new row too. Security advisor: no table or policy findings.
- Project pack committed under `docs/`.

## Decisions made (copy into `10_DECISIONS_AND_RISKS.md` when it exists)

- Money is **integer minor units** (kobo, cents). Currencies: **NGN and USD**. Never floats. Currencies are never added into one total (no exchange rate in V1).
- **Void** bets: net profit 0, excluded from the ROI denominator and win rate.
- **Pending** bets: excluded from P/L, ROI and win rate; reported separately and not filtered by date range.
- ROI and win rate are `null` (shown as "n/a"), never NaN, when the denominator is 0.
- Date filters use **settlement date**, half-open `[start, end)`. Lagos is UTC+1 with no daylight saving.
- **No cash-out. No partial or half-win returns** (decided 2026-10-30): a bet that pays back less than its stake is recorded as void. A "won" bet must return **more than** its stake (decided 2026-11-03): a bet returning exactly its stake, or less, counts towards nothing and is recorded as void. This is enforced by the engine, the database (migration `20261102231741_won_must_return_more_than_stake`) and the service, which tells the user to record it as void. A won bet's stake also cannot be edited up to its return or above.
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
| `slip_drafts` | Slip drafts (not bets) | `name`, `source_type` (manual, pasted_text, image), optional `source_bookmaker`, `status` draft or archived. Private per user |
| `slip_selections` | Legs of a draft | Same fields as bet legs plus `event_start_at` and `verification_status` (user_entered, needs_review, verified). Owned through the parent draft |

| Function | Purpose |
| --- | --- |
| `create_bet(p_bet, p_selections)` | Creates a pending bet and its legs atomically; owner from the session |
| `update_bet(p_id, p_patch, p_selections)` | Updates the keys present (null clears) and optionally replaces legs, atomically; returns false for a bet that is missing or not the caller's |

Database rules that mirror the engine: pending has no settlement date or return; won needs a settlement date and a return strictly greater than the stake; lost and void need a settlement date and no return; settled time cannot be before placed time. Deleting a user deletes their profile, bets and legs. `bets.slip_draft_id` (optional) links a bet to the draft it was recorded from; the foreign key covers (draft, owner), and deleting the draft clears only the link. `create_bet` sets it when the caller gives a draft the same user owns; `update_bet` does not change it.

## Next

Phase two, in order: steps 8 to 14 are done. Next: **step 15** Telegram, **step 16** private beta. Hosting for live testing comes first. The AI adapter must treat model output as an untrusted draft and may not invent odds, fixtures, markets or booking codes.

Older notes:

Follow [`NEXT_STEPS.md`](NEXT_STEPS.md) (backend and frontend steps) and [`FRONTEND_TASKS.md`](FRONTEND_TASKS.md) (prompts F1 to F6). Before anything else: set up `.env.local` and the Supabase Auth settings ([`SUPABASE_AUTH_CHECKLIST.md`](SUPABASE_AUTH_CHECKLIST.md)), then run the live check in NEXT_STEPS B2.

Do not start the slip parser or any AI work until the tracker works end to end.

## Not verified yet

- - `lib/services/supabase-repository.ts` type-checks and mirrors the test repository, and the two SQL functions it calls were checked live. But it has **not been run through the real supabase-js client against the live API**, and neither has sign-in itself: the build environment cannot reach Supabase. Do the live check in NEXT_STEPS B2 (create, list, settle, dashboard, second user sees nothing). Pay attention to the embedded `bet_selections(*)` select and the `count: "exact"` paging.
- Email confirmation and the sign-in pages have only been built and compiled, not clicked through against real Supabase Auth.
- `npm audit` reports dev-only findings in Vitest 2.x and its dependencies (esbuild, tinypool). They do not ship in the app; upgrading Vitest to a current major is a small separate task.

## Not built yet


## How to change the database

1. Add a new file to `supabase/migrations/` named `YYYYMMDDHHMMSS_what_it_does.sql`. Never edit a migration that has already been applied.
2. Every new table needs row-level security turned on, policies, and cases in `supabase/tests/rls.test.ts` that prove one user cannot touch another's rows. Include statements with no `WHERE` clause. Functions that write for users should be `security invoker` and take the owner from `auth.uid()`.
3. Run `npm test`. The tests apply every migration in order on an in-memory Postgres.
4. Apply it to the Supabase project (through the Supabase connector in a Claude session, or the Supabase CLI), then check the project's security advisor.
5. If Supabase records a different version number than the filename, rename the file to match.

## Open questions

None right now.

## Repo notes

- The Next.js app lives at the repo root together with the engine and tests (one `package.json`, one `tsconfig.json`). TypeScript is kept on 5.x on purpose.
- Real secrets go in `.env.local` (gitignored). Variable names are in `.env.example`. Only the project URL and the publishable key (`sb_publishable_...`) may appear in browser code. The secret key (`sb_secret_...`) stays server-side and never goes in git or chat.
- Work on short branches (e.g. `feat/api-layer`) and open a pull request into `main`.
