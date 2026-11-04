import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asAnon, asUser, createDb, newUser } from "./helpers";

/** user_preferences and save_preferences, called the way the app calls them. */

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

const save = (userId: string | null, prefs: unknown) =>
  asUser(db, userId, () => db.query("select public.save_preferences($1::jsonb)", [JSON.stringify(prefs)]));

const rowOf = async (userId: string) =>
  (await db.query<Record<string, unknown>>("select * from public.user_preferences where user_id = $1", [userId])).rows[0];

describe("save_preferences", () => {
  it("creates the row for the caller with what was sent", async () => {
    await save(ada, {
      favorite_sports: ["Football", "Tennis"],
      preferred_markets: ["Match result"],
      avoided_markets: ["Correct score"],
      slip_style: "balanced",
      target_odds_min: 2,
      target_odds_max: 5.5,
      detail_level: "detailed",
    });
    expect(await rowOf(ada)).toMatchObject({
      user_id: ada,
      favorite_sports: ["Football", "Tennis"],
      preferred_markets: ["Match result"],
      avoided_markets: ["Correct score"],
      slip_style: "balanced",
      target_odds_min: "2.000",
      target_odds_max: "5.500",
      detail_level: "detailed",
    });
    expect((await rowOf(ada))!.explicitly_confirmed_at).not.toBeNull();
  });

  it("an empty object saves the defaults: nothing set, standard detail", async () => {
    await save(bola, {});
    expect(await rowOf(bola)).toMatchObject({
      favorite_sports: [],
      preferred_markets: [],
      avoided_markets: [],
      slip_style: null,
      target_odds_min: null,
      target_odds_max: null,
      detail_level: "standard",
    });
  });

  it("replaces every field on the second save, so a missing key clears it", async () => {
    await save(ada, { favorite_sports: ["Football"], slip_style: "ambitious", target_odds_min: 3 });
    await save(ada, { favorite_sports: ["Cricket"] });
    expect(await rowOf(ada)).toMatchObject({ favorite_sports: ["Cricket"], slip_style: null, target_odds_min: null });
    expect((await db.query("select count(*)::int as n from public.user_preferences where user_id = $1", [ada])).rows).toEqual([{ n: 1 }]);
  });

  it("a second save changes every stored field, detail level and markets included", async () => {
    const fay = await newUser(db);
    await save(fay, { detail_level: "brief", preferred_markets: ["Handicap"], avoided_markets: ["Moneyline"], favorite_sports: ["Boxing"] });
    await save(fay, { detail_level: "detailed", preferred_markets: ["Over/Under"], avoided_markets: ["Handicap"], favorite_sports: ["MMA"] });
    expect(await rowOf(fay)).toMatchObject({
      detail_level: "detailed",
      preferred_markets: ["Over/Under"],
      avoided_markets: ["Handicap"],
      favorite_sports: ["MMA"],
    });
  });

  it("moves updated_at forward but keeps created_at", async () => {
    await save(ada, {});
    await db.query("update public.user_preferences set created_at = '2020-01-01', updated_at = '2020-01-01' where user_id = $1", [ada]);
    await save(ada, { favorite_sports: ["Football"] });
    const r = (await db.query<{ created: boolean; updated: boolean }>(
      "select created_at < '2020-02-01' as created, updated_at > '2020-02-01' as updated from public.user_preferences where user_id = $1",
      [ada],
    )).rows[0];
    expect(r).toEqual({ created: true, updated: true });
  });

  it("takes the owner from the session, never from the input", async () => {
    const carl = await newUser(db);
    await save(carl, { user_id: bola, favorite_sports: ["Rugby"] });
    expect((await rowOf(carl))!.favorite_sports).toEqual(["Rugby"]);
    expect((await rowOf(bola))!.favorite_sports).toEqual([]);
  });

  it.each([
    ["an unknown slip style", { slip_style: "reckless" }],
    ["an unknown detail level", { detail_level: "everything" }],
    ["odds below 1", { target_odds_min: 0.5 }],
    ["a max below the min", { target_odds_min: 5, target_odds_max: 2 }],
    ["the same market wanted and avoided", { preferred_markets: ["Over/Under"], avoided_markets: ["Over/Under"] }],
    ["an empty sport", { favorite_sports: [""] }],
    ["a sport over 80 characters", { favorite_sports: ["s".repeat(81)] }],
    ["21 sports", { favorite_sports: Array.from({ length: 21 }, (_, i) => `Sport ${i}`) }],
    ["a list that is not an array", { favorite_sports: "Football" }],
  ])("rejects %s and keeps the previous row", async (_label, prefs) => {
    const dan = await newUser(db);
    await save(dan, { favorite_sports: ["Football"] });
    await expect(save(dan, prefs)).rejects.toThrow();
    expect((await rowOf(dan))!.favorite_sports).toEqual(["Football"]);
  });

  it("accepts exactly 20 items and equal min and max", async () => {
    const eve = await newUser(db);
    await save(eve, { favorite_sports: Array.from({ length: 20 }, (_, i) => `Sport ${i}`), target_odds_min: 2, target_odds_max: 2 });
    expect((await rowOf(eve))!.favorite_sports).toHaveLength(20);
  });

  it("rejects input that is not an object", async () => {
    await expect(save(ada, [])).rejects.toThrow();
    await expect(save(ada, "x")).rejects.toThrow();
  });

  it("a signed-in role with no identity cannot save", async () => {
    await expect(save(null, {})).rejects.toThrow();
  });

  it("a signed-out visitor cannot call it", async () => {
    await expect(asAnon(db, () => db.query("select public.save_preferences('{}'::jsonb)"))).rejects.toThrow();
    const r = (await db.query<{ anon: boolean; authed: boolean }>(
      "select has_function_privilege('anon', 'public.save_preferences(jsonb)', 'execute') as anon, has_function_privilege('authenticated', 'public.save_preferences(jsonb)', 'execute') as authed",
    )).rows[0];
    expect(r).toEqual({ anon: false, authed: true });
  });
});

describe("privacy", () => {
  it("a user sees only their own row", async () => {
    await save(ada, { favorite_sports: ["Football"] });
    await save(bola, { favorite_sports: ["Tennis"] });
    const seen = await asUser(db, ada, async () => (await db.query<{ user_id: string }>("select user_id from public.user_preferences")).rows);
    expect(seen).toEqual([{ user_id: ada }]);
  });

  it("cannot insert, update or delete someone else's row directly", async () => {
    await expect(
      asUser(db, ada, () => db.query("insert into public.user_preferences (user_id) values ($1)", [bola])),
    ).rejects.toThrow();
    const updated = await asUser(db, ada, () => db.query("update public.user_preferences set slip_style = 'ambitious' where user_id = $1", [bola]));
    expect(updated.affectedRows).toBe(0);
    const deleted = await asUser(db, ada, () => db.query("delete from public.user_preferences where user_id = $1", [bola]));
    expect(deleted.affectedRows).toBe(0);
    expect((await rowOf(bola))!.slip_style).toBeNull();
  });

  it("cannot hand a row to someone else by changing user_id", async () => {
    await expect(asUser(db, ada, () => db.query("update public.user_preferences set user_id = $1 where user_id = $2", [bola, ada]))).rejects.toThrow();
  });

  it("signed-out visitors can read and write nothing", async () => {
    await expect(asAnon(db, () => db.query("select * from public.user_preferences"))).rejects.toThrow();
    await expect(asAnon(db, () => db.query("insert into public.user_preferences (user_id) values (gen_random_uuid())"))).rejects.toThrow();
  });

  it("deleting the account deletes the preferences", async () => {
    const gone = await newUser(db);
    await save(gone, {});
    await db.query("delete from auth.users where id = $1", [gone]);
    expect(await rowOf(gone)).toBeUndefined();
  });

  it("a user can remove their own row (the 'clear my preferences' action)", async () => {
    const del = await newUser(db);
    await save(del, {});
    const r = await asUser(db, del, () => db.query("delete from public.user_preferences where user_id = $1", [del]));
    expect(r.affectedRows).toBe(1);
  });
});

