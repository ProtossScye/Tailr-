# 03 — Step-by-Step Roadmap

## Phase 0: Align and validate (2–4 days)
1. Agree on V1 promise and exclusions.
2. Assign roles and weekly availability.
3. Interview 5–8 bettors first, then continue toward 15–25.
4. Collect anonymized sample slips with permission.
5. Create shared Git repo and issue board.
**Exit:** both founders agree what V1 is and is not.

## Phase 1: UX and brand (3–5 days)
1. Sketch onboarding, preferences, slip review, add-bet, dashboard, history.
2. Choose three brand adjectives and make a moodboard.
3. Design empty, loading, error, and low-confidence states.
4. Test with 3–5 people.

## Phase 2: Foundation (3–7 days)
Choose stack based on team skills; set up app, linting, tests, deployment, auth, migrations, per-user access rules, environment secrets, and basic error logging.

## Phase 3: Manual tracker (4–7 days)
Build add/edit/delete bet form; statuses; pure calculation functions; tests for wins/losses/voids/pending/zero denominator/date boundaries; history and dashboard. **Build this as the first end-to-end feature.**

## Phase 4: Slip workspace (5–10 days)
Text input → structured schema → review/correct UI → save/copy/share. Add image/OCR only after text flow works. Use mock parser fixtures while building UI.

## Phase 5: Personalization (4–7 days)
Store explicit preferences; implement deterministic rules; allow per-request override; ask before saving inferred preferences; explain suggestions.

## Phase 6: AI integration (3–7+ days)
Use a server-side model adapter, schema-validate output, treat it as a draft, add timeouts/rate limits/cost logging, and evaluate against anonymized examples.

## Phase 7: Telegram (3–7 days)
Secure account linking; support private text first, images later; reuse same backend; never reveal private records in groups.

## Phase 8: X feasibility and integration
Verify current developer access, terms, pricing, rate limits, mention/reply/DM support, and media access. Implement only if viable; handle duplicates and inaccessible content.

## Phase 9: Private beta (2 weeks)
Recruit 20–50 testers; measure first slip, first recorded bet, repeat use, corrections, and errors; interview users; fix top three blockers. Prepare privacy/terms/responsible-use materials with appropriate review.

## Weekly rhythm
Monday: choose one measurable outcome. Midweek: demo. Friday: test, review feedback, and decide what not to build.
