import { describe, expect, it } from "vitest";
import { AccountingError } from "./errors";
import { assertValidCurrency, assertValidReturn, assertValidStake, formatMoney, formatPercent } from "./money";
import type { Currency } from "./types";

describe("assertValidStake", () => {
  it.each([1, 100, 500_000, Number.MAX_SAFE_INTEGER])("accepts %s", (v) => {
    expect(() => assertValidStake(v)).not.toThrow();
  });

  it.each([0, -1, 0.5, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53, null, undefined, "100", {}])(
    "rejects %s",
    (v) => {
      expect(() => assertValidStake(v)).toThrow(AccountingError);
    },
  );
});

describe("assertValidReturn", () => {
  it.each([0, 1, 900_000])("accepts %s", (v) => {
    expect(() => assertValidReturn(v)).not.toThrow();
  });

  it.each([-1, 0.1, Number.NaN, Number.POSITIVE_INFINITY, "5", null])("rejects %s", (v) => {
    expect(() => assertValidReturn(v)).toThrow(AccountingError);
  });
});

describe("assertValidCurrency", () => {
  it.each(["NGN", "USD"])("accepts %s", (v) => {
    expect(() => assertValidCurrency(v)).not.toThrow();
  });
  it.each(["GBP", "ngn", "", null, 1])("rejects %s", (v) => {
    expect(() => assertValidCurrency(v)).toThrow(AccountingError);
  });
});

describe("formatMoney", () => {
  it("formats naira from kobo", () => {
    expect(formatMoney(500_000, "NGN")).toBe("₦5,000.00");
    expect(formatMoney(1_234_567_890, "NGN")).toBe("₦12,345,678.90");
  });

  it("formats dollars from cents", () => {
    expect(formatMoney(123_456, "USD")).toBe("$1,234.56");
    expect(formatMoney(1_250, "USD")).toBe("$12.50");
  });

  it("pads minor units and handles small and zero amounts", () => {
    expect(formatMoney(0, "NGN")).toBe("₦0.00");
    expect(formatMoney(5, "NGN")).toBe("₦0.05");
    expect(formatMoney(100, "NGN")).toBe("₦1.00");
    expect(formatMoney(99_999, "USD")).toBe("$999.99");
  });

  it("puts the minus sign before the symbol", () => {
    expect(formatMoney(-100_000, "NGN")).toBe("-₦1,000.00");
    expect(formatMoney(-5, "USD")).toBe("-$0.05");
  });

  it("rejects non-integers and bad currencies", () => {
    expect(() => formatMoney(10.5, "NGN")).toThrow(AccountingError);
    expect(() => formatMoney(Number.NaN, "NGN")).toThrow(AccountingError);
    expect(() => formatMoney(100, "GBP" as unknown as Currency)).toThrow(AccountingError);
  });
});

describe("formatPercent", () => {
  it("null is n/a", () => {
    expect(formatPercent(null)).toBe("n/a");
  });

  it("rounds to one decimal only at display time", () => {
    expect(formatPercent(25)).toBe("25.0%");
    expect(formatPercent(-10)).toBe("-10.0%");
    expect(formatPercent(100 / 3)).toBe("33.3%");
  });

  it("never shows negative zero", () => {
    expect(formatPercent(-0.04)).toBe("0.0%");
    expect(formatPercent(-0)).toBe("0.0%");
  });

  it("rejects NaN and Infinity", () => {
    expect(() => formatPercent(Number.NaN)).toThrow(AccountingError);
    expect(() => formatPercent(Number.POSITIVE_INFINITY)).toThrow(AccountingError);
  });
});
