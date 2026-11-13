export interface TelegramConfig {
  token: string;
  /** Telegram sends this back on every webhook call, so we know the call is from Telegram. */
  secret: string;
  botUsername: string;
  /** The web address of the app, with no path and no trailing slash. */
  appUrl: string;
}

type Env = Record<string, string | undefined>;

const TOKEN = /^\d{5,15}:[A-Za-z0-9_-]{30,}$/;
const SECRET = /^[A-Za-z0-9_-]{24,256}$/;
const USERNAME = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;

/**
 * Read from the server's environment. Returns null unless every setting is present and well formed, in
 * which case Telegram is simply off (the webhook answers 503 and the app does not offer Connect).
 * Server-side only: none of these may be a NEXT_PUBLIC variable.
 */
export function telegramConfigFromEnv(env: Env = process.env): TelegramConfig | null {
  const token = env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  const secret = env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? "";
  const botUsername = (env.TELEGRAM_BOT_USERNAME?.trim() ?? "").replace(/^@/, "");
  const appUrl = originOf(env.TAILR_APP_URL?.trim() ?? "");
  if (!TOKEN.test(token) || !SECRET.test(secret) || !USERNAME.test(botUsername) || appUrl === null) return null;
  return { token, secret, botUsername, appUrl };
}

function originOf(value: string): string | null {
  try {
    const url = new URL(value);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
    return url.origin;
  } catch {
    return null;
  }
}
