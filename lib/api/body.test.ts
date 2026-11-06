import { describe, expect, it } from "vitest";
import { readBodyLimited } from "./body";

const req = (body: BodyInit | null, headers: Record<string, string> = {}) => new Request("http://x/", { method: "POST", body, headers, ...(body instanceof ReadableStream ? { duplex: "half" } : {}) } as RequestInit);

describe("readBodyLimited", () => {
  it("returns the bytes when under the limit, and when exactly at it", async () => {
    expect(Array.from((await readBodyLimited(req("hello"), 5))!)).toEqual(Array.from(Buffer.from("hello")));
    expect((await readBodyLimited(req("hello"), 100))!.length).toBe(5);
  });
  it("returns null one byte over", async () => expect(await readBodyLimited(req("hello!"), 5)).toBeNull());
  it("returns an empty body as empty", async () => expect((await readBodyLimited(new Request("http://x/", { method: "POST" }), 5))!.length).toBe(0));
  it("says no early when Content-Length is over the limit", async () => {
    expect(await readBodyLimited(req("hi", { "content-length": "999" }), 10)).toBeNull();
  });
  it("is not fooled by a Content-Length that lies low: it counts what actually arrives", async () => {
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(6));
        c.enqueue(new Uint8Array(6));
        c.close();
      },
    });
    expect(await readBodyLimited(req(stream, { "content-length": "3" }), 10)).toBeNull();
  });
  it("joins chunks in order", async () => {
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(Uint8Array.from([1, 2]));
        c.enqueue(Uint8Array.from([3]));
        c.close();
      },
    });
    expect(Array.from((await readBodyLimited(req(stream), 10))!)).toEqual([1, 2, 3]);
  });
});
