import { createHash, timingSafeEqual } from "node:crypto";
import { handleUpdate } from "../telegram/bot";
import type { BotDeps, TelegramUpdate } from "../telegram/types";
import { readBodyLimited } from "./body";

export interface WebhookDeps {
  /** The secret Telegram was told to send with every call. */
  secret: string;
  bot: BotDeps;
}

const MAX_UPDATE_BYTES = 256 * 1024;

function reply(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
const error = (status: number, code: string, message: string) => reply(status, { error: { code, message } });

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Telegram's calls carry no session, so the shared secret is the only thing that says a call is really from Telegram. */
function secretMatches(sent: string | null, expected: string): boolean {
  return sent !== null && timingSafeEqual(digest(sent), digest(expected));
}

/**
 * The Telegram webhook. Anything without the right secret is refused before its body is read. Once
 * the call is accepted the answer is always 200, even when handling the message failed, because a
 * non-200 makes Telegram resend the same message over and over. Nothing from the message is logged.
 */
export async function handleTelegramWebhook(deps: WebhookDeps | null, request: Request): Promise<Response> {
  if (deps === null) return error(503, "telegram_unavailable", "Telegram is not switched on.");
  if (!secretMatches(request.headers.get("x-telegram-bot-api-secret-token"), deps.secret)) {
    return error(401, "unauthorized", "Not allowed.");
  }

  const bytes = await readBodyLimited(request, MAX_UPDATE_BYTES);
  if (bytes === null) return error(413, "too_large", "That update is too large.");

  let update: unknown;
  try {
    update = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return error(400, "invalid_json", "Send a JSON update.");
  }
  if (typeof update !== "object" || update === null || !Number.isInteger((update as { update_id?: unknown }).update_id)) {
    return error(400, "invalid_json", "Send a Telegram update.");
  }

  try {
    await handleUpdate(deps.bot, update as TelegramUpdate);
  } catch {
    console.error("[telegram] could not handle an update");
  }
  return reply(200, { ok: true });
}
