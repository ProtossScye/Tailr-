import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asAnon, asUser, createDb, newUser, seedBet, seedLeg } from "./helpers";

/**
 * Cross-user access tests. Two users, Ada and Bola, each own a bet with one leg.
 * Every test proves what one of them can and cannot do to the other's data.
 * Rows are seeded as the database owner; the assertions run as the user.
 */

let db: PGlite;
let ada: string;
let bola: string;
let adaBet: string;
let bolaBet: string;
let adaLeg: string;
let bolaLeg: string;

beforeAll(async () => {
  db = await createDb();
  ada = await newUser(db, { display_name: "Ada" });
  bola = await newUser(db, { display_name: "Bola" });
  adaBet = await seedBet(db, ada, 500000);
  bolaBet = await seedBet(db, bola, 700000);
  adaLeg = await seedLeg(db, adaBet, "Ada leg");
  bolaLeg = await seedLeg(db, bolaBet, "Bola leg");
});

afterAll(async () => {
  await db.close();
});

/** Reads a single value as the database owner, to confirm what really happened. */
async function owner<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

describe("sign-up creates a profile", () => {
  it("copies the display name from sign-up metadata", async () => {
    const rows = await owner<{ display_name: string }>("select display_name from public.profiles where id = $1", [ada]);
    expect(rows).toEqual([{ display_name: "Ada" }]);
  });

  it("works with no metadata and leaves the name empty", async () => {
    const id = await newUser(db);
    const rows = await owner<{ display_name: string | null }>("select display_name from public.profiles where id = $1", [id]);
    expect(rows).toEqual([{ display_name: null }]);
  });

  it("treats a blank name as empty", async () => {
    const id = await newUser(db, { display_name: "   " });
    const rows = await owner<{ display_name: string | null }>("select display_name from public.profiles where id = $1", [id]);
    expect(rows).toEqual([{ display_name: null }]);
  });

  it("trims spaces and cuts an over-long name to 80 characters instead of failing sign-up", async () => {
    const id = await newUser(db, { display_name: `  ${"x".repeat(120)}` });
    const rows = await owner<{ display_name: string }>("select display_name from public.profiles where id = $1", [id]);
    expect(rows[0]!.display_name).toBe("x".repeat(80));
  });

  it("every user gets exactly one profile", async () => {
    const rows = await owner<{ n: number }>("select count(*)::int as n from public.profiles where id in ($1, $2)", [ada, bola]);
    expect(rows[0]!.n).toBe(2);
  });
});

describe("profiles", () => {
  it("a user sees only their own profile", async () => {
    const rows = await asUser(db, ada, async () => (await db.query<{ id: string }>("select id from public.profiles")).rows);
    expect(rows).toEqual([{ id: ada }]);
  });

  it("a user can change their own display name", async () => {
    const r = await asUser(db, ada, () => db.query("update public.profiles set display_name = 'Ada O.' where id = $1", [ada]));
    expect(r.affectedRows).toBe(1);
    await owner("update public.profiles set display_name = 'Ada' where id = $1", [ada]);
  });

  it("a user cannot change someone else's profile", async () => {
    const r = await asUser(db, ada, () => db.query("update public.profiles set display_name = 'hacked' where id = $1", [bola]));
    expect(r.affectedRows).toBe(0);
    expect(await owner("select display_name from public.profiles where id = $1", [bola])).toEqual([{ display_name: "Bola" }]);
  });

  it("a user cannot change which account their profile belongs to", async () => {
    await expect(asUser(db, ada, () => db.query("update public.profiles set id = $1 where id = $2", [bola, ada]))).rejects.toThrow();
  });

  it("a user cannot create or delete profiles", async () => {
    await expect(asUser(db, ada, () => db.query("insert into public.profiles (id) values (gen_random_uuid())"))).rejects.toThrow();
    await expect(asUser(db, ada, () => db.query("delete from public.profiles where id = $1", [ada]))).rejects.toThrow();
  });

  it("a signed-in role with no identity sees nothing", async () => {
    const rows = await asUser(db, null, async () => (await db.query("select id from public.profiles")).rows);
    expect(rows).toEqual([]);
  });

  it("a signed-out visitor cannot read profiles", async () => {
    await expect(asAnon(db, () => db.query("select id from public.profiles"))).rejects.toThrow();
  });
});

describe("bets", () => {
  it("each user sees only their own bets", async () => {
    const adaSees = await asUser(db, ada, async () => (await db.query<{ id: string }>("select id from public.bets")).rows);
    const bolaSees = await asUser(db, bola, async () => (await db.query<{ id: string }>("select id from public.bets")).rows);
    expect(adaSees).toEqual([{ id: adaBet }]);
    expect(bolaSees).toEqual([{ id: bolaBet }]);
  });

  it("looking up another user's bet by its exact id returns nothing", async () => {
    const rows = await asUser(db, ada, async () => (await db.query("select * from public.bets where id = $1", [bolaBet])).rows);
    expect(rows).toEqual([]);
  });

  it("totals only count the user's own bets", async () => {
    const rows = await asUser(db, ada, async () =>
      (await db.query<{ n: number; total: number }>("select count(*)::int as n, sum(stake_minor)::bigint::int as total from public.bets")).rows,
    );
    expect(rows).toEqual([{ n: 1, total: 500000 }]);
  });

  it("a user can add a bet for themselves", async () => {
    const r = await asUser(db, ada, () =>
      db.query(
        "insert into public.bets (user_id, currency, stake_minor, status, placed_at) values ($1, 'USD', 2500, 'pending', now())",
        [ada],
      ),
    );
    expect(r.affectedRows).toBe(1);
  });

  it("a user cannot add a bet in someone else's name", async () => {
    await expect(
      asUser(db, ada, () =>
        db.query("insert into public.bets (user_id, currency, stake_minor, status, placed_at) values ($1, 'NGN', 1000, 'pending', now())", [bola]),
      ),
    ).rejects.toThrow();
  });

  it("a user can edit their own bet", async () => {
    const r = await asUser(db, ada, () => db.query("update public.bets set notes = 'mine' where id = $1", [adaBet]));
    expect(r.affectedRows).toBe(1);
  });

  it("a user cannot edit someone else's bet", async () => {
    const r = await asUser(db, ada, () => db.query("update public.bets set notes = 'hacked', stake_minor = 1 where id = $1", [bolaBet]));
    expect(r.affectedRows).toBe(0);
    expect(await owner("select notes, stake_minor::int as stake from public.bets where id = $1", [bolaBet])).toEqual([{ notes: null, stake: 700000 }]);
  });

  it("a user cannot hand their bet to someone else", async () => {
    await expect(asUser(db, ada, () => db.query("update public.bets set user_id = $1 where id = $2", [bola, adaBet]))).rejects.toThrow();
    expect(await owner("select user_id from public.bets where id = $1", [adaBet])).toEqual([{ user_id: ada }]);
  });

  it("a user cannot delete someone else's bet", async () => {
    const r = await asUser(db, ada, () => db.query("delete from public.bets where id = $1", [bolaBet]));
    expect(r.affectedRows).toBe(0);
    expect(await owner("select id from public.bets where id = $1", [bolaBet])).toEqual([{ id: bolaBet }]);
  });

  it("a user can delete their own bet, and its legs go with it", async () => {
    const temp = await seedBet(db, ada);
    await seedLeg(db, temp);
    const r = await asUser(db, ada, () => db.query("delete from public.bets where id = $1", [temp]));
    expect(r.affectedRows).toBe(1);
    expect(await owner("select id from public.bet_selections where bet_id = $1", [temp])).toEqual([]);
  });

  it("a signed-in role with no identity sees and adds nothing", async () => {
    const rows = await asUser(db, null, async () => (await db.query("select id from public.bets")).rows);
    expect(rows).toEqual([]);
    await expect(
      asUser(db, null, () =>
        db.query("insert into public.bets (user_id, currency, stake_minor, status, placed_at) values ($1, 'NGN', 1000, 'pending', now())", [ada]),
      ),
    ).rejects.toThrow();
  });

  it("a signed-out visitor cannot read or add bets", async () => {
    await expect(asAnon(db, () => db.query("select id from public.bets"))).rejects.toThrow();
    await expect(
      asAnon(db, () =>
        db.query("insert into public.bets (user_id, currency, stake_minor, status, placed_at) values ($1, 'NGN', 1000, 'pending', now())", [ada]),
      ),
    ).rejects.toThrow();
  });
});

describe("bet legs", () => {
  it("each user sees only the legs of their own bets", async () => {
    const adaSees = await asUser(db, ada, async () => (await db.query<{ id: string }>("select id from public.bet_selections")).rows);
    const bolaSees = await asUser(db, bola, async () => (await db.query<{ id: string }>("select id from public.bet_selections")).rows);
    expect(adaSees).toEqual([{ id: adaLeg }]);
    expect(bolaSees).toEqual([{ id: bolaLeg }]);
  });

  it("joining legs to bets cannot leak another user's rows", async () => {
    const rows = await asUser(db, ada, async () =>
      (
        await db.query<{ selection: string }>(
          "select l.selection from public.bet_selections l join public.bets b on b.id = l.bet_id",
        )
      ).rows,
    );
    expect(rows).toEqual([{ selection: "Ada leg" }]);
  });

  it("a user can add a leg to their own bet", async () => {
    const r = await asUser(db, ada, () =>
      db.query("insert into public.bet_selections (bet_id, event, selection) values ($1, 'Match', 'Home win')", [adaBet]),
    );
    expect(r.affectedRows).toBe(1);
  });

  it("a user cannot add a leg to someone else's bet", async () => {
    await expect(
      asUser(db, ada, () => db.query("insert into public.bet_selections (bet_id, event, selection) values ($1, 'Match', 'Home win')", [bolaBet])),
    ).rejects.toThrow();
  });

  it("a user cannot move their leg onto someone else's bet", async () => {
    await expect(asUser(db, ada, () => db.query("update public.bet_selections set bet_id = $1 where id = $2", [bolaBet, adaLeg]))).rejects.toThrow();
    expect(await owner("select bet_id from public.bet_selections where id = $1", [adaLeg])).toEqual([{ bet_id: adaBet }]);
  });

  it("a user cannot edit or delete someone else's leg", async () => {
    const edit = await asUser(db, ada, () => db.query("update public.bet_selections set selection = 'hacked' where id = $1", [bolaLeg]));
    const del = await asUser(db, ada, () => db.query("delete from public.bet_selections where id = $1", [bolaLeg]));
    expect(edit.affectedRows).toBe(0);
    expect(del.affectedRows).toBe(0);
    expect(await owner("select selection from public.bet_selections where id = $1", [bolaLeg])).toEqual([{ selection: "Bola leg" }]);
  });

  it("a user can edit and delete their own leg", async () => {
    const temp = await seedLeg(db, adaBet, "temp");
    const edit = await asUser(db, ada, () => db.query("update public.bet_selections set selection = 'changed' where id = $1", [temp]));
    const del = await asUser(db, ada, () => db.query("delete from public.bet_selections where id = $1", [temp]));
    expect(edit.affectedRows).toBe(1);
    expect(del.affectedRows).toBe(1);
  });

  it("a signed-out visitor cannot read legs", async () => {
    await expect(asAnon(db, () => db.query("select id from public.bet_selections"))).rejects.toThrow();
  });
});

describe("least privilege and policy inventory", () => {
  it("signed-in users have only the table privileges they need", async () => {
    const has = async (table: string, priv: string) =>
      (await db.query<{ ok: boolean }>("select has_table_privilege('authenticated', $1, $2) as ok", [`public.${table}`, priv])).rows[0]!.ok;
    expect(await has("profiles", "select")).toBe(true);
    expect(await has("profiles", "insert")).toBe(false);
    expect(await has("profiles", "delete")).toBe(false);
    expect(await has("bets", "delete")).toBe(true);
    expect(await has("bet_selections", "insert")).toBe(true);
  });

  it("on profiles, users can update only the display name column", async () => {
    const col = async (column: string) =>
      (await db.query<{ ok: boolean }>("select has_column_privilege('authenticated', 'public.profiles', $1, 'update') as ok", [column])).rows[0]!.ok;
    expect(await col("display_name")).toBe(true);
    expect(await col("id")).toBe(false);
    expect(await col("created_at")).toBe(false);
  });

  it("the sign-up function cannot be called by users or visitors", async () => {
    const rows = await owner<{ role: string; ok: boolean }>(
      `select r as role, has_function_privilege(r, 'public.handle_new_user()', 'execute') as ok
       from unnest(array['anon', 'authenticated']) as r order by r`,
    );
    expect(rows).toEqual([
      { role: "anon", ok: false },
      { role: "authenticated", ok: false },
    ]);
  });

  it("no policy has been dropped: 2 on profiles, 4 on bets, 4 on bet_selections", async () => {
    const rows = await owner<{ tablename: string; n: number }>(
      `select tablename, count(*)::int as n from pg_policies where schemaname = 'public' group by tablename order by tablename`,
    );
    expect(rows).toEqual([
      { tablename: "bet_selections", n: 4 },
      { tablename: "bets", n: 4 },
      { tablename: "profiles", n: 2 },
    ]);
  });

  it("every policy applies to signed-in users only, never to anon or public", async () => {
    const rows = await owner<{ roles: string[] }>("select roles::text[] as roles from pg_policies where schemaname = 'public'");
    for (const row of rows) expect(row.roles).toEqual(["authenticated"]);
  });
});

/**
 * With a WHERE clause, the read rules already hide other people's rows, so they mask
 * a broken update or delete rule. Statements with no WHERE clause are gated only by the
 * update and delete rules themselves, so they are the real test of those rules.
 */
describe("statements with no WHERE clause only touch the user's own rows", () => {
  /** Two fresh users with two bets each and one leg per bet, so tests can be destructive. */
  async function twoFreshUsers() {
    const cara = await newUser(db);
    const dayo = await newUser(db);
    const caraBets = [await seedBet(db, cara), await seedBet(db, cara)] as [string, string];
    const dayoBets = [await seedBet(db, dayo), await seedBet(db, dayo)] as [string, string];
    for (const id of [...caraBets, ...dayoBets]) await seedLeg(db, id);
    return { cara, dayo, caraBets, dayoBets };
  }

  async function countWhere(sql: string, params: unknown[] = []): Promise<number> {
    return (await owner<{ n: number }>(sql, params))[0]!.n;
  }

  it("an unqualified update of bets changes only my bets", async () => {
    const { cara, dayo } = await twoFreshUsers();
    const r = await asUser(db, cara, () => db.query("update public.bets set notes = 'marker-bets-update'"));
    expect(r.affectedRows).toBe(2);
    expect(await countWhere("select count(*)::int as n from public.bets where notes = 'marker-bets-update'")).toBe(2);
    expect(await countWhere("select count(*)::int as n from public.bets where user_id = $1 and notes is null", [dayo])).toBe(2);
  });

  it("an unqualified update cannot hand all my bets to someone else", async () => {
    const { cara, dayo } = await twoFreshUsers();
    await expect(asUser(db, cara, () => db.query("update public.bets set user_id = $1", [dayo]))).rejects.toThrow();
    expect(await countWhere("select count(*)::int as n from public.bets where user_id = $1", [cara])).toBe(2);
  });

  it("an unqualified delete of bets removes only my bets", async () => {
    const { cara, dayo } = await twoFreshUsers();
    const r = await asUser(db, cara, () => db.query("delete from public.bets"));
    expect(r.affectedRows).toBe(2);
    expect(await countWhere("select count(*)::int as n from public.bets where user_id = $1", [cara])).toBe(0);
    expect(await countWhere("select count(*)::int as n from public.bets where user_id = $1", [dayo])).toBe(2);
  });

  it("an unqualified update of legs changes only legs of my bets", async () => {
    const { cara, dayoBets } = await twoFreshUsers();
    const r = await asUser(db, cara, () => db.query("update public.bet_selections set selection = 'marker-legs-update'"));
    expect(r.affectedRows).toBe(2);
    expect(await countWhere("select count(*)::int as n from public.bet_selections where selection = 'marker-legs-update'")).toBe(2);
    expect(
      await countWhere(
        "select count(*)::int as n from public.bet_selections where (bet_id = $1 or bet_id = $2) and selection <> 'marker-legs-update'",
        dayoBets,
      ),
    ).toBe(2);
  });

  it("an unqualified update cannot move all my legs onto someone else's bet", async () => {
    const { cara, caraBets, dayoBets } = await twoFreshUsers();
    await expect(asUser(db, cara, () => db.query("update public.bet_selections set bet_id = $1", [dayoBets[0]]))).rejects.toThrow();
    expect(
      await countWhere("select count(*)::int as n from public.bet_selections where bet_id = $1 or bet_id = $2", caraBets),
    ).toBe(2);
  });

  it("an unqualified delete of legs removes only legs of my bets", async () => {
    const { cara, caraBets, dayoBets } = await twoFreshUsers();
    const r = await asUser(db, cara, () => db.query("delete from public.bet_selections"));
    expect(r.affectedRows).toBe(2);
    expect(
      await countWhere("select count(*)::int as n from public.bet_selections where bet_id = $1 or bet_id = $2", caraBets),
    ).toBe(0);
    expect(
      await countWhere("select count(*)::int as n from public.bet_selections where bet_id = $1 or bet_id = $2", dayoBets),
    ).toBe(2);
  });

  it("an unqualified update of profiles changes only my profile", async () => {
    const { cara } = await twoFreshUsers();
    const r = await asUser(db, cara, () => db.query("update public.profiles set display_name = 'marker-profiles-update'"));
    expect(r.affectedRows).toBe(1);
    expect(await countWhere("select count(*)::int as n from public.profiles where display_name = 'marker-profiles-update'")).toBe(1);
  });
});
