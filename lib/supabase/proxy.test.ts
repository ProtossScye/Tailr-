import { describe, expect, it } from "vitest";
import { isPublicPath } from "./proxy";

describe("isPublicPath", () => {
  it.each(["/", "/sign-in", "/sign-up", "/verify-email", "/forgot-password", "/reset-password", "/auth/confirm", "/auth/sign-out", "/privacy"])("%s is open to signed-out visitors", (p) => expect(isPublicPath(p)).toBe(true));
  it.each(["/dashboard", "/bets", "/bets/new", "/create", "/analytics", "/profile", "/profile/password", "/welcome", "/notifications", "/sign-in-evil", "/signup", "/authx"])("%s needs a session", (p) => expect(isPublicPath(p)).toBe(false));
});
