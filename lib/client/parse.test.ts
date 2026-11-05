import { describe, expect, it } from "vitest";
import { combinedFromRead, isComplete, missingNote, toDraftLeg, type ParsedSelectionJson } from "./parse";

const sel = (o: Partial<ParsedSelectionJson> = {}): ParsedSelectionJson => ({
  sourceLine: "x",
  sport: null,
  event: "A v B",
  market: null,
  selection: "A",
  odds: 1.85,
  confidence: "high",
  missing: [],
  ...o,
});

describe("toDraftLeg", () => {
  it("copies what was read and leaves everything else blank", () => {
    expect(toDraftLeg(sel())).toEqual({ sport: "", event: "A v B", market: "", selection: "A", odds: "1.85" });
    expect(toDraftLeg(sel({ event: null, odds: null, market: "Match result", sport: "Football" }))).toEqual({
      sport: "Football",
      event: "",
      market: "Match result",
      selection: "A",
      odds: "",
    });
  });
});

describe("isComplete", () => {
  it("needs both an event and a pick", () => {
    expect(isComplete(sel())).toBe(true);
    expect(isComplete(sel({ event: null }))).toBe(false);
    expect(isComplete(sel({ selection: null }))).toBe(false);
  });
});

describe("missingNote", () => {
  it("says what the text did not give", () => {
    expect(missingNote(sel())).toBeNull();
    expect(missingNote(sel({ missing: ["odds"] }))).toBe("No odds in the text");
    expect(missingNote(sel({ missing: ["event", "odds"] }))).toBe("No event or odds in the text");
    expect(missingNote(sel({ missing: ["event", "selection", "odds"] }))).toBe("No event, pick or odds in the text");
  });
});

describe("combinedFromRead", () => {
  it("multiplies the odds when every selection has them", () => {
    expect(combinedFromRead([sel({ odds: 1.5 }), sel({ odds: 1.9 })])).toBe(2.85);
    expect(combinedFromRead([sel({ odds: 2 })])).toBe(2);
  });

  it("is null when any odds are missing, or there is nothing", () => {
    expect(combinedFromRead([sel({ odds: 1.5 }), sel({ odds: null })])).toBeNull();
    expect(combinedFromRead([])).toBeNull();
  });
});
