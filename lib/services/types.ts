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
  /** Record this bet as made from one of the user's own drafts. The draft stays a draft. */
  slipDraftId?: string | null;
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
  /** The draft this bet was recorded from, if any. */
  slipDraftId: string | null;
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

// Slip drafts

export interface CreateSlipInput {
  /** Optional. Defaults to the first event, plus "+N" when there are more. */
  name?: string | null;
  sourceBookmaker?: string | null;
  /** At least one, at most 50. */
  selections: SelectionInput[];
}

/** Only the fields present are changed. `null` clears sourceBookmaker. */
export interface UpdateSlipInput {
  name?: string;
  sourceBookmaker?: string | null;
  status?: "draft" | "archived";
  /** When given, replaces all selections. */
  selections?: SelectionInput[];
}

export interface ListSlipsQuery {
  /** Default: every status. */
  status?: "draft" | "archived";
  /** 1 to 200, default 50. */
  limit?: number;
  offset?: number;
}

export interface SlipSelectionView {
  id: string;
  sport: string | null;
  event: string;
  marketType: string | null;
  selection: string;
  oddsDecimal: number | null;
  /** user_entered for everything typed by the person. Tailr never marks anything verified. */
  verificationStatus: "user_entered" | "needs_review" | "verified";
  sortOrder: number;
}

/** A draft is never a bet. It becomes one only when the user records it themselves. */
export interface SlipView {
  id: string;
  name: string;
  sourceType: "manual" | "pasted_text" | "image";
  sourceBookmaker: string | null;
  status: "draft" | "archived";
  selections: SlipSelectionView[];
  createdAt: Date;
  updatedAt: Date;
}

export interface SlipPage {
  items: SlipView[];
  limit: number;
  offset: number;
  hasMore: boolean;
}
