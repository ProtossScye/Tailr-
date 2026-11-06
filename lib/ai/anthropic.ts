import { AiProviderError, type AiProvider, type AiToolRequest, type AiToolResult } from "./types";

export interface AnthropicOptions {
  apiKey: string;
  model: string;
  /** Injected so tests need no network. */
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

/**
 * Anthropic Messages API, with the model forced to answer through one tool so the reply is
 * structured JSON rather than prose. Runs on the server only: the key never reaches the browser.
 * Error messages carry a status number at most, never the key, the request or the response body.
 */
/** Plain text, or the images followed by the instruction text when images are attached. */
function userContent(request: AiToolRequest) {
  if (!request.images || request.images.length === 0) return request.user;
  return [
    ...request.images.map((image) => ({ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } })),
    { type: "text", text: request.user },
  ];
}

export function createAnthropicProvider({ apiKey, model, fetchImpl = fetch, baseUrl = "https://api.anthropic.com" }: AnthropicOptions): AiProvider {
  return {
    async callTool(request: AiToolRequest): Promise<AiToolResult> {
      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}/v1/messages`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model,
            max_tokens: request.maxTokens,
            system: request.system,
            messages: [{ role: "user", content: userContent(request) }],
            tools: [{ name: request.toolName, description: request.toolDescription, input_schema: request.inputSchema }],
            tool_choice: { type: "tool", name: request.toolName },
          }),
          signal: request.signal,
        });
      } catch (error) {
        if (request.signal.aborted || (error instanceof Error && error.name === "AbortError")) throw new AiProviderError("timeout", "The AI provider did not answer in time");
        throw new AiProviderError("provider_error", "Could not reach the AI provider");
      }

      if (!response.ok) throw new AiProviderError("provider_error", `The AI provider returned status ${response.status}`);

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new AiProviderError("invalid_output", "The AI provider's answer was not JSON");
      }

      const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
      const content = Array.isArray(record.content) ? record.content : [];
      const call = content.find(
        (block): block is { type: "tool_use"; name: string; input: unknown } =>
          typeof block === "object" && block !== null && (block as { type?: unknown }).type === "tool_use" && (block as { name?: unknown }).name === request.toolName,
      );
      if (!call) throw new AiProviderError("invalid_output", "The AI provider did not return the expected structured answer");

      const usage = typeof record.usage === "object" && record.usage !== null ? (record.usage as Record<string, unknown>) : {};
      const count = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);
      return {
        output: call.input,
        model: typeof record.model === "string" && record.model !== "" ? record.model.slice(0, 100) : model,
        inputTokens: count(usage.input_tokens),
        outputTokens: count(usage.output_tokens),
      };
    },
  };
}
