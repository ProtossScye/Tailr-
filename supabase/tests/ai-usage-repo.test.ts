import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { readSlipWithAi } from "../../lib/ai/read-slip";
import { AiRateLimitedError, type AiProvider } from "../../lib/ai/types";
import { createDb, newUser } from "./helpers";
import { createPgliteAiUsageRepository } from "./pglite-repository";

const TEXT = "Arsenal vs Chelsea - Arsenal to win @ 1.50";
const provider: AiProvider = { callTool: async () => ({ output: { selections: [{ source_text: TEXT, event: "Arsenal vs Chelsea", selection: "Arsenal to win", odds: 1.5 }] }, model: "m", inputTokens: 9, outputTokens: 4 }) };

describe("AI reading against the real usage functions", () => {
  let db: PGlite;
  beforeAll(async () => { db = await createDb(); });

  it("logs the outcome without text, and stops at the hourly limit", async () => {
    const uid = await newUser(db);
    const usage = createPgliteAiUsageRepository(db, uid);
    for (let i = 0; i < 10; i++) await readSlipWithAi({ provider, usage, timeoutMs: 1000 }, { text: TEXT });
    await expect(readSlipWithAi({ provider, usage, timeoutMs: 1000 }, { text: TEXT })).rejects.toBeInstanceOf(AiRateLimitedError);
    const rows = await db.query<Record<string, unknown>>("select * from public.ai_calls where user_id = $1", [uid]);
    expect(rows.rows).toHaveLength(10);
    expect(rows.rows[0]).toMatchObject({ status: "ok", input_tokens: 9, output_tokens: 4, input_chars: TEXT.length });
    expect(JSON.stringify(rows.rows)).not.toContain("Arsenal");
  });
  it("one person's limit does not affect another's", async () => {
    const other = await newUser(db);
    await expect(readSlipWithAi({ provider, usage: createPgliteAiUsageRepository(db, other), timeoutMs: 1000 }, { text: TEXT })).resolves.toBeTruthy();
  });
});
