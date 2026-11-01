import { describe, expect, it } from "vitest";
import { ValidationError } from "./errors";
import { FUTURE_TOLERANCE_MS, MAX_SELECTIONS, parseCreate, parseSettle, parseUpdate } from "./validate";

const NOW = new Date("2026-10-31T12:00:00Z");

const leg = { event: "Arsenal vs Chelsea", selection: "Arsenal -1" };
const valid = () => ({
  currency: "NGN",
  stakeMinor: 500000,
  placedAt: "2026-10-30T12:00:00Z",
  selections: [{ ...leg }],
});

function issuesOf(fn: () => unknown): Record<string, string> {
  try {
    fn();
  } catch (error) {
    if (error instanceof ValidationError) {
      return Object.fromEntries(error.issues.map((i) => [i.field, i.message]));
    }
    throw error;
  }
  throw new Error("expected a ValidationError but nothing was thrown");
}

describe("parseCreate: good input", () => {
  it("accepts the minimum and turns it into database records", () => {
    const { bet, selections } = parseCreate(valid(), NOW);
    expect(bet).toEqual({
      bookmaker_label: null,
      currency: "NGN",
      stake_minor: 500000,
      decimal_odds: null,
      placed_at: "2026-10-30T12:00:00.000Z",
      notes: null,
    });
    expect(selections).toEqual([
      { sport: null, event: "Arsenal vs Chelsea", market_type: null, selection: "Arsenal -1", odds_decimal: null },
    ]);
  });

  it("accepts a Date for placedAt and a timezone offset string", () => {
    expect(parseCreate({ ...valid(), placedAt: new Date("2026-10-30T12:00:00Z") }, NOW).bet.placed_at).toBe("2026-10-30T12:00:00.000Z");
    expect(parseCreate({ ...valid(), placedAt: "2026-10-30T13:00:00+01:00" }, NOW).bet.placed_at).toBe("2026-10-30T12:00:00.000Z");
  });

  it("trims text, turns blanks into null and rounds odds to 3 decimals", () => {
    const { bet, selections } = parseCreate(
      {
        ...valid(),
        bookmakerLabel: "  Bet9ja  ",
        notes: "   ",
        decimalOdds: 3.4567,
        selections: [{ event: "  Match ", selection: " Home ", sport: "", marketType: " 1X2 ", oddsDecimal: 1.9555 }],
      },
      NOW,
    );
    expect(bet.bookmaker_label).toBe("Bet9ja");
    expect(bet.notes).toBeNull();
    expect(bet.decimal_odds).toBe(3.457);
    expect(selections[0]).toEqual({ sport: null, event: "Match", market_type: "1X2", selection: "Home", odds_decimal: 1.956 });
  });

  it("accepts USD, odds of exactly 1, and exactly the maximum number of legs", () => {
    expect(() => parseCreate({ ...valid(), currency: "USD", decimalOdds: 1 }, NOW)).not.toThrow();
    const many = Array.from({ length: MAX_SELECTIONS }, () => ({ ...leg }));
    expect(parseCreate({ ...valid(), selections: many }, NOW).selections).toHaveLength(MAX_SELECTIONS);
  });

  it("accepts a placement time within the clock-skew allowance", () => {
    const soon = new Date(NOW.getTime() + FUTURE_TOLERANCE_MS - 1000);
    expect(() => parseCreate({ ...valid(), placedAt: soon }, NOW)).not.toThrow();
  });

  it("counts characters, not bytes, so emoji and accents are not over-counted", () => {
    expect(() => parseCreate({ ...valid(), bookmakerLabel: "é".repeat(80) }, NOW)).not.toThrow();
    expect(() => parseCreate({ ...valid(), bookmakerLabel: "🙂".repeat(80) }, NOW)).not.toThrow();
  });

  it("ignores keys it does not know, so owner, status and return cannot be smuggled in", () => {
    const { bet } = parseCreate(
      { ...valid(), userId: "someone-else", user_id: "someone-else", status: "won", grossReturnMinor: 99, settledAt: "2026-10-30T12:00:00Z", provenance: "verified" },
      NOW,
    );
    expect(Object.keys(bet).sort()).toEqual(["bookmaker_label", "currency", "decimal_odds", "notes", "placed_at", "stake_minor"]);
  });
});

describe("parseCreate: bad input is rejected with a message per field", () => {
  it.each([null, undefined, "text", 5, []])("rejects a non-object input %j", (input) => {
    expect(Object.keys(issuesOf(() => parseCreate(input, NOW)))).toEqual(["input"]);
  });

  it.each([0, -5, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53, "5000", null, undefined])("rejects stake %j", (stake) => {
    expect(issuesOf(() => parseCreate({ ...valid(), stakeMinor: stake }, NOW))).toHaveProperty("stakeMinor");
  });

  it.each(["GBP", "ngn", "", null, undefined, 1])("rejects currency %j", (currency) => {
    expect(issuesOf(() => parseCreate({ ...valid(), currency }, NOW))).toHaveProperty("currency");
  });

  it.each([0.99, 0, -2, Number.NaN, Number.POSITIVE_INFINITY, 1_000_001, "2.5"])("rejects odds %j", (odds) => {
    expect(issuesOf(() => parseCreate({ ...valid(), decimalOdds: odds }, NOW))).toHaveProperty("decimalOdds");
    expect(
      issuesOf(() => parseCreate({ ...valid(), selections: [{ ...leg, oddsDecimal: odds }] }, NOW)),
    ).toHaveProperty("selections[0].oddsDecimal");
  });

  it.each([
    ["no timezone", "2026-10-30T12:00:00"],
    ["date only", "2026-10-30"],
    ["not a date", "yesterday"],
    ["impossible day", "2026-02-30T12:00:00Z"],
    ["impossible month", "2026-13-01T12:00:00Z"],
    ["impossible hour", "2026-10-30T25:00:00Z"],
    ["leap day in a non-leap year", "2027-02-29T12:00:00Z"],
    ["a number", 1760000000000],
    ["null", null],
    ["an invalid Date", new Date("nope")],
  ])("rejects placedAt that is %s", (_label, placedAt) => {
    expect(issuesOf(() => parseCreate({ ...valid(), placedAt }, NOW))).toHaveProperty("placedAt");
  });

  it("accepts a real leap day", () => {
    expect(() => parseCreate({ ...valid(), placedAt: "2028-02-29T12:00:00Z" }, new Date("2028-03-01T00:00:00Z"))).not.toThrow();
  });

  it("rejects a placement time in the future, beyond the allowance", () => {
    const later = new Date(NOW.getTime() + FUTURE_TOLERANCE_MS + 1000);
    expect(issuesOf(() => parseCreate({ ...valid(), placedAt: later }, NOW)).placedAt).toMatch(/future/);
  });

  it("rejects missing, empty, too many and malformed selections", () => {
    expect(issuesOf(() => parseCreate({ ...valid(), selections: undefined }, NOW))).toHaveProperty("selections");
    expect(issuesOf(() => parseCreate({ ...valid(), selections: [] }, NOW))).toHaveProperty("selections");
    expect(issuesOf(() => parseCreate({ ...valid(), selections: "Arsenal" }, NOW))).toHaveProperty("selections");
    const tooMany = Array.from({ length: MAX_SELECTIONS + 1 }, () => ({ ...leg }));
    expect(issuesOf(() => parseCreate({ ...valid(), selections: tooMany }, NOW))).toHaveProperty("selections");
    expect(issuesOf(() => parseCreate({ ...valid(), selections: [null] }, NOW))).toHaveProperty("selections[0]");
  });

  it("reports which leg and which field is wrong", () => {
    const issues = issuesOf(() =>
      parseCreate({ ...valid(), selections: [{ ...leg }, { event: "", selection: "x".repeat(201) }] }, NOW),
    );
    expect(Object.keys(issues).sort()).toEqual(["selections[1].event", "selections[1].selection"]);
  });

  it("rejects text that is too long, too short, or not text", () => {
    expect(issuesOf(() => parseCreate({ ...valid(), bookmakerLabel: "x".repeat(81) }, NOW))).toHaveProperty("bookmakerLabel");
    expect(issuesOf(() => parseCreate({ ...valid(), notes: "x".repeat(2001) }, NOW))).toHaveProperty("notes");
    expect(issuesOf(() => parseCreate({ ...valid(), notes: 5 }, NOW))).toHaveProperty("notes");
    expect(issuesOf(() => parseCreate({ ...valid(), selections: [{ event: 5, selection: {} }] }, NOW))).toHaveProperty("selections[0].event");
  });

  it("reports every problem at once, so a form can show them all", () => {
    const issues = issuesOf(() => parseCreate({ currency: "GBP", stakeMinor: 0, placedAt: "soon", selections: [] }, NOW));
    expect(Object.keys(issues).sort()).toEqual(["currency", "placedAt", "selections", "stakeMinor"]);
  });
});

describe("parseUpdate", () => {
  it("only includes the fields that were given", () => {
    const { patch, selections } = parseUpdate({ stakeMinor: 700000, notes: "edited" }, NOW);
    expect(patch).toEqual({ stake_minor: 700000, notes: "edited" });
    expect(selections).toBeUndefined();
  });

  it("null and blank clear optional fields, but undefined leaves them alone", () => {
    const { patch } = parseUpdate({ bookmakerLabel: null, notes: "  ", decimalOdds: null, currency: undefined }, NOW);
    expect(patch).toEqual({ bookmaker_label: null, notes: null, decimal_odds: null });
    expect("currency" in patch).toBe(false);
  });

  it("replaces legs when selections are given", () => {
    expect(parseUpdate({ selections: [{ ...leg }] }, NOW).selections).toHaveLength(1);
  });

  it("cannot change the result, the owner or the status", () => {
    expect(issuesOf(() => parseUpdate({ status: "won", grossReturnMinor: 5, settledAt: "2026-10-30T12:00:00Z", userId: "x" }, NOW))).toEqual({
      input: "Nothing to update",
    });
  });

  it("rejects an empty update and a non-object", () => {
    expect(issuesOf(() => parseUpdate({}, NOW))).toEqual({ input: "Nothing to update" });
    expect(issuesOf(() => parseUpdate(null, NOW))).toHaveProperty("input");
  });

  it("rejects bad values field by field, and null for fields that cannot be cleared", () => {
    const issues = issuesOf(() =>
      parseUpdate({ currency: null, stakeMinor: null, placedAt: null, selections: [], decimalOdds: 0.5 }, NOW),
    );
    expect(Object.keys(issues).sort()).toEqual(["currency", "decimalOdds", "placedAt", "selections", "stakeMinor"]);
  });

  it("rejects a placement time in the future", () => {
    expect(issuesOf(() => parseUpdate({ placedAt: new Date(NOW.getTime() + 3_600_000) }, NOW))).toHaveProperty("placedAt");
  });
});

describe("parseSettle", () => {
  it("won needs a return; lost and void do not", () => {
    expect(parseSettle({ outcome: "won", grossReturnMinor: 900000 }, NOW)).toEqual({ outcome: "won", grossReturnMinor: 900000, settledAt: null });
    expect(parseSettle({ outcome: "lost" }, NOW)).toEqual({ outcome: "lost", grossReturnMinor: null, settledAt: null });
    expect(parseSettle({ outcome: "void" }, NOW).grossReturnMinor).toBeNull();
  });

  it("ignores a return amount sent with lost or void", () => {
    expect(parseSettle({ outcome: "lost", grossReturnMinor: 500 }, NOW).grossReturnMinor).toBeNull();
  });

  it.each(["cashed_out", "pending", "WON", "", null, undefined, 1])("rejects outcome %j", (outcome) => {
    expect(issuesOf(() => parseSettle({ outcome }, NOW))).toHaveProperty("outcome");
  });

  it.each([-1, 1.5, Number.NaN, "900", null, undefined])("rejects a won return of %j", (grossReturnMinor) => {
    expect(issuesOf(() => parseSettle({ outcome: "won", grossReturnMinor }, NOW))).toHaveProperty("grossReturnMinor");
  });

  it("accepts a return of zero at the parsing stage (the stake check happens in settleBet)", () => {
    expect(parseSettle({ outcome: "won", grossReturnMinor: 0 }, NOW).grossReturnMinor).toBe(0);
  });

  it("parses an explicit settlement time and rejects a bad or future one", () => {
    expect(parseSettle({ outcome: "lost", settledAt: "2026-10-31T10:00:00Z" }, NOW).settledAt).toEqual(new Date("2026-10-31T10:00:00Z"));
    expect(issuesOf(() => parseSettle({ outcome: "lost", settledAt: "yesterday" }, NOW))).toHaveProperty("settledAt");
    expect(issuesOf(() => parseSettle({ outcome: "lost", settledAt: new Date(NOW.getTime() + 3_600_000) }, NOW)).settledAt).toMatch(/future/);
  });
});
