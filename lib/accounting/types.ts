/**
 * Shared types for the Tailr accounting engine.
 *
 * Money is ALWAYS an integer number of minor units:
 *   NGN -> kobo  (₦5,000.00 = 500000)
 *   USD -> cents ($12.50    = 1250)
 * Never store or pass floats for money.
 */

export const CURRENCIES = ["NGN", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export type BetStatus = "pending" | "won" | "lost" | "void";

export interface Bet {
  id: string;
  currency: Currency;
  /** Stake in minor units. Must be a positive safe integer. */
  stakeMinor: number;
  status: BetStatus;
  /**
   * Total amount returned for a winning bet (stake + winnings), in minor units.
   * Required when status is "won". Ignored for other statuses.
   */
  grossReturnMinor?: number;
  /** When the bet was placed (an absolute instant; stored/compared in UTC). */
  placedAt: Date;
  /** When the bet was settled. Required unless status is "pending". */
  settledAt?: Date;
}

/** Half-open interval: start is included, end is excluded. */
export interface DateRange {
  start: Date;
  end: Date;
}

export interface Summary {
  currency: Currency;
  /** Sum of net profit for settled (won/lost) bets in range. Can be negative. */
  netProfitMinor: number;
  /** Sum of stakes for the same won/lost bets that feed ROI. Voids excluded. */
  settledStakeMinor: number;
  /** netProfit / settledStake * 100. null when settledStake is 0. Unrounded. */
  roiPercent: number | null;
  /** wins / (wins + losses) * 100. null when there are no wins or losses. Unrounded. */
  winRatePercent: number | null;
  wins: number;
  losses: number;
  /** Voids settled in range. Counted for display only; excluded from ROI and win rate. */
  voids: number;
  /** All currently pending bets in this currency. Not filtered by date range. */
  pendingCount: number;
  pendingStakeMinor: number;
}
