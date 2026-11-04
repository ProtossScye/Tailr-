import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asAnon, asUser, createDb, newUser, seedBet, seedSlip, seedSlipLeg } from "./helpers";

/**
 * Slip drafts and selections: what the tables accept, then what one user can and cannot do
 * to another's rows. Rows are seeded as the database owner; assertions run as the user.
 */

let db: PGlite;
let ada: string;
let bola: string;
let adaSlip: string;
let bolaSlip: string;
let adaLeg: string;
let bolaLeg: string;

beforeAll(async () => {
  db = await createDb();
  ada = await newUser(db, { display_name: "Ada" });
  bola = await newUser(db, { display_name: "Bola" });
  adaSlip = await seedSlip(db, ada, "Ada slip");
  bolaSlip = await seedSlip(db, bola, "Bola slip");
  adaLeg = await seedSlipLeg(db, adaSlip, "Ada leg");
  bolaLeg = await seedSlipLeg(db, bolaSlip, "Bola leg");
});

afterAll(async () => {
  await db.close();
});

async function owner<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

async function insertSlip(fields: Record<string, string | number | null> = {}) {
  const row: Record<string, string | number | null> = { user_id: ada, name: "A slip", ...fields };
  const cols = Object.keys(row);
  const r = await db.query<{ id: string }>(
    `insert into public.slip_drafts (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
    Object.values(row),
  );
  return r.rows[0]!.id;
}

async function insertLeg(fields: Record<string, string | number | null> = {}) {
  const row: Record<string, string | number | null> = { slip_draft_id: adaSlip, event: "Arsenal vs Chelsea", selection: "Arsenal", ...fields };
  const cols = Object.keys(row);
  const r = await db.query<{ id: string }>(
    `insert into public.slip_selections (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
    Object.values(row),
  );
  return r.rows[0]!.id;
}

describe("slip_drafts accept valid rows and apply defaults", () => {
  it("a manual draft starts as a draft", async () => {
    const id = await insertSlip();
    const row = (await owner<{ source_type: string; status: string; source_bookmaker: string | null }>(
      "select source_type, status, source_bookmaker from public.slip_drafts where id = $1",
      [id],
    ))[0]!;
    expect(row).toEqual({ source_type: "manual", status: "draft", source_bookmaker: null });
  });

  it.each(["manual", "pasted_text", "image"])("source_type %s", async (source_type) => {
    await expect(insertSlip({ source_type })).resolves.toBeTruthy();
  });

  it.each(["draft", "archived"])("status %s", async (status) => {
    await expect(insertSlip({ status })).resolves.toBeTruthy();
  });

  it("a name of exactly 120 characters and a bookmaker of exactly 80", async () => {
    await expect(insertSlip({ name: "n".repeat(120), source_bookmaker: "b".repeat(80) })).resolves.toBeTruthy();
  });
});

describe("slip_drafts reject bad rows", () => {
  it.each([
    ["an empty name", { name: "" }],
    ["a name over 120 characters", { name: "n".repeat(121) }],
    ["no name", { name: null }],
    ["an unknown source type", { source_type: "telegram" }],
    ["an unknown status", { status: "placed" }],
    ["an empty bookmaker", { source_bookmaker: "" }],
    ["a bookmaker over 80 characters", { source_bookmaker: "b".repeat(81) }],
    ["no owner", { user_id: null }],
    ["an owner that does not exist", { user_id: "00000000-0000-4000-8000-000000000000" }],
  ])("%s", async (_label, fields) => {
    await expect(insertSlip(fields)).rejects.toThrow();
  });

  it("there is no placed status: a draft can never become a bet by changing its status", async () => {
    await expect(db.query("update public.slip_drafts set status = 'placed' where id = $1", [adaSlip])).rejects.toThrow();
  });
});

describe("slip_selections accept valid rows", () => {
  it("only event and selection are required, and the source is the user", async () => {
    const id = await insertLeg();
    const row = (await owner<{ odds_decimal: string | null; verification_status: string; sort_order: number; sport: string | null }>(
      "select odds_decimal, verification_status, sort_order, sport from public.slip_selections where id = $1",
      [id],
    ))[0]!;
    expect(row).toEqual({ odds_decimal: null, verification_status: "user_entered", sort_order: 0, sport: null });
  });

  it("keeps odds exactly as entered, to 3 decimals", async () => {
    const id = await insertLeg({ odds_decimal: 1.85 });
    const row = (await owner<{ odds_decimal: string }>("select odds_decimal::text from public.slip_selections where id = $1", [id]))[0]!;
    expect(row.odds_decimal).toBe("1.850");
  });

  it("odds of exactly 1 and very long odds", async () => {
    await expect(insertLeg({ odds_decimal: 1 })).resolves.toBeTruthy();
    await expect(insertLeg({ odds_decimal: 999999999.999 })).resolves.toBeTruthy();
  });

  it.each(["user_entered", "needs_review", "verified"])("verification_status %s", async (verification_status) => {
    await expect(insertLeg({ verification_status })).resolves.toBeTruthy();
  });

  it("an event start time and the longest allowed text", async () => {
    await expect(
      insertLeg({ event: "e".repeat(200), selection: "s".repeat(200), sport: "x".repeat(80), market_type: "m".repeat(80), event_start_at: "2026-11-08T15:00:00Z" }),
    ).resolves.toBeTruthy();
  });
});

describe("slip_selections reject bad rows", () => {
  it.each([
    ["odds below 1", { odds_decimal: 0.99 }],
    ["zero odds", { odds_decimal: 0 }],
    ["negative odds", { odds_decimal: -2 }],
    ["an empty event", { event: "" }],
    ["an event over 200 characters", { event: "e".repeat(201) }],
    ["an empty selection", { selection: "" }],
    ["a selection over 200 characters", { selection: "s".repeat(201) }],
    ["no event", { event: null }],
    ["no selection", { selection: null }],
    ["an empty sport", { sport: "" }],
    ["a sport over 80 characters", { sport: "x".repeat(81) }],
    ["an empty market", { market_type: "" }],
    ["a market over 80 characters", { market_type: "m".repeat(81) }],
    ["an unknown verification status", { verification_status: "confirmed" }],
    ["a negative sort order", { sort_order: -1 }],
    ["no draft", { slip_draft_id: null }],
    ["a draft that does not exist", { slip_draft_id: "00000000-0000-4000-8000-000000000000" }],
  ])("%s", async (_label, fields) => {
    await expect(insertLeg(fields)).rejects.toThrow();
  });
});

describe("housekeeping", () => {
  it("updated_at moves when a draft changes", async () => {
    const id = await insertSlip({ name: "Before" });
    await db.query("update public.slip_drafts set created_at = '2020-01-01', updated_at = '2020-01-01' where id = $1", [id]);
    await db.query("update public.slip_drafts set name = 'After' where id = $1", [id]);
    const row = (await owner<{ moved: boolean }>("select updated_at > '2020-01-02' as moved from public.slip_drafts where id = $1", [id]))[0]!;
    expect(row.moved).toBe(true);
  });

  it("deleting a draft deletes its selections", async () => {
    const id = await insertSlip();
    const leg = await insertLeg({ slip_draft_id: id });
    await db.query("delete from public.slip_drafts where id = $1", [id]);
    expect(await owner("select id from public.slip_selections where id = $1", [leg])).toEqual([]);
  });

  it("deleting a user deletes their drafts and selections", async () => {
    const id = await newUser(db);
    const slip = await seedSlip(db, id);
    const leg = await seedSlipLeg(db, slip);
    await db.query("delete from auth.users where id = $1", [id]);
    expect(await owner("select id from public.slip_drafts where id = $1", [slip])).toEqual([]);
    expect(await owner("select id from public.slip_selections where id = $1", [leg])).toEqual([]);
  });
});

describe("slip_drafts: one user cannot reach another's", () => {
  it("each user sees only their own drafts", async () => {
    const adaSees = await asUser(db, ada, async () => (await db.query<{ id: string }>("select id from public.slip_drafts")).rows);
    const bolaSees = await asUser(db, bola, async () => (await db.query<{ id: string }>("select id from public.slip_drafts where name = 'Bola slip'")).rows);
    expect(adaSees.every((r) => r.id !== bolaSlip)).toBe(true);
    expect(adaSees.some((r) => r.id === adaSlip)).toBe(true);
    expect(bolaSees).toEqual([{ id: bolaSlip }]);
  });

  it("looking up another user's draft by its exact id returns nothing", async () => {
    const rows = await asUser(db, ada, async () => (await db.query("select * from public.slip_drafts where id = $1", [bolaSlip])).rows);
    expect(rows).toEqual([]);
  });

  it("a user can add a draft for themselves", async () => {
    const r = await asUser(db, ada, () => db.query("insert into public.slip_drafts (user_id, name) values ($1, 'Mine') returning id", [ada]));
    expect(r.rows).toHaveLength(1);
  });

  it("a user cannot add a draft owned by someone else", async () => {
    await expect(asUser(db, ada, () => db.query("insert into public.slip_drafts (user_id, name) values ($1, 'Planted')", [bola]))).rejects.toThrow();
    expect(await owner("select id from public.slip_drafts where name = 'Planted'")).toEqual([]);
  });

  it("a user can rename their own draft", async () => {
    const r = await asUser(db, ada, () => db.query("update public.slip_drafts set name = 'Renamed' where id = $1", [adaSlip]));
    expect(r.affectedRows).toBe(1);
    await owner("update public.slip_drafts set name = 'Ada slip' where id = $1", [adaSlip]);
  });

  it("a user cannot change another user's draft", async () => {
    const r = await asUser(db, ada, () => db.query("update public.slip_drafts set name = 'hacked' where id = $1", [bolaSlip]));
    expect(r.affectedRows).toBe(0);
    expect(await owner("select name from public.slip_drafts where id = $1", [bolaSlip])).toEqual([{ name: "Bola slip" }]);
  });

  it("a user cannot hand their draft to someone else, or take one over", async () => {
    await expect(asUser(db, ada, () => db.query("update public.slip_drafts set user_id = $1 where id = $2", [bola, adaSlip]))).rejects.toThrow();
    const taken = await asUser(db, ada, () => db.query("update public.slip_drafts set user_id = $1 where id = $2", [ada, bolaSlip]));
    expect(taken.affectedRows).toBe(0);
    expect(await owner("select user_id from public.slip_drafts where id = $1", [bolaSlip])).toEqual([{ user_id: bola }]);
  });

  it("a user cannot delete another user's draft", async () => {
    const r = await asUser(db, ada, () => db.query("delete from public.slip_drafts where id = $1", [bolaSlip]));
    expect(r.affectedRows).toBe(0);
    expect(await owner("select id from public.slip_drafts where id = $1", [bolaSlip])).toHaveLength(1);
  });

  it("a signed-in role with no identity sees nothing and can add nothing", async () => {
    const rows = await asUser(db, null, async () => (await db.query("select id from public.slip_drafts")).rows);
    expect(rows).toEqual([]);
    await expect(asUser(db, null, () => db.query("insert into public.slip_drafts (user_id, name) values ($1, 'x')", [ada]))).rejects.toThrow();
  });

  it("a signed-out visitor can neither read nor write drafts", async () => {
    await expect(asAnon(db, () => db.query("select id from public.slip_drafts"))).rejects.toThrow();
    await expect(asAnon(db, () => db.query("insert into public.slip_drafts (user_id, name) values ($1, 'x')", [ada]))).rejects.toThrow();
    await expect(asAnon(db, () => db.query("update public.slip_drafts set name = 'x'"))).rejects.toThrow();
    await expect(asAnon(db, () => db.query("delete from public.slip_drafts"))).rejects.toThrow();
  });
});

describe("slip_selections: one user cannot reach another's", () => {
  it("each user sees only selections of their own drafts", async () => {
    const ids = await asUser(db, ada, async () => (await db.query<{ id: string }>("select id from public.slip_selections")).rows.map((r) => r.id));
    expect(ids).toContain(adaLeg);
    expect(ids).not.toContain(bolaLeg);
  });

  it("looking up another user's selection by its exact id returns nothing", async () => {
    const rows = await asUser(db, ada, async () => (await db.query("select * from public.slip_selections where id = $1", [bolaLeg])).rows);
    expect(rows).toEqual([]);
  });

  it("a user can add a selection to their own draft", async () => {
    const r = await asUser(db, ada, () =>
      db.query("insert into public.slip_selections (slip_draft_id, event, selection) values ($1, 'A v B', 'A') returning id", [adaSlip]),
    );
    expect(r.rows).toHaveLength(1);
  });

  it("a user cannot add a selection to someone else's draft", async () => {
    await expect(
      asUser(db, ada, () => db.query("insert into public.slip_selections (slip_draft_id, event, selection) values ($1, 'Planted', 'x')", [bolaSlip])),
    ).rejects.toThrow();
    expect(await owner("select id from public.slip_selections where event = 'Planted'")).toEqual([]);
  });

  it("a user cannot change or delete another user's selection", async () => {
    const upd = await asUser(db, ada, () => db.query("update public.slip_selections set selection = 'hacked' where id = $1", [bolaLeg]));
    const del = await asUser(db, ada, () => db.query("delete from public.slip_selections where id = $1", [bolaLeg]));
    expect(upd.affectedRows).toBe(0);
    expect(del.affectedRows).toBe(0);
    expect(await owner("select selection from public.slip_selections where id = $1", [bolaLeg])).toEqual([{ selection: "Bola leg" }]);
  });

  it("a user cannot move their selection onto someone else's draft, or pull one in", async () => {
    await expect(asUser(db, ada, () => db.query("update public.slip_selections set slip_draft_id = $1 where id = $2", [bolaSlip, adaLeg]))).rejects.toThrow();
    const pulled = await asUser(db, ada, () => db.query("update public.slip_selections set slip_draft_id = $1 where id = $2", [adaSlip, bolaLeg]));
    expect(pulled.affectedRows).toBe(0);
    expect(await owner("select slip_draft_id from public.slip_selections where id = $1", [bolaLeg])).toEqual([{ slip_draft_id: bolaSlip }]);
  });

  it("a signed-out visitor can neither read nor write selections", async () => {
    await expect(asAnon(db, () => db.query("select id from public.slip_selections"))).rejects.toThrow();
    await expect(asAnon(db, () => db.query("insert into public.slip_selections (slip_draft_id, event, selection) values ($1, 'x', 'x')", [adaSlip]))).rejects.toThrow();
    await expect(asAnon(db, () => db.query("update public.slip_selections set selection = 'x'"))).rejects.toThrow();
    await expect(asAnon(db, () => db.query("delete from public.slip_selections"))).rejects.toThrow();
  });
});

/**
 * With a WHERE clause the read rules already hide other people's rows, which would mask a
 * broken update or delete rule. Statements with NO WHERE clause are gated only by the update
 * and delete rules themselves, so they are the real test of those rules.
 */
describe("statements with no WHERE clause only touch the user's own rows", () => {
  async function twoFreshUsers() {
    const a = await newUser(db);
    const b = await newUser(db);
    const aSlip = await seedSlip(db, a, "A slip");
    const bSlip = await seedSlip(db, b, "B slip");
    const aLeg = await seedSlipLeg(db, aSlip, "A leg");
    const bLeg = await seedSlipLeg(db, bSlip, "B leg");
    return { a, b, aSlip, bSlip, aLeg, bLeg };
  }

  it("update of every draft changes only the user's own", async () => {
    const t = await twoFreshUsers();
    await asUser(db, t.a, () => db.query("update public.slip_drafts set name = 'changed'"));
    expect(await owner("select name from public.slip_drafts where id = $1", [t.bSlip])).toEqual([{ name: "B slip" }]);
    expect(await owner("select name from public.slip_drafts where id = $1", [t.aSlip])).toEqual([{ name: "changed" }]);
  });

  it("delete of every draft removes only the user's own", async () => {
    const t = await twoFreshUsers();
    await asUser(db, t.a, () => db.query("delete from public.slip_drafts"));
    expect(await owner("select id from public.slip_drafts where id = $1", [t.aSlip])).toEqual([]);
    expect(await owner("select id from public.slip_drafts where id = $1", [t.bSlip])).toHaveLength(1);
    expect(await owner("select id from public.slip_selections where id = $1", [t.bLeg])).toHaveLength(1);
  });

  it("update of every selection changes only the user's own", async () => {
    const t = await twoFreshUsers();
    await asUser(db, t.a, () => db.query("update public.slip_selections set selection = 'changed'"));
    expect(await owner("select selection from public.slip_selections where id = $1", [t.bLeg])).toEqual([{ selection: "B leg" }]);
    expect(await owner("select selection from public.slip_selections where id = $1", [t.aLeg])).toEqual([{ selection: "changed" }]);
  });

  it("delete of every selection removes only the user's own", async () => {
    const t = await twoFreshUsers();
    await asUser(db, t.a, () => db.query("delete from public.slip_selections"));
    expect(await owner("select id from public.slip_selections where id = $1", [t.aLeg])).toEqual([]);
    expect(await owner("select id from public.slip_selections where id = $1", [t.bLeg])).toHaveLength(1);
  });
});

describe("a bet can only be linked to the recording user's own draft", () => {
  async function insertBetAs(userId: string, slipId: string | null) {
    return asUser(db, userId, () =>
      db.query(
        `insert into public.bets (user_id, currency, stake_minor, status, placed_at, slip_draft_id)
         values ($1, 'NGN', 500000, 'pending', '2026-10-15T12:00:00Z', $2) returning id`,
        [userId, slipId],
      ),
    );
  }

  it("a bet starts with no draft", async () => {
    const id = await seedBet(db, ada);
    expect(await owner("select slip_draft_id from public.bets where id = $1", [id])).toEqual([{ slip_draft_id: null }]);
  });

  it("a user can record a bet from their own draft", async () => {
    const r = await insertBetAs(ada, adaSlip);
    expect(r.rows).toHaveLength(1);
  });

  it("a user cannot link a bet to someone else's draft", async () => {
    await expect(insertBetAs(ada, bolaSlip)).rejects.toThrow();
  });

  it("a user cannot re-point an existing bet at someone else's draft", async () => {
    const id = await seedBet(db, ada);
    await expect(asUser(db, ada, () => db.query("update public.bets set slip_draft_id = $1 where id = $2", [bolaSlip, id]))).rejects.toThrow();
    expect(await owner("select slip_draft_id from public.bets where id = $1", [id])).toEqual([{ slip_draft_id: null }]);
  });

  it("deleting a draft keeps the bet and clears only the link", async () => {
    const slip = await seedSlip(db, ada, "Soon deleted");
    const bet = (await insertBetAs(ada, slip)).rows[0] as { id: string };
    await asUser(db, ada, () => db.query("delete from public.slip_drafts where id = $1", [slip]));
    expect(await owner("select user_id, status, stake_minor::int as stake, slip_draft_id from public.bets where id = $1", [bet.id])).toEqual([
      { user_id: ada, status: "pending", stake: 500000, slip_draft_id: null },
    ]);
  });

  it("a draft that already has a bet is not a bet itself: the draft stays a draft", async () => {
    await insertBetAs(ada, adaSlip);
    expect(await owner("select status from public.slip_drafts where id = $1", [adaSlip])).toEqual([{ status: "draft" }]);
  });
});

describe("table privileges", () => {
  it("signed-out visitors hold no privileges on either table", async () => {
    const rows = await owner<{ t: string; priv: string; ok: boolean }>(
      `select t, p as priv, has_table_privilege('anon', 'public.' || t, p) as ok
       from unnest(array['slip_drafts', 'slip_selections']) as t,
            unnest(array['select', 'insert', 'update', 'delete']) as p`,
    );
    expect(rows).toHaveLength(8);
    for (const row of rows) expect(row.ok).toBe(false);
  });

  it("row-level security is on for both tables", async () => {
    const rows = await owner<{ relname: string; relrowsecurity: boolean }>(
      "select relname, relrowsecurity from pg_class where relname in ('slip_drafts', 'slip_selections') order by relname",
    );
    expect(rows).toEqual([
      { relname: "slip_drafts", relrowsecurity: true },
      { relname: "slip_selections", relrowsecurity: true },
    ]);
  });
});
