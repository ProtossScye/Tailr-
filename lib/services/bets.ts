import {
  AccountingError,
  CURRENCIES,
  formatMoney,
  summarizeByCurrency,
  type BetStatus,
  type Currency,
  type DateRange,
} from "../accounting";
import { NotFoundError } from "./errors";
import { toBetView, toEngineBet } from "./mapping";
import type { BetRepository } from "./repository";
import { Issues, isUuid, parseCreate, parseSettle, parseUpdate } from "./validate";
import type {
  BetPage,
  BetView,
  CreateBetInput,
  DashboardStats,
  ListBetsQuery,
  SettleBetInput,
  UpdateBetInput,
} from "./types";

/**
 * Bet services. All logic lives here, not in route handlers or components, so the
 * web app, Telegram and X can share it. Each call acts for the one signed-in user the
 * repository is bound to; privacy is enforced by the database as well as by this code.
 */

export interface ServiceDeps {
  repo: BetRepository;
  /** Injected so tests can control the clock. Defaults to the real time. */
  now?: () => Date;
}

const nowOf = (deps: ServiceDeps): Date => (deps.now ?? (() => new Date()))();

/** Everything from the start of time to the end of time, for "all-time" stats. */
export const ALL_TIME: DateRange = { start: new Date(0), end: new Date(8_640_000_000_000_000) };

const STATUSES: readonly BetStatus[] = ["pending", "won", "lost", "void"];
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

async function loadOrThrow(deps: ServiceDeps, id: string) {
  if (!isUuid(id)) throw new NotFoundError();
  const found = await deps.repo.getBet(id);
  if (found === null) throw new NotFoundError();
  return found;
}

/** Adds a new PENDING bet with its legs. Status, owner and return cannot be set here. */
export async function createBet(deps: ServiceDeps, input: CreateBetInput): Promise<BetView> {
  const { bet, selections } = parseCreate(input, nowOf(deps));
  const id = await deps.repo.createBet(bet, selections);
  const created = await deps.repo.getBet(id);
  if (created === null) throw new Error("The bet was saved but could not be read back");
  return toBetView(created);
}

export async function getBet(deps: ServiceDeps, id: string): Promise<BetView> {
  return toBetView(await loadOrThrow(deps, id));
}

/** The user's bets, newest placed first. */
export async function listBets(deps: ServiceDeps, query: ListBetsQuery = {}): Promise<BetPage> {
  const issues = new Issues();
  const limit = query.limit ?? DEFAULT_LIMIT;
  const offset = query.offset ?? 0;

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) issues.add("limit", `Use a whole number from 1 to ${MAX_LIMIT}`);
  if (!Number.isInteger(offset) || offset < 0) issues.add("offset", "Use a whole number, zero or more");
  if (query.status !== undefined && !STATUSES.includes(query.status)) issues.add("status", "Choose pending, won, lost or void");
  if (query.currency !== undefined && !(CURRENCIES as readonly string[]).includes(query.currency)) {
    issues.add("currency", `Choose one of: ${CURRENCIES.join(", ")}`);
  }
  issues.throwIfAny();

  // One extra row tells us whether there is a next page.
  const rows = await deps.repo.listBets({ status: query.status, currency: query.currency, limit: limit + 1, offset });
  return {
    items: rows.slice(0, limit).map(toBetView),
    limit,
    offset,
    hasMore: rows.length > limit,
  };
}

/**
 * Edits bet details (and, when given, replaces the legs). Cannot change the result:
 * use settleBet for that. The edited bet must still be consistent, for example a won
 * bet cannot have its stake raised above its return.
 */
export async function updateBet(deps: ServiceDeps, id: string, input: UpdateBetInput): Promise<BetView> {
  const now = nowOf(deps);
  const { patch, selections } = parseUpdate(input, now);
  const existing = toBetView(await loadOrThrow(deps, id));

  const issues = new Issues();
  const stake = patch.stake_minor ?? existing.stakeMinor;
  const currency: Currency = patch.currency ?? existing.currency;
  const placedAt = patch.placed_at !== undefined ? new Date(patch.placed_at) : existing.placedAt;

  if (existing.status === "won" && existing.grossReturnMinor !== null && stake > existing.grossReturnMinor) {
    issues.add(
      "stakeMinor",
      `This bet is marked as won with a return of ${formatMoney(existing.grossReturnMinor, currency)}. A won bet can't return less than its stake. Settle it again first if the result changed.`,
    );
  }
  if (existing.settledAt !== null && placedAt.getTime() > existing.settledAt.getTime()) {
    issues.add("placedAt", "Placement time can't be after the time the bet was settled");
  }
  issues.throwIfAny();

  const updated = await deps.repo.updateBet(id, patch, selections);
  if (!updated) throw new NotFoundError();
  return getBet(deps, id);
}

/**
 * Records the result. Works on any bet, so a mistake can be corrected (won to lost,
 * a new return amount). A bet that pays back less than its stake is "void", not "won".
 * A won bet's grossReturnMinor is the total paid out, stake included.
 */
export async function settleBet(deps: ServiceDeps, id: string, input: SettleBetInput): Promise<BetView> {
  const now = nowOf(deps);
  const parsed = parseSettle(input, now);
  const existing = toBetView(await loadOrThrow(deps, id));

  const issues = new Issues();
  if (parsed.outcome === "won" && parsed.grossReturnMinor !== null && parsed.grossReturnMinor < existing.stakeMinor) {
    issues.add(
      "grossReturnMinor",
      `The stake was ${formatMoney(existing.stakeMinor, existing.currency)}. A bet that returns less than its stake should be recorded as void, not won.`,
    );
  }

  // With no time given, settle "now", but never before the bet was placed.
  const settledAt = parsed.settledAt ?? new Date(Math.max(now.getTime(), existing.placedAt.getTime()));
  if (settledAt.getTime() < existing.placedAt.getTime()) {
    issues.add("settledAt", "Settlement time can't be before the bet was placed");
  }
  issues.throwIfAny();

  const updated = await deps.repo.updateBet(id, {
    status: parsed.outcome,
    settled_at: settledAt.toISOString(),
    gross_return_minor: parsed.outcome === "won" ? parsed.grossReturnMinor : null,
  });
  if (!updated) throw new NotFoundError();
  return getBet(deps, id);
}

/** Deletes the bet and its legs. */
export async function deleteBet(deps: ServiceDeps, id: string): Promise<void> {
  if (!isUuid(id)) throw new NotFoundError();
  const deleted = await deps.repo.deleteBet(id);
  if (!deleted) throw new NotFoundError();
}

/**
 * Dashboard numbers from every bet the user owns, computed by lib/accounting: one
 * summary per currency, by settlement date within `range` (default: all time).
 */
export async function getDashboardStats(
  deps: ServiceDeps,
  options: { range?: DateRange } = {},
): Promise<DashboardStats> {
  const range = options.range ?? ALL_TIME;
  const issues = new Issues();
  if (
    !(range.start instanceof Date) ||
    !(range.end instanceof Date) ||
    Number.isNaN(range.start.getTime()) ||
    Number.isNaN(range.end.getTime()) ||
    range.start.getTime() >= range.end.getTime()
  ) {
    issues.add("range", "Use a valid date range where the start is before the end");
  }
  issues.throwIfAny();

  const rows = await deps.repo.listAllBetsForStats();
  try {
    return { range, byCurrency: summarizeByCurrency(rows.map(toEngineBet), range) };
  } catch (error) {
    if (error instanceof AccountingError) throw new Error(`Stored bet data is inconsistent: ${error.message}`);
    throw error;
  }
}
