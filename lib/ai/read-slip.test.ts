import { describe, expect, it } from "vitest";
import { readSlipWithAi } from "./read-slip";
import { AiFailedError, AiProviderError, AiRateLimitedError, AiUnavailableError, type AiProvider } from "./types";
import type { AiUsageRepository } from "./usage";
import { ValidationError } from "../services/errors";

const TEXT = "Bet9ja\nArsenal vs Chelsea - Arsenal to win @ 1.50";
const good: AiProvider = {
  async callTool() {
    return { output: { selections: [{ source_text: "Arsenal vs Chelsea - Arsenal to win @ 1.50", event: "Arsenal vs Chelsea", selection: "Arsenal to win", odds: 1.5 }] }, model: "m", inputTokens: 7, outputTokens: 3 };
  },
};

function usage(limited = false) {
  const calls: { begin: unknown[][]; finish: unknown[][] } = { begin: [], finish: [] };
  const repo: AiUsageRepository = {
    async begin(...a) { calls.begin.push(a); return limited ? null : "id1"; },
    async finish(...a) { calls.finish.push(a); },
  };
  return { repo, calls };
}

describe("readSlipWithAi", () => {
  it("reads, grounds, and logs status and tokens but not text", async () => {
    const u = usage();
    const r = await readSlipWithAi({ provider: good, usage: u.repo, timeoutMs: 1000 }, { text: TEXT });
    expect(r.selections[0]).toMatchObject({ event: "Arsenal vs Chelsea", odds: 1.5, confidence: "medium" });
    expect(u.calls.begin[0]).toEqual(["read_slip", TEXT.length]);
    const fin = u.calls.finish[0]!;
    expect(fin[0]).toBe("id1");
    expect(fin[1]).toMatchObject({ status: "ok", model: "m", inputTokens: 7, outputTokens: 3 });
    expect(JSON.stringify(u.calls)).not.toContain("Arsenal");
  });
  it("validates text first and never calls anything on bad input", async () => {
    const u = usage();
    for (const bad of [undefined, {}, { text: "" }, { text: "   " }, { text: "x".repeat(10_001) }, { text: 5 }, "raw"]) await expect(readSlipWithAi({ provider: good, usage: u.repo, timeoutMs: 1000 }, bad)).rejects.toBeInstanceOf(ValidationError);
    expect(u.calls.begin).toHaveLength(0);
  });
  it("is unavailable with no provider, before using any allowance", async () => {
    const u = usage();
    await expect(readSlipWithAi({ provider: null, usage: u.repo, timeoutMs: 1000 }, { text: TEXT })).rejects.toBeInstanceOf(AiUnavailableError);
    expect(u.calls.begin).toHaveLength(0);
  });
  it("is rate limited without calling the provider", async () => {
    let called = false;
    const p: AiProvider = { async callTool() { called = true; return good.callTool({} as never); } };
    await expect(readSlipWithAi({ provider: p, usage: usage(true).repo, timeoutMs: 1000 }, { text: TEXT })).rejects.toBeInstanceOf(AiRateLimitedError);
    expect(called).toBe(false);
  });
  it("times out a provider that never answers, aborts it, and logs timeout", async () => {
    const u = usage();
    let aborted = false;
    const p: AiProvider = { callTool: (r) => new Promise(() => { r.signal.addEventListener("abort", () => (aborted = true)); }) };
    const err = await readSlipWithAi({ provider: p, usage: u.repo, timeoutMs: 30 }, { text: TEXT }).catch((e) => e);
    expect(err).toBeInstanceOf(AiFailedError);
    expect(err.kind).toBe("timeout");
    expect(aborted).toBe(true);
    expect((u.calls.finish[0]![1] as { status: string }).status).toBe("timeout");
  });
  it("maps provider errors and unexpected throws to provider_error", async () => {
    for (const thrown of [new AiProviderError("provider_error", "x"), new Error("secret text Arsenal")]) {
      const u = usage();
      const err = await readSlipWithAi({ provider: { callTool: async () => { throw thrown; } }, usage: u.repo, timeoutMs: 1000 }, { text: TEXT }).catch((e) => e);
      expect(err).toBeInstanceOf(AiFailedError);
      expect(err.kind).toBe("provider_error");
      expect(err.message).not.toContain("Arsenal");
    }
  });
  it("keeps the provider's own failure kind", async () => {
    const err = await readSlipWithAi({ provider: { callTool: async () => { throw new AiProviderError("invalid_output", "x"); } }, usage: usage().repo, timeoutMs: 1000 }, { text: TEXT }).catch((e) => e);
    expect(err.kind).toBe("invalid_output");
  });
  it("rejects a schema-breaking answer as invalid_output but still logs tokens", async () => {
    const u = usage();
    const p: AiProvider = { callTool: async () => ({ output: { nope: true }, model: "m", inputTokens: 4, outputTokens: 2 }) };
    const err = await readSlipWithAi({ provider: p, usage: u.repo, timeoutMs: 1000 }, { text: TEXT }).catch((e) => e);
    expect(err.kind).toBe("invalid_output");
    expect(u.calls.finish[0]![1]).toMatchObject({ status: "invalid_output", inputTokens: 4 });
  });
  it("does not lose the result if logging the finish fails", async () => {
    const repo: AiUsageRepository = { begin: async () => "id", finish: async () => { throw new Error("db down"); } };
    const r = await readSlipWithAi({ provider: good, usage: repo, timeoutMs: 1000 }, { text: TEXT });
    expect(r.selections).toHaveLength(1);
  });
});
