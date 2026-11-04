import { describe, expect, it } from "vitest";
import type { BetJson } from "@/lib/api/types";
import {
  MIN_BETS_FOR_RATES,
  MIXED,
  UNSPECIFIED,
  bookmakerOf,
  cumulativeSeries,
  groupBets,
  hasEnoughBets,
  marketOf,
  oddsRangeOf,
  orderedWeekdays,
  settledBetween,
  sportOf,
  streaks,
  summarizeBets,
  weekdayOf,
} from "./stats";

let counter = 0;

function bet(overrides: Partial<BetJson> & { status: BetJson["status"] }): BetJson {
  counter += 1;
  const stake = overrides.stakeMinor ?? 100000;
  const base: BetJson = {
    id: `bet-${counter}`,
    currency: "NGN",
    stakeMinor: stake,
    bookmakerLabel: null,
    decimalOdds: null,
    status: "pending",
    placedAt: "2026-11-01T10:00:00Z",
    settledAt: null,
    grossReturnMinor: null,
    netProfitMinor: null,
    provenance: "user_reported",
    notes: null,
    slipDraftId: null,
    selections: [{ id: `s-${counter}`, sport: null, event: "A v B", marketType: null, selection: "A", oddsDecimal: null, sortOrder: 0 }],
    createdAt: "2026-11-01T10:00:00Z",
    updatedAt: "2026-11-01T10:00:00Z",
  };
  const merged = { ...base, ...overrides };
  if (merged.status === "won" && merged.grossReturnMinor !== null && merged.netProfitMinor === null) {
    merged.netProfitMinor = merged.grossReturnMinor - merged.stakeMinor;
  }
  if (merged.status === "lost" && merged.netProfitMinor === null) merged.netProfitMinor = -merged.stakeMinor;
  if (merged.status === "void" && merged.netProfitMinor === null) merged.netProfitMinor = 0;
  if (merged.status !== "pending" && merged.settledAt === null) merged.settledAt = "2026-11-02T10:00:00Z";
  return merged;
}

const won = (stake: number, gross: number, extra: Partial<BetJson> = {}) =>
  bet({ status: "won", stakeMinor: stake, grossReturnMinor: gross, ...extra });
const lost = (stake: number, extra: Partial<BetJson> = {}) => bet({ status: "lost", stakeMinor: stake, ...extra });

describe("summarizeBets", () => {
  it("matches the documented example: +4,000, -3,000, -2,000 on 10,000 staked is -10% ROI", () => {
    const stats = summarizeBets([won(500000, 900000), lost(300000), lost(200000)]);
    expect(stats.netMinor).toBe(-100000);
    expect(stats.stakedMinor).toBe(1000000);
    expect(stats.roiPercent).toBeCloseTo(-10, 10);
    expect(stats.wins).toBe(1);
    expect(stats.losses).toBe(2);
    expect(stats.winRatePercent).toBeCloseTo(33.3333, 3);
    expect(stats.settled).toBe(3);
  });

  it("excludes pending and void from ROI and win rate but counts them", () => {
    const stats = summarizeBets([won(100000, 250000), bet({ status: "pending" }), bet({ status: "void", stakeMinor: 900000 })]);
    expect(stats.pending).toBe(1);
    expect(stats.voids).toBe(1);
    expect(stats.stakedMinor).toBe(100000);
    expect(stats.netMinor).toBe(150000);
    expect(stats.roiPercent).toBeCloseTo(150, 10);
    expect(stats.winRatePercent).toBe(100);
  });

  it("gives null rates, never NaN, when nothing is settled", () => {
    const stats = summarizeBets([bet({ status: "pending" }), bet({ status: "void" })]);
    expect(stats.roiPercent).toBeNull();
    expect(stats.winRatePercent).toBeNull();
    expect(stats.avgStakeMinor).toBeNull();
    expect(stats.avgOdds).toBeNull();
    expect(summarizeBets([]).settled).toBe(0);
  });

  it("averages stake over won and lost bets and odds over bets that recorded them", () => {
    const stats = summarizeBets([
      won(100000, 300000, { decimalOdds: 3 }),
      lost(300000, { decimalOdds: 2 }),
      lost(200000),
    ]);
    expect(stats.avgStakeMinor).toBe(200000);
    expect(stats.avgOdds).toBe(2.5);
  });

  it("flags small samples", () => {
    const few = summarizeBets(Array.from({ length: MIN_BETS_FOR_RATES - 1 }, () => lost(100)));
    const enough = summarizeBets(Array.from({ length: MIN_BETS_FOR_RATES }, () => lost(100)));
    expect(hasEnoughBets(few)).toBe(false);
    expect(hasEnoughBets(enough)).toBe(true);
  });
});

describe("settledBetween", () => {
  const inside = won(100, 300, { settledAt: "2026-11-03T08:00:00Z" });
  const before = won(100, 300, { settledAt: "2026-10-31T08:00:00Z" });
  const boundaryEarly = won(100, 300, { settledAt: "2026-11-02T23:30:00Z" }); // 3 Nov 00:30 in Lagos
  const pending = bet({ status: "pending" });

  it("filters on the Lagos settlement date, inclusive, and drops pending bets", () => {
    const result = settledBetween([inside, before, boundaryEarly, pending], "2026-11-03", "2026-11-03");
    expect(result).toEqual([inside, boundaryEarly]);
  });

  it("returns every settled bet for all time", () => {
    expect(settledBetween([inside, before, pending], null, null)).toEqual([inside, before]);
  });
});

describe("cumulativeSeries", () => {
  const bets = [
    won(100000, 300000, { settledAt: "2026-11-02T10:00:00Z" }), // +2000
    lost(50000, { settledAt: "2026-11-02T15:00:00Z" }), // -500
    lost(100000, { settledAt: "2026-11-04T10:00:00Z" }), // -1000
    bet({ status: "void", settledAt: "2026-11-05T10:00:00Z" }),
    bet({ status: "pending" }),
  ];

  it("builds a running total by day and skips void, pending and empty days", () => {
    expect(cumulativeSeries(bets, "day")).toEqual([
      { key: "2026-11-02", deltaMinor: 150000, cumulativeMinor: 150000 },
      { key: "2026-11-04", deltaMinor: -100000, cumulativeMinor: 50000 },
    ]);
  });

  it("groups by Monday-start week, month and year", () => {
    expect(cumulativeSeries(bets, "week")).toEqual([{ key: "2026-11-02", deltaMinor: 50000, cumulativeMinor: 50000 }]);
    expect(cumulativeSeries(bets, "month")).toEqual([{ key: "2026-11", deltaMinor: 50000, cumulativeMinor: 50000 }]);
    expect(cumulativeSeries(bets, "year")).toEqual([{ key: "2026", deltaMinor: 50000, cumulativeMinor: 50000 }]);
  });

  it("sorts buckets chronologically regardless of input order", () => {
    const shuffled = [bets[2] as BetJson, bets[0] as BetJson];
    expect(cumulativeSeries(shuffled, "day").map((p) => p.key)).toEqual(["2026-11-02", "2026-11-04"]);
  });

  it("is empty with nothing settled", () => {
    expect(cumulativeSeries([bet({ status: "pending" })], "day")).toEqual([]);
  });

  it("buckets by Lagos day around midnight", () => {
    const late = won(100, 300, { settledAt: "2026-11-02T23:30:00Z" });
    expect(cumulativeSeries([late], "day")[0]?.key).toBe("2026-11-03");
  });
});

describe("groupBets and labels", () => {
  const leg = (sport: string | null, marketType: string | null) => ({
    id: Math.random().toString(),
    sport,
    event: "X v Y",
    marketType,
    selection: "X",
    oddsDecimal: null,
    sortOrder: 0,
  });

  it("labels a bet by its shared sport, Mixed when legs differ, and Not recorded when blank", () => {
    expect(sportOf(won(100, 300, { selections: [leg("Football", null), leg("Football", null)] }))).toBe("Football");
    expect(sportOf(won(100, 300, { selections: [leg("Football", null), leg("Tennis", null)] }))).toBe(MIXED);
    expect(sportOf(won(100, 300, { selections: [leg(null, null)] }))).toBe(UNSPECIFIED);
    expect(sportOf(won(100, 300, { selections: [leg("  ", null)] }))).toBe(UNSPECIFIED);
    expect(marketOf(won(100, 300, { selections: [leg(null, "Over/Under")] }))).toBe("Over/Under");
  });

  it("labels bookmakers", () => {
    expect(bookmakerOf(bet({ status: "pending", bookmakerLabel: " Bet9ja " }))).toBe("Bet9ja");
    expect(bookmakerOf(bet({ status: "pending" }))).toBe(UNSPECIFIED);
  });

  it("groups and orders by settled count", () => {
    const rows = groupBets(
      [
        won(100, 300, { bookmakerLabel: "SportyBet" }),
        lost(100, { bookmakerLabel: "Bet9ja" }),
        lost(100, { bookmakerLabel: "Bet9ja" }),
        bet({ status: "pending", bookmakerLabel: "1xBet" }),
      ],
      bookmakerOf,
    );
    expect(rows.map((r) => r.key)).toEqual(["Bet9ja", "SportyBet", "1xBet"]);
    expect(rows[0]?.stats.losses).toBe(2);
    expect(rows[2]?.stats.pending).toBe(1);
  });

  it("places odds in ranges, with edges falling in the higher range", () => {
    expect(oddsRangeOf(bet({ status: "pending", decimalOdds: 1.49 }))).toBe("Under 1.50");
    expect(oddsRangeOf(bet({ status: "pending", decimalOdds: 1.5 }))).toBe("1.50 to 1.99");
    expect(oddsRangeOf(bet({ status: "pending", decimalOdds: 2 }))).toBe("2.00 to 2.99");
    expect(oddsRangeOf(bet({ status: "pending", decimalOdds: 10 }))).toBe("10.00 and above");
    expect(oddsRangeOf(bet({ status: "pending" }))).toBe(UNSPECIFIED);
  });

  it("names the Lagos weekday of settlement", () => {
    expect(weekdayOf(won(100, 300, { settledAt: "2026-11-02T10:00:00Z" }))).toBe("Monday");
    expect(weekdayOf(won(100, 300, { settledAt: "2026-11-01T23:30:00Z" }))).toBe("Monday"); // Mon 00:30 Lagos
    expect(weekdayOf(bet({ status: "pending" }))).toBe(UNSPECIFIED);
    const rows = groupBets(
      [won(100, 300, { settledAt: "2026-11-04T10:00:00Z" }), won(100, 300, { settledAt: "2026-11-02T10:00:00Z" })],
      weekdayOf,
    );
    expect(orderedWeekdays(rows).map((r) => r.key)).toEqual(["Monday", "Wednesday"]);
  });
});

describe("streaks", () => {
  const at = (day: number, status: "won" | "lost") =>
    status === "won"
      ? won(100, 300, { settledAt: `2026-10-${String(day).padStart(2, "0")}T10:00:00Z` })
      : lost(100, { settledAt: `2026-10-${String(day).padStart(2, "0")}T10:00:00Z` });

  it("finds the longest runs and the current run, in settlement order", () => {
    const history = [at(5, "lost"), at(1, "won"), at(2, "won"), at(3, "won"), at(4, "lost"), at(6, "lost")];
    expect(streaks(history)).toEqual({ longestWin: 3, longestLoss: 3, current: { kind: "lost", length: 3 } });
  });

  it("ignores void and pending bets", () => {
    const history = [at(1, "won"), bet({ status: "void", settledAt: "2026-10-02T10:00:00Z" }), at(3, "won"), bet({ status: "pending" })];
    expect(streaks(history)).toEqual({ longestWin: 2, longestLoss: 0, current: { kind: "won", length: 2 } });
  });

  it("handles no history", () => {
    expect(streaks([])).toEqual({ longestWin: 0, longestLoss: 0, current: null });
  });
});
