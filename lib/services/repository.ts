import type { BetStatus, Currency } from "../accounting";

/**
 * The only way the services touch the database. There are two implementations:
 * the Supabase one (supabase-repository.ts) and an in-memory Postgres one used by
 * the tests, so the tests run the real SQL, constraints and privacy rules.
 *
 * A repository acts for ONE signed-in user. No method takes a user id: the owner
 * always comes from the session, so a caller cannot act for someone else.
 */

// What the database returns. Numbers and dates arrive in different shapes depending
// on the driver (bigint, string or number; Date or ISO string); mapping.ts normalizes them.

export interface BetRow {
  id: string;
  user_id: string;
  bookmaker_label: string | null;
  currency: string;
  stake_minor: number | string | bigint;
  decimal_odds: number | string | null;
  status: string;
  placed_at: string | Date;
  settled_at: string | Date | null;
  gross_return_minor: number | string | bigint | null;
  provenance: string;
  notes: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface SelectionRow {
  id: string;
  bet_id: string;
  sport: string | null;
  event: string;
  market_type: string | null;
  selection: string;
  odds_decimal: number | string | null;
  sort_order: number;
  created_at: string | Date;
}

export interface BetWithSelections {
  bet: BetRow;
  selections: SelectionRow[];
}

/** Just the columns the dashboard needs. */
export type StatsBetRow = Pick<
  BetRow,
  "id" | "currency" | "stake_minor" | "status" | "placed_at" | "settled_at" | "gross_return_minor"
>;

// What the services send to the database.

export interface NewSelectionRecord {
  sport: string | null;
  event: string;
  market_type: string | null;
  selection: string;
  odds_decimal: number | null;
}

export interface NewBetRecord {
  bookmaker_label: string | null;
  currency: Currency;
  stake_minor: number;
  decimal_odds: number | null;
  /** ISO 8601 with timezone. */
  placed_at: string;
  notes: string | null;
}

/** Only keys that are present are changed. null clears the field. */
export interface BetPatchRecord {
  bookmaker_label?: string | null;
  currency?: Currency;
  stake_minor?: number;
  decimal_odds?: number | null;
  status?: BetStatus;
  placed_at?: string;
  settled_at?: string | null;
  gross_return_minor?: number | null;
  notes?: string | null;
}

export interface ListQuery {
  status?: BetStatus;
  currency?: Currency;
  limit: number;
  offset: number;
}

export interface BetRepository {
  /** Creates a pending bet and its legs together or not at all. Returns the new id. */
  createBet(bet: NewBetRecord, selections: NewSelectionRecord[]): Promise<string>;
  /** null when it does not exist or belongs to someone else. */
  getBet(id: string): Promise<BetWithSelections | null>;
  /** Newest placed first. */
  listBets(query: ListQuery): Promise<BetWithSelections[]>;
  /** Every bet the user owns, however many there are. Never silently truncated. */
  listAllBetsForStats(): Promise<StatsBetRow[]>;
  /** Updates fields and, when given, replaces the legs, atomically. false when not found. */
  updateBet(id: string, patch: BetPatchRecord, selections?: NewSelectionRecord[]): Promise<boolean>;
  /** false when not found. Legs are deleted with the bet. */
  deleteBet(id: string): Promise<boolean>;
}
