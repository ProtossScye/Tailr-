import { describe, expect, it } from "vitest";
import { NAV, activeHref } from "./nav";

describe("navigation", () => {
  it("has five tabs in order, with Create in the middle as the primary action", () => {
    expect(NAV.map((n) => n.label)).toEqual(["Home", "Bets", "Create", "Analytics", "Profile"]);
    expect(NAV.filter((n) => n.primary).map((n) => n.label)).toEqual(["Create"]);
    expect(NAV[2]?.primary).toBe(true);
  });

  it("lights the tab that owns the page, including sub-pages", () => {
    expect(activeHref("/dashboard")).toBe("/dashboard");
    expect(activeHref("/bets")).toBe("/bets");
    expect(activeHref("/bets/new")).toBe("/bets");
    expect(activeHref("/bets/abc/edit")).toBe("/bets");
    expect(activeHref("/create")).toBe("/create");
    expect(activeHref("/analytics")).toBe("/analytics");
    expect(activeHref("/profile")).toBe("/profile");
  });

  it("keeps Home lit on the notifications page and nothing lit on unknown paths", () => {
    expect(activeHref("/notifications")).toBe("/dashboard");
    expect(activeHref("/betsy")).toBeNull();
    expect(activeHref("/elsewhere")).toBeNull();
  });
});
