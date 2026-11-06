import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleReadSlipImage, type AiDeps } from "../../lib/api/handlers";
import { MAX_IMAGE_BYTES } from "../../lib/ai/image";
import { AiProviderError, type AiProvider } from "../../lib/ai/types";
import { createDb, newUser } from "./helpers";
import { createPgliteAiUsageRepository } from "./pglite-repository";

const SLIP = "Bet9ja\nArsenal vs Chelsea - Arsenal to win @ 1.50\nLiverpool vs Spurs - Over 2.5 goals @ 1.85";
const good: AiProvider = { callTool: async () => ({ output: { contains_slip: true, text: SLIP }, model: "m", inputTokens: 800, outputTokens: 50 }) };
const jpeg = (len = 2000) => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(len - 4).fill(9)]);

let db: PGlite;
beforeAll(async () => { db = await createDb(); });
afterAll(async () => { await db.close(); });

function upload(bytes: Uint8Array | null, opts: { field?: string; type?: string; name?: string } = {}) {
  const form = new FormData();
  if (bytes) form.set(opts.field ?? "image", new Blob([bytes as Uint8Array<ArrayBuffer>], { type: opts.type ?? "image/jpeg" }), opts.name ?? "slip.jpg");
  return new Request("http://localhost/api/slips/parse-image", { method: "POST", body: form });
}
async function deps(provider: AiProvider | null, timeoutMs = 1000): Promise<AiDeps> {
  return { provider, usage: createPgliteAiUsageRepository(db, await newUser(db)), timeoutMs };
}
const j = async (r: Response) => (await r.json()) as any;

describe("screenshot reading API", () => {
  it("401 when not signed in", async () => expect((await handleReadSlipImage(null, upload(jpeg()))).status).toBe(401));

  it("200: returns the copied text and a reviewed slip, no-store, nothing rated high", async () => {
    const r = await handleReadSlipImage(await deps(good), upload(jpeg()));
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    const body = await j(r);
    expect(body.data.text).toBe(SLIP);
    expect(body.data.slip.selections).toHaveLength(2);
    expect(body.data.slip.selections.every((s: any) => s.confidence !== "high")).toBe(true);
    expect(body.data.slip.warnings[0]).toMatch(/screenshot/);
  });

  it("logs the read against the real usage functions without any text or image", async () => {
    const d = await deps(good);
    await handleReadSlipImage(d, upload(jpeg(1234)));
    const rows = await db.query<Record<string, unknown>>("select * from public.ai_calls where purpose = 'read_image' order by created_at desc limit 1");
    expect(rows.rows[0]).toMatchObject({ status: "ok", input_chars: 1234, input_tokens: 800 });
    expect(JSON.stringify(rows.rows)).not.toMatch(/Arsenal/);
  });

  it("503 with no provider, and nothing is used up", async () => {
    const r = await handleReadSlipImage(await deps(null), upload(jpeg()));
    expect(r.status).toBe(503);
    expect((await j(r)).error.code).toBe("ai_unavailable");
  });

  it("400 for a missing image, the wrong field, or a non-multipart body", async () => {
    const d = await deps(good);
    expect((await handleReadSlipImage(d, upload(null))).status).toBe(400);
    expect((await handleReadSlipImage(d, upload(jpeg(), { field: "file" }))).status).toBe(400);
    const json = new Request("http://x/", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const r = await handleReadSlipImage(d, json);
    expect(r.status).toBe(400);
    expect((await j(r)).error.code).toBe("invalid_upload");
    const garbled = new Request("http://x/", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=zzz" }, body: "not multipart" });
    expect((await handleReadSlipImage(d, garbled)).status).toBe(400);
  });

  it("400 for a file that is not a JPEG, PNG or WebP, whatever it claims to be", async () => {
    const d = await deps(good);
    const html = Uint8Array.from(Buffer.from("<html><script>alert(1)</script></html>".padEnd(500, " ")));
    const r = await handleReadSlipImage(d, upload(html, { type: "image/jpeg", name: "slip.jpg" }));
    expect(r.status).toBe(400);
    expect((await j(r)).error.issues[0].field).toBe("image");
    const gif = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, ...new Array(300).fill(1)]);
    expect((await handleReadSlipImage(d, upload(gif, { type: "image/png" }))).status).toBe(400);
  });

  it("413 for an image over the limit, without reading it all", async () => {
    const r = await handleReadSlipImage(await deps(good), upload(jpeg(MAX_IMAGE_BYTES + 200_000)));
    expect(r.status).toBe(413);
    expect((await j(r)).error.code).toBe("too_large");
  });

  it("429 after the shared hourly limit", async () => {
    const d = await deps(good);
    for (let i = 0; i < 10; i++) expect((await handleReadSlipImage(d, upload(jpeg()))).status).toBe(200);
    const r = await handleReadSlipImage(d, upload(jpeg()));
    expect(r.status).toBe(429);
    expect((await j(r)).error.code).toBe("rate_limited");
  });

  it("502 on a provider failure, with nothing private in the response", async () => {
    const bad: AiProvider = { callTool: async () => { throw new AiProviderError("provider_error", "sk-ant-secret " + SLIP); } };
    const r = await handleReadSlipImage(await deps(bad), upload(jpeg()));
    expect(r.status).toBe(502);
    expect(JSON.stringify(await j(r))).not.toMatch(/secret|Arsenal/);
  });

  it("502 when the provider never answers", async () => {
    const hang: AiProvider = { callTool: () => new Promise(() => undefined) };
    expect((await handleReadSlipImage({ provider: hang, usage: createPgliteAiUsageRepository(db, await newUser(db)), timeoutMs: 5000, imageTimeoutMs: 30 }, upload(jpeg()))).status).toBe(502);
  });

  it("an image with no slip gets a plain message, not an error", async () => {
    const none: AiProvider = { callTool: async () => ({ output: { contains_slip: false, text: "" }, model: "m", inputTokens: 1, outputTokens: 1 }) };
    const r = await handleReadSlipImage(await deps(none), upload(jpeg()));
    expect(r.status).toBe(200);
    expect((await j(r)).data.slip.warnings[0]).toMatch(/No betting slip was found/);
  });
});
