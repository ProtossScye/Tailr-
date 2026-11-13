import { createHash } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asAnon, asService, asUser, createDb, newUser } from "./helpers";

/** The Telegram tables and functions: linking, de-duplication, limits, and drafts saved for a linked person. */

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
});
afterAll(async () => {
  await db.close();
});

const hash = (code: string) => createHash("sha256").update(code).digest("hex");
let nextUpdate = 1000;
let nextTelegram = 5000;
const tg = () => (nextTelegram += 1);

const makeCode = (userId: string, code: string) =>
  asUser(db, userId, async () => (await db.query<{ e: string | null }>("select public.create_telegram_link_code($1) as e", [hash(code)])).rows[0]!.e);
const redeem = (code: string, tgId: number, chat = tgId) =>
  asService(db, async () => (await db.query<{ r: string }>("select public.telegram_redeem_link($1, $2, $3) as r", [hash(code), tgId, chat])).rows[0]!.r);
const accept = (tgId: number, updateId = (nextUpdate += 1)) =>
  asService(db, async () => (await db.query<{ r: string }>("select public.telegram_accept_update($1, $2) as r", [updateId, tgId])).rows[0]!.r);
const isLinked = (tgId: number) => asService(db, async () => (await db.query<{ r: boolean }>("select public.telegram_is_linked($1) as r", [tgId])).rows[0]!.r);
const unlink = (tgId: number) => asService(db, async () => (await db.query<{ r: boolean }>("select public.telegram_unlink($1) as r", [tgId])).rows[0]!.r);
const leg = (event: string, selection: string, odds: number | null = 1.85) => ({ sport: null, event, market_type: null, selection, odds_decimal: odds });
const draft = (tgId: number, selections: unknown, slip: unknown = { name: "Arsenal v Chelsea", source_bookmaker: null }) =>
  asService(db, async () => (await db.query<{ id: string | null }>("select public.telegram_create_draft($1, $2::jsonb, $3::jsonb) as id", [tgId, JSON.stringify(slip), JSON.stringify(selections)])).rows[0]!.id);
const link = async (code = `C${Math.random().toString(36).slice(2, 10)}`) => {
  const userId = await newUser(db);
  const tgId = tg();
  await makeCode(userId, code);
  expect(await redeem(code, tgId)).toBe("linked");
  return { userId, tgId };
};

describe("create_telegram_link_code", () => {
  it("stores only the hash, and the code expires in about 10 minutes", async () => {
    const u = await newUser(db);
    const expires = await makeCode(u, "ABCD2345");
    const minutes = (new Date(expires as string).getTime() - Date.now()) / 60000;
    expect(minutes).toBeGreaterThan(9.5);
    expect(minutes).toBeLessThanOrEqual(10.1);
    const rows = (await db.query<{ code_hash: string }>("select code_hash from public.telegram_link_codes where user_id = $1", [u])).rows;
    expect(rows).toEqual([{ code_hash: hash("ABCD2345") }]);
    expect(JSON.stringify(rows)).not.toContain("ABCD2345");
  });

  it("refuses a signed-out caller and a hash that is not 64 hex characters", async () => {
    await expect(asAnon(db, () => db.query("select public.create_telegram_link_code($1)", [hash("X")]))).rejects.toThrow();
    await expect(asUser(db, null, () => db.query("select public.create_telegram_link_code($1)", [hash("X")]))).rejects.toThrow(/Not signed in/);
    const u = await newUser(db);
    for (const bad of ["abc", "G".repeat(64), "A".repeat(64), "", null]) {
      await expect(asUser(db, u, () => db.query("select public.create_telegram_link_code($1)", [bad]))).rejects.toThrow(/Invalid code/);
    }
  });

  it("a new code replaces the old one, and leaves other people's codes alone", async () => {
    const a = await newUser(db);
    const b = await newUser(db);
    await makeCode(a, "FIRSTCODE");
    await makeCode(b, "BOBSCODE1");
    await makeCode(a, "SECONDCODE");
    expect(await redeem("FIRSTCODE", tg())).toBe("invalid");
    expect(await redeem("BOBSCODE1", tg())).toBe("linked");
    expect(await redeem("SECONDCODE", tg())).toBe("linked");
  });

  it("allows 5 codes an hour, then returns null", async () => {
    const u = await newUser(db);
    for (let i = 0; i < 5; i++) expect(await makeCode(u, `CODE000${i}`)).not.toBeNull();
    expect(await makeCode(u, "CODE0009")).toBeNull();
    await db.query("update public.telegram_link_codes set created_at = now() - interval '61 minutes' where user_id = $1", [u]);
    expect(await makeCode(u, "CODE0010")).not.toBeNull();
  });
});

describe("telegram_redeem_link", () => {
  it("connects the Telegram account to the person who made the code, once", async () => {
    const u = await newUser(db);
    const t = tg();
    await makeCode(u, "GOODCODE1");
    expect(await redeem("GOODCODE1", t, 777)).toBe("linked");
    expect((await db.query("select user_id, telegram_user_id::int as t, chat_id::int as c from public.telegram_links where user_id = $1", [u])).rows).toEqual([{ user_id: u, t, c: 777 }]);
    expect(await isLinked(t)).toBe(true);
    // The code is used up.
    expect(await redeem("GOODCODE1", tg())).toBe("invalid");
  });

  it("rejects a wrong code, an unknown code and an expired code", async () => {
    const u = await newUser(db);
    await makeCode(u, "EXPIRED01");
    await db.query("update public.telegram_link_codes set expires_at = now() - interval '1 second' where user_id = $1", [u]);
    const t = tg();
    expect(await redeem("EXPIRED01", t)).toBe("invalid");
    expect(await redeem("NEVERMADE", t)).toBe("invalid");
    expect(await isLinked(t)).toBe(false);
  });

  it("stops guessing: 5 wrong codes in an hour block that Telegram account, even for a right code", async () => {
    const u = await newUser(db);
    const t = tg();
    for (let i = 0; i < 5; i++) expect(await redeem(`WRONG000${i}`, t)).toBe("invalid");
    await makeCode(u, "RIGHTCODE");
    expect(await redeem("RIGHTCODE", t)).toBe("limited");
    expect(await isLinked(t)).toBe(false);
    // Another Telegram account is not affected, and the code was not used up.
    expect(await redeem("RIGHTCODE", tg())).toBe("linked");
  });

  it("failed tries older than an hour stop counting", async () => {
    const u = await newUser(db);
    const t = tg();
    for (let i = 0; i < 5; i++) await redeem(`OLDWRONG${i}`, t);
    await db.query("update public.telegram_failed_links set created_at = now() - interval '61 minutes' where telegram_user_id = $1", [t]);
    await makeCode(u, "LATERCODE");
    expect(await redeem("LATERCODE", t)).toBe("linked");
  });

  it("a Telegram account already connected to someone else is refused, and the new code is kept", async () => {
    const first = await link();
    const other = await newUser(db);
    await makeCode(other, "OTHERUSER");
    expect(await redeem("OTHERUSER", first.tgId)).toBe("taken");
    const stillFirst = (await db.query("select user_id from public.telegram_links where telegram_user_id = $1", [first.tgId])).rows;
    expect(stillFirst).toEqual([{ user_id: first.userId }]);
    // After disconnecting, the same code works.
    await unlink(first.tgId);
    expect(await redeem("OTHERUSER", first.tgId)).toBe("linked");
  });

  it("a person who connects a different Telegram account moves their connection", async () => {
    const { userId, tgId } = await link();
    const newTg = tg();
    await makeCode(userId, "MOVEDOVER");
    expect(await redeem("MOVEDOVER", newTg)).toBe("linked");
    expect(await isLinked(tgId)).toBe(false);
    expect(await isLinked(newTg)).toBe(true);
    expect((await db.query("select count(*)::int as n from public.telegram_links where user_id = $1", [userId])).rows[0]).toEqual({ n: 1 });
  });

  it("a successful link clears that person's earlier wrong tries", async () => {
    const u = await newUser(db);
    const t = tg();
    for (let i = 0; i < 3; i++) await redeem(`NOPE000${i}`, t);
    await makeCode(u, "FINALLYOK");
    expect(await redeem("FINALLYOK", t)).toBe("linked");
    expect((await db.query("select count(*)::int as n from public.telegram_failed_links where telegram_user_id = $1", [t])).rows[0]).toEqual({ n: 0 });
  });
});

describe("telegram_accept_update", () => {
  it("accepts a new update once, then calls a repeat a duplicate", async () => {
    const t = tg();
    expect(await accept(t, 1)).toBe("ok");
    expect(await accept(t, 1)).toBe("duplicate");
  });

  it("allows 30 messages an hour per Telegram account, then reports limited, still recording them", async () => {
    const t = tg();
    for (let i = 0; i < 30; i++) expect(await accept(t)).toBe("ok");
    const over = (nextUpdate += 1);
    expect(await accept(t, over)).toBe("limited");
    expect(await accept(t, over)).toBe("duplicate");
    expect(await accept(tg())).toBe("ok");
  });

  it("messages older than an hour stop counting", async () => {
    const t = tg();
    for (let i = 0; i < 30; i++) await accept(t);
    await db.query("update public.telegram_updates set received_at = now() - interval '61 minutes' where telegram_user_id = $1", [t]);
    expect(await accept(t)).toBe("ok");
  });

  it("forgets updates after two days, and stores no message text", async () => {
    const t = tg();
    await accept(t, 42424242);
    await db.query("update public.telegram_updates set received_at = now() - interval '3 days' where update_id = 42424242");
    await accept(tg());
    expect((await db.query("select count(*)::int as n from public.telegram_updates where update_id = 42424242")).rows[0]).toEqual({ n: 0 });
    const columns = (await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_name = 'telegram_updates'")).rows.map((r) => r.column_name).sort();
    expect(columns).toEqual(["received_at", "telegram_user_id", "update_id"]);
  });
});

describe("telegram_unlink and telegram_is_linked", () => {
  it("disconnects once and says whether anything was connected", async () => {
    const { tgId } = await link();
    expect(await unlink(tgId)).toBe(true);
    expect(await isLinked(tgId)).toBe(false);
    expect(await unlink(tgId)).toBe(false);
    expect(await isLinked(tg())).toBe(false);
  });
});

describe("telegram_create_draft", () => {
  it("saves a draft for the connected person, marked as read from text and needing review", async () => {
    const { userId, tgId } = await link();
    const id = await draft(tgId, [leg("Arsenal v Chelsea", "Arsenal to win"), leg("Lakers v Celtics", "Over 215.5", null)], { name: "Arsenal v Chelsea +1", source_bookmaker: "Bet9ja" });
    expect(id).toBeTruthy();
    const slip = (await db.query("select user_id, name, source_type, source_bookmaker, status from public.slip_drafts where id = $1", [id])).rows[0];
    expect(slip).toEqual({ user_id: userId, name: "Arsenal v Chelsea +1", source_type: "pasted_text", source_bookmaker: "Bet9ja", status: "draft" });
    const legs = (await db.query("select event, selection, odds_decimal::float as odds, verification_status, sort_order from public.slip_selections where slip_draft_id = $1 order by sort_order", [id])).rows;
    expect(legs).toEqual([
      { event: "Arsenal v Chelsea", selection: "Arsenal to win", odds: 1.85, verification_status: "needs_review", sort_order: 0 },
      { event: "Lakers v Celtics", selection: "Over 215.5", odds: null, verification_status: "needs_review", sort_order: 1 },
    ]);
  });

  it("returns null and saves nothing for a Telegram account that is not connected", async () => {
    const before = (await db.query<{ n: number }>("select count(*)::int as n from public.slip_drafts")).rows[0]!.n;
    expect(await draft(tg(), [leg("A v B", "A")])).toBeNull();
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.slip_drafts")).rows[0]!.n).toBe(before);
  });

  it("is only visible to its owner, and is never a bet", async () => {
    const { userId, tgId } = await link();
    const stranger = await newUser(db);
    const id = await draft(tgId, [leg("A v B", "A")]);
    expect(await asUser(db, userId, async () => (await db.query("select id from public.slip_drafts where id = $1", [id])).rows)).toHaveLength(1);
    expect(await asUser(db, stranger, async () => (await db.query("select id from public.slip_drafts where id = $1", [id])).rows)).toHaveLength(0);
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.bets where user_id = $1", [userId])).rows[0]!.n).toBe(0);
  });

  it("refuses no selections, more than 50, and a bad leg, and leaves no half-saved draft", async () => {
    const { userId, tgId } = await link();
    await expect(draft(tgId, [])).rejects.toThrow(/at least one/);
    await expect(draft(tgId, null)).rejects.toThrow(/at least one/);
    await expect(draft(tgId, Array.from({ length: 51 }, (_, i) => leg(`E${i}`, "S")))).rejects.toThrow(/at most 50/);
    await expect(draft(tgId, [leg("A v B", "A"), leg("C v D", "C", 0.5)])).rejects.toThrow();
    await expect(draft(tgId, [leg("A v B", "A")], { name: null })).rejects.toThrow();
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.slip_drafts where user_id = $1", [userId])).rows[0]!.n).toBe(0);
  });
});

describe("who can do what", () => {
  it("signed-in people and visitors cannot call the bot's functions", async () => {
    const u = await newUser(db);
    const calls: [string, unknown[]][] = [
      ["select public.telegram_accept_update($1, $2)", [1, 1]],
      ["select public.telegram_redeem_link($1, $2, $3)", [hash("X"), 1, 1]],
      ["select public.telegram_is_linked($1)", [1]],
      ["select public.telegram_unlink($1)", [1]],
      ["select public.telegram_create_draft($1, '{}'::jsonb, '[]'::jsonb)", [1]],
    ];
    for (const [sql, params] of calls) {
      await expect(asUser(db, u, () => db.query(sql, params)), sql).rejects.toThrow(/permission denied/);
      await expect(asAnon(db, () => db.query(sql, params)), sql).rejects.toThrow(/permission denied/);
    }
  });

  it("people cannot read or write the code, update or failed-try tables, or insert or change a link", async () => {
    const { userId } = await link();
    for (const table of ["telegram_link_codes", "telegram_updates", "telegram_failed_links"]) {
      await expect(asUser(db, userId, () => db.query(`select * from public.${table}`))).rejects.toThrow(/permission denied/);
    }
    await expect(asUser(db, userId, () => db.query("insert into public.telegram_links (user_id, telegram_user_id, chat_id) values ($1, 1, 1)", [userId]))).rejects.toThrow(/permission denied/);
    await expect(asUser(db, userId, () => db.query("update public.telegram_links set telegram_user_id = 99 where user_id = $1", [userId]))).rejects.toThrow(/permission denied/);
    await expect(asAnon(db, () => db.query("select * from public.telegram_links"))).rejects.toThrow(/permission denied/);
  });

  it("a person sees only their own connection and can remove it, but not someone else's", async () => {
    const a = await link();
    const b = await link();
    const seen = await asUser(db, a.userId, async () => (await db.query<{ user_id: string }>("select user_id from public.telegram_links")).rows);
    expect(seen).toEqual([{ user_id: a.userId }]);
    await asUser(db, a.userId, () => db.query("delete from public.telegram_links where user_id = $1", [b.userId]));
    expect(await isLinked(b.tgId)).toBe(true);
    await asUser(db, a.userId, () => db.query("delete from public.telegram_links where user_id = $1", [a.userId]));
    expect(await isLinked(a.tgId)).toBe(false);
  });

  it("deleting a user removes their connection and codes", async () => {
    const { userId, tgId } = await link();
    await makeCode(userId, "LEFTOVER1");
    await db.query("delete from auth.users where id = $1", [userId]);
    expect(await isLinked(tgId)).toBe(false);
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.telegram_link_codes where user_id = $1", [userId])).rows[0]!.n).toBe(0);
  });
});
