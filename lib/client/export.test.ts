import { describe, expect, it } from "vitest";
import type { BetJson } from "@/lib/api/types";
import { betsToCsv } from "./export";

const bet = (overrides: Partial<BetJson> = {}): BetJson => ({
  id: "1",
  currency: "NGN",
  stakeMinor: 500050,
  bookmakerLabel: "Bet9ja",
  decimalOdds: 1.85,
  status: "won",
  placedAt: "2026-11-01T10:00:00Z",
  settledAt: "2026-11-02T10:00:00Z",
  grossReturnMinor: 900000,
  netProfitMinor: 399950,
  provenance: "user_reported",
  notes: null,
  slipDraftId: null,
  selections: [{ id: "s", sport: "Football", event: "Arsenal v Chelsea", marketType: "Result", selection: "Arsenal", oddsDecimal: 1.85, sortOrder: 0 }],
  createdAt: "2026-11-01T10:00:00Z",
  updatedAt: "2026-11-01T10:00:00Z",
  ...overrides,
});

describe("betsToCsv", () => {
  it("writes a header and one row per bet with plain decimal money", () => {
    const lines = betsToCsv([bet()]).trimEnd().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("id,currency,stake,status,net_profit,total_return,total_odds,bookmaker,placed_at,settled_at,selections,notes");
    expect(lines[1]).toBe("1,NGN,5000.50,won,3999.50,9000.00,1.85,Bet9ja,2026-11-01T10:00:00Z,2026-11-02T10:00:00Z,Arsenal v Chelsea | Result | Arsenal | 1.85,");
  });

  it("leaves pending profit and return empty", () => {
    const row = betsToCsv([bet({ status: "pending", netProfitMinor: null, grossReturnMinor: null, settledAt: null })]).split("\n")[1] as string;
    expect(row).toContain(",pending,,,1.85,");
  });

  it("quotes commas, quotes and newlines", () => {
    const row = betsToCsv([bet({ notes: 'said "yes", twice\nnext line' })]).split("\n").slice(1).join("\n");
    expect(row).toContain('"said ""yes"", twice\nnext line"');
  });

  it("defuses spreadsheet formulas typed into text fields", () => {
    const csv = betsToCsv([bet({ bookmakerLabel: "=HYPERLINK(\"x\")", notes: "+1" })]);
    expect(csv).toContain("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csv).toContain(",'+1");
  });
});
