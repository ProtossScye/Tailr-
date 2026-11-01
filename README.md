# Tailr

Tailr is a personalized betting-slip assistant with manual bet tracking and a performance dashboard (V1 audience: Nigerian bettors).

**Start here:** read [`docs/STATUS.md`](docs/STATUS.md) for what is done and what is next, then the project pack in [`docs/`](docs/README.md).

## What exists today

- `lib/accounting/`: the calculation engine (settled P/L, ROI, win rate, Lagos date ranges, NGN and USD in integer minor units). Pure TypeScript, tested, no dependencies on the rest of the app. See [`lib/accounting/README.md`](lib/accounting/README.md) for the rules.
- `lib/services/`: the bet services (add, edit, settle, delete, list, dashboard totals). See [`lib/services/README.md`](lib/services/README.md).
- `supabase/`: database migrations (`profiles`, `bets`, `bet_selections`) and schema tests. See "How to change the database" in [`docs/STATUS.md`](docs/STATUS.md).

## Run the tests

```bash
npm install
npm test
npm run typecheck
```

## Ground rules

Tailr does not place bets, handle money, or log into sportsbook accounts. Never commit secrets: real values go in `.env.local`, names only in `.env.example`. See [`docs/08_AI_BUILD_RULES.md`](docs/08_AI_BUILD_RULES.md) before using Codex or Claude on a task.
