import { createHash, timingSafeEqual } from "node:crypto";

type Env = Record<string, string | undefined>;

/**
 * The shared invite code for the private beta, or null when sign-up is open. Set TAILR_BETA_CODE on
 * the server to turn the invite requirement on; clear it to open sign-up again.
 *
 * This keeps casual visitors out of the sign-up form. It is not a hard wall: Supabase's own sign-up
 * endpoint is reachable with the app's public key unless "Allow new users to sign up" is switched off
 * in the Supabase dashboard (then testers are added from the dashboard instead).
 */
export function betaCodeFromEnv(env: Env = process.env): string | null {
  const code = env.TAILR_BETA_CODE?.trim();
  return code ? code : null;
}

const tidy = (value: string) => value.replace(/[\s-]/g, "").toLowerCase();
const digest = (value: string) => createHash("sha256").update(value).digest();

/** The message to show when the invite code is missing or wrong, or null when the person may sign up. */
export function betaCodeProblem(required: string | null, given: unknown): string | null {
  if (required === null) return null;
  const typed = typeof given === "string" ? tidy(given) : "";
  if (typed === "") return "Tailr is invite-only while we test. Enter the invite code you were sent.";
  if (!timingSafeEqual(digest(typed), digest(tidy(required)))) return "That invite code is not right. Check it and try again.";
  return null;
}
