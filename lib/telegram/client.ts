import type { TelegramApi } from "./types";

/** A failed call to Telegram. Carries only the status, never the address (which contains the bot token) or the text. */
export class TelegramApiError extends Error {
  readonly status: number | null;
  constructor(status: number | null) {
    super(status === null ? "Telegram could not be reached" : `Telegram answered ${status}`);
    this.name = "TelegramApiError";
    this.status = status;
  }
}

export function createTelegramApi(token: string, options: { fetch?: typeof fetch; timeoutMs?: number } = {}): TelegramApi {
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  return {
    async sendMessage(chatId, text) {
      let response: Response;
      try {
        response = await doFetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          // No parse_mode: the text goes out exactly as written, and link previews are off.
          body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new TelegramApiError(null);
      }
      if (!response.ok) throw new TelegramApiError(response.status);
    },
  };
}
