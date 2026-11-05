import { describe, expect, it } from "vitest";
import type { DraftLeg } from "./drafts";
import { applyRemoval, suggestChanges, type SuggestionInput } from "./suggest";

const leg = (event: string, selection: string, odds = "", market = "", sport = ""): DraftLeg => ({ sport, event, market, selection, odds });
const base = (legs: DraftLeg[], over: Partial<SuggestionInput> = {}): SuggestionInput => ({ legs, avoidedMarkets: [], preferredMarkets: [], targetMin: null, targetMax: null, ...over });

describe("suggestChanges", () => {
  it("suggests nothing for an empty slip, with a note", () => {
    const r = suggestChanges(base([]));
    expect(r.suggestions).toEqual([]);
    expect(r.notes.length).toBe(1);
  });
  it("suggests nothing when there is nothing to improve", () => {
    expect(suggestChanges(base([leg("A v B", "A", "1.5"), leg("C v D", "C", "2")])).suggestions).toEqual([]);
  });
  it("flags a duplicate pick, keeping the first, case and spacing ignored", () => {
    const r = suggestChanges(base([leg("Arsenal v Chelsea", "Arsenal", "1.5"), leg("X v Y", "X", "2"), leg("arsenal  v chelsea", " ARSENAL ", "1.5")]));
    expect(r.suggestions).toHaveLength(1);
    expect(r.suggestions[0]).toMatchObject({ kind: "duplicate", remove: [2], before: 4.5, after: 3 });
    expect(r.suggestions[0]!.reason).toMatch(/more than once/);
  });
  it("flags avoided markets and explains the trade-off with before and after", () => {
    const r = suggestChanges(base([leg("A v B", "A", "2", "Correct score"), leg("C v D", "C", "1.5", "Match result")], { avoidedMarkets: ["correct score"] }));
    expect(r.suggestions).toHaveLength(1);
    expect(r.suggestions[0]).toMatchObject({ kind: "avoided_market", remove: [0], before: 3, after: 1.5 });
    expect(r.suggestions[0]!.tradeoff).toMatch(/from 3\.00 to 1\.50/);
  });
  it("flags markets outside the preferred list but never blank markets", () => {
    const r = suggestChanges(base([leg("A v B", "A", "2", "Handicap"), leg("C v D", "C", "1.5"), leg("E v F", "E", "1.2", "Match result")], { preferredMarkets: ["Match result"] }));
    expect(r.suggestions.map((s) => s.remove)).toEqual([[0]]);
    expect(r.suggestions[0]!.kind).toBe("outside_preferred");
  });
  it("does not double-suggest a leg in an avoided market as outside preferred", () => {
    const r = suggestChanges(base([leg("A v B", "A", "2", "Handicap"), leg("C v D", "C", "1.5", "Match result")], { avoidedMarkets: ["Handicap"], preferredMarkets: ["Match result"] }));
    expect(r.suggestions).toHaveLength(1);
    expect(r.suggestions[0]!.kind).toBe("avoided_market");
  });
  it("a duplicate that is also in an avoided market is suggested once", () => {
    const r = suggestChanges(base([leg("A v B", "A", "2", "Handicap"), leg("A v B", "A", "2", "Handicap"), leg("C v D", "C", "2")], { avoidedMarkets: ["Handicap"] }));
    expect(r.suggestions.filter((x) => x.remove.includes(1))).toHaveLength(1);
    expect(r.suggestions.filter((x) => x.remove.includes(0))).toHaveLength(1);
  });
  it("never suggests removing every selection", () => {
    const r = suggestChanges(base([leg("A v B", "A", "2", "Handicap")], { avoidedMarkets: ["Handicap"] }));
    expect(r.suggestions).toEqual([]);
    const two = suggestChanges(base([leg("A v B", "A", "2", "Handicap"), leg("C v D", "C", "2", "Handicap")], { avoidedMarkets: ["Handicap"] }));
    expect(two.suggestions).toHaveLength(1);
  });
  it("a rejected suggestion is not offered again", () => {
    const input = base([leg("A v B", "A", "2", "Handicap"), leg("C v D", "C", "2")], { avoidedMarkets: ["Handicap"] });
    const first = suggestChanges(input).suggestions[0]!;
    expect(suggestChanges(input, new Set([first.key])).suggestions).toEqual([]);
  });
  it("without odds on every selection, shows no combined figures", () => {
    const s = suggestChanges(base([leg("A v B", "A", "", "Handicap"), leg("C v D", "C", "2")], { avoidedMarkets: ["Handicap"] })).suggestions[0]!;
    expect(s.before).toBeNull();
    expect(s.after).toBeNull();
    expect(s.tradeoff).toMatch(/cannot be shown/);
  });
  describe("target odds", () => {
    const legs = [leg("A v B", "A", "2"), leg("C v D", "C", "3"), leg("E v F", "E", "1.5")]; // 9
    it("suggests the removal that lands inside the range, keeping the most value", () => {
      const r = suggestChanges(base(legs, { targetMax: 6 }));
      expect(r.suggestions).toHaveLength(1);
      expect(r.suggestions[0]).toMatchObject({ kind: "target_odds", remove: [2], before: 9, after: 6 });
    });
    it("respects a minimum as well", () => {
      const r = suggestChanges(base(legs, { targetMin: 2.5, targetMax: 4 }));
      // removing 3 -> 3, removing 2 -> 4.5 (too high), removing 1.5 -> 6 (too high)
      expect(r.suggestions[0]).toMatchObject({ remove: [1], after: 3 });
    });
    it("says so when removal cannot reach the range", () => {
      const r = suggestChanges(base([leg("A v B", "A", "5"), leg("C v D", "C", "5")], { targetMax: 2 }));
      expect(r.suggestions).toEqual([]);
      expect(r.notes.join(" ")).toMatch(/cannot bring them inside/);
    });
    it("below target: only a note, never an invented selection", () => {
      const r = suggestChanges(base([leg("A v B", "A", "1.5")], { targetMin: 5 }));
      expect(r.suggestions).toEqual([]);
      expect(r.notes.join(" ")).toMatch(/add one yourself/);
    });
    it("waits until other pending changes are settled", () => {
      const r = suggestChanges(base([leg("A v B", "A", "5", "Handicap"), leg("C v D", "C", "5")], { avoidedMarkets: ["Handicap"], targetMax: 6 }));
      expect(r.suggestions.map((s) => s.kind)).toEqual(["avoided_market"]);
      expect(r.notes.join(" ")).toMatch(/Settle the changes above first/);
    });
    it("asks for odds when some are missing", () => {
      expect(suggestChanges(base([leg("A v B", "A", "")], { targetMax: 2 })).notes.join(" ")).toMatch(/Add odds/);
    });
    it("no target, no target suggestion", () => {
      expect(suggestChanges(base(legs)).suggestions).toEqual([]);
    });
    it("a within-range slip gets nothing", () => {
      expect(suggestChanges(base(legs, { targetMin: 5, targetMax: 10 })).suggestions).toEqual([]);
    });
  });
  it("only ever removes: every index is a real selection, and nothing is added", () => {
    const legs = [leg("A v B", "A", "2", "Handicap"), leg("A v B", "A", "2", "Handicap"), leg("C v D", "C", "3", "Odd"), leg("E v F", "E", "1.5")];
    const r = suggestChanges(base(legs, { avoidedMarkets: ["Odd"], preferredMarkets: ["Match result"] }));
    for (const s of r.suggestions) for (const i of s.remove) expect(legs[i]).toBeDefined();
    const flat = r.suggestions.flatMap((s) => s.remove);
    expect(new Set(flat).size).toBe(flat.length);
    expect(Object.keys(r.suggestions[0]!)).not.toContain("add");
  });
});

describe("applyRemoval", () => {
  it("removes by index and keeps order", () => expect(applyRemoval(["a", "b", "c", "d"], [1, 3])).toEqual(["a", "c"]));
  it("ignores out-of-range indexes", () => expect(applyRemoval(["a"], [5])).toEqual(["a"]));
});
