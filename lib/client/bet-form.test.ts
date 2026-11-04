import { describe, expect, it } from "vitest";
import type { BetJson } from "@/lib/api/types";
import { buildBetPayload, emptyForm, emptyLeg, legsCombinedOdds, mapIssues, valuesFromBet, type BetFormValues } from "./bet-form";

const NOW = new Date("2026-11-03T10:16:00Z"); // 11:16 in Lagos

function valid(overrides: Partial<BetFormValues> = {}): BetFormValues {
  return {
    ...emptyForm(NOW),
    stake: "5000.50",
    legs: [{ sport: "Football", event: "Arsenal v Chelsea", market: "Match result", selection: "Arsenal", odds: "1.85" }],
    ...overrides,
  };
}

describe("buildBetPayload", () => {
  it("converts to the API shape without float error", () => {
    const result = buildBetPayload(valid(), NOW);
    expect(result).toEqual({
      ok: true,
      payload: {
        currency: "NGN",
        stakeMinor: 500050,
        bookmakerLabel: null,
        decimalOdds: null,
        placedAt: "2026-11-03T11:16:00+01:00",
        notes: null,
        selections: [{ sport: "Football", event: "Arsenal v Chelsea", marketType: "Match result", selection: "Arsenal", oddsDecimal: 1.85 }],
      },
    });
  });

  it("trims text and turns blanks into null", () => {
    const result = buildBetPayload(
      valid({ bookmaker: "  Bet9ja  ", notes: "  ", legs: [{ sport: " ", event: " A v B ", market: "", selection: " A ", odds: "" }] }),
      NOW,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.bookmakerLabel).toBe("Bet9ja");
      expect(result.payload.notes).toBeNull();
      expect(result.payload.selections[0]).toEqual({ sport: null, event: "A v B", marketType: null, selection: "A", oddsDecimal: null });
    }
  });

  it("reports every problem at once, keyed by field", () => {
    const result = buildBetPayload(
      valid({ stake: "0", placedLocal: "", totalOdds: "0.5", legs: [emptyLeg(), { ...emptyLeg(), event: "X v Y", selection: "X", odds: "abc" }] }),
      NOW,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(
        ["legs.0.event", "legs.0.selection", "legs.1.odds", "placedAt", "stake", "totalOdds"].sort(),
      );
    }
  });

  it("rejects a placed time more than 5 minutes ahead, allows a little clock drift", () => {
    expect(buildBetPayload(valid({ placedLocal: "2026-11-03T11:30" }), NOW).ok).toBe(false);
    expect(buildBetPayload(valid({ placedLocal: "2026-11-03T11:20" }), NOW).ok).toBe(true);
  });

  it("requires at least one selection and caps at 50", () => {
    expect(buildBetPayload(valid({ legs: [] }), NOW).ok).toBe(false);
    const fifty = Array.from({ length: 50 }, () => ({ ...emptyLeg(), event: "A v B", selection: "A" }));
    expect(buildBetPayload(valid({ legs: fifty }), NOW).ok).toBe(true);
    expect(buildBetPayload(valid({ legs: [...fifty, fifty[0] as never] }), NOW).ok).toBe(false);
  });

  it("keeps the chosen currency", () => {
    const result = buildBetPayload(valid({ currency: "USD", stake: "12.5" }), NOW);
    expect(result.ok && result.payload.currency).toBe("USD");
    expect(result.ok && result.payload.stakeMinor).toBe(1250);
  });
});

describe("legsCombinedOdds", () => {
  it("multiplies when every leg has odds and is null otherwise", () => {
    expect(legsCombinedOdds([{ ...emptyLeg(), odds: "2" }, { ...emptyLeg(), odds: "1.5" }])).toBe(3);
    expect(legsCombinedOdds([{ ...emptyLeg(), odds: "2" }, emptyLeg()])).toBeNull();
  });
});

describe("mapIssues", () => {
  it("maps API field names onto form keys", () => {
    expect(
      mapIssues([
        { field: "stakeMinor", message: "Bad stake" },
        { field: "selections[0].event", message: "Missing event" },
        { field: "selections[2].oddsDecimal", message: "Odds too low" },
        { field: "selections[1].marketType", message: "Too long" },
        { field: "decimalOdds", message: "Bad odds" },
        { field: "input", message: "Something general" },
        { field: "somethingNew", message: "Unknown" },
      ]),
    ).toEqual({
      stake: "Bad stake",
      "legs.0.event": "Missing event",
      "legs.2.odds": "Odds too low",
      "legs.1.market": "Too long",
      totalOdds: "Bad odds",
      form: "Something general Unknown",
    });
  });
});

describe("valuesFromBet", () => {
  it("fills the form from a saved bet, legs in order", () => {
    const bet: BetJson = {
      id: "1",
      currency: "USD",
      stakeMinor: 1250,
      bookmakerLabel: "Pinnacle",
      decimalOdds: 3.5,
      status: "pending",
      placedAt: "2026-11-03T10:16:00Z",
      settledAt: null,
      grossReturnMinor: null,
      netProfitMinor: null,
      provenance: "user_reported",
      notes: "note",
      slipDraftId: null,
      selections: [
        { id: "b", sport: null, event: "Second", marketType: null, selection: "S2", oddsDecimal: null, sortOrder: 1 },
        { id: "a", sport: "Tennis", event: "First", marketType: "Winner", selection: "S1", oddsDecimal: 1.7, sortOrder: 0 },
      ],
      createdAt: "2026-11-03T10:16:00Z",
      updatedAt: "2026-11-03T10:16:00Z",
    };
    const values = valuesFromBet(bet);
    expect(values).toMatchObject({ currency: "USD", stake: "12.50", placedLocal: "2026-11-03T11:16", bookmaker: "Pinnacle", totalOdds: "3.5", notes: "note" });
    expect(values.legs.map((l) => l.event)).toEqual(["First", "Second"]);
    expect(values.legs[0]).toEqual({ sport: "Tennis", event: "First", market: "Winner", selection: "S1", odds: "1.7" });
  });
});
