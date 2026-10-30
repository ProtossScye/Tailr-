import { AccountingError } from "./errors";
import { assertValidCurrency, assertValidReturn, assertValidStake } from "./money";
import { CURRENCIES, type Bet, type Currency, type DateRange, type Summary } from "./types";

function assertValidDate(value: unknown, label: string): asserts value is Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new AccountingError(`Invalid ${label}: expected a valid Date`);
  }
}

/** Validates everything the engine relies on for one bet. Throws AccountingError. */
function assertValidBet(bet: Bet): void {
  assertValidCurrency(bet.currency);
  assertValidStake(bet.stakeMinor);
  assertValidDate(bet.placedAt, `placedAt for bet ${bet.id}`);

  switch (bet.status) {
    case "pending":
      return;
    case "won":
      if (bet.grossReturnMinor === undefined) {
        throw new AccountingError(`Won bet ${bet.id} needs a gross return`);
      }
      assertValidReturn(bet.grossReturnMinor);
      // V1 has no partial/half-win support: a win must return at least the stake.
      if (bet.grossReturnMinor < bet.stakeMinor) {
        throw new AccountingError(
          `Won bet ${bet.id} returns less than its stake; partial returns are not supported`,
        );
      }
      break;
    case "lost":
    case "void":
      break;
    default:
      throw new AccountingError(`Unknown status on bet ${bet.id}: ${String(bet.status)}`);
  }
  assertValidDate(bet.settledAt, `settledAt for settled bet ${bet.id}`);
}

/**
 * Net profit for one bet, in minor units.
 *   won     -> grossReturn - stake
 *   lost    -> -stake
 *   void    -> 0
 *   pending -> null (not settled, excluded from P/L)
 */
export function netProfitMinor(bet: Bet): number | null {
  assertValidBet(bet);
  switch (bet.status) {
    case "won":
      return (bet.grossReturnMinor as number) - bet.stakeMinor;
    case "lost":
      return -bet.stakeMinor;
    case "void":
      return 0;
    case "pending":
      return null;
  }
}

function assertValidRange(range: DateRange): void {
  assertValidDate(range.start, "range start");
  assertValidDate(range.end, "range end");
  if (range.start.getTime() >= range.end.getTime()) {
    throw new AccountingError("Invalid range: start must be before end");
  }
}

function assertSafeTotal(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new AccountingError(`${label} exceeds the safe integer range`);
  }
}

/**
 * Summary for ONE currency over a half-open settlement-date range [start, end).
 *
 * - Won/lost bets count by settledAt falling inside the range.
 * - Void bets are counted but excluded from stake, ROI and win rate.
 * - Pending bets are never in P/L or ROI. They are reported separately and are
 *   NOT filtered by the range (they have no settlement date yet).
 * - ROI and win rate are null (not NaN) when their denominator is 0.
 * - Nothing is rounded here; round only for display.
 *
 * Every bet passed in is validated, even ones in other currencies or outside
 * the range, so corrupt data fails loudly instead of being silently skipped.
 */
export function summarize(bets: readonly Bet[], range: DateRange, currency: Currency): Summary {
  assertValidCurrency(currency);
  assertValidRange(range);

  const start = range.start.getTime();
  const end = range.end.getTime();

  let profit = 0;
  let stake = 0;
  let wins = 0;
  let losses = 0;
  let voids = 0;
  let pendingCount = 0;
  let pendingStake = 0;

  for (const bet of bets) {
    assertValidBet(bet);
    if (bet.currency !== currency) continue;

    if (bet.status === "pending") {
      pendingCount += 1;
      pendingStake += bet.stakeMinor;
      continue;
    }

    const settled = (bet.settledAt as Date).getTime();
    if (settled < start || settled >= end) continue;

    if (bet.status === "void") {
      voids += 1;
      continue;
    }

    profit += netProfitMinor(bet) as number;
    stake += bet.stakeMinor;
    if (bet.status === "won") wins += 1;
    else losses += 1;
  }

  assertSafeTotal(profit, "Net profit");
  assertSafeTotal(stake, "Settled stake");
  assertSafeTotal(pendingStake, "Pending stake");

  return {
    currency,
    netProfitMinor: profit,
    settledStakeMinor: stake,
    roiPercent: stake > 0 ? (profit * 100) / stake : null,
    winRatePercent: wins + losses > 0 ? (wins * 100) / (wins + losses) : null,
    wins,
    losses,
    voids,
    pendingCount,
    pendingStakeMinor: pendingStake,
  };
}

/**
 * One independent Summary per supported currency. Currencies are never
 * combined into a single total, because there is no exchange rate in V1.
 */
export function summarizeByCurrency(
  bets: readonly Bet[],
  range: DateRange,
): Record<Currency, Summary> {
  const result = {} as Record<Currency, Summary>;
  for (const currency of CURRENCIES) {
    result[currency] = summarize(bets, range, currency);
  }
  return result;
}
