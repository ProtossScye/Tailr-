import { describe, expect, it } from "vitest";
import { draftToText, type DraftLeg } from "./drafts";
import { checkTarget, defaultDraftName, outsidePreferred, slipCombinedOdds } from "./slip";

const leg = (overrides: Partial<DraftLeg> = {}): DraftLeg => ({ sport: "", event: "A v B", market: "", selection: "A", odds: "", ...overrides });

describe("slipCombinedOdds", () => {
  it("multiplies only when every selection has odds", () => {
    expect(slipCombinedOdds([leg({ odds: "2" }), leg({ odds: "1.5" })])).toBe(3);
    expect(slipCombinedOdds([leg({ odds: "2" }), leg()])).toBeNull();
    expect(slipCombinedOdds([])).toBeNull();
  });
});

describe("checkTarget", () => {
  it("reports nothing when no target is set", () => {
    expect(checkTarget(3, null, null)).toEqual({ kind: "none" });
    expect(checkTarget(null, null, null)).toEqual({ kind: "none" });
  });

  it("cannot judge without combined odds", () => {
    expect(checkTarget(null, 2, 4)).toEqual({ kind: "unknown" });
  });

  it("compares with the range, inclusive at both ends", () => {
    expect(checkTarget(3, 2, 4)).toEqual({ kind: "within", combined: 3 });
    expect(checkTarget(2, 2, 4)).toEqual({ kind: "within", combined: 2 });
    expect(checkTarget(4, 2, 4)).toEqual({ kind: "within", combined: 4 });
    expect(checkTarget(1.5, 2, 4)).toEqual({ kind: "below", combined: 1.5, by: 0.5 });
    expect(checkTarget(5.25, 2, 4)).toEqual({ kind: "above", combined: 5.25, by: 1.25 });
  });

  it("works with only a minimum or only a maximum", () => {
    expect(checkTarget(10, 2, null)).toEqual({ kind: "within", combined: 10 });
    expect(checkTarget(1.2, 2, null)).toMatchObject({ kind: "below" });
    expect(checkTarget(1.2, null, 4)).toEqual({ kind: "within", combined: 1.2 });
    expect(checkTarget(9, null, 4)).toMatchObject({ kind: "above" });
  });
});

describe("outsidePreferred", () => {
  it("flags selections whose market is not preferred, ignoring case and blanks", () => {
    const legs = [leg({ market: "Over/Under" }), leg({ market: "handicap" }), leg({ market: "" }), leg({ market: "Match result" })];
    expect(outsidePreferred(legs, ["over/under", "Handicap"])).toEqual([3]);
  });

  it("flags nothing when no preference is set", () => {
    expect(outsidePreferred([leg({ market: "Anything" })], [])).toEqual([]);
  });
});

describe("defaultDraftName", () => {
  it("names a draft after its first event", () => {
    expect(defaultDraftName([leg({ event: "Arsenal v Chelsea" })], 0)).toBe("Arsenal v Chelsea");
    expect(defaultDraftName([leg({ event: "Arsenal v Chelsea" }), leg()], 0)).toBe("Arsenal v Chelsea +1");
    expect(defaultDraftName([leg({ event: " " })], 2)).toBe("Slip 3");
  });
});

describe("draftToText", () => {
  it("writes only what was entered", () => {
    const text = draftToText([leg({ event: "Arsenal v Chelsea", market: "Match result", selection: "Arsenal", odds: "1.85" }), leg({ event: "Lakers v Celtics", selection: "Lakers" })], null);
    expect(text).toBe("1. Arsenal v Chelsea | Match result: Arsenal @ 1.85\n2. Lakers v Celtics | Lakers");
  });

  it("adds combined odds only when given", () => {
    expect(draftToText([leg({ odds: "2" })], 2)).toContain("Combined odds: 2.00");
  });
});
