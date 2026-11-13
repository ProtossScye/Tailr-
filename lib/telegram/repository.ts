import type { SupabaseClient } from "@supabase/supabase-js";
import { RepositoryError } from "../services/errors";
import type { AcceptResult, RedeemResult, TelegramRepository } from "./types";

const ACCEPT: readonly string[] = ["ok", "duplicate", "limited"];
const REDEEM: readonly string[] = ["linked", "invalid", "limited", "taken"];

function oneOf<T extends string>(value: unknown, allowed: readonly string[], where: string): T {
  if (typeof value !== "string" || !allowed.includes(value)) throw new RepositoryError(where, "Unexpected answer");
  return value as T;
}

/**
 * The bot's database access. `client` must be built with the server's secret key, and this module
 * only ever calls the telegram_* functions (see the migration), each of which acts for one Telegram user.
 */
export function createSupabaseTelegramRepository(client: SupabaseClient): TelegramRepository {
  const call = async (fn: string, args: Record<string, unknown>): Promise<unknown> => {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw new RepositoryError(fn, error);
    return data;
  };
  return {
    async acceptUpdate(updateId, telegramUserId) {
      return oneOf<AcceptResult>(await call("telegram_accept_update", { p_update_id: updateId, p_telegram_user_id: telegramUserId }), ACCEPT, "telegram_accept_update");
    },
    async redeemLink(codeHash, telegramUserId, chatId) {
      return oneOf<RedeemResult>(await call("telegram_redeem_link", { p_code_hash: codeHash, p_telegram_user_id: telegramUserId, p_chat_id: chatId }), REDEEM, "telegram_redeem_link");
    },
    async isLinked(telegramUserId) {
      return (await call("telegram_is_linked", { p_telegram_user_id: telegramUserId })) === true;
    },
    async unlink(telegramUserId) {
      return (await call("telegram_unlink", { p_telegram_user_id: telegramUserId })) === true;
    },
    async createDraft(telegramUserId, slip, selections) {
      const data = await call("telegram_create_draft", { p_telegram_user_id: telegramUserId, p_slip: slip, p_selections: selections });
      if (data === null) return null;
      if (typeof data !== "string") throw new RepositoryError("telegram_create_draft", "No id returned");
      return data;
    },
  };
}

/** What the signed-in person's Profile page can do about their own Telegram connection. */
export interface TelegramLinkRepository {
  /** When this person connected Telegram, or null. */
  getLink(): Promise<{ linkedAt: string } | null>;
  /** Stores the hash of a new code. The time it expires, or null when they have made too many codes this hour. */
  createCode(codeHash: string): Promise<string | null>;
  /** true if a connection was removed. */
  removeLink(): Promise<boolean>;
}

/** `client` is the signed-in person's own client, so row-level security limits every call to their own rows. */
export function createSupabaseTelegramLinkRepository(client: SupabaseClient): TelegramLinkRepository {
  return {
    async getLink() {
      const { data, error } = await client.from("telegram_links").select("linked_at").maybeSingle();
      if (error) throw new RepositoryError("telegram_links", error);
      return data ? { linkedAt: String((data as { linked_at: unknown }).linked_at) } : null;
    },
    async createCode(codeHash) {
      const { data, error } = await client.rpc("create_telegram_link_code", { p_code_hash: codeHash });
      if (error) throw new RepositoryError("create_telegram_link_code", error);
      return typeof data === "string" ? data : null;
    },
    async removeLink() {
      const { data, error } = await client.from("telegram_links").delete().not("id", "is", null).select("id");
      if (error) throw new RepositoryError("telegram_links", error);
      return Array.isArray(data) && data.length > 0;
    },
  };
}
