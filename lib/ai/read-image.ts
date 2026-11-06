import { parseSlipText, type ParsedSlip } from "../parser/parse-slip-text";
import { ValidationError } from "../services/errors";
import { runAiCall, type AiCallDeps } from "./call";
import { MAX_IMAGE_BYTES, detectImageType, toBase64 } from "./image";
import { IMAGE_SYSTEM_PROMPT, IMAGE_USER_PROMPT, TRANSCRIBE_TOOL, validateTranscription } from "./image-schema";
import { AiUnavailableError } from "./types";

export interface ImageReadResult {
  /** The text the AI copied from the screenshot. Shown to the person to check and correct. */
  text: string;
  /** What Tailr's text reader made of that text. */
  slip: ParsedSlip;
}

const MAX_OUTPUT_TOKENS = 3000;
const SCREENSHOT_NOTE = "Read from your screenshot by AI. Compare every line with the image, because it can misread small or blurry text.";

/**
 * Reads a screenshot of a slip. The AI only copies out the text it can see; Tailr's ordinary text
 * reader then reads that text, so no odds, fixtures, markets or booking codes can be invented. Nothing
 * from an AI read is rated "high". The image is not stored or logged: only its size, the model,
 * token counts and the outcome are recorded.
 */
export async function readSlipImage(deps: AiCallDeps, input: { bytes: Uint8Array }): Promise<ImageReadResult> {
  const { bytes } = input;
  if (bytes.length > MAX_IMAGE_BYTES) throw new ValidationError([{ field: "image", message: "That image is too large." }]);
  const mediaType = detectImageType(bytes);
  if (mediaType === null) throw new ValidationError([{ field: "image", message: "Use a JPG, PNG or WebP image." }]);
  if (!deps.provider) throw new AiUnavailableError();

  const transcription = await runAiCall(
    deps,
    "read_image",
    bytes.length,
    {
      system: IMAGE_SYSTEM_PROMPT,
      user: IMAGE_USER_PROMPT,
      toolName: TRANSCRIBE_TOOL.name,
      toolDescription: TRANSCRIBE_TOOL.description,
      inputSchema: TRANSCRIBE_TOOL.inputSchema as unknown as Record<string, unknown>,
      maxTokens: MAX_OUTPUT_TOKENS,
      images: [{ mediaType, data: toBase64(bytes) }],
    },
    (output) => {
      const checked = validateTranscription(output);
      return checked.ok ? checked.value : null;
    },
    deps.imageTimeoutMs ?? deps.timeoutMs,
  );

  if (!transcription.containsSlip) {
    return {
      text: "",
      slip: { selections: [], bookmaker: null, bookingCode: null, totalOdds: null, ignoredLines: [], warnings: ["No betting slip was found in that image. Try a clearer screenshot, or paste the text."] },
    };
  }

  const parsed = parseSlipText(transcription.text);
  const warnings = [SCREENSHOT_NOTE, ...parsed.warnings];
  if (transcription.truncated) warnings.push("The image had a lot of text, so only the first part was kept.");
  if (transcription.text.includes("[unclear]")) warnings.push("Some text was marked [unclear]. Fix those parts from your screenshot.");
  return {
    text: transcription.text,
    slip: {
      ...parsed,
      // An AI read is never "high": a person should look at every line.
      selections: parsed.selections.map((s) => (s.confidence === "high" ? { ...s, confidence: "medium" as const } : s)),
      warnings,
    },
  };
}
