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
