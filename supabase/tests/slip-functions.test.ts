import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asAnon, asUser, createDb, newUser, seedSlip, seedSlipLeg } from "./helpers";

/**
 * create_slip, update_slip, and create_bet's new draft link, called the way the app calls them:
 * as a signed-in user, over the real tables, constraints and privacy rules.
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

const leg = (event: string, extra: Record<string, unknown> = {}) => ({ event, selection: `${event} to win`, ...extra });

async function owner<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

async function createSlip(userId: string | null, slip: Record<string, unknown>, selections: unknown) {
  return asUser(db, userId, async () => {
    const r = await db.query<{ id: string }>("select public.create_slip($1::jsonb, $2::jsonb) as id", [JSON.stringify(slip), JSON.stringify(selections)]);
    return r.rows[0]!.id;
  });
}

async function updateSlip(userId: string | null, id: string, patch: Record<string, unknown>, selections?: unknown) {
  return asUser(db, userId, async () => {
    const r = await db.query<{ ok: boolean }>("select public.update_slip($1::uuid, $2::jsonb, $3::jsonb) as ok", [
      id,
      JSON.stringify(patch),
      selections === undefined ? null : JSON.stringify(selections),
    ]);
    return r.rows[0]!.ok;
  });
}

const legsOf = (id: string) =>
  owner<{ event: string; sort_order: number; odds_decimal: string | null; verification_status: string }>(
    "select event, sort_order, odds_decimal::text, verification_status from public.slip_selections where slip_draft_id = $1 order by sort_order",
    [id],
  );

describe("create_slip", () => {
  it("saves the draft and its selections together, in order, owned by the caller", async () => {
    const id = await createSlip(ada, { name: "Saturday", source_bookmaker: "Bet9ja" }, [
      leg("Arsenal v Chelsea", { sport: "Football", market_type: "Match result", odds_decimal: 1.85 }),
      leg("Lakers v Celtics"),
      leg("Real v Barca", { odds_decimal: 2.1 }),
    ]);
    expect(await owner("select user_id, name, source_bookmaker, source_type, status from public.slip_drafts where id = $1", [id])).toEqual([
      { user_id: ada, name: "Saturday", source_bookmaker: "Bet9ja", source_type: "manual", status: "draft" },
    ]);
    expect(await legsOf(id)).toEqual([
      { event: "Arsenal v Chelsea", sort_order: 0, odds_decimal: "1.850", verification_status: "user_entered" },
      { event: "Lakers v Celtics", sort_order: 1, odds_decimal: null, verification_status: "user_entered" },
      { event: "Real v Barca", sort_order: 2, odds_decimal: "2.100", verification_status: "user_entered" },
    ]);
  });

  it("takes the owner from the session, never from the input", async () => {
    const id = await createSlip(ada, { name: "Mine", user_id: bola }, [leg("A v B")]);
    expect(await owner("select user_id from public.slip_drafts where id = $1", [id])).toEqual([{ user_id: ada }]);
  });

  it("ignores any attempt to set the source type or status", async () => {
    const id = await createSlip(ada, { name: "Sneaky", source_type: "image", status: "archived" }, [leg("A v B")]);
    expect(await owner("select source_type, status from public.slip_drafts where id = $1", [id])).toEqual([{ source_type: "manual", status: "draft" }]);
  });

  it("accepts exactly 1 and exactly 50 selections", async () => {
    await expect(createSlip(ada, { name: "One" }, [leg("A v B")])).resolves.toBeTruthy();
    const fifty = Array.from({ length: 50 }, (_, i) => leg(`Match ${i}`));
    const id = await createSlip(ada, { name: "Fifty" }, fifty);
    expect(await legsOf(id)).toHaveLength(50);
  });

  it.each([
    ["no selections", []],
    ["a null list", null],
    ["a list that is not an array", { event: "A v B" }],
    ["51 selections", Array.from({ length: 51 }, (_, i) => leg(`Match ${i}`))],
  ])("rejects %s and saves nothing", async (_label, selections) => {
    const before = (await owner<{ n: number }>("select count(*)::int as n from public.slip_drafts"))[0]!.n;
    await expect(createSlip(ada, { name: "Rejected" }, selections)).rejects.toThrow();
    expect((await owner<{ n: number }>("select count(*)::int as n from public.slip_drafts"))[0]!.n).toBe(before);
  });

  it("a bad selection rolls back the whole draft: no orphan draft is left", async () => {
    await expect(createSlip(ada, { name: "Half saved?" }, [leg("A v B"), { event: "", selection: "x" }])).rejects.toThrow();
    expect(await owner("select id from public.slip_drafts where name = 'Half saved?'")).toEqual([]);
  });

  it.each([
    ["an empty name", { name: "" }],
    ["no name", {}],
    ["a name over 120 characters", { name: "n".repeat(121) }],
  ])("rejects %s", async (_label, slip) => {
    await expect(createSlip(ada, slip, [leg("A v B")])).rejects.toThrow();
  });

  it("a signed-in role with no identity cannot create a draft", async () => {
    await expect(createSlip(null, { name: "Ghost" }, [leg("A v B")])).rejects.toThrow();
  });

  it("a signed-out visitor cannot call it", async () => {
    await expect(asAnon(db, () => db.query("select public.create_slip('{\"name\":\"x\"}'::jsonb, '[{\"event\":\"a\",\"selection\":\"b\"}]'::jsonb)"))).rejects.toThrow();
  });
});

describe("who may call the functions", () => {
  it.each(["public.create_slip(jsonb, jsonb)", "public.update_slip(uuid, jsonb, jsonb)"])("%s is for signed-in users only", async (fn) => {
    const r = await owner<{ anon: boolean; authed: boolean }>(
      "select has_function_privilege('anon', $1, 'execute') as anon, has_function_privilege('authenticated', $1, 'execute') as authed",
      [fn],
    );
    expect(r[0]).toEqual({ anon: false, authed: true });
  });
});

describe("update_slip", () => {
  async function fresh(name = "Original") {
    const id = await createSlip(ada, { name, source_bookmaker: "Bet9ja" }, [leg("One"), leg("Two")]);
    return id;
  }

  it("changes only the fields present", async () => {
    const id = await fresh();
    expect(await updateSlip(ada, id, { name: "Renamed" })).toBe(true);
    expect(await owner("select name, source_bookmaker, status from public.slip_drafts where id = $1", [id])).toEqual([
      { name: "Renamed", source_bookmaker: "Bet9ja", status: "draft" },
    ]);
    expect(await legsOf(id)).toHaveLength(2);
  });

  it("a key set to null clears an optional field", async () => {
    const id = await fresh();
    await updateSlip(ada, id, { source_bookmaker: null });
    expect(await owner("select source_bookmaker from public.slip_drafts where id = $1", [id])).toEqual([{ source_bookmaker: null }]);
  });

  it("the name cannot be cleared", async () => {
    const id = await fresh();
    await expect(updateSlip(ada, id, { name: null })).rejects.toThrow();
    expect(await owner("select name from public.slip_drafts where id = $1", [id])).toEqual([{ name: "Original" }]);
  });

  it("archives and restores a draft, and rejects any other status", async () => {
    const id = await fresh();
    await updateSlip(ada, id, { status: "archived" });
    expect(await owner("select status from public.slip_drafts where id = $1", [id])).toEqual([{ status: "archived" }]);
    await updateSlip(ada, id, { status: "draft" });
    await expect(updateSlip(ada, id, { status: "placed" })).rejects.toThrow();
    expect(await owner("select status from public.slip_drafts where id = $1", [id])).toEqual([{ status: "draft" }]);
  });

  it("replaces the selections as a whole, in the new order", async () => {
    const id = await fresh();
    await updateSlip(ada, id, {}, [leg("Three"), leg("Four", { odds_decimal: 3 }), leg("Five")]);
    expect((await legsOf(id)).map((l) => l.event)).toEqual(["Three", "Four", "Five"]);
    expect((await legsOf(id)).map((l) => l.sort_order)).toEqual([0, 1, 2]);
  });

  it("leaves the selections alone when none are given", async () => {
    const id = await fresh();
    await updateSlip(ada, id, { name: "Only the name" });
    expect((await legsOf(id)).map((l) => l.event)).toEqual(["One", "Two"]);
  });

  it("a change to only the selections still moves the draft up the list", async () => {
    const id = await fresh();
    await db.query("update public.slip_drafts set created_at = '2020-01-01', updated_at = '2020-01-01' where id = $1", [id]);
    await updateSlip(ada, id, {}, [leg("New")]);
    const row = (await owner<{ moved: boolean }>("select updated_at > '2020-01-02' as moved from public.slip_drafts where id = $1", [id]))[0]!;
    expect(row.moved).toBe(true);
  });

  it.each([
    ["an empty list", []],
    ["51 selections", Array.from({ length: 51 }, (_, i) => leg(`Match ${i}`))],
    ["a list that is not an array", { event: "x" }],
  ])("rejects %s and leaves the draft untouched", async (_label, selections) => {
    const id = await fresh();
    await expect(updateSlip(ada, id, { name: "Should not stick" }, selections)).rejects.toThrow();
    expect(await owner("select name from public.slip_drafts where id = $1", [id])).toEqual([{ name: "Original" }]);
    expect((await legsOf(id)).map((l) => l.event)).toEqual(["One", "Two"]);
  });

  it("a bad replacement selection rolls back the rename and the delete of the old selections", async () => {
    const id = await fresh();
    await expect(updateSlip(ada, id, { name: "Should not stick" }, [leg("Good"), { event: "", selection: "x" }])).rejects.toThrow();
    expect(await owner("select name from public.slip_drafts where id = $1", [id])).toEqual([{ name: "Original" }]);
    expect((await legsOf(id)).map((l) => l.event)).toEqual(["One", "Two"]);
  });

  it("returns false for a draft that does not exist", async () => {
    expect(await updateSlip(ada, "00000000-0000-4000-8000-000000000000", { name: "x" })).toBe(false);
  });

  it("returns false and changes nothing for someone else's draft", async () => {
    const id = await fresh();
    expect(await updateSlip(bola, id, { name: "hacked" }, [leg("Planted")])).toBe(false);
    expect(await owner("select name from public.slip_drafts where id = $1", [id])).toEqual([{ name: "Original" }]);
    expect((await legsOf(id)).map((l) => l.event)).toEqual(["One", "Two"]);
  });

  it("a signed-out visitor cannot call it", async () => {
    const id = await fresh();
    await expect(asAnon(db, () => db.query("select public.update_slip($1::uuid, '{}'::jsonb)", [id]))).rejects.toThrow();
  });
});

describe("create_bet with a draft link", () => {
  async function createBetAs(userId: string, slipDraftId: string | null | undefined) {
    return asUser(db, userId, async () => {
      const bet: Record<string, unknown> = { currency: "NGN", stake_minor: 500000, placed_at: "2026-10-15T12:00:00Z" };
      if (slipDraftId !== undefined) bet.slip_draft_id = slipDraftId;
      const r = await db.query<{ id: string }>("select public.create_bet($1::jsonb, $2::jsonb) as id", [
        JSON.stringify(bet),
        JSON.stringify([leg("A v B")]),
      ]);
      return r.rows[0]!.id;
    });
  }

  it("works exactly as before with no draft", async () => {
    const id = await createBetAs(ada, undefined);
    expect(await owner("select slip_draft_id, status from public.bets where id = $1", [id])).toEqual([{ slip_draft_id: null, status: "pending" }]);
  });

  it("records the link to the user's own draft and leaves the draft a draft", async () => {
    const slip = await seedSlip(db, ada, "Source");
    await seedSlipLeg(db, slip);
    const id = await createBetAs(ada, slip);
    expect(await owner("select slip_draft_id from public.bets where id = $1", [id])).toEqual([{ slip_draft_id: slip }]);
    expect(await owner("select status from public.slip_drafts where id = $1", [slip])).toEqual([{ status: "draft" }]);
    expect(await owner("select count(*)::int as n from public.slip_selections where slip_draft_id = $1", [slip])).toEqual([{ n: 1 }]);
  });

  it("refuses someone else's draft and saves no bet", async () => {
    const slip = await seedSlip(db, bola, "Bola's");
    const before = (await owner<{ n: number }>("select count(*)::int as n from public.bets where user_id = $1", [ada]))[0]!.n;
    await expect(createBetAs(ada, slip)).rejects.toThrow();
    expect((await owner<{ n: number }>("select count(*)::int as n from public.bets where user_id = $1", [ada]))[0]!.n).toBe(before);
  });

  it("refuses a draft that does not exist, and an id that is not a uuid", async () => {
    await expect(createBetAs(ada, "00000000-0000-4000-8000-000000000000")).rejects.toThrow();
    await expect(createBetAs(ada, "not-a-uuid")).rejects.toThrow();
  });
});
