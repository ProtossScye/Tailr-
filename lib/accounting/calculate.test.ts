import { describe, expect, it } from "vitest";
import { AccountingError } from "./errors";
import { netProfitMinor, summarize, summarizeByCurrency } from "./calculate";
import { lagosDayRange } from "./dates";
import type { Bet, Currency, DateRange } from "./types";

const T = (iso: string) => new Date(iso);

// A wide range that contains everything in the simple tests.
const RANGE: DateRange = { start: T("2026-10-01T00:00:00Z"), end: T("2026-11-01T00:00:00Z") };
const WHEN = T("2026-10-15T12:00:00Z");

let counter = 0;
function bet(partial: Partial<Bet> & Pick<Bet, "status" | "stakeMinor">): Bet {
  counter += 1;
  return {
    id: `b${counter}`,
    currency: "NGN",
    placedAt: WHEN,
    settledAt: partial.status === "pending" ? undefined : WHEN,
    ...partial,
  };
}

describe("worked example from 07_USER_FLOWS_AND_TESTS.md", () => {
  it("₦5,000 -> ₦9,000, then ₦3,000 and ₦2,000 losses = -₦1,000 and -10% ROI", () => {
    const s = summarize(
      [
        bet({ status: "won", stakeMinor: 500_000, grossReturnMinor: 900_000 }),
        bet({ status: "lost", stakeMinor: 300_000 }),
        bet({ status: "lost", stakeMinor: 200_000 }),
      ],
      RANGE,
      "NGN",
    );
    expect(s.netProfitMinor).toBe(-100_000);
    expect(s.settledStakeMinor).toBe(1_000_000);
    expect(s.roiPercent).toBe(-10);
    expect(s.wins).toBe(1);
    expect(s.losses).toBe(2);
  });
});

describe("netProfitMinor", () => {
  it("win = gross return - stake", () => {
    expect(netProfitMinor(bet({ status: "won", stakeMinor: 500_000, grossReturnMinor: 900_000 }))).toBe(400_000);
  });
  it("loss = -stake", () => {
    expect(netProfitMinor(bet({ status: "lost", stakeMinor: 300_000 }))).toBe(-300_000);
  });
  it("void = 0", () => {
    expect(netProfitMinor(bet({ status: "void", stakeMinor: 300_000 }))).toBe(0);
  });
  it("pending = null (excluded)", () => {
    expect(netProfitMinor(bet({ status: "pending", stakeMinor: 300_000 }))).toBeNull();
  });
  it("a win that returns exactly the stake is 0 profit", () => {
    expect(netProfitMinor(bet({ status: "won", stakeMinor: 1_000, grossReturnMinor: 1_000 }))).toBe(0);
  });
});

describe("pending bets", () => {
  it("are excluded from P/L and ROI but counted separately with their stake", () => {
    const s = summarize(
      [
        bet({ status: "won", stakeMinor: 100_000, grossReturnMinor: 250_000 }),
        bet({ status: "pending", stakeMinor: 400_000 }),
        bet({ status: "pending", stakeMinor: 50_000 }),
      ],
      RANGE,
      "NGN",
    );
    expect(s.netProfitMinor).toBe(150_000);
    expect(s.settledStakeMinor).toBe(100_000);
    expect(s.roiPercent).toBe(150);
    expect(s.pendingCount).toBe(2);
    expect(s.pendingStakeMinor).toBe(450_000);
  });

  it("are counted even when placed outside the range (pending is a live snapshot)", () => {
    const s = summarize(
      [bet({ status: "pending", stakeMinor: 10_000, placedAt: T("2025-01-01T00:00:00Z") })],
      RANGE,
      "NGN",
    );
    expect(s.pendingCount).toBe(1);
  });

  it("alone give null ROI and null win rate", () => {
    const s = summarize([bet({ status: "pending", stakeMinor: 10_000 })], RANGE, "NGN");
    expect(s.roiPercent).toBeNull();
    expect(s.winRatePercent).toBeNull();
    expect(s.netProfitMinor).toBe(0);
  });
});

describe("void bets", () => {
  it("give 0 profit and do not affect stake, ROI or win rate", () => {
    const withVoid = summarize(
      [
        bet({ status: "won", stakeMinor: 100_000, grossReturnMinor: 300_000 }),
        bet({ status: "lost", stakeMinor: 100_000 }),
        bet({ status: "void", stakeMinor: 900_000 }),
      ],
      RANGE,
      "NGN",
    );
    const withoutVoid = summarize(
      [
        bet({ status: "won", stakeMinor: 100_000, grossReturnMinor: 300_000 }),
        bet({ status: "lost", stakeMinor: 100_000 }),
      ],
      RANGE,
      "NGN",
    );
    expect(withVoid.netProfitMinor).toBe(withoutVoid.netProfitMinor);
    expect(withVoid.settledStakeMinor).toBe(200_000);
    expect(withVoid.roiPercent).toBe(withoutVoid.roiPercent);
    expect(withVoid.winRatePercent).toBe(50);
    expect(withVoid.voids).toBe(1);
  });

  it("alone give null ROI and null win rate", () => {
    const s = summarize([bet({ status: "void", stakeMinor: 10_000 })], RANGE, "NGN");
    expect(s.roiPercent).toBeNull();
    expect(s.winRatePercent).toBeNull();
    expect(s.voids).toBe(1);
  });
});

describe("empty and zero-denominator cases", () => {
  it("empty list returns zeros and nulls, never NaN or a crash", () => {
    const s = summarize([], RANGE, "NGN");
    expect(s).toEqual({
      currency: "NGN",
      netProfitMinor: 0,
      settledStakeMinor: 0,
      roiPercent: null,
      winRatePercent: null,
      wins: 0,
      losses: 0,
      voids: 0,
      pendingCount: 0,
      pendingStakeMinor: 0,
    });
  });
});

describe("win rate", () => {
  it("1 win and 3 losses = 25%", () => {
    const s = summarize(
      [
        bet({ status: "won", stakeMinor: 1_000, grossReturnMinor: 2_000 }),
        bet({ status: "lost", stakeMinor: 1_000 }),
        bet({ status: "lost", stakeMinor: 1_000 }),
        bet({ status: "lost", stakeMinor: 1_000 }),
      ],
      RANGE,
      "NGN",
    );
    expect(s.winRatePercent).toBe(25);
  });

  it("all wins = 100%, all losses = 0%", () => {
    const allWins = summarize([bet({ status: "won", stakeMinor: 1_000, grossReturnMinor: 3_000 })], RANGE, "NGN");
    const allLosses = summarize([bet({ status: "lost", stakeMinor: 1_000 })], RANGE, "NGN");
    expect(allWins.winRatePercent).toBe(100);
    expect(allLosses.winRatePercent).toBe(0);
  });
});

describe("ROI precision", () => {
  it("does not round inside the calculation", () => {
    const oneThird = summarize(
      [
        bet({ status: "won", stakeMinor: 1, grossReturnMinor: 2 }),
        bet({ status: "void", stakeMinor: 5 }),
        bet({ status: "lost", stakeMinor: 1 }),
        bet({ status: "won", stakeMinor: 1, grossReturnMinor: 2 }),
      ],
      RANGE,
      "NGN",
    );
    // profit = 1 - 1 + 1 = 1, stake = 3
    expect(oneThird.roiPercent).toBeCloseTo(33.3333333333, 8);
    expect(oneThird.roiPercent).not.toBe(33.3);
  });
});

describe("date range boundaries (half-open [start, end))", () => {
  const range: DateRange = { start: T("2026-10-10T00:00:00.000Z"), end: T("2026-10-11T00:00:00.000Z") };

  it("includes a bet settled exactly at range start", () => {
    const s = summarize([bet({ status: "lost", stakeMinor: 1_000, settledAt: range.start })], range, "NGN");
    expect(s.losses).toBe(1);
  });

  it("excludes a bet settled exactly at range end", () => {
    const s = summarize([bet({ status: "lost", stakeMinor: 1_000, settledAt: range.end })], range, "NGN");
    expect(s.losses).toBe(0);
  });

  it("excludes a bet settled 1ms before start, includes 1ms before end", () => {
    const before = bet({ status: "lost", stakeMinor: 1_000, settledAt: new Date(range.start.getTime() - 1) });
    const justInside = bet({ status: "lost", stakeMinor: 1_000, settledAt: new Date(range.end.getTime() - 1) });
    const s = summarize([before, justInside], range, "NGN");
    expect(s.losses).toBe(1);
  });

  it("filters by settlement date, not placement date", () => {
    const placedInRangeSettledOutside = bet({
      status: "lost",
      stakeMinor: 1_000,
      placedAt: T("2026-10-10T08:00:00Z"),
      settledAt: T("2026-10-20T08:00:00Z"),
    });
    expect(summarize([placedInRangeSettledOutside], range, "NGN").losses).toBe(0);
  });

  it("Lagos midnight: each bet lands in exactly one Lagos day", () => {
    const oct29 = lagosDayRange("2026-10-29");
    const oct30 = lagosDayRange("2026-10-30");
    // 22:59:59.999Z = 23:59:59.999 in Lagos on Oct 29. 23:00:00Z = 00:00 in Lagos on Oct 30.
    const lastMomentOct29 = bet({ status: "lost", stakeMinor: 1_000, settledAt: T("2026-10-29T22:59:59.999Z") });
    const firstMomentOct30 = bet({ status: "lost", stakeMinor: 2_000, settledAt: T("2026-10-29T23:00:00.000Z") });
    const all = [lastMomentOct29, firstMomentOct30];

    expect(summarize(all, oct29, "NGN").settledStakeMinor).toBe(1_000);
    expect(summarize(all, oct30, "NGN").settledStakeMinor).toBe(2_000);
  });
});

describe("currency handling (NGN and USD)", () => {
  const mixed: Bet[] = [
    bet({ status: "won", stakeMinor: 500_000, grossReturnMinor: 900_000, currency: "NGN" }),
    bet({ status: "lost", stakeMinor: 1_000, currency: "USD" }),
    bet({ status: "won", stakeMinor: 2_000, grossReturnMinor: 5_000, currency: "USD" }),
    bet({ status: "pending", stakeMinor: 7_500, currency: "USD" }),
  ];

  it("never mixes currencies in one total", () => {
    const ngn = summarize(mixed, RANGE, "NGN");
    const usd = summarize(mixed, RANGE, "USD");
    expect(ngn.netProfitMinor).toBe(400_000);
    expect(ngn.settledStakeMinor).toBe(500_000);
    expect(ngn.pendingCount).toBe(0);
    expect(usd.netProfitMinor).toBe(2_000); // -1000 + 3000
    expect(usd.settledStakeMinor).toBe(3_000);
    expect(usd.pendingStakeMinor).toBe(7_500);
  });

  it("summarizeByCurrency returns an independent summary per currency", () => {
    const by = summarizeByCurrency(mixed, RANGE);
    expect(Object.keys(by).sort()).toEqual(["NGN", "USD"]);
    expect(by.NGN.currency).toBe("NGN");
    expect(by.USD.currency).toBe("USD");
    expect(by.USD.winRatePercent).toBe(50);
    expect(by.NGN.winRatePercent).toBe(100);
  });

  it("a currency with no bets gets a clean empty summary", () => {
    const by = summarizeByCurrency([bet({ status: "lost", stakeMinor: 1_000, currency: "NGN" })], RANGE);
    expect(by.USD.settledStakeMinor).toBe(0);
    expect(by.USD.roiPercent).toBeNull();
  });

  it("rejects an unsupported currency on a bet or in the call", () => {
    const bad = bet({ status: "lost", stakeMinor: 1_000, currency: "GBP" as unknown as Currency });
    expect(() => summarize([bad], RANGE, "NGN")).toThrow(AccountingError);
    expect(() => summarize([], RANGE, "EUR" as unknown as Currency)).toThrow(AccountingError);
  });
});

describe("invalid input throws AccountingError", () => {
  it.each([0, -100, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53, "5000" as unknown as number])(
    "invalid stake %s",
    (stake) => {
      const b = bet({ status: "lost", stakeMinor: stake });
      expect(() => netProfitMinor(b)).toThrow(AccountingError);
      expect(() => summarize([b], RANGE, "NGN")).toThrow(AccountingError);
    },
  );

  it("won bet without a gross return", () => {
    expect(() => netProfitMinor(bet({ status: "won", stakeMinor: 1_000 }))).toThrow(AccountingError);
  });

  it.each([-1, 1.5, Number.NaN])("won bet with invalid gross return %s", (gross) => {
    expect(() => netProfitMinor(bet({ status: "won", stakeMinor: 1_000, grossReturnMinor: gross }))).toThrow(
      AccountingError,
    );
  });

  it("won bet returning less than its stake (partial returns unsupported)", () => {
    expect(() => netProfitMinor(bet({ status: "won", stakeMinor: 1_000, grossReturnMinor: 500 }))).toThrow(
      /partial/,
    );
  });

  it("settled bet without settledAt", () => {
    expect(() => netProfitMinor(bet({ status: "lost", stakeMinor: 1_000, settledAt: undefined }))).toThrow(
      AccountingError,
    );
  });

  it("invalid Date objects", () => {
    expect(() => netProfitMinor(bet({ status: "lost", stakeMinor: 1_000, settledAt: new Date("nope") }))).toThrow(
      AccountingError,
    );
    expect(() => netProfitMinor(bet({ status: "pending", stakeMinor: 1_000, placedAt: new Date("nope") }))).toThrow(
      AccountingError,
    );
  });

  it("unknown status", () => {
    const b = bet({ status: "cashed_out" as unknown as Bet["status"], stakeMinor: 1_000 });
    expect(() => netProfitMinor(b)).toThrow(AccountingError);
  });

  it("empty or reversed range", () => {
    expect(() => summarize([], { start: RANGE.end, end: RANGE.start }, "NGN")).toThrow(AccountingError);
    expect(() => summarize([], { start: RANGE.start, end: RANGE.start }, "NGN")).toThrow(AccountingError);
  });

  it("corrupt bets in other currencies still fail loudly", () => {
    const corrupt = bet({ status: "lost", stakeMinor: -5, currency: "USD" });
    expect(() => summarize([corrupt], RANGE, "NGN")).toThrow(AccountingError);
  });
});

describe("purity", () => {
  it("does not mutate its input", () => {
    const bets = [
      bet({ status: "won", stakeMinor: 1_000, grossReturnMinor: 2_500 }),
      bet({ status: "pending", stakeMinor: 500 }),
    ];
    const snapshot = JSON.stringify(bets);
    summarize(bets, RANGE, "NGN");
    summarizeByCurrency(bets, RANGE);
    expect(JSON.stringify(bets)).toBe(snapshot);
  });

  it("handles large realistic volumes exactly", () => {
    const bets: Bet[] = [];
    for (let i = 0; i < 10_000; i += 1) {
      bets.push(bet({ status: i % 2 === 0 ? "won" : "lost", stakeMinor: 100_000, grossReturnMinor: 250_000 }));
    }
    const s = summarize(bets, RANGE, "NGN");
    // 5,000 wins * 150,000 - 5,000 losses * 100,000 = 250,000,000
    expect(s.netProfitMinor).toBe(250_000_000);
    expect(s.settledStakeMinor).toBe(1_000_000_000);
    expect(s.roiPercent).toBe(25);
    expect(s.winRatePercent).toBe(50);
  });
});
