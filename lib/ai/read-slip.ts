import { validatePasteText } from "../services/slip-parse";
import type { ParsedSlip } from "../parser/parse-slip-text";
import { runAiCall, type AiCallDeps } from "./call";
import { groundAiSlip } from "./ground";
import { REPORT_SLIP_TOOL, SLIP_SYSTEM_PROMPT, validateAiSlip, wrapPastedText } from "./slip-schema";
import { AiUnavailableError } from "./types";

export type ReadSlipAiDeps = AiCallDeps;

const MAX_OUTPUT_TOKENS = 4000;

/**
 * Reads a pasted slip with AI. The answer is treated as an untrusted draft: checked against a schema,
 * then grounded in the pasted text. Limits are checked before any provider call. The pasted text and
 * the answer are never stored or logged; only sizes, model, token counts and the outcome are.
 */
export async function readSlipWithAi(deps: ReadSlipAiDeps, input: unknown): Promise<ParsedSlip> {
  const text = validatePasteText(input);
  if (!deps.provider) throw new AiUnavailableError();
  return runAiCall(
    deps,
    "read_slip",
    [...text].length,
    {
      system: SLIP_SYSTEM_PROMPT,
      user: wrapPastedText(text),
      toolName: REPORT_SLIP_TOOL.name,
      toolDescription: REPORT_SLIP_TOOL.description,
      inputSchema: REPORT_SLIP_TOOL.inputSchema as unknown as Record<string, unknown>,
      maxTokens: MAX_OUTPUT_TOKENS,
    },
    (output) => {
      const checked = validateAiSlip(output);
      return checked.ok ? groundAiSlip(checked.value, text) : null;
    },
  );
}
