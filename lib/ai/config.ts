import { createAnthropicProvider } from "./anthropic";
import type { AiProvider } from "./types";

export const DEFAULT_MODEL = "claude-sonnet-5-5";
export const DEFAULT_TIMEOUT_MS = 20_000;

type Env = Record<string, string | undefined>;

/** null when no key is set: AI reading is then simply off. Server-side only; never a NEXT_PUBLIC variable. */
export function createProviderFromEnv(env: Env = process.env): AiProvider | null {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  return createAnthropicProvider({ apiKey, model: env.TAILR_AI_MODEL?.trim() || DEFAULT_MODEL });
}

/** A whole number of milliseconds from 1,000 to 120,000, or the default. */
export function timeoutFromEnv(env: Env = process.env): number {
  const n = Number(env.TAILR_AI_TIMEOUT_MS);
  return Number.isInteger(n) && n >= 1_000 && n <= 120_000 ? n : DEFAULT_TIMEOUT_MS;
}
