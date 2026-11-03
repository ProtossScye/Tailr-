/**
 * Form helpers for money and odds. Money stays in whole minor units (kobo, cents): the text a user
 * types is converted with string handling only, never through floating point.
 */

export type ParsedAmount = { ok: true; minor: number } | { ok: false; error: string };

const AMOUNT = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/;

/** "5000.50" or "5,000.5" -> 500050. Rejects empty, zero, negative, 3+ decimals, and unsafe sizes. */
export function parseAmountToMinor(input: string): ParsedAmount {
  const text = input.trim();
  if (text === "") return { ok: false, error: "Enter an amount." };
  if (text.startsWith("-")) return { ok: false, error: "Amounts cannot be negative." };
  const match = AMOUNT.exec(text);
  if (!match) return { ok: false, error: "Use numbers only, with up to 2 decimal places." };
  const whole = (match[1] ?? "").replaceAll(",", "");
  const fraction = (match[2] ?? "").padEnd(2, "0");
  const minor = Number(whole) * 100 + Number(fraction);
  if (!Number.isSafeInteger(minor)) return { ok: false, error: "That amount is too large." };
  if (minor <= 0) return { ok: false, error: "Enter an amount above zero." };
  return { ok: true, minor };
}

/** 500050 -> "5000.50", for filling an edit form. */
export function minorToInput(minor: number): string {
  const abs = Math.abs(minor);
  const whole = Math.trunc(abs / 100);
  const fraction = String(abs % 100).padStart(2, "0");
  return `${minor < 0 ? "-" : ""}${whole}.${fraction}`;
}

export type ParsedOdds = { ok: true; value: number } | { ok: false; error: string };

/** Decimal odds, at least 1.00, up to 3 decimal places (the API rounds to 3). */
export function parseOdds(input: string): ParsedOdds {
  const text = input.trim();
  if (text === "") return { ok: false, error: "Enter the odds." };
  if (!/^\d+(?:\.\d{1,3})?$/.test(text)) return { ok: false, error: "Use decimal odds like 1.85." };
  const value = Number(text);
  if (!Number.isFinite(value) || value < 1) return { ok: false, error: "Decimal odds start at 1.00." };
  return { ok: true, value };
}

/**
 * Product of the legs' decimal odds. Returns null unless EVERY leg has valid odds, so a combined
 * figure is never shown for a slip with a missing price.
 */
export function combinedOdds(legOdds: readonly (number | null | undefined)[]): number | null {
  if (legOdds.length === 0) return null;
  let product = 1;
  for (const odds of legOdds) {
    if (typeof odds !== "number" || !Number.isFinite(odds) || odds < 1) return null;
    product *= odds;
  }
  return Math.round(product * 1000) / 1000;
}
