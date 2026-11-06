import { AiFailedError, AiProviderError, AiRateLimitedError, AiUnavailableError, type AiProvider, type AiToolRequest } from "./types";
import type { AiCallStatus, AiPurpose, AiUsageRepository } from "./usage";

export interface AiCallDeps {
  /** null when AI reading is not switched on. */
  provider: AiProvider | null;
  usage: AiUsageRepository;
  timeoutMs: number;
  /** Image reads take longer, so they may be given more time. Falls back to timeoutMs. */
  imageTimeoutMs?: number;
  now?: () => number;
}

/**
 * One AI call with everything around it that must never be skipped: switched on? within the
 * person's allowance? timed out and aborted if slow? outcome logged (sizes, tokens, status only)?
 * `interpret` turns the untrusted answer into a result, or returns null if it is unusable.
 * The input and the answer are never stored or logged here.
 */
export async function runAiCall<T>(
  deps: AiCallDeps,
  purpose: AiPurpose,
  inputSize: number,
  request: Omit<AiToolRequest, "signal">,
  interpret: (output: unknown) => T | null,
  timeoutMs: number = deps.timeoutMs,
): Promise<T> {
  if (!deps.provider) throw new AiUnavailableError();

  const now = deps.now ?? Date.now;
  const callId = await deps.usage.begin(purpose, inputSize);
  if (callId === null) throw new AiRateLimitedError();

  const started = now();
  let status: AiCallStatus = "ok";
  let model: string | null = null;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let result: T | null = null;

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AiProviderError("timeout", "The AI provider did not answer in time"));
    }, timeoutMs);
  });

  try {
    const answer = await Promise.race([deps.provider.callTool({ ...request, signal: controller.signal }), timeout]);
    model = answer.model;
    inputTokens = answer.inputTokens;
    outputTokens = answer.outputTokens;
    result = interpret(answer.output);
    if (result === null) status = "invalid_output";
  } catch (error) {
    status = error instanceof AiProviderError ? error.kind : "provider_error";
  } finally {
    clearTimeout(timer);
  }

  // The result must not be lost because the log write failed.
  try {
    await deps.usage.finish(callId, { status, model, inputTokens, outputTokens, latencyMs: now() - started });
  } catch {
    /* best effort */
  }

  if (status !== "ok" || result === null) throw new AiFailedError(status === "ok" ? "invalid_output" : status);
  return result;
}
