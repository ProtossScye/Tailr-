import { describe, expect, it } from "vitest";
import { betaCodeFromEnv, betaCodeProblem } from "./beta";

describe("betaCodeFromEnv", () => {
  it("is null (sign-up open) when unset, empty or only spaces", () => {
    for (const v of [undefined, "", "   "]) expect(betaCodeFromEnv({ TAILR_BETA_CODE: v })).toBeNull();
    expect(betaCodeFromEnv({})).toBeNull();
  });
  it("trims the code", () => expect(betaCodeFromEnv({ TAILR_BETA_CODE: "  Lagos-2026 " })).toBe("Lagos-2026"));
});

describe("betaCodeProblem", () => {
  it("lets everyone in when no code is required", () => {
    for (const given of [undefined, "", "anything", 5]) expect(betaCodeProblem(null, given)).toBeNull();
  });

  it("accepts the right code", () => expect(betaCodeProblem("Lagos-2026", "Lagos-2026")).toBeNull());

  it("ignores case, spaces and dashes, because people retype codes", () => {
    expect(betaCodeProblem("Lagos-2026", "  lagos 2026 ")).toBeNull();
    expect(betaCodeProblem("LAGOS2026", "lagos-2026")).toBeNull();
  });

  it("asks for the code when it is missing", () => {
    for (const given of [undefined, null, "", "   ", 5, {}]) expect(betaCodeProblem("Lagos-2026", given), String(given)).toMatch(/invite/i);
  });

  it("refuses a wrong code, a near miss, a longer code and a prefix, with the same message", () => {
    const messages = new Set<string | null>();
    for (const given of ["Lagos-2027", "Lagos-202", "Lagos-20266", "Lagos", "other", "x".repeat(5000)]) {
      const p = betaCodeProblem("Lagos-2026", given);
      expect(p, given).not.toBeNull();
      messages.add(p);
    }
    expect(messages.size).toBe(1);
  });

  it("never repeats the code in a message", () => {
    expect(betaCodeProblem("Lagos-2026", "nope")).not.toMatch(/lagos/i);
    expect(betaCodeProblem("Lagos-2026", undefined)).not.toMatch(/lagos/i);
  });
});
