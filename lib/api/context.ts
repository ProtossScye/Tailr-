import { createSupabaseBetRepository, createSupabaseSlipRepository, type ServiceDeps, type SlipServiceDeps } from "../services";
import { createClient } from "../supabase/server";

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
