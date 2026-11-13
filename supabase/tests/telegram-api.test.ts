import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleTelegramLinkCode, handleTelegramStatus, handleTelegramUnlink, type TelegramLinkDeps } from "../../lib/api/handlers";
import { handleTelegramWebhook } from "../../lib/api/telegram-webhook";
import { asUser, createDb, newUser } from "./helpers";
import { createPgliteTelegramLinkRepository, createPgliteTelegramRepository } from "./pglite-repository";

/** Profile endpoints and the webhook, end to end against the real SQL functions. */

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
});
afterAll(async () => {
  await db.close();
});

const SECRET = "a-long-random-secret_0123456789abcdef";
const j = async (r: Response) => (await r.json()) as any;
const deps = (userId: string, botUsername: string | null = "TailrBot"): TelegramLinkDeps => ({ repo: createPgliteTelegramLinkRepository(db, userId), botUsername });

function bot() {
  const sent: { chatId: number; text: string }[] = [];
  const webhook = (text: string, tg = 4242, updateId = Math.floor(Math.random() * 1e9)) =>
    handleTelegramWebhook(
      { secret: SECRET, bot: { api: { sendMessage: async (chatId, t) => void sent.push({ chatId, text: t }) }, repo: createPgliteTelegramRepository(db), appUrl: "https://tailr.example" } },
      new Request("https://tailr.example/api/telegram/webhook", {
        method: "POST",
        headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": SECRET },
        body: JSON.stringify({ update_id: updateId, message: { message_id: 1, from: { id: tg }, chat: { id: tg, type: "private" }, text } }),
      }),
    );
  return { sent, webhook, last: () => sent[sent.length - 1]?.text ?? "" };
}

describe("Telegram settings in Profile", () => {
  it("401 for every endpoint when signed out", async () => {
    for (const r of [await handleTelegramStatus(null), await handleTelegramLinkCode(null), await handleTelegramUnlink(null)]) expect(r.status).toBe(401);
  });

  it("status: available only when the bot is set up, and not linked at first", async () => {
    const u = await newUser(db);
    expect((await j(await handleTelegramStatus(deps(u)))).data).toEqual({ available: true, linked: false, linkedAt: null });
    expect((await j(await handleTelegramStatus(deps(u, null)))).data.available).toBe(false);
  });

  it("link code: returns the code once, a deep link, and 10 minutes; never the hash", async () => {
    const u = await newUser(db);
    const r = await handleTelegramLinkCode(deps(u));
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    const { data } = await j(r);
    expect(data.code).toMatch(/^[A-HJKMNP-Z2-9]{10}$/);
    expect(data.botUsername).toBe("TailrBot");
    expect(data.deepLink).toBe(`https://t.me/TailrBot?start=${data.code}`);
    expect((new Date(data.expiresAt).getTime() - Date.now()) / 60000).toBeGreaterThan(9);
    const stored = (await db.query<{ code_hash: string }>("select code_hash from public.telegram_link_codes where user_id = $1", [u])).rows;
    expect(JSON.stringify(stored)).not.toContain(data.code);
  });

  it("link code: 503 when Telegram is off, and nothing is stored", async () => {
    const u = await newUser(db);
    const r = await handleTelegramLinkCode(deps(u, null));
    expect(r.status).toBe(503);
    expect((await j(r)).error.code).toBe("telegram_unavailable");
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.telegram_link_codes where user_id = $1", [u])).rows[0]!.n).toBe(0);
  });

  it("link code: 429 after 5 in an hour", async () => {
    const u = await newUser(db);
    for (let i = 0; i < 5; i++) expect((await handleTelegramLinkCode(deps(u))).status).toBe(200);
    const r = await handleTelegramLinkCode(deps(u));
    expect(r.status).toBe(429);
    expect((await j(r)).error.code).toBe("rate_limited");
  });

  it("the whole journey: make a code, connect in Telegram, send a slip, find the draft, disconnect", async () => {
    const u = await newUser(db);
    const stranger = await newUser(db);
    const { data } = await j(await handleTelegramLinkCode(deps(u)));
    const b = bot();

    // Before connecting, a slip is not saved.
    await b.webhook("Arsenal vs Chelsea - Arsenal to win @1.85");
    expect(b.last()).toMatch(/connect/i);

    await b.webhook(`/start ${data.code}`);
    expect(b.last()).toMatch(/connected/i);
    const status = (await j(await handleTelegramStatus(deps(u)))).data;
    expect(status).toMatchObject({ available: true, linked: true });
    expect(status.linkedAt).toMatch(/^\d{4}-/);

    await b.webhook("Bet9ja\nArsenal vs Chelsea - Arsenal to win @1.85\nLakers vs Celtics - Over 215.5 points @1.90\nTotal odds 3.52");
    const url = /https:\/\/tailr\.example\/create\?draft=([0-9a-f-]{36})/.exec(b.last());
    expect(url).not.toBeNull();
    const id = url![1];

    const mine = await asUser(db, u, async () => (await db.query<Record<string, unknown>>("select name, source_type, source_bookmaker, status from public.slip_drafts where id = $1", [id])).rows);
    expect(mine).toEqual([{ name: "Arsenal vs Chelsea +1", source_type: "pasted_text", source_bookmaker: "Bet9ja", status: "draft" }]);
    expect(await asUser(db, stranger, async () => (await db.query("select id from public.slip_drafts where id = $1", [id])).rows)).toHaveLength(0);
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.bets where user_id = $1", [u])).rows[0]!.n).toBe(0);

    // The code cannot be used a second time, by anyone.
    await bot().webhook(`/link ${data.code}`, 9999);
    expect(await createPgliteTelegramRepository(db).isLinked(9999)).toBe(false);

    // Disconnect from the app; the bot stops saving.
    expect((await j(await handleTelegramUnlink(deps(u)))).data).toEqual({ removed: true });
    expect((await j(await handleTelegramUnlink(deps(u)))).data).toEqual({ removed: false });
    expect((await j(await handleTelegramStatus(deps(u)))).data.linked).toBe(false);
    await b.webhook("Arsenal vs Chelsea - Arsenal to win @1.85");
    expect(b.last()).toMatch(/connect/i);
  });

  it("disconnecting from Telegram with /unlink shows in the app", async () => {
    const u = await newUser(db);
    const { data } = await j(await handleTelegramLinkCode(deps(u)));
    const b = bot();
    await b.webhook(`/link ${data.code}`, 7001);
    expect((await j(await handleTelegramStatus(deps(u)))).data.linked).toBe(true);
    await b.webhook("/unlink", 7001);
    expect((await j(await handleTelegramStatus(deps(u)))).data.linked).toBe(false);
  });

  it("one person cannot see or remove another's connection", async () => {
    const a = await newUser(db);
    const other = await newUser(db);
    const { data } = await j(await handleTelegramLinkCode(deps(a)));
    await bot().webhook(`/link ${data.code}`, 7002);
    expect((await j(await handleTelegramStatus(deps(other)))).data.linked).toBe(false);
    expect((await j(await handleTelegramUnlink(deps(other)))).data.removed).toBe(false);
    expect((await j(await handleTelegramStatus(deps(a)))).data.linked).toBe(true);
  });

  it("repeating the same Telegram update does not save a second draft", async () => {
    const u = await newUser(db);
    const { data } = await j(await handleTelegramLinkCode(deps(u)));
    const b = bot();
    await b.webhook(`/link ${data.code}`, 7003);
    await b.webhook("Arsenal vs Chelsea - Arsenal to win @1.85", 7003, 555001);
    await b.webhook("Arsenal vs Chelsea - Arsenal to win @1.85", 7003, 555001);
    expect((await db.query<{ n: number }>("select count(*)::int as n from public.slip_drafts where user_id = $1", [u])).rows[0]!.n).toBe(1);
  });
});
