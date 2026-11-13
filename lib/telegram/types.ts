import type { NewSelectionRecord } from "../services/repository";

/** The few fields of a Telegram update the bot reads. Everything else is ignored. */
export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; is_bot?: boolean };
    chat: { id: number; type: string };
    text?: string;
    photo?: unknown[];
    document?: unknown;
  };
}

/** Sends plain text. No formatting mode is ever used, so nothing a person types can be misread as markup. */
export interface TelegramApi {
  sendMessage(chatId: number, text: string): Promise<void>;
}

export type AcceptResult = "ok" | "duplicate" | "limited";
export type RedeemResult = "linked" | "invalid" | "limited" | "taken";

/** Everything the bot may do with the database. There is deliberately nothing here that reads or writes a bet. */
export interface TelegramRepository {
  acceptUpdate(updateId: number, telegramUserId: number): Promise<AcceptResult>;
  redeemLink(codeHash: string, telegramUserId: number, chatId: number): Promise<RedeemResult>;
  isLinked(telegramUserId: number): Promise<boolean>;
  unlink(telegramUserId: number): Promise<boolean>;
  /** The new draft's id, or null when this Telegram account is not connected. */
  createDraft(telegramUserId: number, slip: { name: string; source_bookmaker: string | null }, selections: NewSelectionRecord[]): Promise<string | null>;
}

export interface BotDeps {
  api: TelegramApi;
  repo: TelegramRepository;
  /** The app's web address, with no trailing slash, used for the review link. */
  appUrl: string;
}
