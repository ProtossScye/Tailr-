/**
 * Shapes of API responses, for the frontend to import (types only, no runtime code).
 * Over JSON, every Date becomes an ISO string; money stays integer minor units.
 * The service types describe the same fields with Date objects, so use Serialized<T>.
 */
import type { ParsedSlip } from "../parser/parse-slip-text";
import type { BetView, BetPage, DashboardStats, PreferencesView, SlipPage, SlipView } from "../services/types";

export type Serialized<T> = T extends Date
  ? string
  : T extends readonly (infer U)[]
    ? Serialized<U>[]
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T;

export type ApiErrorCode = "unauthenticated" | "validation_failed" | "not_found" | "invalid_json" | "server_error" | "rate_limited" | "ai_unavailable" | "ai_failed" | "invalid_upload" | "too_large" | "telegram_unavailable" | "unauthorized";

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string; issues?: { field: string; message: string }[] };
}

export type ApiOk<T> = { data: T };

export type BetJson = Serialized<BetView>;
export type BetPageJson = Serialized<BetPage>;
export type DashboardJson = Serialized<DashboardStats>;
export type SlipJson = Serialized<SlipView>;
export type SlipPageJson = Serialized<SlipPage>;
export type PreferencesJson = Serialized<PreferencesView>;
export type ParsedSlipJson = ParsedSlip;
/** A screenshot read: the text the AI copied from it, and what the text reader made of that text. */
export interface ImageReadJson {
  text: string;
  slip: ParsedSlip;
}

/** Whether Telegram is switched on, and whether this person has connected it. */
export interface TelegramStatusJson {
  available: boolean;
  linked: boolean;
  /** When they connected, or null. */
  linkedAt: string | null;
}

/** A one-time code to connect Telegram. Shown once; only its hash is stored. */
export interface TelegramLinkCodeJson {
  code: string;
  expiresAt: string;
  botUsername: string;
  /** Opens the bot with the code filled in. */
  deepLink: string;
}

export interface AiStatusJson {
  available: boolean;
}
