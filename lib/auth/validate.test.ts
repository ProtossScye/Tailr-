import { describe, expect, it } from "vitest";
import { cleanCode, cleanEmail, newPasswordProblem, passwordProblem } from "./validate";

describe("cleanEmail", () => {
  it("trims and lower-cases", () => expect(cleanEmail("  Ada@Example.COM ")).toBe("ada@example.com"));
  it.each(["", "   ", "ada", "ada@", "@example.com", "ada@example", "a b@example.com", "ada@@example.com", 5, null, undefined, {}])("rejects %j", (v) => expect(cleanEmail(v)).toBeNull());
  it("rejects over 254 characters", () => expect(cleanEmail(`${"a".repeat(250)}@x.co`)).toBeNull());
  it("accepts plus tags and subdomains", () => expect(cleanEmail("a+b@mail.example.co.uk")).toBe("a+b@mail.example.co.uk"));
});

describe("passwordProblem", () => {
  it("accepts 8 characters", () => expect(passwordProblem("abcd1234")).toBeNull());
  it("rejects 7", () => expect(passwordProblem("abcd123")).toMatch(/at least 8/));
  it("rejects non-strings", () => expect(passwordProblem(undefined)).toMatch(/at least 8/));
  it("rejects only spaces", () => expect(passwordProblem("        ")).toMatch(/only spaces/));
  it("accepts exactly 72 bytes and rejects 73", () => {
    expect(passwordProblem("a".repeat(72))).toBeNull();
    expect(passwordProblem("a".repeat(73))).toMatch(/shorter/);
  });
  it("counts bytes, not characters", () => expect(passwordProblem("é".repeat(37))).toMatch(/shorter/));
});

describe("cleanCode", () => {
  it("accepts 6 digits", () => expect(cleanCode("123456")).toBe("123456"));
  it("ignores spaces and dashes", () => {
    expect(cleanCode(" 123 456 ")).toBe("123456");
    expect(cleanCode("123-456")).toBe("123456");
  });
  it("accepts up to 10 digits in case the dashboard length differs", () => expect(cleanCode("12345678")).toBe("12345678"));
  it.each(["12345", "12345678901", "12a456", "", "abcdef", 123456, null])("rejects %j", (v) => expect(cleanCode(v)).toBeNull());
});

describe("newPasswordProblem", () => {
  it("passes a matching good pair", () => expect(newPasswordProblem("abcd1234", "abcd1234")).toBeNull());
  it("flags a mismatch", () => expect(newPasswordProblem("abcd1234", "abcd1235")).toMatch(/do not match/));
  it("flags a weak password before a mismatch", () => expect(newPasswordProblem("abc", "abd")).toMatch(/at least 8/));
});
