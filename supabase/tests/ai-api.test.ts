import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleAiStatus, handleReadSlipWithAi, type AiDeps } from "../../lib/api/handlers";
import { AiProviderError, type AiProvider } from "../../lib/ai/types";
import { createDb, newUser } from "./helpers";
import { createPgliteAiUsageRepository } from "./pglite-repository";

const TEXT = "Bet9ja\nArsenal vs Chelsea - Arsenal to win @ 1.50";
const good: AiProvider = { callTool: async () => ({ output: { selections: [{ source_text: TEXT, event: "Arsenal vs Chelsea", selection: "Arsenal to win", odds: 1.5 }] }, model: "m", inputTokens: 1, outputTokens: 1 }) };

let db: PGlite;
beforeAll(async () => { db = await createDb(); });
afterAll(async () => { await db.close(); });

const post = (body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) =>
  new Request("http://localhost/api/slips/parse-ai", { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
async function deps(provider: AiProvider | null, timeoutMs = 1000): Promise<AiDeps> {
  return { provider, usage: createPgliteAiUsageRepository(db, await newUser(db)), timeoutMs };
}
const j = async (r: Response) => (await r.json()) as any;

describe("AI reading API", () => {
  it("401 when not signed in, for both routes", async () => {
    expect((await handleReadSlipWithAi(null, post({ text: TEXT }))).status).toBe(401);
    expect((await handleAiStatus(null)).status).toBe(401);
  });
  it("status reflects whether a provider is set", async () => {
    expect((await j(await handleAiStatus(await deps(good)))).data).toEqual({ available: true });
    expect((await j(await handleAiStatus(await deps(null)))).data).toEqual({ available: false });
  });
  it("503 with no provider", async () => {
    const r = await handleReadSlipWithAi(await deps(null), post({ text: TEXT }));
    expect(r.status).toBe(503);
    expect((await j(r)).error.code).toBe("ai_unavailable");
  });
  it("200 with a grounded, review-only draft and no-store", async () => {
    const r = await handleReadSlipWithAi(await deps(good), post({ text: TEXT }));
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    const body = await j(r);
    expect(body.data.selections[0]).toMatchObject({ event: "Arsenal vs Chelsea", odds: 1.5, confidence: "medium" });
    expect(body.data.warnings[0]).toMatch(/Read by AI/);
  });
  it("400 on bad text or body, and content-type is required", async () => {
    const d = await deps(good);
    expect((await handleReadSlipWithAi(d, post({ text: "" }))).status).toBe(400);
    expect((await handleReadSlipWithAi(d, post({ text: "x".repeat(10_001) }))).status).toBe(400);
    expect((await handleReadSlipWithAi(d, post("not json"))).status).toBe(400);
    expect((await handleReadSlipWithAi(d, post({ text: TEXT }, { "content-type": "text/plain" }))).status).toBe(400);
  });
  it("429 after the hourly limit", async () => {
    const d = await deps(good);
    for (let i = 0; i < 10; i++) expect((await handleReadSlipWithAi(d, post({ text: TEXT }))).status).toBe(200);
    const r = await handleReadSlipWithAi(d, post({ text: TEXT }));
    expect(r.status).toBe(429);
    expect((await j(r)).error.code).toBe("rate_limited");
  });
  it("502 on provider failure, with no provider detail or text in the response", async () => {
    const bad: AiProvider = { callTool: async () => { throw new AiProviderError("provider_error", "sk-ant-secret Arsenal"); } };
    const r = await handleReadSlipWithAi(await deps(bad), post({ text: TEXT }));
    expect(r.status).toBe(502);
    const t = JSON.stringify(await j(r));
    expect(t).not.toMatch(/secret|Arsenal/);
  });
  it("502 on a provider that never answers", async () => {
    const hang: AiProvider = { callTool: () => new Promise(() => undefined) };
    expect((await handleReadSlipWithAi(await deps(hang, 30), post({ text: TEXT }))).status).toBe(502);
  });
});
