import {
  createSupabaseBetRepository,
  createSupabasePreferencesRepository,
  createSupabaseSlipRepository,
  type PreferencesServiceDeps,
  type ServiceDeps,
  type SlipServiceDeps,
} from "../services";
import { createClient } from "../supabase/server";
import { createProviderFromEnv, timeoutFromEnv } from "../ai/config";
import { createSupabaseAiUsageRepository } from "../ai/usage";
import type { ReadSlipAiDeps } from "../ai/read-slip";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createTelegramApi } from "../telegram/client";
import { telegramConfigFromEnv } from "../telegram/config";
import { createSupabaseTelegramLinkRepository, createSupabaseTelegramRepository } from "../telegram/repository";
import type { TelegramLinkDeps } from "./handlers";
import type { WebhookDeps } from "./telegram-webhook";

/**
 * Builds the service dependencies for the current request, acting AS the signed-in user
 * (publishable key + the user's cookies; row-level security applies). Returns null if not signed in.
 */
export async function getDeps(): Promise<ServiceDeps | null> {
  const supabase = await createClient();
  // getClaims() verifies the token; getSession() would only read the cookie.
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return null;
  return { repo: createSupabaseBetRepository(supabase) };
}

/** Same as getDeps, for slip drafts. Also null when not signed in. */
export async function getSlipDeps(): Promise<SlipServiceDeps | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return null;
  return { repo: createSupabaseSlipRepository(supabase) };
}

/** Same as getDeps, for preferences. Also null when not signed in. */
export async function getPreferencesDeps(): Promise<PreferencesServiceDeps | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return null;
  return { repo: createSupabasePreferencesRepository(supabase) };
}

/** For AI reading. The provider key stays on the server; null when not signed in. The provider is null when no key is set. */
export async function getAiDeps(): Promise<ReadSlipAiDeps | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return null;
  return { provider: createProviderFromEnv(), usage: createSupabaseAiUsageRepository(supabase), timeoutMs: timeoutFromEnv(), imageTimeoutMs: Math.max(timeoutFromEnv(), 30_000) };
}

/** For the Profile page's Telegram settings. Null when not signed in; `botUsername` is null when Telegram is off. */
export async function getTelegramLinkDeps(): Promise<TelegramLinkDeps | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return null;
  return { repo: createSupabaseTelegramLinkRepository(supabase), botUsername: telegramConfigFromEnv()?.botUsername ?? null };
}

/**
 * For the Telegram webhook. There is no signed-in person here, so the database is reached with the
 * server's secret key (never sent to a browser), and only through the telegram_* functions.
 * Null unless Telegram is fully set up, in which case the webhook answers 503.
 */
export function getTelegramWebhookDeps(): WebhookDeps | null {
  const config = telegramConfigFromEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!config || !url || !secretKey) return null;
  const client = createSupabaseClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return { secret: config.secret, bot: { api: createTelegramApi(config.token), repo: createSupabaseTelegramRepository(client), appUrl: config.appUrl } };
}
