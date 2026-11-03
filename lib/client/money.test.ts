import { describe, expect, it } from "vitest";
import { combinedOdds, minorToInput, parseAmountToMinor, parseOdds } from "./money";

describe("parseAmountToMinor", () => {
  it.each([
    ["5000", 500000],
    ["5000.5", 500050],
    ["5000.50", 500050],
    ["5,000.50", 500050],
    ["1,234,567", 123456700],
    ["0.01", 1],
    ["19.99", 1999],
    ["0.1", 10],
    ["  250  ", 25000],
  ])("converts %s to %i minor units without float error", (text, minor) => {
    expect(parseAmountToMinor(text)).toEqual({ ok: true, minor });
  });

  it.each(["", "   ", "abc", "-5", "0", "0.00", "1.234", "1,00", "12,34,567", "1e3", "5 000", "₦500"])(
    "rejects %j",
    (text) => {
      expect(parseAmountToMinor(text).ok).toBe(false);
    },
  );

  it("rejects amounts beyond the safe integer range", () => {
    expect(parseAmountToMinor("90071992547409.92").ok).toBe(false);
  });

  it("is exact where plain multiplication is not (1.15 * 100 === 114.99999999999999)", () => {
    expect(parseAmountToMinor("1.15")).toEqual({ ok: true, minor: 115 });
    expect(parseAmountToMinor("8.2")).toEqual({ ok: true, minor: 820 });
  });
});

describe("minorToInput", () => {
  it("formats minor units for an edit form", () => {
    expect(minorToInput(500050)).toBe("5000.50");
    expect(minorToInput(5)).toBe("0.05");
    expect(minorToInput(100)).toBe("1.00");
  });

  it("round-trips through parseAmountToMinor", () => {
    for (const minor of [1, 99, 100, 101, 123456, 500050, 999999999]) {
      expect(parseAmountToMinor(minorToInput(minor))).toEqual({ ok: true, minor });
    }
  });
});

describe("parseOdds", () => {
  it("accepts decimal odds of at least 1 with up to 3 decimals", () => {
    expect(parseOdds("1.85")).toEqual({ ok: true, value: 1.85 });
    expect(parseOdds("1")).toEqual({ ok: true, value: 1 });
    expect(parseOdds("12.345")).toEqual({ ok: true, value: 12.345 });
  });

  it.each(["", "0.99", "abc", "-2", "1.2345", "1,85", "+2"])("rejects %j", (text) => {
    expect(parseOdds(text).ok).toBe(false);
  });
});

describe("combinedOdds", () => {
  it("multiplies every leg", () => {
    expect(combinedOdds([2, 1.5, 3])).toBe(9);
    expect(combinedOdds([1.85])).toBe(1.85);
  });

  it("returns null unless every leg has valid odds", () => {
    expect(combinedOdds([])).toBeNull();
    expect(combinedOdds([2, null])).toBeNull();
    expect(combinedOdds([2, undefined, 3])).toBeNull();
    expect(combinedOdds([2, 0.5])).toBeNull();
    expect(combinedOdds([2, Number.NaN])).toBeNull();
  });

  it("rounds to 3 decimals", () => {
    expect(combinedOdds([1.333, 1.333])).toBe(1.777);
  });
});
