import { describe, expect, it } from "vitest";
import {
  addDaysYmd,
  bucketLabel,
  formatWhen,
  greeting,
  isoToLagosLocal,
  lagosLocalToIso,
  lagosYmd,
  previousRange,
  rangeFor,
  weekStartYmd,
  weekdayIndex,
} from "./dates";

describe("lagosYmd", () => {
  it("uses the Lagos calendar day, not UTC", () => {
    // 23:30 UTC on 2 Nov is 00:30 on 3 Nov in Lagos.
    expect(lagosYmd(new Date("2026-11-02T23:30:00Z"))).toBe("2026-11-03");
    expect(lagosYmd(new Date("2026-11-02T22:59:59Z"))).toBe("2026-11-02");
  });
});

describe("addDaysYmd", () => {
  it("crosses month and year boundaries", () => {
    expect(addDaysYmd("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDaysYmd("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysYmd("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("weeks", () => {
  it("starts weeks on Monday", () => {
    expect(weekdayIndex("2026-11-02")).toBe(0); // Monday
    expect(weekdayIndex("2026-11-08")).toBe(6); // Sunday
    expect(weekStartYmd("2026-11-08")).toBe("2026-11-02");
    expect(weekStartYmd("2026-11-02")).toBe("2026-11-02");
  });
});

describe("rangeFor", () => {
  const now = new Date("2026-11-03T10:16:00Z");

  it("builds inclusive Lagos ranges ending today", () => {
    expect(rangeFor("today", now)).toEqual({ from: "2026-11-03", to: "2026-11-03" });
    expect(rangeFor("7d", now)).toEqual({ from: "2026-10-28", to: "2026-11-03" });
    expect(rangeFor("30d", now)).toEqual({ from: "2026-10-05", to: "2026-11-03" });
  });

  it("returns null for all time", () => {
    expect(rangeFor("all", now)).toBeNull();
  });

  it("previousRange is the same length, directly before", () => {
    expect(previousRange({ from: "2026-10-28", to: "2026-11-03" })).toEqual({ from: "2026-10-21", to: "2026-10-27" });
    expect(previousRange({ from: "2026-11-03", to: "2026-11-03" })).toEqual({ from: "2026-11-02", to: "2026-11-02" });
  });
});

describe("greeting", () => {
  it("follows the Lagos hour", () => {
    expect(greeting(new Date("2026-11-03T06:00:00Z"))).toBe("Good morning"); // 07:00
    expect(greeting(new Date("2026-11-03T11:00:00Z"))).toBe("Good afternoon"); // 12:00
    expect(greeting(new Date("2026-11-03T20:00:00Z"))).toBe("Good evening"); // 21:00
    expect(greeting(new Date("2026-11-03T23:30:00Z"))).toBe("Good morning"); // 00:30 next day
  });
});

describe("datetime-local conversion", () => {
  it("adds the Lagos offset", () => {
    expect(lagosLocalToIso("2026-11-03T11:16")).toBe("2026-11-03T11:16:00+01:00");
    expect(new Date(lagosLocalToIso("2026-11-03T11:16") as string).toISOString()).toBe("2026-11-03T10:16:00.000Z");
  });

  it("rejects malformed input", () => {
    expect(lagosLocalToIso("")).toBeNull();
    expect(lagosLocalToIso("2026-11-03")).toBeNull();
    expect(lagosLocalToIso("2026-13-45T25:61")).toBeNull();
  });

  it("round-trips", () => {
    const iso = lagosLocalToIso("2026-02-14T23:45") as string;
    expect(isoToLagosLocal(iso)).toBe("2026-02-14T23:45");
  });
});

describe("formatWhen", () => {
  const now = new Date("2026-11-03T10:16:00Z");

  it("says Today and Yesterday by Lagos day", () => {
    expect(formatWhen("2026-11-03T09:00:00Z", now)).toMatch(/^Today · /);
    expect(formatWhen("2026-11-02T20:00:00Z", now)).toMatch(/^Yesterday · /);
    expect(formatWhen("2026-10-20T20:00:00Z", now)).toMatch(/^20 Oct · /);
  });
});

describe("bucketLabel", () => {
  it("labels years, months and days", () => {
    expect(bucketLabel("2026")).toBe("2026");
    expect(bucketLabel("2026-11")).toMatch(/Nov/);
    expect(bucketLabel("2026-11-03")).toMatch(/3 Nov/);
  });
});
