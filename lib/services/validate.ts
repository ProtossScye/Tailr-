import { CURRENCIES, type Currency } from "../accounting";
import { ValidationError, type ValidationIssue } from "./errors";
import type { BetPatchRecord, NewBetRecord, NewSelectionRecord } from "./repository";

/**
 * Input checking. Every function collects ALL problems before throwing one
 * ValidationError, so a form can show every error at once. Unknown keys are ignored,
 * which means a caller can never smuggle in a user id, a status or a return amount.
 */

export const MAX_SELECTIONS = 50;
/** A clock-skew allowance: times up to this far ahead of the server clock are accepted. */
export const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const MAX_ODDS = 1_000_000;

const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class Issues {
  readonly list: ValidationIssue[] = [];

  add(field: string, message: string): void {
    this.list.push({ field, message });
  }

  throwIfAny(): void {
    if (this.list.length > 0) throw new ValidationError(this.list);
  }
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function codePoints(text: string): number {
  return [...text].length;
}

function requiredText(value: unknown, field: string, max: number, issues: Issues): string | null {
  if (typeof value !== "string" || value.trim() === "") {
    issues.add(field, "Required");
    return null;
  }
  const text = value.trim();
  if (codePoints(text) > max) {
    issues.add(field, `Keep this under ${max} characters`);
    return null;
  }
  return text;
}

/** undefined, null and blank all mean "nothing". */
function optionalText(value: unknown, field: string, max: number, issues: Issues): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    issues.add(field, "Must be text");
    return null;
  }
  const text = value.trim();
  if (text === "") return null;
  if (codePoints(text) > max) {
    issues.add(field, `Keep this under ${max} characters`);
    return null;
  }
  return text;
}

function parseCurrency(value: unknown, field: string, issues: Issues): Currency | null {
  if (typeof value === "string" && (CURRENCIES as readonly string[]).includes(value)) return value as Currency;
  issues.add(field, `Choose one of: ${CURRENCIES.join(", ")}`);
  return null;
}

function parseStake(value: unknown, field: string, issues: Issues): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  issues.add(field, "Stake must be a whole number of kobo or cents, above zero");
  return null;
}

function parseOdds(value: unknown, field: string, issues: Issues): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1 || value > MAX_ODDS) {
    issues.add(field, "Odds must be a decimal number of at least 1.00");
    return null;
  }
  return Math.round(value * 1000) / 1000;
}

/** JavaScript quietly turns 2026-02-30 into March 2, which would save a bet on the wrong day. */
function isRealCalendarDate(ymd: string): boolean {
  const [year, month, day] = ymd.split("-").map(Number) as [number, number, number];
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
}

/** A Date, or an ISO string that carries its own timezone. A zone-less string is rejected: it would be read in the server's timezone. */
export function parseInstant(value: unknown, field: string, issues: Issues): Date | null {
  if (value instanceof Date) {
    if (!Number.isNaN(value.getTime())) return value;
  } else if (typeof value === "string" && ISO_WITH_ZONE.test(value) && isRealCalendarDate(value.slice(0, 10))) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  issues.add(field, "Enter a valid date and time with a timezone, for example 2026-10-15T12:00:00Z");
  return null;
}

export function checkNotFuture(date: Date, field: string, now: Date, label: string, issues: Issues): void {
  if (date.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
    issues.add(field, `${label} can't be in the future`);
  }
}

function parseSelections(value: unknown, field: string, issues: Issues): NewSelectionRecord[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    issues.add(field, "Add at least one selection");
    return null;
  }
  if (value.length > MAX_SELECTIONS) {
    issues.add(field, `A bet can have at most ${MAX_SELECTIONS} selections`);
    return null;
  }
  const before = issues.list.length;
  const records: NewSelectionRecord[] = [];
  value.forEach((raw: unknown, index) => {
    const at = `${field}[${index}]`;
    if (!isPlainObject(raw)) {
      issues.add(at, "Expected an object");
      return;
    }
    const event = requiredText(raw.event, `${at}.event`, 200, issues);
    const selection = requiredText(raw.selection, `${at}.selection`, 200, issues);
    const sport = optionalText(raw.sport, `${at}.sport`, 80, issues);
    const marketType = optionalText(raw.marketType, `${at}.marketType`, 80, issues);
    const odds = parseOdds(raw.oddsDecimal, `${at}.oddsDecimal`, issues);
    if (event !== null && selection !== null) {
      records.push({ sport, event, market_type: marketType, selection, odds_decimal: odds });
    }
  });
  return issues.list.length > before ? null : records;
}

export function parseCreate(
  input: unknown,
  now: Date,
): { bet: NewBetRecord; selections: NewSelectionRecord[] } {
  const issues = new Issues();
  if (!isPlainObject(input)) {
    issues.add("input", "Expected an object");
    issues.throwIfAny();
  }
  const i = input as Record<string, unknown>;

  const currency = parseCurrency(i.currency, "currency", issues);
  const stake = parseStake(i.stakeMinor, "stakeMinor", issues);
  const bookmaker = optionalText(i.bookmakerLabel, "bookmakerLabel", 80, issues);
  const odds = parseOdds(i.decimalOdds, "decimalOdds", issues);
  const placedAt = parseInstant(i.placedAt, "placedAt", issues);
  if (placedAt !== null) checkNotFuture(placedAt, "placedAt", now, "Placement time", issues);
  const notes = optionalText(i.notes, "notes", 2000, issues);
  const selections = parseSelections(i.selections, "selections", issues);
  issues.throwIfAny();

  return {
    bet: {
      bookmaker_label: bookmaker,
      currency: currency as Currency,
      stake_minor: stake as number,
      decimal_odds: odds,
      placed_at: (placedAt as Date).toISOString(),
      notes,
    },
    selections: selections as NewSelectionRecord[],
  };
}

export interface ParsedUpdate {
  patch: BetPatchRecord;
  selections: NewSelectionRecord[] | undefined;
}

export function parseUpdate(input: unknown, now: Date): ParsedUpdate {
  const issues = new Issues();
  if (!isPlainObject(input)) {
    issues.add("input", "Expected an object");
    issues.throwIfAny();
  }
  const i = input as Record<string, unknown>;
  const has = (key: string) => key in i && i[key] !== undefined;

  const patch: BetPatchRecord = {};
  let selections: NewSelectionRecord[] | undefined;

  if (has("currency")) {
    const v = parseCurrency(i.currency, "currency", issues);
    if (v !== null) patch.currency = v;
  }
  if (has("stakeMinor")) {
    const v = parseStake(i.stakeMinor, "stakeMinor", issues);
    if (v !== null) patch.stake_minor = v;
  }
  if (has("bookmakerLabel")) patch.bookmaker_label = optionalText(i.bookmakerLabel, "bookmakerLabel", 80, issues);
  if (has("decimalOdds")) patch.decimal_odds = parseOdds(i.decimalOdds, "decimalOdds", issues);
  if (has("placedAt")) {
    const v = parseInstant(i.placedAt, "placedAt", issues);
    if (v !== null) {
      checkNotFuture(v, "placedAt", now, "Placement time", issues);
      patch.placed_at = v.toISOString();
    }
  }
  if (has("notes")) patch.notes = optionalText(i.notes, "notes", 2000, issues);
  if (has("selections")) {
    const v = parseSelections(i.selections, "selections", issues);
    if (v !== null) selections = v;
  }

  if (Object.keys(patch).length === 0 && selections === undefined && issues.list.length === 0) {
    issues.add("input", "Nothing to update");
  }
  issues.throwIfAny();
  return { patch, selections };
}

export interface ParsedSettle {
  outcome: "won" | "lost" | "void";
  grossReturnMinor: number | null;
  settledAt: Date | null;
}

export function parseSettle(input: unknown, now: Date): ParsedSettle {
  const issues = new Issues();
  if (!isPlainObject(input)) {
    issues.add("input", "Expected an object");
    issues.throwIfAny();
  }
  const i = input as Record<string, unknown>;

  let outcome: ParsedSettle["outcome"] | null = null;
  if (i.outcome === "won" || i.outcome === "lost" || i.outcome === "void") {
    outcome = i.outcome;
  } else {
    issues.add("outcome", "Choose won, lost or void");
  }

  let grossReturnMinor: number | null = null;
  if (outcome === "won") {
    const v = i.grossReturnMinor;
    if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) {
      grossReturnMinor = v;
    } else {
      issues.add("grossReturnMinor", "Enter the total paid out, as a whole number of kobo or cents");
    }
  }

  let settledAt: Date | null = null;
  if (i.settledAt !== undefined && i.settledAt !== null) {
    settledAt = parseInstant(i.settledAt, "settledAt", issues);
    if (settledAt !== null) checkNotFuture(settledAt, "settledAt", now, "Settlement time", issues);
  }

  issues.throwIfAny();
  return { outcome: outcome as ParsedSettle["outcome"], grossReturnMinor, settledAt };
}
