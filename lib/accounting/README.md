# Tailr accounting engine

Pure TypeScript. No database, framework, UI or network. Nothing in this folder imports from outside it, so it can be dropped into the Next.js app (or a Telegram worker) unchanged.

## Money

- Every amount is an **integer in minor units**: kobo for NGN, cents for USD (`₦5,000.00` = `500000`).
- Supported currencies: `NGN`, `USD`. Anything else throws.
- Currencies are **never combined** into one total (there is no exchange rate in V1). Use `summarize(bets, range, "NGN")` or `summarizeByCurrency(bets, range)`.
- Nothing is rounded inside calculations. `formatMoney` and `formatPercent` round/format only for display.

## Rules (decisions to copy into `10_DECISIONS_AND_RISKS.md`)

| Rule | Decision |
| --- | --- |
| Win | net profit = gross return − stake. Gross return must be ≥ stake. |
| Loss | net profit = −stake |
| Void | net profit = 0. **Excluded from ROI denominator and win rate.** Counted in `voids` for display. |
| Pending | Excluded from P/L, ROI and win rate. Reported as `pendingCount` / `pendingStakeMinor`. Not filtered by date range. |
| ROI | `netProfit ÷ settledStake × 100`, over won + lost bets settled in range. `null` when settled stake is 0. |
| Win rate | `wins ÷ (wins + losses) × 100`. `null` when there are none. |
| Date filter | By **settlement date**, half-open `[start, end)`. |
| Lagos days | UTC+1, no daylight saving. A Lagos day runs 23:00 UTC → 23:00 UTC. |
| Cash-out | Not supported. Accounting must be defined before it is added. |
| Partial / half wins | Not supported. A "won" bet returning less than its stake throws. |

## API

```ts
import {
  summarize, summarizeByCurrency, netProfitMinor,
  lagosDayRange, lagosDateRange, lagosDayRangeContaining,
  formatMoney, formatPercent,
} from "@/lib/accounting";

const today = lagosDayRange("2026-10-30");
const ngn = summarize(bets, today, "NGN");
formatMoney(ngn.netProfitMinor, "NGN"); // "-₦1,000.00"
formatPercent(ngn.roiPercent);          // "-10.0%" or "n/a"
```

Invalid input (bad stake, missing settlement date, unknown currency, reversed range…) throws `AccountingError`. Every bet passed to `summarize` is validated, including ones in other currencies or outside the range, so corrupt rows fail loudly instead of being silently skipped.

## Commands

```bash
npm install
npm test         # vitest run
npm run typecheck
```
