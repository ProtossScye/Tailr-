import { CURRENCIES, netProfitMinor, type Bet, type BetStatus, type Currency } from "../accounting";
import type { BetRow, BetWithSelections, SelectionRow, StatsBetRow } from "./repository";
import type { BetView, SelectionView } from "./types";

/**
 * Turns database rows into the shapes the app and the accounting engine use. Drivers
 * disagree on how to return numbers and dates (bigint, string or number; Date or ISO
 * string), so everything is normalized here, and anything unexpected throws loudly.
 */

const STATUSES: readonly BetStatus[] = ["pending", "won", "lost", "void"];

export function toSafeInteger(value: unknown, field: string): number {
  const n = typeof value === "bigint" || typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isSafeInteger(n)) {
    throw new Error(`Unexpected value for ${field}: ${String(value)}`);
  }
  return n;
}

export function toInstant(value: unknown, field: string): Date {
  const d = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  if (d === null || Number.isNaN(d.getTime())) {
    throw new Error(`Unexpected date for ${field}: ${String(value)}`);
  }
  return d;
}

function toOdds(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) {
    throw new Error(`Unexpected odds for ${field}: ${String(value)}`);
  }
  return n;
}

export function asCurrency(value: unknown): Currency {
  if (typeof value === "string" && (CURRENCIES as readonly string[]).includes(value)) return value as Currency;
  throw new Error(`Unexpected currency: ${String(value)}`);
}

export function asStatus(value: unknown): BetStatus {
  if (typeof value === "string" && (STATUSES as readonly string[]).includes(value)) return value as BetStatus;
  throw new Error(`Unexpected status: ${String(value)}`);
}

/** The shape lib/accounting expects. The engine validates it again on the way in. */
export function toEngineBet(row: StatsBetRow): Bet {
  return {
    id: row.id,
    currency: asCurrency(row.currency),
    stakeMinor: toSafeInteger(row.stake_minor, "stake_minor"),
    status: asStatus(row.status),
    grossReturnMinor:
      row.gross_return_minor === null ? undefined : toSafeInteger(row.gross_return_minor, "gross_return_minor"),
    placedAt: toInstant(row.placed_at, "placed_at"),
    settledAt: row.settled_at === null ? undefined : toInstant(row.settled_at, "settled_at"),
  };
}

function toSelectionView(row: SelectionRow): SelectionView {
  return {
    id: row.id,
    sport: row.sport,
    event: row.event,
    marketType: row.market_type,
    selection: row.selection,
    oddsDecimal: toOdds(row.odds_decimal, "odds_decimal"),
    sortOrder: row.sort_order,
  };
}

export function toBetView({ bet, selections }: { bet: BetRow; selections: SelectionRow[] } | BetWithSelections): BetView {
  if (bet.provenance !== "user_reported") throw new Error(`Unexpected provenance: ${String(bet.provenance)}`);
  const engine = toEngineBet(bet);
  return {
    id: bet.id,
    currency: engine.currency,
    stakeMinor: engine.stakeMinor,
    bookmakerLabel: bet.bookmaker_label,
    decimalOdds: toOdds(bet.decimal_odds, "decimal_odds"),
    status: engine.status,
    placedAt: engine.placedAt,
    settledAt: engine.settledAt ?? null,
    grossReturnMinor: engine.grossReturnMinor ?? null,
    netProfitMinor: netProfitMinor(engine),
    provenance: "user_reported",
    notes: bet.notes,
    selections: [...selections].map(toSelectionView).sort((a, b) => a.sortOrder - b.sortOrder),
    createdAt: toInstant(bet.created_at, "created_at"),
    updatedAt: toInstant(bet.updated_at, "updated_at"),
  };
}
