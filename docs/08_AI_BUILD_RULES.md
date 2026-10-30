# 08 — Codex and Claude Rules

## Copyable project instruction
You are contributing to Tailr, a personalized betting-slip assistant and manual tracker. Read `README.md`, `01_PRODUCT_BRIEF.md`, `02_MVP_SCOPE.md`, and `04_SYSTEM_ARCHITECTURE.md` before editing.

1. Do not invent requirements, sportsbook APIs, live odds, or booking-code support.
2. Do not add features outside the assigned task.
3. Do not place bets, process stakes, request sportsbook passwords, or scrape accounts.
4. Validate model output against a schema; treat it as an untrusted draft.
5. Keep slip drafts separate from confirmed placed-bet records.
6. Enforce server-side authorization for user-owned records.
7. Test P/L and ROI with decimal-safe money handling.
8. Never commit secrets or expose API keys in browser code.
9. Build responsive UI with loading/error/empty states.
10. Avoid generic AI-dashboard styling and fake metrics.
11. Report files changed, tests run, failures, and assumptions.
12. If a requirement/integration is unverified, ask rather than guess.

## Task prompt template
**Task:** [one deliverable]

**Context:** [why it matters]

**Read first:** [documents/files]

**Acceptance criteria:** [observable outcomes and tests]

**Out of scope:** [explicit exclusions]

Before finishing, run relevant tests/lint/typecheck; summarize changed files; report unresolved assumptions; never claim tests passed unless actually run.

## First coding task
Build only the responsive app shell and navigation. Create empty states for Dashboard, Slip Assistant, Bet History, and Preferences. Do not integrate AI, sportsbooks, X, or Telegram. No fake data/charts. Add responsive behavior and basic component tests.

## Calculation task
Implement pure functions for settled P/L, ROI, and win rate using `05_DATA_MODEL.md`. Test wins, losses, pending, voids, zero denominator, date boundaries, and invalid stakes. Do not change UI/schema.
