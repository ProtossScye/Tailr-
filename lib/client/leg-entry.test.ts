import { describe, expect, it } from "vitest";
import { isSameGame, marketAfterSportChange, marketsForSport, matchOption, nextLinked, quickSports, removeLinkedAt, resolveLinkedEvents } from "./leg-entry";
import { COMMON_MARKETS } from "./slip";

describe("marketsForSport", () => {
  it("offers football markets, ignoring case and spaces", () => {
    expect(marketsForSport(" FOOTBALL ")).toContain("Both teams to score");
    expect(marketsForSport("football")).not.toContain("Moneyline");
  });
  it("offers moneyline for basketball and American football, not match result", () => {
    for (const s of ["Basketball", "American football"]) {
      expect(marketsForSport(s)).toContain("Moneyline");
      expect(marketsForSport(s)).toContain("Player props");
      expect(marketsForSport(s)).not.toContain("Match result");
    }
  });
  it("falls back to the general list for blank or custom sports", () => {
    expect(marketsForSport("")).toBe(COMMON_MARKETS);
    expect(marketsForSport("Darts")).toBe(COMMON_MARKETS);
  });
  it("every listed market is a plain label that preferences can match", () => {
    for (const s of ["football", "basketball", "tennis", "american football"]) for (const m of marketsForSport(s)) expect(m.trim()).toBe(m);
  });
});

describe("matchOption", () => {
  it("matches ignoring case and returns the listed spelling", () => expect(matchOption("football", ["Football", "Tennis"])).toBe("Football"));
  it("returns null for custom or blank text", () => {
    expect(matchOption("Darts", ["Football"])).toBeNull();
    expect(matchOption("   ", ["Football"])).toBeNull();
  });
});

describe("quickSports", () => {
  it("puts the most recent sport on the slip first, then favourites, without repeats", () => {
    const legs = [{ sport: "Football" }, { sport: "Football" }, { sport: "Basketball" }];
    expect(quickSports(legs, ["Tennis", "football"])).toEqual(["Basketball", "Football", "Tennis"]);
  });
  it("skips blank sports and caps the list", () => {
    expect(quickSports([{ sport: "" }], ["A", "B", "C", "D", "E"])).toEqual(["A", "B", "C", "D"]);
  });
  it("is empty with nothing to go on", () => expect(quickSports([], [])).toEqual([]));
});

describe("marketAfterSportChange", () => {
  it("keeps a market the new sport also offers", () => expect(marketAfterSportChange("Over/Under", "Basketball")).toBe("Over/Under"));
  it("clears one it does not", () => expect(marketAfterSportChange("Both teams to score", "Basketball")).toBe(""));
  it("clears a custom market", () => expect(marketAfterSportChange("Corners", "Football")).toBe(""));
  it("stays blank", () => expect(marketAfterSportChange("", "Football")).toBe(""));
});

describe("linked events", () => {
  const legs = [{ event: "A v B" }, { event: "" }, { event: "x" }, { event: "" }];
  it("copies the event down a run of linked selections", () => {
    expect(resolveLinkedEvents(legs, [false, true, true, false]).map((l) => l.event)).toEqual(["A v B", "A v B", "A v B", ""]);
  });
  it("ignores a link on the first selection", () => {
    expect(resolveLinkedEvents([{ event: "A v B" }], [true]).map((l) => l.event)).toEqual(["A v B"]);
  });
  it("does not change the input", () => {
    resolveLinkedEvents(legs, [false, true, true, true]);
    expect(legs[1]!.event).toBe("");
  });
  it("removing a selection unlinks the one that moves up, and the first is never linked", () => {
    expect(removeLinkedAt([false, true, true], 1)).toEqual([false, false]);
    expect(removeLinkedAt([false, true, true], 0)).toEqual([false, true]);
    expect(removeLinkedAt([false, false, true], 2)).toEqual([false, false]);
  });
  it("a new selection continues a run only if the last was linked", () => {
    expect(nextLinked([false, true], 2)).toEqual([false, true, true]);
    expect(nextLinked([false, false], 2)).toEqual([false, false, false]);
    expect(nextLinked([], 0)).toEqual([false]);
  });
});

describe("isSameGame", () => {
  it("is true when every selection has the same event, ignoring case and spacing", () => {
    expect(isSameGame([{ event: "Cowboys v Eagles" }, { event: " cowboys  v eagles " }, { event: "Cowboys v Eagles" }])).toBe(true);
  });
  it("is false for one selection, different events, or blank events", () => {
    expect(isSameGame([{ event: "A v B" }])).toBe(false);
    expect(isSameGame([{ event: "A v B" }, { event: "C v D" }])).toBe(false);
    expect(isSameGame([{ event: "" }, { event: "" }])).toBe(false);
    expect(isSameGame([])).toBe(false);
  });
});
