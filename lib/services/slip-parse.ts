import { parseSlipText, type ParsedSlip } from "../parser/parse-slip-text";
import { Issues } from "./validate";

export const MAX_PASTE_CHARS = 10_000;

/**
 * Reads pasted slip text into a draft the person can review. Stores nothing and looks nothing up:
 * the text is read in memory and dropped, and the result is only as good as what the text says.
 * Saving a slip, and recording a bet, remain separate explicit steps.
 */
export function readSlipText(input: unknown): ParsedSlip {
  return parseSlipText(validatePasteText(input));
}

/** The pasted text from a request body, or a ValidationError. Shared by the rule-based and AI readers. */
export function validatePasteText(input: unknown): string {
  const issues = new Issues();
  const text = typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>).text : undefined;
  if (typeof text !== "string" || text.trim() === "") {
    issues.add("text", "Paste the slip text to read");
  } else if ([...text].length > MAX_PASTE_CHARS) {
    issues.add("text", `Keep the pasted text under ${MAX_PASTE_CHARS.toLocaleString("en-US")} characters`);
  }
  issues.throwIfAny();
  return text as string;
}
