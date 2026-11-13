import { describe, expect, it } from "vitest";
import { generateLinkCode, hashLinkCode, normalizeLinkCode } from "./code";

describe("link codes", () => {
  it("are 10 characters from an alphabet without look-alikes, and differ each time", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const code = generateLinkCode();
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/);
      seen.add(code);
    }
    expect(seen.size).toBe(300);
  });

  it("uses every character of the alphabet", () => {
    const used = new Set<string>();
    for (let i = 0; i < 2000; i++) for (const ch of generateLinkCode()) used.add(ch);
    expect(used.size).toBe(31);
  });

  it("hash to the SHA-256 hex of the code", () => {
    expect(hashLinkCode("ABCD234EFG")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashLinkCode("ABCD234EFG")).toBe(hashLinkCode("ABCD234EFG"));
    expect(hashLinkCode("ABCD234EFG")).not.toBe(hashLinkCode("ABCD234EFH"));
    expect(hashLinkCode("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("normalise what a person types: case, spaces and dashes", () => {
    expect(normalizeLinkCode("abcd234efg")).toBe("ABCD234EFG");
    expect(normalizeLinkCode("  ABCD-234E fg ")).toBe("ABCD234EFG");
  });

  it("reject anything that cannot be a code", () => {
    for (const bad of ["", "ABC", "ABCD234EF", "ABCD234EFGH", "ABCD234E0G", "ABCD234EIG", "ABCD234E!G", "ABCD234EFG; drop table", null, undefined, 42]) {
      expect(normalizeLinkCode(bad as never), String(bad)).toBeNull();
    }
  });
});
