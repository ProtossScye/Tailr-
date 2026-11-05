import { validatePasteText } from "../services/slip-parse";
import type { ParsedSlip } from "../parser/parse-slip-text";
import { groundAiSlip } from "./ground";
import { REPORT_SLIP_TOOL, SLIP_SYSTEM_PROMPT, validateAiSlip, wrapPastedText } from "./slip-schema";
import { AiFailedError, AiProviderError, AiRateLimitedError, AiUnavailableError, type AiProvider } from "./types";
import type { AiCallStatus, AiUsageRepository } from "./usage";

export interface ReadSlipAiDeps {
  /** null when AI reading is not switched on. */
  provider: AiProvider | null;
  usage: AiUsageRepository;
  timeoutMs: number;
  now?: () => number;
}

const MAX_OUTPUT_TOKENS = 4000;

/**
 * Reads a pasted slip with AI. The answer is treated as an untrusted draft: checked against a schema,
 * then grounded in the pasted text. Limits are checked before any provider call. The pasted text and
 * the answer are never stored or logged; only sizes, model, token counts and the outcome are.
 */
export async function readSlipWithAi(deps: ReadSlipAiDeps, input: unknown): Promise<ParsedSlip> {
  const text = validatePasteText(input);
  if (!deps.provider) throw new AiUnavailableError();

  const now = deps.now ?? Date.now;
  const callId = await deps.usage.begin("read_slip", [...text].length);
  if (callId === null) throw new AiRateLimitedError();

  const started = now();
  let status: AiCallStatus = "ok";
  let model: string | null = null;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let result: ParsedSlip | null = null;

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AiProviderError("timeout", "The AI provider did not answer in time"));
    }, deps.timeoutMs);
  });

  try {
    const answer = await Promise.race([
      deps.provider.callTool({
        system: SLIP_SYSTEM_PROMPT,
        user: wrapPastedText(text),
        toolName: REPORT_SLIP_TOOL.name,
        toolDescription: REPORT_SLIP_TOOL.description,
        inputSchema: REPORT_SLIP_TOOL.inputSchema as unknown as Record<string, unknown>,
        maxTokens: MAX_OUTPUT_TOKENS,
        signal: controller.signal,
      }),
      timeout,
    ]);
    model = answer.model;
    inputTokens = answer.inputTokens;
    outputTokens = answer.outputTokens;
    const checked = validateAiSlip(answer.output);
    if (!checked.ok) status = "invalid_output";
    else result = groundAiSlip(checked.value, text);
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
