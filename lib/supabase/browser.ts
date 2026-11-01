import { createBrowserClient } from "@supabase/ssr";
import { supabaseEnv } from "./env";

/** For code that runs in the browser. Not needed yet; the frontend should call /api routes instead. */
export function createClient() {
  const { url, key } = supabaseEnv();
  return createBrowserClient(url, key);
}
