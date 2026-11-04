import { describe, expect, it } from "vitest";
import type { SlipRepository } from "../services";
import { handleParseSlip, type SlipDeps } from "./handlers";

/** A repository that fails the test if anything touches it: reading pasted text must store nothing. */
const untouchable = new Proxy({}, { get: (_t, name) => () => { throw new Error(`repository.${String(name)} was called`); } }) as unknown as SlipRepository;
const deps: SlipDeps = { repo: untouchable };

const post = (d: SlipDeps, body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) =>
  handleParseSlip(d, new Request("http://localhost/api/slips/parse", { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) }));

describe("POST /api/slips/parse", () => {
  it("needs a signed-in user", async () => {
    const res = await post(null, { text: "Arsenal vs Chelsea - Arsenal to win @1.85" });
    expect(res.status).toBe(401);
  });

  it("returns the draft read from the text, touching no stored data", async () => {
    const res = await post(deps, { text: "Bet9ja\nArsenal vs Chelsea - Arsenal to win @1.85\nBooking code: AB12CD3" });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const data = ((await res.json()) as any).data;
    expect(data.selections).toMatchObject([{ event: "Arsenal vs Chelsea", selection: "Arsenal to win", odds: 1.85, confidence: "high" }]);
    expect(data).toMatchObject({ bookmaker: "Bet9ja", bookingCode: "AB12CD3" });
    expect(data.warnings.join(" ")).toMatch(/booking code/i);
  });

  it("answers 200 with nothing found rather than an error when the text has no slip in it", async () => {
    const res = await post(deps, { text: "good morning everyone" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).data.selections).toEqual([]);
  });

  it.each([
    ["no text", {}],
    ["blank text", { text: "   " }],
    ["text that is not a string", { text: 5 }],
    ["text over 10,000 characters", { text: "x".repeat(10_001) }],
  ])("rejects %s with a 400 on text", async (_l, body) => {
    const res = await post(deps, body);
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error.issues[0].field).toBe("text");
  });

  it("accepts exactly 10,000 characters", async () => {
    expect((await post(deps, { text: "x".repeat(10_000) })).status).toBe(200);
  });

  it("requires a JSON body", async () => {
    const res = await post(deps, "{}", { "content-type": "text/plain" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error.code).toBe("invalid_json");
  });

  it("ignores other keys in the body", async () => {
    const res = await post(deps, { text: "Arsenal vs Chelsea - Arsenal to win @1.85", userId: "x", odds: 9 });
    expect(((await res.json()) as any).data.selections[0].odds).toBe(1.85);
  });
});
