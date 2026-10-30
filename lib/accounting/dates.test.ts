import { describe, expect, it } from "vitest";
import { lagosDateRange, lagosDayRange, lagosDayRangeContaining } from "./dates";
import { AccountingError } from "./errors";

const iso = (r: { start: Date; end: Date }) => [r.start.toISOString(), r.end.toISOString()];

describe("lagosDayRange", () => {
  it("a Lagos day starts at 23:00 UTC the previous day", () => {
    expect(iso(lagosDayRange("2026-10-29"))).toEqual(["2026-10-28T23:00:00.000Z", "2026-10-29T23:00:00.000Z"]);
  });

  it("works across a year boundary", () => {
    expect(iso(lagosDayRange("2026-01-01"))).toEqual(["2025-12-31T23:00:00.000Z", "2026-01-01T23:00:00.000Z"]);
    expect(iso(lagosDayRange("2026-12-31"))).toEqual(["2026-12-30T23:00:00.000Z", "2026-12-31T23:00:00.000Z"]);
  });

  it("is always exactly 24 hours (no daylight saving in Lagos)", () => {
    for (const d of ["2026-03-08", "2026-03-29", "2026-10-25", "2026-11-01"]) {
      const r = lagosDayRange(d);
      expect(r.end.getTime() - r.start.getTime()).toBe(24 * 60 * 60 * 1000);
    }
  });

  it("accepts a real leap day and rejects a fake one", () => {
    expect(() => lagosDayRange("2028-02-29")).not.toThrow();
    expect(() => lagosDayRange("2027-02-29")).toThrow(AccountingError);
  });

  it.each(["2026-02-30", "2026-13-01", "2026-00-10", "2026-10-00", "2026-10-32", "26-10-29", "2026/10/29", "", "today"])(
    "rejects invalid date %j",
    (value) => {
      expect(() => lagosDayRange(value)).toThrow(AccountingError);
    },
  );
});

describe("lagosDateRange (inclusive dates)", () => {
  it("spans from the first Lagos midnight to the midnight after the last day", () => {
    expect(iso(lagosDateRange("2026-10-01", "2026-10-31"))).toEqual([
      "2026-09-30T23:00:00.000Z",
      "2026-10-31T23:00:00.000Z",
    ]);
  });

  it("a single day equals lagosDayRange", () => {
    expect(iso(lagosDateRange("2026-10-29", "2026-10-29"))).toEqual(iso(lagosDayRange("2026-10-29")));
  });

  it("rejects a reversed range", () => {
    expect(() => lagosDateRange("2026-10-30", "2026-10-29")).toThrow(AccountingError);
  });
});

describe("lagosDayRangeContaining", () => {
  it("22:59:59.999Z is still the previous Lagos day", () => {
    expect(iso(lagosDayRangeContaining(new Date("2026-10-29T22:59:59.999Z")))).toEqual(
      iso(lagosDayRange("2026-10-29")),
    );
  });

  it("23:00:00.000Z starts the next Lagos day", () => {
    expect(iso(lagosDayRangeContaining(new Date("2026-10-29T23:00:00.000Z")))).toEqual(
      iso(lagosDayRange("2026-10-30")),
    );
  });

  it("midday UTC maps to the same calendar date in Lagos", () => {
    expect(iso(lagosDayRangeContaining(new Date("2026-10-30T12:00:00Z")))).toEqual(iso(lagosDayRange("2026-10-30")));
  });

  it("rejects an invalid Date", () => {
    expect(() => lagosDayRangeContaining(new Date("nope"))).toThrow(AccountingError);
  });
});
