import { describe, expect, it } from "vitest";
import { handleTelegramWebhook, type WebhookDeps } from "./telegram-webhook";
import type { TelegramRepository } from "../telegram/types";

const SECRET = "a-long-random-secret_0123456789abcdef";

function setup(opts: { failRepo?: boolean } = {}) {
  const sent: string[] = [];
  const accepted: number[] = [];
  const repo: TelegramRepository = {
    acceptUpdate: async (id) => {
      accepted.push(id);
      if (opts.failRepo) throw new Error("db down");
      return "ok";
    },
    redeemLink: async () => "invalid",
    isLinked: async () => false,
    unlink: async () => false,
    createDraft: async () => null,
  };
  const deps: WebhookDeps = { secret: SECRET, bot: { api: { sendMessage: async (_c, t) => void sent.push(t) }, repo, appUrl: "https://tailr.example" } };
  return { deps, sent, accepted };
}

const update = { update_id: 9, message: { message_id: 1, from: { id: 42 }, chat: { id: 4242, type: "private" }, text: "/help" } };
const call = (body: unknown, headers: Record<string, string> = { "x-telegram-bot-api-secret-token": SECRET }) =>
  new Request("https://tailr.example/api/telegram/webhook", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
const j = async (r: Response) => (await r.json()) as any;

describe("the Telegram webhook", () => {
  it("is off (503) when Telegram is not set up", async () => {
    const r = await handleTelegramWebhook(null, call(update));
    expect(r.status).toBe(503);
    expect((await j(r)).error.code).toBe("telegram_unavailable");
  });

  it("refuses a call with a missing, wrong or near-miss secret, and never reads the update", async () => {
    for (const headers of [{} as Record<string, string>, { "x-telegram-bot-api-secret-token": "" }, { "x-telegram-bot-api-secret-token": "wrong" }, { "x-telegram-bot-api-secret-token": `${SECRET}x` }, { "x-telegram-bot-api-secret-token": SECRET.slice(0, -1) }]) {
      const { deps, sent, accepted } = setup();
      const r = await handleTelegramWebhook(deps, call(update, headers));
      expect(r.status, JSON.stringify(headers)).toBe(401);
      expect((await j(r)).error.code).toBe("unauthorized");
      expect(sent).toEqual([]);
      expect(accepted).toEqual([]);
    }
  });

  it("does not read the body when the secret is wrong", async () => {
    const { deps } = setup();
    let read = false;
    const request = new Request("https://x/", { method: "POST", headers: { "x-telegram-bot-api-secret-token": "wrong" }, body: "{}" });
    Object.defineProperty(request, "body", { get: () => ((read = true), null) });
    await handleTelegramWebhook(deps, request);
    expect(read).toBe(false);
  });

  it("hands a valid update to the bot and answers 200, no-store", async () => {
    const { deps, sent, accepted } = setup();
    const r = await handleTelegramWebhook(deps, call(update));
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(await j(r)).toEqual({ ok: true });
    expect(accepted).toEqual([9]);
    expect(sent).toHaveLength(1);
  });

  it("answers 400 for a body that is not JSON or not an update", async () => {
    const { deps } = setup();
    for (const body of ["not json", "[]", "null", '"text"', "{}", '{"update_id":"7"}', '{"update_id":1.5}']) {
      expect((await handleTelegramWebhook(deps, call(body))).status, body).toBe(400);
    }
  });

  it("answers 413 for an update over 256 KB, cut off while reading", async () => {
    const { deps, accepted } = setup();
    const big = JSON.stringify({ update_id: 1, message: { text: "x".repeat(300 * 1024) } });
    expect((await handleTelegramWebhook(deps, call(big))).status).toBe(413);
    expect(accepted).toEqual([]);
  });

  it("still answers 200 when handling the message fails, so Telegram does not resend it", async () => {
    const { deps, sent } = setup({ failRepo: true });
    const r = await handleTelegramWebhook(deps, call(update));
    expect(r.status).toBe(200);
    expect(sent[0]).toMatch(/something went wrong/i);
  });

  it("still answers 200 for an update with an odd shape, and logs nothing from it", async () => {
    const { deps } = setup();
    const logged: unknown[][] = [];
    const original = console.error;
    console.error = (...a: unknown[]) => void logged.push(a);
    try {
      const r = await handleTelegramWebhook(deps, call({ update_id: 5, message: { text: "SECRET SLIP TEXT" } }));
      expect(r.status).toBe(200);
      expect(JSON.stringify(logged)).not.toContain("SECRET SLIP TEXT");
    } finally {
      console.error = original;
    }
  });
});
