import { describe, expect, it } from "vitest";
import { TelegramApiError, createTelegramApi } from "./client";

const TOKEN = "123456789:AAH-abcdefghijklmnopqrstuvwxyz012345";

describe("createTelegramApi", () => {
  it("posts plain text to sendMessage, with no formatting mode and no link previews", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const api = createTelegramApi(TOKEN, { fetch: (async (url: string, init: RequestInit) => ((seen = { url, init }), new Response("{}", { status: 200 }))) as never });
    await api.sendMessage(4242, "Hello <b>there</b> *x*");
    expect(seen!.url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    expect(seen!.init.method).toBe("POST");
    expect(JSON.parse(seen!.init.body as string)).toEqual({ chat_id: 4242, text: "Hello <b>there</b> *x*", disable_web_page_preview: true });
    expect(seen!.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("fails with the status only: no token, no address, no text", async () => {
    const api = createTelegramApi(TOKEN, { fetch: (async () => new Response("secret body", { status: 403 })) as never });
    const error = await api.sendMessage(1, "private text").catch((e) => e);
    expect(error).toBeInstanceOf(TelegramApiError);
    expect(error.status).toBe(403);
    expect(`${error.message} ${error.stack}`).not.toMatch(/AAH|private text|secret body|api\.telegram/);
  });

  it("fails cleanly when Telegram cannot be reached, without leaking the token from the underlying error", async () => {
    const api = createTelegramApi(TOKEN, { fetch: (async () => Promise.reject(new Error(`getaddrinfo failed for https://api.telegram.org/bot${TOKEN}/sendMessage`))) as never });
    const error = await api.sendMessage(1, "x").catch((e) => e);
    expect(error).toBeInstanceOf(TelegramApiError);
    expect(error.status).toBeNull();
    expect(`${error.message} ${error.stack}`).not.toContain("AAH");
  });

  it("gives up after the timeout", async () => {
    const api = createTelegramApi(TOKEN, {
      timeoutMs: 20,
      fetch: ((_: string, init: RequestInit) => new Promise((_res, rej) => init.signal!.addEventListener("abort", () => rej(new Error("aborted"))))) as never,
    });
    await expect(api.sendMessage(1, "x")).rejects.toBeInstanceOf(TelegramApiError);
  });
});
