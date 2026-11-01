import type { BetStatus, Currency, DateRange, Summary } from "../accounting";

/** Money is always integer minor units: kobo for NGN, cents for USD. */

export interface SelectionInput {
  sport?: string | null;
  event: string;
  marketType?: string | null;
  selection: string;
  /** Decimal odds, at least 1. Rounded to 3 decimal places. */
  oddsDecimal?: number | null;
}

export interface CreateBetInput {
  currency: Currency;
  stakeMinor: number;
  bookmakerLabel?: string | null;
  decimalOdds?: number | null;
  /** A Date, or an ISO string that includes a timezone, e.g. 2026-10-15T12:00:00Z. */
  placedAt: Date | string;
  notes?: string | null;
  /** At least one, at most 50. */
  selections: SelectionInput[];
}

/**
 * Only the fields present are changed. `null` clears an optional field. Status,
 * settlement and return are NOT editable here; use settleBet.
 */
export interface UpdateBetInput {
  currency?: Currency;
  stakeMinor?: number;
  bookmakerLabel?: string | null;
  decimalOdds?: number | null;
  placedAt?: Date | string;
  notes?: string | null;
  /** When given, replaces all legs. */
  selections?: SelectionInput[];
}

/**
 * A bet that pays back less than its stake is recorded as "void", not "won".
 * A won bet's gross return is the total paid out, stake included.
 */
export type SettleBetInput =
  | { outcome: "won"; grossReturnMinor: number; settledAt?: Date | string }
  | { outcome: "lost" | "void"; settledAt?: Date | string };

export interface ListBetsQuery {
  status?: BetStatus;
  currency?: Currency;
  /** 1 to 200, default 50. */
  limit?: number;
  /** Default 0. */
  offset?: number;
}

export interface SelectionView {
  id: string;
  sport: string | null;
  event: string;
  marketType: string | null;
  selection: string;
  oddsDecimal: number | null;
  sortOrder: number;
}

export interface BetView {
  id: string;
  currency: Currency;
  stakeMinor: number;
  bookmakerLabel: string | null;
  decimalOdds: number | null;
  status: BetStatus;
  placedAt: Date;
  settledAt: Date | null;
  /** Total paid out, stake included. Only set for won bets. */
  grossReturnMinor: number | null;
  /** Derived by lib/accounting, never stored. null while pending. */
  netProfitMinor: number | null;
  provenance: "user_reported";
  notes: string | null;
  selections: SelectionView[];
  createdAt: Date;
  updatedAt: Date;
}

export interface BetPage {
  items: BetView[];
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface DashboardStats {
  range: DateRange;
  /** One independent summary per currency. Currencies are never added together. */
  byCurrency: Record<Currency, Summary>;
}
