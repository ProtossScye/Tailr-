import { readFileSync } from "node:fs";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asAnon, asUser, createDb, newUser, seedBet, seedSlip } from "./helpers";

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
});
afterAll(async () => {
  await db.close();
});

const submit = (userId: string, kind: string, message: string | null) =>
  asUser(db, userId, async () => (await db.query<{ r: string }>("select public.submit_feedback($1, $2) as r", [kind, message])).rows[0]!.r);

describe("submit_feedback", () => {
  it("saves a trimmed note for the signed-in person only", async () => {
    const a = await newUser(db, {});
    const b = await newUser(db, {});
    expect(await submit(a, "bug", "  The slip would not save  ")).toBe("ok");
    const mine = await asUser(db, a, async () => (await db.query<{ message: string; kind: string }>("select message, kind from public.user_feedback")).rows);
    expect(mine).toEqual([{ message: "The slip would not save", kind: "bug" }]);
    const theirs = await asUser(db, b, async () => (await db.query("select * from public.user_feedback")).rows);
    expect(theirs).toEqual([]);
  });

  it("refuses empty, blank, too long, wrong kind and missing text, and keeps exactly 2000 characters", async () => {
    const u = await newUser(db, {});
    expect(await submit(u, "idea", "")).toBe("invalid");
    expect(await submit(u, "idea", "   \n ")).toBe("invalid");
    expect(await submit(u, "idea", null)).toBe("invalid");
    expect(await submit(u, "complaint", "hello")).toBe("invalid");
    expect(await submit(u, "idea", "x".repeat(2001))).toBe("invalid");
    expect(await submit(u, "idea", "x".repeat(2000))).toBe("ok");
  });

  it("allows 10 notes an hour per person, and the limit is per person", async () => {
    const u = await newUser(db, {});
    const other = await newUser(db, {});
    for (let i = 0; i < 10; i++) expect(await submit(u, "other", `note ${i}`)).toBe("ok");
    expect(await submit(u, "other", "one too many")).toBe("limited");
    expect(await submit(other, "other", "fine")).toBe("ok");
    await db.query("update public.user_feedback set created_at = now() - interval '2 hours' where user_id = $1", [u]);
    expect(await submit(u, "other", "an hour later")).toBe("ok");
  });

  it("cannot be called signed out, and people cannot write or change the table directly", async () => {
    await expect(asAnon(db, () => db.query("select public.submit_feedback('bug', 'hi')"))).rejects.toThrow();
    const u = await newUser(db, {});
    await expect(asUser(db, u, () => db.query("insert into public.user_feedback (user_id, kind, message) values ($1, 'bug', 'x')", [u]))).rejects.toThrow();
    expect(await submit(u, "bug", "real one")).toBe("ok");
    await expect(asUser(db, u, () => db.query("update public.user_feedback set message = 'edited'"))).rejects.toThrow();
    await expect(asUser(db, u, () => db.query("delete from public.user_feedback"))).rejects.toThrow();
  });
});

describe("telegram_redeem_link pruning", () => {
  it("clears wrong-code rows older than a day but keeps recent ones", async () => {
    await db.query("insert into public.telegram_failed_links (telegram_user_id, created_at) values (777, now() - interval '3 days'), (778, now() - interval '5 minutes')");
    await db.exec("set role service_role");
    try {
      await db.query("select public.telegram_redeem_link($1, 999, 1)", ["a".repeat(64)]);
    } finally {
      await db.exec("reset role");
    }
    const left = (await db.query<{ telegram_user_id: string }>("select telegram_user_id from public.telegram_failed_links where telegram_user_id in (777, 778) order by 1")).rows;
    expect(left.map((r) => Number(r.telegram_user_id))).toEqual([778]);
  });
});

describe("beta-metrics.sql", () => {
  it("counts people, first slip, first bet, coming back, sources and feedback", async () => {
    const sql = readFileSync(new URL("../beta-metrics.sql", import.meta.url), "utf8");
    const before = (await db.query<Record<string, string>>(sql)).rows[0]!;
    const n = (r: Record<string, string>, k: string) => Number(r[k]);

    const onlyJoined = await newUser(db, {});
    const slipper = await newUser(db, {});
    const better = await newUser(db, {});
    const returner = await newUser(db, {});
    await seedSlip(db, slipper);
    await seedBet(db, better);
    const s1 = await seedSlip(db, returner);
    const s2 = await seedSlip(db, returner);
    const s3 = await seedSlip(db, returner);
    // Two slips on one Lagos day, one on the next. 23:30 UTC is already the next day in Lagos (UTC+1).
    await db.query("update public.slip_drafts set created_at = '2026-11-01T10:00:00Z' where id = $1", [s1]);
    await db.query("update public.slip_drafts set created_at = '2026-11-01T22:30:00Z' where id = $1", [s2]);
    await db.query("update public.slip_drafts set created_at = '2026-11-01T23:30:00Z', source_type = 'pasted_text' where id = $1", [s3]);
    await db.query("update public.slip_drafts set source_type = 'image' where id = $1", [await seedSlip(db, onlyJoined)]);
    await submit(better, "idea", "more sports");

    const after = (await db.query<Record<string, string>>(sql)).rows[0]!;
    const d = (k: string) => n(after, k) - n(before, k);
    expect(d("people")).toBe(4);
    expect(d("made_a_slip")).toBe(3); // slipper, returner, onlyJoined
    expect(d("recorded_a_bet")).toBe(1);
    expect(d("came_back")).toBe(1); // returner: s2 is 11 Nov 1 Lagos, s3 is Nov 2 Lagos
    expect(d("slips_from_text")).toBe(1);
    expect(d("slips_from_screenshots")).toBe(1);
    expect(d("feedback_notes")).toBe(1);
  });
});
