import { AccountingError } from "./errors";
import { CURRENCIES, type Currency } from "./types";

export function assertValidCurrency(currency: unknown): asserts currency is Currency {
  if (!CURRENCIES.includes(currency as Currency)) {
    throw new AccountingError(`Unsupported currency: ${String(currency)}`);
  }
}

/** A stake must be a positive safe integer of minor units. */
export function assertValidStake(stakeMinor: unknown): asserts stakeMinor is number {
  if (typeof stakeMinor !== "number" || !Number.isSafeInteger(stakeMinor) || stakeMinor <= 0) {
    throw new AccountingError(
      `Invalid stake: expected a positive integer in minor units, got ${String(stakeMinor)}`,
    );
  }
}

/** A return amount must be a non-negative safe integer of minor units. */
export function assertValidReturn(returnMinor: unknown): asserts returnMinor is number {
  if (typeof returnMinor !== "number" || !Number.isSafeInteger(returnMinor) || returnMinor < 0) {
    throw new AccountingError(
      `Invalid return: expected a non-negative integer in minor units, got ${String(returnMinor)}`,
    );
  }
}

const SYMBOLS: Record<Currency, string> = { NGN: "₦", USD: "$" };

/**
 * Display helper: 500000 NGN -> "₦5,000.00", -1250 USD -> "-$12.50".
 * Uses integer arithmetic only (no floats), so there is no rounding.
 */
export function formatMoney(amountMinor: number, currency: Currency): string {
  assertValidCurrency(currency);
  if (!Number.isSafeInteger(amountMinor)) {
    throw new AccountingError(`Cannot format non-integer amount: ${String(amountMinor)}`);
  }
  const negative = amountMinor < 0;
  const abs = Math.abs(amountMinor);
  const major = Math.trunc(abs / 100);
  const minor = abs % 100;
  const majorWithCommas = String(major).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = `${SYMBOLS[currency]}${majorWithCommas}.${String(minor).padStart(2, "0")}`;
  return negative ? `-${body}` : body;
}

/**
 * Display helper for ROI / win rate. Rounds to one decimal place ONLY here,
 * never inside calculations. null -> "n/a".
 */
export function formatPercent(value: number | null): string {
  if (value === null) return "n/a";
  if (!Number.isFinite(value)) {
    throw new AccountingError(`Cannot format non-finite percentage: ${String(value)}`);
  }
  const text = value.toFixed(1);
  return `${text === "-0.0" ? "0.0" : text}%`;
}
