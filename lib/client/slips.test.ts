import { describe, expect, it } from "vitest";
import type { SlipJson } from "@/lib/api/types";
import { legToSelection, slipToDraft } from "./slips";

describe("legToSelection", () => {
  it("trims, turns blanks into null and parses the odds the person typed", () => {
    expect(legToSelection({ sport: " Football ", event: " A v B ", market: "", selection: " A ", odds: "1.85" })).toEqual({
      sport: "Football",
      event: "A v B",
      marketType: null,
      selection: "A",
      oddsDecimal: 1.85,
    });
  });

  it("sends no odds when none were typed or they are unreadable; never a made-up price", () => {
    expect(legToSelection({ sport: "", event: "A v B", market: "", selection: "A", odds: "" }).oddsDecimal).toBeNull();
    expect(legToSelection({ sport: "", event: "A v B", market: "", selection: "A", odds: "abc" }).oddsDecimal).toBeNull();
    expect(legToSelection({ sport: "", event: "A v B", market: "", selection: "A", odds: "0.5" }).oddsDecimal).toBeNull();
  });
});

describe("slipToDraft", () => {
  const slip: SlipJson = {
    id: "s1",
    name: "Saturday",
    sourceType: "manual",
    sourceBookmaker: null,
    status: "draft",
    createdAt: "2026-11-04T08:00:00Z",
    updatedAt: "2026-11-04T09:00:00Z",
    selections: [
      { id: "b", sport: null, event: "Second", marketType: null, selection: "S2", oddsDecimal: null, verificationStatus: "user_entered", sortOrder: 1 },
      { id: "a", sport: "Tennis", event: "First", marketType: "Winner", selection: "S1", oddsDecimal: 2, verificationStatus: "user_entered", sortOrder: 0 },
      { id: "c", sport: null, event: "Third", marketType: null, selection: "S3", oddsDecimal: 1.855, verificationStatus: "user_entered", sortOrder: 2 },
    ],
  };

  it("restores the legs in order with blank text for missing values and readable odds", () => {
    const draft = slipToDraft(slip);
    expect(draft).toMatchObject({ id: "s1", name: "Saturday", updatedAt: "2026-11-04T09:00:00Z" });
    expect(draft.legs).toEqual([
      { sport: "Tennis", event: "First", market: "Winner", selection: "S1", odds: "2.00" },
      { sport: "", event: "Second", market: "", selection: "S2", odds: "" },
      { sport: "", event: "Third", market: "", selection: "S3", odds: "1.855" },
    ]);
  });
});
