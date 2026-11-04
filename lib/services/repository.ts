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
  /** The draft this bet was recorded from, when the user chose to link it. */
  slip_draft_id: string | null;
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
  /** Must be a draft the same user owns; the database refuses anything else. */
  slip_draft_id?: string | null;
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

// Slip drafts ------------------------------------------------------------------------

export interface SlipRow {
  id: string;
  user_id: string;
  name: string;
  source_type: string;
  source_bookmaker: string | null;
  status: string;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface SlipSelectionRow {
  id: string;
  slip_draft_id: string;
  sport: string | null;
  event: string;
  event_start_at: string | Date | null;
  market_type: string | null;
  selection: string;
  odds_decimal: number | string | null;
  verification_status: string;
  sort_order: number;
  created_at: string | Date;
}

export interface SlipWithSelections {
  slip: SlipRow;
  selections: SlipSelectionRow[];
}

export interface NewSlipRecord {
  name: string;
  source_bookmaker: string | null;
}

/** Only keys that are present are changed. null clears source_bookmaker; the name cannot be cleared. */
export interface SlipPatchRecord {
  name?: string;
  source_bookmaker?: string | null;
  status?: "draft" | "archived";
}

export interface ListSlipsQuery {
  status?: "draft" | "archived";
  limit: number;
  offset: number;
}

/** Like BetRepository: acts for ONE signed-in user, no method takes a user id. */
export interface SlipRepository {
  /** Creates a manual draft and its selections together or not at all. Returns the new id. */
  createSlip(slip: NewSlipRecord, selections: NewSelectionRecord[]): Promise<string>;
  /** null when it does not exist or belongs to someone else. */
  getSlip(id: string): Promise<SlipWithSelections | null>;
  /** Most recently changed first. */
  listSlips(query: ListSlipsQuery): Promise<SlipWithSelections[]>;
  /** Updates fields and, when given, replaces the selections, atomically. false when not found. */
  updateSlip(id: string, patch: SlipPatchRecord, selections?: NewSelectionRecord[]): Promise<boolean>;
  /** false when not found. Selections are deleted with the draft; bets made from it are kept. */
  deleteSlip(id: string): Promise<boolean>;
}

// Preferences ------------------------------------------------------------------------

export interface PreferencesRow {
  user_id: string;
  favorite_sports: string[];
  preferred_markets: string[];
  avoided_markets: string[];
  slip_style: string | null;
  target_odds_min: number | string | null;
  target_odds_max: number | string | null;
  detail_level: string;
  explicitly_confirmed_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}

/** Every field is replaced on save; a null or empty value means "not set". */
export interface PreferencesRecord {
  favorite_sports: string[];
  preferred_markets: string[];
  avoided_markets: string[];
  slip_style: "cautious" | "balanced" | "ambitious" | null;
  target_odds_min: number | null;
  target_odds_max: number | null;
  detail_level: "brief" | "standard" | "detailed";
}

/** Acts for ONE signed-in user, like the other repositories. */
export interface PreferencesRepository {
  /** null when the user has never saved preferences. */
  getPreferences(): Promise<PreferencesRow | null>;
  /** Creates or replaces the user's row. */
  savePreferences(record: PreferencesRecord): Promise<void>;
  /** false when there was nothing to remove. */
  clearPreferences(): Promise<boolean>;
}
