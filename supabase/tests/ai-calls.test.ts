import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asAnon, asUser, createDb, newUser } from "./helpers";

/** ai_calls, begin_ai_call and finish_ai_call: the usage log and the per-user limits. */

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
});
afterAll(async () => {
  await db.close();
});

const begin = (userId: string | null, chars = 100, purpose = "read_slip") =>
  asUser(db, userId, async () => (await db.query<{ id: string | null }>("select public.begin_ai_call($1, $2) as id", [purpose, chars])).rows[0]!.id);

const finish = (userId: string | null, id: string, status = "ok", model: string | null = "m", inTok: number | null = 10, outTok: number | null = 5, ms: number | null = 120) =>
  asUser(db, userId, async () =>
    (await db.query<{ ok: boolean }>("select public.finish_ai_call($1::uuid, $2, $3, $4, $5, $6) as ok", [id, status, model, inTok, outTok, ms])).rows[0]!.ok,
  );

const rowsOf = async (userId: string) => (await db.query<Record<string, unknown>>("select * from public.ai_calls where user_id = $1 order by created_at", [userId])).rows;
const age = (userId: string, interval: string) => db.query(`update public.ai_calls set created_at = now() - interval '${interval}' where user_id = $1`, [userId]);

describe("begin_ai_call", () => {
  it("records a started call for the caller and returns its id", async () => {
    const u = await newUser(db);
    const id = await begin(u, 250);
    expect(id).toBeTruthy();
    expect(await rowsOf(u)).toMatchObject([{ id, user_id: u, purpose: "read_slip", status: "started", input_chars: 250, input_tokens: null }]);
  });

  it("allows 10 calls an hour and then returns null without recording another", async () => {
    const u = await newUser(db);
    for (let i = 0; i < 10; i++) expect(await begin(u)).toBeTruthy();
    expect(await begin(u)).toBeNull();
    expect(await rowsOf(u)).toHaveLength(10);
  });

  it("one person's use does not affect another's", async () => {
    const a = await newUser(db);
    const b = await newUser(db);
    for (let i = 0; i < 10; i++) await begin(a);
    expect(await begin(a)).toBeNull();
    expect(await begin(b)).toBeTruthy();
  });

  it("calls older than an hour stop counting toward the hourly limit", async () => {
    const u = await newUser(db);
    for (let i = 0; i < 10; i++) await begin(u);
    await age(u, "61 minutes");
    expect(await begin(u)).toBeTruthy();
  });

  it("allows 40 calls a day, however they are spread", async () => {
    const u = await newUser(db);
    for (let i = 0; i < 40; i++) await db.query("insert into public.ai_calls (user_id, purpose, created_at) values ($1, 'read_slip', now() - interval '2 hours')", [u]);
    expect(await begin(u)).toBeNull();
    await age(u, "25 hours");
    expect(await begin(u)).toBeTruthy();
  });

  it("counts failed calls too, so retrying a failure cannot be used to hammer the provider", async () => {
    const u = await newUser(db);
    for (let i = 0; i < 10; i++) await finish(u, (await begin(u))!, "provider_error", null, null, null, null);
    expect(await begin(u)).toBeNull();
  });

  it("cannot be run for anyone but the caller: the owner is the session", async () => {
    const a = await newUser(db);
    const b = await newUser(db);
    const id = await begin(a);
    expect((await rowsOf(b)).length).toBe(0);
    expect((await rowsOf(a)).map((r) => r.id)).toEqual([id]);
  });

  it.each([["an unknown purpose", "suggest"], ["no purpose", null as unknown as string]])("rejects %s", async (_l, purpose) => {
    const u = await newUser(db);
    await expect(begin(u, 1, purpose)).rejects.toThrow();
    expect(await rowsOf(u)).toEqual([]);
  });

  it("accepts the image purpose, and image and text reads share one limit", async () => {
    const u = await newUser(db);
    for (let i = 0; i < 5; i++) expect(await begin(u, 100, "read_image")).toBeTruthy();
    for (let i = 0; i < 5; i++) expect(await begin(u, 100, "read_slip")).toBeTruthy();
    expect(await begin(u, 100, "read_image")).toBeNull();
    expect(await begin(u, 100, "read_slip")).toBeNull();
    expect((await rowsOf(u)).filter((r) => r.purpose === "read_image")).toHaveLength(5);
  });

  it("treats a negative size as zero", async () => {
    const u = await newUser(db);
    await begin(u, -5);
    expect((await rowsOf(u))[0]!.input_chars).toBe(0);
  });

  it("a signed-in role with no identity cannot call it", async () => {
    await expect(begin(null)).rejects.toThrow();
  });

  it("signed-out visitors cannot call it", async () => {
    await expect(asAnon(db, () => db.query("select public.begin_ai_call('read_slip', 1)"))).rejects.toThrow();
  });
});

describe("finish_ai_call", () => {
  it("closes the call with its outcome, model, tokens and time", async () => {
    const u = await newUser(db);
    const id = (await begin(u))!;
    expect(await finish(u, id, "ok", "claude-sonnet-5-5", 420, 130, 1800)).toBe(true);
    expect(await rowsOf(u)).toMatchObject([{ status: "ok", model: "claude-sonnet-5-5", input_tokens: 420, output_tokens: 130, latency_ms: 1800 }]);
  });

  it.each(["timeout", "invalid_output", "provider_error"])("records the %s outcome", async (status) => {
    const u = await newUser(db);
    const id = (await begin(u))!;
    expect(await finish(u, id, status, null, null, null, 20_000)).toBe(true);
    expect((await rowsOf(u))[0]!.status).toBe(status);
  });

  it("closes a call only once", async () => {
    const u = await newUser(db);
    const id = (await begin(u))!;
    expect(await finish(u, id, "ok")).toBe(true);
    expect(await finish(u, id, "provider_error")).toBe(false);
    expect((await rowsOf(u))[0]!.status).toBe("ok");
  });

  it("cannot close someone else's call, and says false for one that does not exist", async () => {
    const a = await newUser(db);
    const b = await newUser(db);
    const id = (await begin(a))!;
    expect(await finish(b, id, "ok")).toBe(false);
    expect((await rowsOf(a))[0]!.status).toBe("started");
    expect(await finish(a, "00000000-0000-4000-8000-000000000000", "ok")).toBe(false);
  });

  it.each(["started", "done", ""])("rejects the status %j", async (status) => {
    const u = await newUser(db);
    const id = (await begin(u))!;
    await expect(finish(u, id, status)).rejects.toThrow();
    expect((await rowsOf(u))[0]!.status).toBe("started");
  });

  it("rejects negative token counts", async () => {
    const u = await newUser(db);
    const id = (await begin(u))!;
    await expect(finish(u, id, "ok", "m", -1, 5, 5)).rejects.toThrow();
  });

  it("signed-out visitors cannot call it", async () => {
    const u = await newUser(db);
    const id = (await begin(u))!;
    await expect(asAnon(db, () => db.query("select public.finish_ai_call($1::uuid, 'ok')", [id]))).rejects.toThrow();
  });
});

describe("the log cannot be edited by the people it limits", () => {
  it("a user reads only their own rows", async () => {
    const a = await newUser(db);
    const b = await newUser(db);
    await begin(a);
    await begin(b);
    const seen = await asUser(db, a, async () => (await db.query<{ user_id: string }>("select user_id from public.ai_calls")).rows);
    expect(seen).toEqual([{ user_id: a }]);
  });

  it("a user cannot insert, update or delete rows directly, so cannot reset their own limit", async () => {
    const u = await newUser(db);
    for (let i = 0; i < 10; i++) await begin(u);
    await expect(asUser(db, u, () => db.query("delete from public.ai_calls where user_id = $1", [u]))).rejects.toThrow();
    await expect(asUser(db, u, () => db.query("update public.ai_calls set created_at = now() - interval '3 days' where user_id = $1", [u]))).rejects.toThrow();
    await expect(asUser(db, u, () => db.query("insert into public.ai_calls (user_id, purpose) values ($1, 'read_slip')", [u]))).rejects.toThrow();
    expect(await rowsOf(u)).toHaveLength(10);
    expect(await begin(u)).toBeNull();
  });

  it("signed-out visitors can read and write nothing", async () => {
    await expect(asAnon(db, () => db.query("select * from public.ai_calls"))).rejects.toThrow();
  });

  it("the functions are for signed-in users only", async () => {
    for (const fn of ["public.begin_ai_call(text, integer)", "public.finish_ai_call(uuid, text, text, integer, integer, integer)"]) {
      const r = (await db.query<{ anon: boolean; authed: boolean }>(
        "select has_function_privilege('anon', $1, 'execute') as anon, has_function_privilege('authenticated', $1, 'execute') as authed",
        [fn],
      )).rows[0];
      expect(r).toEqual({ anon: false, authed: true });
    }
  });

  it("deleting the account deletes its log", async () => {
    const u = await newUser(db);
    await begin(u);
    await db.query("delete from auth.users where id = $1", [u]);
    expect((await db.query("select 1 from public.ai_calls where user_id = $1", [u])).rows).toEqual([]);
  });

  it("stores sizes and outcomes only: there is no column for text or answers", async () => {
    const cols = (await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_name = 'ai_calls' order by 1")).rows.map((r) => r.column_name);
    expect(cols).toEqual(["created_at", "id", "input_chars", "input_tokens", "latency_ms", "model", "output_tokens", "purpose", "status", "user_id"]);
  });
});
