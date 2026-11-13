import { describe, expect, it, vi } from "vitest";

vi.mock("../telegram/bot", () => ({ handleUpdate: async () => Promise.reject(new Error("crashed while reading SECRET SLIP TEXT")) }));

import { handleTelegramWebhook } from "./telegram-webhook";

describe("the webhook when the bot itself crashes", () => {
  it("still answers 200 and logs a fixed line, never the update or the error text", async () => {
    const logged: unknown[][] = [];
    const original = console.error;
    console.error = (...a: unknown[]) => void logged.push(a);
    try {
      const r = await handleTelegramWebhook(
        { secret: "s".repeat(30), bot: {} as never },
        new Request("https://x/", { method: "POST", headers: { "x-telegram-bot-api-secret-token": "s".repeat(30) }, body: JSON.stringify({ update_id: 1, message: { text: "SECRET SLIP TEXT" } }) }),
      );
      expect(r.status).toBe(200);
      expect(logged).toEqual([["[telegram] could not handle an update"]]);
    } finally {
      console.error = original;
    }
  });
});
