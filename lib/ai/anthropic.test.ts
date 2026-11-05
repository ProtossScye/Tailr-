import { describe, expect, it } from "vitest";
import { createAnthropicProvider } from "./anthropic";
import { createProviderFromEnv, DEFAULT_MODEL, DEFAULT_TIMEOUT_MS, timeoutFromEnv } from "./config";
import { AiProviderError, type AiToolRequest } from "./types";

const KEY = "sk-ant-SECRET-KEY-123";
const req = (signal = new AbortController().signal): AiToolRequest => ({ system: "s", user: "u", toolName: "report_slip", toolDescription: "d", inputSchema: { type: "object" }, maxTokens: 100, signal });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const ok = { model: "m1", content: [{ type: "text", text: "hi" }, { type: "tool_use", name: "report_slip", input: { selections: [] } }], usage: { input_tokens: 10, output_tokens: 5 } };

describe("anthropic provider", () => {
  it("sends the right request and returns the tool input and usage", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const p = createAnthropicProvider({ apiKey: KEY, model: "m0", fetchImpl: (async (url: string, init: RequestInit) => ((seen = { url, init }), json(ok))) as unknown as typeof fetch });
    const r = await p.callTool(req());
    expect(r).toEqual({ output: { selections: [] }, model: "m1", inputTokens: 10, outputTokens: 5 });
    expect(seen!.url).toBe("https://api.anthropic.com/v1/messages");
    const headers = seen!.init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe(KEY);
    const body = JSON.parse(seen!.init.body as string);
    expect(body.tool_choice).toEqual({ type: "tool", name: "report_slip" });
    expect(body.tools).toHaveLength(1);
    expect(body.messages).toEqual([{ role: "user", content: "u" }]);
  });
  const failing = async (f: () => Promise<Response>, signal?: AbortSignal) => {
    const p = createAnthropicProvider({ apiKey: KEY, model: "m", fetchImpl: f as unknown as typeof fetch });
    return p.callTool(req(signal)).then(
      () => { throw new Error("expected a failure"); },
      (e: unknown) => e as AiProviderError,
    );
  };
  it("maps a non-200 to provider_error without leaking the key or body", async () => {
    const e = await failing(async () => json({ error: "bad key sk-ant-SECRET-KEY-123 user text" }, 401));
    expect(e.kind).toBe("provider_error");
    expect(e.message).toContain("401");
    expect(e.message).not.toContain(KEY);
    expect(e.message).not.toContain("user text");
  });
  it("maps a network failure without leaking the key", async () => {
    const e = await failing(async () => { throw new Error(`boom ${KEY}`); });
    expect(e.kind).toBe("provider_error");
    expect(e.message).not.toContain(KEY);
  });
  it("maps abort to timeout", async () => {
    const c = new AbortController();
    c.abort();
    const e = await failing(async () => { throw Object.assign(new Error("x"), { name: "AbortError" }); }, c.signal);
    expect(e.kind).toBe("timeout");
  });
  it("maps non-JSON and a missing or wrong tool_use to invalid_output", async () => {
    expect((await failing(async () => new Response("<html>"))).kind).toBe("invalid_output");
    expect((await failing(async () => json({ content: [{ type: "text", text: "no tool" }] }))).kind).toBe("invalid_output");
    expect((await failing(async () => json({ content: [{ type: "tool_use", name: "other", input: {} }] }))).kind).toBe("invalid_output");
    expect((await failing(async () => json(null))).kind).toBe("invalid_output");
  });
  it("treats odd usage as null", async () => {
    const p = createAnthropicProvider({ apiKey: KEY, model: "m0", fetchImpl: (async () => json({ ...ok, model: "", usage: { input_tokens: -1, output_tokens: "x" } })) as unknown as typeof fetch });
    expect(await p.callTool(req())).toMatchObject({ model: "m0", inputTokens: null, outputTokens: null });
  });
});

describe("config", () => {
  it("is off without a key and on with one", () => {
    expect(createProviderFromEnv({})).toBeNull();
    expect(createProviderFromEnv({ ANTHROPIC_API_KEY: "  " })).toBeNull();
    expect(createProviderFromEnv({ ANTHROPIC_API_KEY: KEY })).not.toBeNull();
  });
  it("defaults", () => {
    expect(DEFAULT_MODEL).toBe("claude-sonnet-5-5");
    expect(timeoutFromEnv({})).toBe(DEFAULT_TIMEOUT_MS);
    expect(timeoutFromEnv({ TAILR_AI_TIMEOUT_MS: "5000" })).toBe(5000);
    for (const bad of ["abc", "10", "999999", "1.5", ""]) expect(timeoutFromEnv({ TAILR_AI_TIMEOUT_MS: bad })).toBe(DEFAULT_TIMEOUT_MS);
  });
});
