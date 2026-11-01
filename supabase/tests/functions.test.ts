import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asAnon, asUser, createDb, newUser, seedBet, seedLeg } from "./helpers";

/**
 * Tests for the create_bet and update_bet database functions, called directly. They
 * run as the signed-in user, so the privacy rules apply, and they must never let a
 * caller act for someone else or leave a half-saved bet behind.
 */

let db: PGlite;
let ada: string;
let bola: string;

beforeAll(async () => {
  db = await createDb();
  ada = await newUser(db);
  bola = await newUser(db);
});

afterAll(async () => {
  await db.close();
});

const bet = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ currency: "NGN", stake_minor: 500000, placed_at: "2026-10-15T12:00:00Z", ...extra });
const legs = (...names: string[]) => JSON.stringify(names.map((n) => ({ event: `Match ${n}`, selection: n })));

async function createAs(userId: string | null, betJson: string, legsJson: string): Promise<string> {
  return asUser(db, userId, async () => (await db.query<{ id: string }>("select public.create_bet($1::jsonb, $2::jsonb) as id", [betJson, legsJson])).rows[0]!.id);
}

async function updateAs(userId: string, id: string, patch: Record<string, unknown>, legsJson: string | null = null): Promise<boolean> {
  return asUser(db, userId, async () =>
    (await db.query<{ ok: boolean }>("select public.update_bet($1::uuid, $2::jsonb, $3::jsonb) as ok", [id, JSON.stringify(patch), legsJson])).rows[0]!.ok,
  );
}

async function owner<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

describe("create_bet", () => {
  it("makes a pending bet for the signed-in user with its legs in order", async () => {
    const id = await createAs(ada, bet(), legs("A", "B", "C"));
    expect(await owner("select user_id, status, provenance from public.bets where id = $1", [id])).toEqual([
      { user_id: ada, status: "pending", provenance: "user_reported" },
    ]);
    expect(await owner("select selection, sort_order from public.bet_selections where bet_id = $1 order by sort_order", [id])).toEqual([
      { selection: "A", sort_order: 0 },
      { selection: "B", sort_order: 1 },
      { selection: "C", sort_order: 2 },
    ]);
  });

  it("takes the owner from the session, never from the input", async () => {
    const id = await createAs(ada, bet({ user_id: bola }), legs("A"));
    expect(await owner("select user_id from public.bets where id = $1", [id])).toEqual([{ user_id: ada }]);
  });

  it("always starts pending, whatever the input says", async () => {
    const id = await createAs(ada, bet({ status: "won", gross_return_minor: 900000, settled_at: "2026-10-16T12:00:00Z", provenance: "verified" }), legs("A"));
    expect(await owner("select status, gross_return_minor, settled_at, provenance from public.bets where id = $1", [id])).toEqual([
      { status: "pending", gross_return_minor: null, settled_at: null, provenance: "user_reported" },
    ]);
  });

  it("refuses with no signed-in identity", async () => {
    await expect(createAs(null, bet(), legs("A"))).rejects.toThrow();
  });

  it("refuses no legs, and leaves nothing behind", async () => {
    const before = (await owner<{ n: number }>("select count(*)::int as n from public.bets where user_id = $1", [ada]))[0]!.n;
    await expect(createAs(ada, bet(), "[]")).rejects.toThrow(/at least one selection/);
    await expect(createAs(ada, bet(), "null")).rejects.toThrow();
    await expect(createAs(ada, bet(), '{"event":"x"}')).rejects.toThrow();
    expect((await owner<{ n: number }>("select count(*)::int as n from public.bets where user_id = $1", [ada]))[0]!.n).toBe(before);
  });

  it("a failing leg rolls back the bet", async () => {
    const before = (await owner<{ n: number }>("select count(*)::int as n from public.bets where user_id = $1", [ada]))[0]!.n;
    await expect(createAs(ada, bet(), JSON.stringify([{ event: "Fine", selection: "ok" }, { event: "", selection: "bad" }]))).rejects.toThrow();
    expect((await owner<{ n: number }>("select count(*)::int as n from public.bets where user_id = $1", [ada]))[0]!.n).toBe(before);
  });

  it("the database still enforces its own rules on what it is given", async () => {
    await expect(createAs(ada, bet({ stake_minor: 0 }), legs("A"))).rejects.toThrow();
    await expect(createAs(ada, bet({ currency: "GBP" }), legs("A"))).rejects.toThrow();
  });
});

describe("update_bet", () => {
  it("changes only the keys that are present", async () => {
    const id = await createAs(ada, bet({ notes: "keep me", bookmaker_label: "Bet9ja" }), legs("A"));
    expect(await updateAs(ada, id, { stake_minor: 700000 })).toBe(true);
    expect(await owner("select stake_minor::int as stake, notes, bookmaker_label from public.bets where id = $1", [id])).toEqual([
      { stake: 700000, notes: "keep me", bookmaker_label: "Bet9ja" },
    ]);
  });

  it("a key set to null clears the field", async () => {
    const id = await createAs(ada, bet({ notes: "remove me" }), legs("A"));
    await updateAs(ada, id, { notes: null });
    expect(await owner("select notes from public.bets where id = $1", [id])).toEqual([{ notes: null }]);
  });

  it("settles a bet and the database checks the result is consistent", async () => {
    const id = await createAs(ada, bet(), legs("A"));
    expect(await updateAs(ada, id, { status: "won", settled_at: "2026-10-16T12:00:00Z", gross_return_minor: 900000 })).toBe(true);
    await expect(updateAs(ada, id, { status: "won", settled_at: "2026-10-16T12:00:00Z", gross_return_minor: 100 })).rejects.toThrow();
    await expect(updateAs(ada, id, { status: "lost" })).rejects.toThrow();
    expect(await owner("select status, gross_return_minor::int as r from public.bets where id = $1", [id])).toEqual([{ status: "won", r: 900000 }]);
  });

  it("replaces the legs, in order, when given", async () => {
    const id = await createAs(ada, bet(), legs("A", "B"));
    await updateAs(ada, id, { notes: "x" }, legs("Z", "Y", "X"));
    expect(await owner("select selection from public.bet_selections where bet_id = $1 order by sort_order", [id])).toEqual([
      { selection: "Z" },
      { selection: "Y" },
      { selection: "X" },
    ]);
  });

  it("keeps the legs when none are given", async () => {
    const id = await createAs(ada, bet(), legs("A", "B"));
    await updateAs(ada, id, { notes: "x" });
    expect(await owner("select count(*)::int as n from public.bet_selections where bet_id = $1", [id])).toEqual([{ n: 2 }]);
  });

  it("refuses an empty list of legs, and keeps the old ones", async () => {
    const id = await createAs(ada, bet(), legs("A"));
    await expect(updateAs(ada, id, { notes: "x" }, "[]")).rejects.toThrow(/at least one selection/);
    expect(await owner("select count(*)::int as n from public.bet_selections where bet_id = $1", [id])).toEqual([{ n: 1 }]);
  });

  it("a failing leg rolls back the field changes too", async () => {
    const id = await createAs(ada, bet({ notes: "original" }), legs("A"));
    await expect(updateAs(ada, id, { notes: "changed" }, JSON.stringify([{ event: "", selection: "bad" }]))).rejects.toThrow();
    expect(await owner("select notes from public.bets where id = $1", [id])).toEqual([{ notes: "original" }]);
    expect(await owner("select selection from public.bet_selections where bet_id = $1", [id])).toEqual([{ selection: "A" }]);
  });

  it("returns false for a bet that does not exist", async () => {
    expect(await updateAs(ada, "00000000-0000-0000-0000-000000000000", { notes: "x" })).toBe(false);
  });

  it("returns false for someone else's bet and changes nothing, legs included", async () => {
    const id = await createAs(bola, bet({ notes: "bola's" }), legs("B1", "B2"));
    expect(await updateAs(ada, id, { notes: "hacked", stake_minor: 1 }, legs("HACK"))).toBe(false);
    expect(await owner("select notes, stake_minor::int as stake from public.bets where id = $1", [id])).toEqual([{ notes: "bola's", stake: 500000 }]);
    expect(await owner("select selection from public.bet_selections where bet_id = $1 order by sort_order", [id])).toEqual([
      { selection: "B1" },
      { selection: "B2" },
    ]);
  });

  it("cannot hand the bet to someone else", async () => {
    const id = await createAs(ada, bet(), legs("A"));
    await updateAs(ada, id, { user_id: bola, notes: "x" });
    expect(await owner("select user_id from public.bets where id = $1", [id])).toEqual([{ user_id: ada }]);
  });
});

describe("who may call the functions", () => {
  it("signed-in users can; signed-out visitors cannot", async () => {
    const has = async (role: string, fn: string) =>
      (await db.query<{ ok: boolean }>("select has_function_privilege($1, $2, 'execute') as ok", [role, fn])).rows[0]!.ok;
    expect(await has("authenticated", "public.create_bet(jsonb, jsonb)")).toBe(true);
    expect(await has("authenticated", "public.update_bet(uuid, jsonb, jsonb)")).toBe(true);
    expect(await has("anon", "public.create_bet(jsonb, jsonb)")).toBe(false);
    expect(await has("anon", "public.update_bet(uuid, jsonb, jsonb)")).toBe(false);
  });

  it("a signed-out visitor calling them is refused", async () => {
    await expect(asAnon(db, () => db.query("select public.create_bet($1::jsonb, $2::jsonb)", [bet(), legs("A")]))).rejects.toThrow();
    const id = await seedBet(db, ada);
    await seedLeg(db, id);
    await expect(asAnon(db, () => db.query("select public.update_bet($1::uuid, '{}'::jsonb)", [id]))).rejects.toThrow();
  });

  it("they run as the caller, not as the database owner, so the privacy rules apply", async () => {
    const rows = await owner<{ prosecdef: boolean; proname: string }>(
      "select proname, prosecdef from pg_proc where pronamespace = 'public'::regnamespace and proname in ('create_bet', 'update_bet') order by proname",
    );
    expect(rows).toEqual([
      { proname: "create_bet", prosecdef: false },
      { proname: "update_bet", prosecdef: false },
    ]);
  });
});
