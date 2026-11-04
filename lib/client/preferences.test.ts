import { describe, expect, it } from "vitest";
import type { PreferencesJson } from "@/lib/api/types";
import { addItem, buildPreferencesPayload, emptyPreferencesForm, formFromPreferences, hasAnyPreference, removeItem } from "./preferences";

const saved: PreferencesJson = {
  saved: true,
  favoriteSports: ["Football"],
  preferredMarkets: ["Match result"],
  avoidedMarkets: ["Correct score"],
  slipStyle: "balanced",
  targetOddsMin: 2,
  targetOddsMax: 5.5,
  detailLevel: "detailed",
  confirmedAt: "2026-11-04T08:00:00Z",
};

describe("form and payload", () => {
  it("round-trips saved preferences", () => {
    const built = buildPreferencesPayload(formFromPreferences(saved));
    expect(built).toEqual({
      ok: true,
      payload: {
        favoriteSports: ["Football"],
        preferredMarkets: ["Match result"],
        avoidedMarkets: ["Correct score"],
        slipStyle: "balanced",
        targetOddsMin: 2,
        targetOddsMax: 5.5,
        detailLevel: "detailed",
      },
    });
  });

  it("an empty form is valid: preferences are optional", () => {
    const built = buildPreferencesPayload(emptyPreferencesForm());
    expect(built.ok).toBe(true);
    if (built.ok) expect(built.payload).toMatchObject({ targetOddsMin: null, targetOddsMax: null, slipStyle: null, detailLevel: "standard" });
  });

  it("catches bad odds and a reversed range", () => {
    const bad = buildPreferencesPayload({ ...emptyPreferencesForm(), targetMin: "abc", targetMax: "0.5" });
    expect(bad).toMatchObject({ ok: false, errors: { targetMin: expect.any(String), targetMax: expect.any(String) } });
    const reversed = buildPreferencesPayload({ ...emptyPreferencesForm(), targetMin: "5", targetMax: "2" });
    expect(reversed).toMatchObject({ ok: false, errors: { targetMax: expect.stringContaining("highest") } });
  });

  it("accepts a single-ended range", () => {
    expect(buildPreferencesPayload({ ...emptyPreferencesForm(), targetMin: "2" }).ok).toBe(true);
    expect(buildPreferencesPayload({ ...emptyPreferencesForm(), targetMax: "4" }).ok).toBe(true);
  });

  it("refuses a market that is both preferred and avoided, ignoring case", () => {
    const r = buildPreferencesPayload({ ...emptyPreferencesForm(), preferredMarkets: ["Over/Under"], avoidedMarkets: ["over/under"] });
    expect(r).toMatchObject({ ok: false, errors: { avoidedMarkets: expect.any(String) } });
  });
});

describe("list helpers", () => {
  it("adds without repeats (ignoring case) and ignores blanks", () => {
    expect(addItem(["Football"], " football ")).toEqual(["Football"]);
    expect(addItem(["Football"], "  ")).toEqual(["Football"]);
    expect(addItem(["Football"], " Darts ")).toEqual(["Football", "Darts"]);
  });

  it("removes ignoring case", () => {
    expect(removeItem(["Football", "Darts"], "DARTS")).toEqual(["Football"]);
  });
});

describe("hasAnyPreference", () => {
  it("is false for defaults and detail level alone, true once anything is chosen", () => {
    expect(hasAnyPreference({ ...saved, saved: false, favoriteSports: [], preferredMarkets: [], avoidedMarkets: [], slipStyle: null, targetOddsMin: null, targetOddsMax: null })).toBe(false);
    expect(hasAnyPreference({ ...saved, favoriteSports: [], preferredMarkets: [], avoidedMarkets: [], slipStyle: null, targetOddsMin: null, targetOddsMax: 3 })).toBe(true);
  });
});
