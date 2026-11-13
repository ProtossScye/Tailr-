import { describe, expect, it } from "vitest";
import { telegramConfigFromEnv } from "./config";

const good = {
  TELEGRAM_BOT_TOKEN: "123456789:AAH-abcdefghijklmnopqrstuvwxyz012345",
  TELEGRAM_WEBHOOK_SECRET: "a-long-random-secret_0123456789abcdef",
  TELEGRAM_BOT_USERNAME: "TailrBot",
  TAILR_APP_URL: "https://tailr.example.com",
};

describe("telegramConfigFromEnv", () => {
  it("reads a complete, well formed setup", () => {
    expect(telegramConfigFromEnv(good)).toEqual({ token: good.TELEGRAM_BOT_TOKEN, secret: good.TELEGRAM_WEBHOOK_SECRET, botUsername: "TailrBot", appUrl: "https://tailr.example.com" });
  });

  it("is off when any one setting is missing or blank", () => {
    for (const key of Object.keys(good)) {
      expect(telegramConfigFromEnv({ ...good, [key]: undefined }), key).toBeNull();
      expect(telegramConfigFromEnv({ ...good, [key]: "   " }), key).toBeNull();
    }
    expect(telegramConfigFromEnv({})).toBeNull();
  });

  it("is off for a token, secret or username that is the wrong shape", () => {
    expect(telegramConfigFromEnv({ ...good, TELEGRAM_BOT_TOKEN: "not-a-token" })).toBeNull();
    expect(telegramConfigFromEnv({ ...good, TELEGRAM_WEBHOOK_SECRET: "short" })).toBeNull();
    expect(telegramConfigFromEnv({ ...good, TELEGRAM_WEBHOOK_SECRET: "has spaces and is long enough to pass length" })).toBeNull();
    expect(telegramConfigFromEnv({ ...good, TELEGRAM_BOT_USERNAME: "ab" })).toBeNull();
    expect(telegramConfigFromEnv({ ...good, TELEGRAM_BOT_USERNAME: "bad name" })).toBeNull();
  });

  it("accepts a username written with @ and trims stray spaces", () => {
    expect(telegramConfigFromEnv({ ...good, TELEGRAM_BOT_USERNAME: " @TailrBot " })?.botUsername).toBe("TailrBot");
  });

  it("keeps only the origin of the app address, and requires https except on localhost", () => {
    expect(telegramConfigFromEnv({ ...good, TAILR_APP_URL: "https://tailr.example.com/some/path/?x=1" })?.appUrl).toBe("https://tailr.example.com");
    expect(telegramConfigFromEnv({ ...good, TAILR_APP_URL: "http://localhost:3000" })?.appUrl).toBe("http://localhost:3000");
    expect(telegramConfigFromEnv({ ...good, TAILR_APP_URL: "http://tailr.example.com" })).toBeNull();
    expect(telegramConfigFromEnv({ ...good, TAILR_APP_URL: "javascript:alert(1)" })).toBeNull();
    expect(telegramConfigFromEnv({ ...good, TAILR_APP_URL: "tailr.example.com" })).toBeNull();
  });
});
