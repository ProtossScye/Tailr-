import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lagosDayRange } from "../../lib/accounting";
import {
  createBet,
  deleteBet,
  getBet,
  getDashboardStats,
  listBets,
  NotFoundError,
  settleBet,
  updateBet,
  ValidationError,
  type CreateBetInput,
  type ServiceDeps,
} from "../../lib/services";
import { createDb, newUser } from "./helpers";
import { createPgliteBetRepository } from "./pglite-repository";

/**
 * The bet services, run end to end on an in-memory Postgres: the real tables,
 * constraints, create_bet/update_bet functions and privacy rules, acting as a
 * signed-in user. Every test makes its own users, so tests cannot affect each other.
 */

const NOW = new Date("2026-10-31T19:00:00Z");
const MISSING_ID = "00000000-0000-0000-0000-000000000000";

let db: PGlite;

beforeAll(async () => {
  db = await createDb();
});

afterAll(async () => {
  await db.close();
});

function depsFor(userId: string | null, options: { pageSize?: number; now?: Date } = {}): ServiceDeps {
  return { repo: createPgliteBetRepository(db, userId, { pageSize: options.pageSize }), now: () => options.now ?? NOW };
}

async function freshUser() {
  const id = await newUser(db);
  return { id, deps: depsFor(id) };
}

function betInput(overrides: Partial<CreateBetInput> = {}): CreateBetInput {
  return {
    currency: "NGN",
    stakeMinor: 500000,
    placedAt: "2026-10-15T12:00:00Z",
    selections: [{ event: "Arsenal vs Chelsea", selection: "Arsenal -1" }],
    ...overrides,
  };
}

async function owner<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

async function count(sql: string, params: unknown[] = []): Promise<number> {
  return (await owner<{ n: number }>(sql, params))[0]!.n;
}

async function validationIssues(promise: Promise<unknown>): Promise<Record<string, string>> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ValidationError) return Object.fromEntries(error.issues.map((i) => [i.field, i.message]));
    throw error;
  }
  throw new Error("expected a ValidationError but nothing was thrown");
}

describe("createBet", () => {
  it("saves a pending bet with its legs and returns it", async () => {
    const { id, deps } = await freshUser();
    const bet = await createBet(
      deps,
      betInput({
        bookmakerLabel: "Bet9ja",
        decimalOdds: 3.45,
        notes: "accumulator",
        selections: [
          { sport: "Football", event: "Arsenal vs Chelsea", marketType: "Asian handicap", selection: "Arsenal -1", oddsDecimal: 1.95 },
          { event: "Lakers vs Celtics", selection: "Over 210.5" },
        ],
      }),
    );
    expect(bet).toMatchObject({
      currency: "NGN",
      stakeMinor: 500000,
      status: "pending",
      bookmakerLabel: "Bet9ja",
      decimalOdds: 3.45,
      notes: "accumulator",
      settledAt: null,
      grossReturnMinor: null,
      netProfitMinor: null,
      provenance: "user_reported",
    });
    expect(bet.placedAt).toEqual(new Date("2026-10-15T12:00:00Z"));
    expect(bet.selections.map((s) => [s.event, s.oddsDecimal])).toEqual([
      ["Arsenal vs Chelsea", 1.95],
      ["Lakers vs Celtics", null],
    ]);
    expect(await owner("select user_id from public.bets where id = $1", [bet.id])).toEqual([{ user_id: id }]);
  });

  it("keeps legs in the order they were given", async () => {
    const { deps } = await freshUser();
    const bet = await createBet(
      deps,
      betInput({ selections: ["C", "A", "B"].map((s) => ({ event: `Match ${s}`, selection: s })) }),
    );
    expect(bet.selections.map((s) => s.selection)).toEqual(["C", "A", "B"]);
    expect(bet.selections.map((s) => s.sortOrder)).toEqual([0, 1, 2]);
  });

  it("cannot be tricked into another owner, a result or a verified label", async () => {
    const { id, deps } = await freshUser();
    const other = await newUser(db);
    const smuggled = {
      ...betInput(),
      userId: other,
      user_id: other,
      status: "won",
      grossReturnMinor: 9_000_000,
      settledAt: "2026-10-16T12:00:00Z",
      provenance: "verified",
    } as unknown as CreateBetInput;
    const bet = await createBet(deps, smuggled);
    expect(bet.status).toBe("pending");
    expect(bet.grossReturnMinor).toBeNull();
    expect(bet.settledAt).toBeNull();
    expect(bet.provenance).toBe("user_reported");
    expect(await owner("select user_id from public.bets where id = $1", [bet.id])).toEqual([{ user_id: id }]);
    expect(await count("select count(*)::int as n from public.bets where user_id = $1", [other])).toBe(0);
  });

  it("rejects bad input with field messages and writes nothing", async () => {
    const { id, deps } = await freshUser();
    const issues = await validationIssues(
      createBet(deps, { currency: "GBP", stakeMinor: 0, placedAt: "soon", selections: [] } as unknown as CreateBetInput),
    );
    expect(Object.keys(issues).sort()).toEqual(["currency", "placedAt", "selections", "stakeMinor"]);
    expect(await count("select count(*)::int as n from public.bets where user_id = $1", [id])).toBe(0);
  });

  it("rejects a placement time in the future", async () => {
    const { deps } = await freshUser();
    expect(await validationIssues(createBet(deps, betInput({ placedAt: "2026-11-30T12:00:00Z" })))).toHaveProperty("placedAt");
  });

  it("without a signed-in identity, nothing can be created", async () => {
    await expect(createBet(depsFor(null), betInput())).rejects.toThrow();
  });
});

describe("the database function is all-or-nothing", () => {
  it("a bad leg leaves no bet behind", async () => {
    const { id } = await freshUser();
    const repo = createPgliteBetRepository(db, id);
    const bet = { bookmaker_label: null, currency: "NGN", stake_minor: 1000, decimal_odds: null, placed_at: "2026-10-15T12:00:00.000Z", notes: null } as const;
    const goodLeg = { sport: null, event: "Match", market_type: null, selection: "Home", odds_decimal: null };
    const badLeg = { sport: null, event: "", market_type: null, selection: "Away", odds_decimal: null };
    await expect(repo.createBet({ ...bet }, [goodLeg, badLeg])).rejects.toThrow();
    expect(await count("select count(*)::int as n from public.bets where user_id = $1", [id])).toBe(0);
    expect(await count("select count(*)::int as n from public.bet_selections where bet_id in (select id from public.bets where user_id = $1)", [id])).toBe(0);
  });

  it("no legs at all is refused", async () => {
    const { id } = await freshUser();
    const repo = createPgliteBetRepository(db, id);
    await expect(
      repo.createBet({ bookmaker_label: null, currency: "NGN", stake_minor: 1000, decimal_odds: null, placed_at: "2026-10-15T12:00:00.000Z", notes: null }, []),
    ).rejects.toThrow(/at least one selection/);
    expect(await count("select count(*)::int as n from public.bets where user_id = $1", [id])).toBe(0);
  });

  it("a failed leg replacement keeps the old legs and the old field values", async () => {
    const { id, deps } = await freshUser();
    const bet = await createBet(deps, betInput({ notes: "original" }));
    const repo = createPgliteBetRepository(db, id);
    const badLeg = { sport: null, event: "", market_type: null, selection: "x", odds_decimal: null };
    await expect(repo.updateBet(bet.id, { notes: "changed" }, [badLeg])).rejects.toThrow();
    const after = await getBet(deps, bet.id);
    expect(after.notes).toBe("original");
    expect(after.selections.map((s) => s.selection)).toEqual(["Arsenal -1"]);
  });
});

describe("getBet and listBets only ever show the user's own bets", () => {
  it("another user's bet looks exactly like a bet that does not exist", async () => {
    const ada = await freshUser();
    const bola = await freshUser();
    const adaBet = await createBet(ada.deps, betInput());
    await expect(getBet(bola.deps, adaBet.id)).rejects.toThrow(NotFoundError);
    await expect(getBet(bola.deps, MISSING_ID)).rejects.toThrow(NotFoundError);
    await expect(getBet(bola.deps, "not-a-uuid")).rejects.toThrow(NotFoundError);
    await expect(getBet(ada.deps, adaBet.id)).resolves.toMatchObject({ id: adaBet.id });
  });

  it("lists newest placed first, with legs, and only the user's own", async () => {
    const ada = await freshUser();
    const bola = await freshUser();
    const older = await createBet(ada.deps, betInput({ placedAt: "2026-10-01T12:00:00Z" }));
    const newer = await createBet(ada.deps, betInput({ placedAt: "2026-10-20T12:00:00Z" }));
    await createBet(bola.deps, betInput());
    const page = await listBets(ada.deps);
    expect(page.items.map((b) => b.id)).toEqual([newer.id, older.id]);
    expect(page.items[0]!.selections).toHaveLength(1);
    expect(page.hasMore).toBe(false);
  });

  it("filters by status and currency", async () => {
    const { deps } = await freshUser();
    const won = await createBet(deps, betInput({ stakeMinor: 1000 }));
    await settleBet(deps, won.id, { outcome: "won", grossReturnMinor: 2500 });
    await createBet(deps, betInput({ currency: "USD", stakeMinor: 2500 }));
    await createBet(deps, betInput());
    expect((await listBets(deps, { status: "pending" })).items).toHaveLength(2);
    expect((await listBets(deps, { status: "won" })).items.map((b) => b.id)).toEqual([won.id]);
    expect((await listBets(deps, { currency: "USD" })).items).toHaveLength(1);
    expect((await listBets(deps, { currency: "NGN", status: "pending" })).items).toHaveLength(1);
  });

  it("pages without overlap and says whether there is more", async () => {
    const { deps } = await freshUser();
    for (let day = 1; day <= 5; day += 1) {
      await createBet(deps, betInput({ placedAt: `2026-10-0${day}T12:00:00Z` }));
    }
    const first = await listBets(deps, { limit: 2 });
    const second = await listBets(deps, { limit: 2, offset: 2 });
    const third = await listBets(deps, { limit: 2, offset: 4 });
    expect([first.hasMore, second.hasMore, third.hasMore]).toEqual([true, true, false]);
    const ids = [...first.items, ...second.items, ...third.items].map((b) => b.id);
    expect(new Set(ids).size).toBe(5);
    expect(third.items).toHaveLength(1);
  });

  it("says there is no next page when the last page is exactly full", async () => {
    const { deps } = await freshUser();
    for (let day = 1; day <= 4; day += 1) {
      await createBet(deps, betInput({ placedAt: `2026-10-0${day}T12:00:00Z` }));
    }
    const second = await listBets(deps, { limit: 2, offset: 2 });
    expect(second.items).toHaveLength(2);
    expect(second.hasMore).toBe(false);
    expect((await listBets(deps, { limit: 4 })).hasMore).toBe(false);
    expect((await listBets(deps, { limit: 3 })).hasMore).toBe(true);
  });

  it("rejects an invalid query", async () => {
    const { deps } = await freshUser();
    for (const query of [{ limit: 0 }, { limit: 201 }, { limit: 1.5 }, { offset: -1 }, { status: "cashed_out" }, { currency: "GBP" }]) {
      await expect(listBets(deps, query as never)).rejects.toThrow(ValidationError);
    }
  });
});

describe("updateBet", () => {
  it("edits details and leaves the legs alone when none are given", async () => {
    const { deps } = await freshUser();
    const bet = await createBet(deps, betInput({ notes: "first", bookmakerLabel: "Sportybet" }));
    const updated = await updateBet(deps, bet.id, { stakeMinor: 750000, notes: "second", decimalOdds: 2.5 });
    expect(updated).toMatchObject({ stakeMinor: 750000, notes: "second", decimalOdds: 2.5, bookmakerLabel: "Sportybet" });
    expect(updated.selections.map((s) => s.selection)).toEqual(["Arsenal -1"]);
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(bet.updatedAt.getTime());
  });

  it("clears optional fields with null", async () => {
    const { deps } = await freshUser();
    const bet = await createBet(deps, betInput({ notes: "x", bookmakerLabel: "y", decimalOdds: 2 }));
    const cleared = await updateBet(deps, bet.id, { notes: null, bookmakerLabel: null, decimalOdds: null });
    expect(cleared).toMatchObject({ notes: null, bookmakerLabel: null, decimalOdds: null });
  });

  it("replaces all legs, in order, when selections are given", async () => {
    const { deps } = await freshUser();
    const bet = await createBet(deps, betInput());
    const updated = await updateBet(deps, bet.id, {
      selections: [
        { event: "New match 1", selection: "B" },
        { event: "New match 2", selection: "A" },
      ],
    });
    expect(updated.selections.map((s) => s.selection)).toEqual(["B", "A"]);
    expect(updated.selections.map((s) => s.sortOrder)).toEqual([0, 1]);
  });

  it("can change the currency and placement time of a pending bet", async () => {
    const { deps } = await freshUser();
    const bet = await createBet(deps, betInput());
    const updated = await updateBet(deps, bet.id, { currency: "USD", placedAt: "2026-10-10T08:00:00Z" });
    expect(updated.currency).toBe("USD");
    expect(updated.placedAt).toEqual(new Date("2026-10-10T08:00:00Z"));
  });

  it("cannot change the result: status and return are not editable here", async () => {
    const { deps } = await freshUser();
    const bet = await createBet(deps, betInput());
    expect(
      await validationIssues(updateBet(deps, bet.id, { status: "won", grossReturnMinor: 900000 } as never)),
    ).toEqual({ input: "Nothing to update" });
    expect((await getBet(deps, bet.id)).status).toBe("pending");
  });

  it("another user's bet cannot be edited, and is left untouched", async () => {
    const ada = await freshUser();
    const bola = await freshUser();
    const adaBet = await createBet(ada.deps, betInput({ notes: "mine" }));
    await expect(updateBet(bola.deps, adaBet.id, { notes: "hacked", stakeMinor: 1 })).rejects.toThrow(NotFoundError);
    await expect(updateBet(bola.deps, adaBet.id, { selections: [{ event: "x", selection: "y" }] })).rejects.toThrow(NotFoundError);
    const after = await getBet(ada.deps, adaBet.id);
    expect(after.notes).toBe("mine");
    expect(after.stakeMinor).toBe(500000);
    expect(after.selections.map((s) => s.selection)).toEqual(["Arsenal -1"]);
  });

  it("rejects bad values and a missing or malformed id", async () => {
    const { deps } = await freshUser();
    const bet = await createBet(deps, betInput());
    await expect(updateBet(deps, bet.id, { stakeMinor: -5 })).rejects.toThrow(ValidationError);
    await expect(updateBet(deps, MISSING_ID, { notes: "x" })).rejects.toThrow(NotFoundError);
    await expect(updateBet(deps, "nope", { notes: "x" })).rejects.toThrow(NotFoundError);
  });

  it("a won bet's stake can be lowered but not raised above what it returned", async () => {
    const { deps } = await freshUser();
    const bet = await createBet(deps, betInput({ stakeMinor: 500000 }));
    await settleBet(deps, bet.id, { outcome: "won", grossReturnMinor: 900000 });

    const lowered = await updateBet(deps, bet.id, { stakeMinor: 300000 });
    expect(lowered.netProfitMinor).toBe(600000);

    const issues = await validationIssues(updateBet(deps, bet.id, { stakeMinor: 900001 }));
    expect(issues.stakeMinor).toMatch(/won/);
    expect(issues.stakeMinor).toContain("₦9,000.00");
    expect((await getBet(deps, bet.id)).stakeMinor).toBe(300000);
  });

  it("a bet cannot be moved to after the time it was settled", async () => {
    const { deps } = await freshUser();
    const bet = await createBet(deps, betInput({ placedAt: "2026-10-15T12:00:00Z" }));
    await settleBet(deps, bet.id, { outcome: "lost", settledAt: "2026-10-16T12:00:00Z" });
    expect(await validationIssues(updateBet(deps, bet.id, { placedAt: "2026-10-17T12:00:00Z" }))).toHaveProperty("placedAt");
    await expect(updateBet(deps, bet.id, { placedAt: "2026-10-16T12:00:00Z" })).resolves.toBeTruthy();
  });
});

describe("settleBet", () => {
  it("won: records the return and the profit, settled now by default", async () => {
    const { deps } = await freshUser();
    const bet = await createBet(deps, betInput({ stakeMinor: 500000 }));
    const won = await settleBet(deps, bet.id, { outcome: "won", grossReturnMinor: 900000 });
    expect(won).toMatchObject({ status: "won", grossReturnMinor: 900000, netProfitMinor: 400000 });
    expect(won.settledAt).toEqual(NOW);
  });

  it("lost and void: no return, profit is minus the stake and zero", async () => {
    const { deps } = await freshUser();
    const a = await createBet(deps, betInput({ stakeMinor: 300000 }));
    const b = await createBet(deps, betInput({ stakeMinor: 200000 }));
    expect(await settleBet(deps, a.id, { outcome: "lost" })).toMatchObject({ status: "lost", grossReturnMinor: null, netProfitMinor: -300000 });
    expect(await settleBet(deps, b.id, { outcome: "void" })).toMatchObject({ status: "void", grossReturnMinor: null, netProfitMinor: 0 });
  });

  it("uses the settlement time it is given", async () => {
    const { deps } = await freshUser();
    const bet = await createBet(deps, betInput());
    const lost = await settleBet(deps, bet.id, { outcome: "lost", settledAt: "2026-10-20T15:30:00Z" });
    expect(lost.settledAt).toEqual(new Date("2026-10-20T15:30:00Z"));
  });

  it("a mistake can be corrected: won to lost clears the return, lost to won sets it", async () => {
    const { deps } = await freshUser();
    const bet = await createBet(deps, betInput({ stakeMinor: 500000 }));
    await settleBet(deps, bet.id, { outcome: "won", grossReturnMinor: 900000 });
    const lost = await settleBet(deps, bet.id, { outcome: "lost" });
    expect(lost).toMatchObject({ status: "lost", grossReturnMinor: null, netProfitMinor: -500000 });
    const won = await settleBet(deps, bet.id, { outcome: "won", grossReturnMinor: 1_000_000 });
    expect(won).toMatchObject({ status: "won", grossReturnMinor: 1_000_000, netProfitMinor: 500000 });
  });

  it("a win that pays back less than the stake must be recorded as void", async () => {
    const { deps } = await freshUser();
    const bet = await createBet(deps, betInput({ stakeMinor: 500000 }));
    const issues = await validationIssues(settleBet(deps, bet.id, { outcome: "won", grossReturnMinor: 250000 }));
    expect(issues.grossReturnMinor).toMatch(/void/);
    expect(issues.grossReturnMinor).toContain("₦5,000.00");
    expect((await getBet(deps, bet.id)).status).toBe("pending");
  });

  it("a win that returns exactly the stake is accepted and counts as a win with zero profit", async () => {
    const { deps } = await freshUser();
    const bet = await createBet(deps, betInput({ stakeMinor: 500000 }));
    expect(await settleBet(deps, bet.id, { outcome: "won", grossReturnMinor: 500000 })).toMatchObject({ status: "won", netProfitMinor: 0 });
  });

  it("won needs a return, and the outcome must be one of the three", async () => {
    const { deps } = await freshUser();
    const bet = await createBet(deps, betInput());
    expect(await validationIssues(settleBet(deps, bet.id, { outcome: "won" } as never))).toHaveProperty("grossReturnMinor");
    expect(await validationIssues(settleBet(deps, bet.id, { outcome: "cashed_out" } as never))).toHaveProperty("outcome");
    expect((await getBet(deps, bet.id)).status).toBe("pending");
  });

  it("cannot be settled before it was placed, or in the future", async () => {
    const { deps } = await freshUser();
    const bet = await createBet(deps, betInput({ placedAt: "2026-10-15T12:00:00Z" }));
    expect((await validationIssues(settleBet(deps, bet.id, { outcome: "lost", settledAt: "2026-10-14T12:00:00Z" }))).settledAt).toMatch(/before/);
    expect((await validationIssues(settleBet(deps, bet.id, { outcome: "lost", settledAt: "2026-12-01T12:00:00Z" }))).settledAt).toMatch(/future/);
  });

  it("settling 'now' on a bet placed a moment ahead of the clock never goes backwards in time", async () => {
    const { deps } = await freshUser();
    const slightlyAhead = new Date(NOW.getTime() + 2 * 60 * 1000);
    const bet = await createBet(deps, betInput({ placedAt: slightlyAhead }));
    const lost = await settleBet(deps, bet.id, { outcome: "lost" });
    expect(lost.settledAt).toEqual(slightlyAhead);
  });

  it("another user's bet cannot be settled, and stays pending", async () => {
    const ada = await freshUser();
    const bola = await freshUser();
    const adaBet = await createBet(ada.deps, betInput());
    await expect(settleBet(bola.deps, adaBet.id, { outcome: "won", grossReturnMinor: 900000 })).rejects.toThrow(NotFoundError);
    await expect(settleBet(bola.deps, "nope", { outcome: "lost" })).rejects.toThrow(NotFoundError);
    expect((await getBet(ada.deps, adaBet.id)).status).toBe("pending");
  });
});

describe("deleteBet", () => {
  it("removes the bet and its legs", async () => {
    const { deps } = await freshUser();
    const bet = await createBet(deps, betInput({ selections: [{ event: "A", selection: "1" }, { event: "B", selection: "2" }] }));
    await deleteBet(deps, bet.id);
    await expect(getBet(deps, bet.id)).rejects.toThrow(NotFoundError);
    expect(await count("select count(*)::int as n from public.bet_selections where bet_id = $1", [bet.id])).toBe(0);
    await expect(deleteBet(deps, bet.id)).rejects.toThrow(NotFoundError);
  });

  it("another user's bet cannot be deleted, and is still there", async () => {
    const ada = await freshUser();
    const bola = await freshUser();
    const adaBet = await createBet(ada.deps, betInput());
    await expect(deleteBet(bola.deps, adaBet.id)).rejects.toThrow(NotFoundError);
    await expect(deleteBet(bola.deps, "nope")).rejects.toThrow(NotFoundError);
    await expect(getBet(ada.deps, adaBet.id)).resolves.toMatchObject({ id: adaBet.id });
  });
});

describe("getDashboardStats", () => {
  async function settled(deps: ServiceDeps, input: Partial<CreateBetInput>, result: Parameters<typeof settleBet>[2]) {
    const bet = await createBet(deps, betInput(input));
    return settleBet(deps, bet.id, result);
  }

  it("matches the worked example: ₦5,000 to ₦9,000, then two losses is -₦1,000 and -10% ROI", async () => {
    const { deps } = await freshUser();
    await settled(deps, { stakeMinor: 500000 }, { outcome: "won", grossReturnMinor: 900000 });
    await settled(deps, { stakeMinor: 300000 }, { outcome: "lost" });
    await settled(deps, { stakeMinor: 200000 }, { outcome: "lost" });
    const { byCurrency } = await getDashboardStats(deps);
    expect(byCurrency.NGN).toMatchObject({ netProfitMinor: -100000, settledStakeMinor: 1_000_000, roiPercent: -10, wins: 1, losses: 2 });
    expect(byCurrency.NGN.winRatePercent).toBeCloseTo(33.3333, 3);
  });

  it("keeps NGN and USD apart, excludes voids from ROI, and reports pending separately", async () => {
    const { deps } = await freshUser();
    await settled(deps, { stakeMinor: 1000 }, { outcome: "won", grossReturnMinor: 2500 });
    await settled(deps, { stakeMinor: 5000 }, { outcome: "void" });
    await createBet(deps, betInput({ stakeMinor: 7000 }));
    await settled(deps, { currency: "USD", stakeMinor: 2000 }, { outcome: "lost" });
    await createBet(deps, betInput({ currency: "USD", stakeMinor: 9900 }));
    const { byCurrency } = await getDashboardStats(deps);
    expect(byCurrency.NGN).toMatchObject({ netProfitMinor: 1500, settledStakeMinor: 1000, roiPercent: 150, voids: 1, pendingCount: 1, pendingStakeMinor: 7000 });
    expect(byCurrency.USD).toMatchObject({ netProfitMinor: -2000, settledStakeMinor: 2000, roiPercent: -100, pendingCount: 1, pendingStakeMinor: 9900 });
  });

  it("filters by settlement date using Lagos days, so each bet lands in exactly one day", async () => {
    const { deps } = await freshUser();
    await settled(deps, { stakeMinor: 1000, placedAt: "2026-10-29T10:00:00Z" }, { outcome: "lost", settledAt: "2026-10-30T22:59:59.999Z" });
    await settled(deps, { stakeMinor: 2000, placedAt: "2026-10-29T10:00:00Z" }, { outcome: "lost", settledAt: "2026-10-30T23:00:00Z" });
    const oct30 = await getDashboardStats(deps, { range: lagosDayRange("2026-10-30") });
    const oct31 = await getDashboardStats(deps, { range: lagosDayRange("2026-10-31") });
    expect(oct30.byCurrency.NGN.settledStakeMinor).toBe(1000);
    expect(oct31.byCurrency.NGN.settledStakeMinor).toBe(2000);
    expect((await getDashboardStats(deps)).byCurrency.NGN.settledStakeMinor).toBe(3000);
  });

  it("only counts the user's own bets", async () => {
    const ada = await freshUser();
    const bola = await freshUser();
    await settled(ada.deps, { stakeMinor: 1000 }, { outcome: "lost" });
    await settled(bola.deps, { stakeMinor: 99999 }, { outcome: "won", grossReturnMinor: 500000 });
    expect((await getDashboardStats(ada.deps)).byCurrency.NGN.settledStakeMinor).toBe(1000);
  });

  it("a user with no bets gets empty summaries, not errors", async () => {
    const { deps } = await freshUser();
    const { byCurrency } = await getDashboardStats(deps);
    for (const currency of ["NGN", "USD"] as const) {
      expect(byCurrency[currency]).toMatchObject({ netProfitMinor: 0, settledStakeMinor: 0, roiPercent: null, winRatePercent: null, pendingCount: 0 });
    }
  });

  it("counts every bet even when there are more than one page of them", async () => {
    const { id, deps } = await freshUser();
    for (let i = 0; i < 8; i += 1) {
      await settled(deps, { stakeMinor: 1000 }, i % 2 === 0 ? { outcome: "won", grossReturnMinor: 3000 } : { outcome: "lost" });
    }
    const small = await getDashboardStats(depsFor(id, { pageSize: 3 }));
    const whole = await getDashboardStats(deps);
    expect(small.byCurrency.NGN).toMatchObject({ wins: 4, losses: 4, settledStakeMinor: 8000, netProfitMinor: 4 * 2000 - 4 * 1000 });
    expect(small.byCurrency).toEqual(whole.byCurrency);
  });

  it("rejects a reversed or invalid range", async () => {
    const { deps } = await freshUser();
    const day = lagosDayRange("2026-10-30");
    await expect(getDashboardStats(deps, { range: { start: day.end, end: day.start } })).rejects.toThrow(ValidationError);
    await expect(getDashboardStats(deps, { range: { start: new Date("nope"), end: day.end } })).rejects.toThrow(ValidationError);
  });
});
