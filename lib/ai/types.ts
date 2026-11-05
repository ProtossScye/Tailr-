/**
 * The seam between Tailr and an AI provider. The provider is asked to call ONE tool with a JSON
 * schema, and what comes back is an UNTRUSTED draft: nothing here is believed until it has been
 * validated against the schema and grounded in the text the person pasted (see ground.ts).
 */

export interface AiToolRequest {
  system: string;
  /** The user turn. For slip reading this is the pasted text, which is data, never instructions. */
  user: string;
  toolName: string;
  toolDescription: string;
  /** JSON Schema for the tool's input. */
  inputSchema: Record<string, unknown>;
  maxTokens: number;
  signal: AbortSignal;
}

export interface AiToolResult {
  /** Whatever the model put in the tool call. Untrusted. */
  output: unknown;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface AiProvider {
  callTool(request: AiToolRequest): Promise<AiToolResult>;
}

export type AiFailureKind = "timeout" | "provider_error" | "invalid_output";

/** A failed provider call. The message never contains the API key, the request or the person's text. */
export class AiProviderError extends Error {
  readonly kind: AiFailureKind;
  constructor(kind: AiFailureKind, message: string) {
    super(message);
    this.name = "AiProviderError";
    this.kind = kind;
  }
}

/** No provider is configured (no API key), so AI reading is off. */
export class AiUnavailableError extends Error {
  constructor() {
    super("AI reading is not switched on");
    this.name = "AiUnavailableError";
  }
}

/** The person has used their allowance of AI reads for now. */
export class AiRateLimitedError extends Error {
  constructor() {
    super("AI read limit reached");
    this.name = "AiRateLimitedError";
  }
}

/** The provider failed, timed out, or answered with something unusable. */
export class AiFailedError extends Error {
  readonly kind: AiFailureKind;
  constructor(kind: AiFailureKind) {
    super(`AI read failed (${kind})`);
    this.name = "AiFailedError";
    this.kind = kind;
  }
}
