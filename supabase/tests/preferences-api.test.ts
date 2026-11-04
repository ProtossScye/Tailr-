import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleClearPreferences, handleGetPreferences, handleSavePreferences, type PreferencesDeps } from "../../lib/api/handlers";
import { createDb, newUser } from "./helpers";
import { createPglitePreferencesRepository } from "./pglite-repository";

/** Preferences over the API: real Request in, real Response out, real SQL and privacy rules. */

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
});
afterAll(async () => {
  await db.close();
});

async function freshUser(): Promise<PreferencesDeps> {
  return { repo: createPglitePreferencesRepository(db, await newUser(db)) };
}

const put = (deps: PreferencesDeps, body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) =>
  handleSavePreferences(deps, new Request("http://localhost/api/preferences", { method: "PUT", headers, body: typeof body === "string" ? body : JSON.stringify(body) }));
const get = async (deps: PreferencesDeps) => ((await (await handleGetPreferences(deps)).json()) as any).data;

describe("signed-out visitors", () => {
  it("get 401 on every route", async () => {
    for (const res of [await handleGetPreferences(null), await put(null, {}), await handleClearPreferences(null)]) {
      expect(res.status).toBe(401);
    }
  });
});

describe("before anything is saved", () => {
  it("returns the defaults with saved: false; preferences are optional", async () => {
    expect(await get(await freshUser())).toEqual({
      saved: false,
      favoriteSports: [],
      preferredMarkets: [],
      avoidedMarkets: [],
      slipStyle: null,
      targetOddsMin: null,
      targetOddsMax: null,
      detailLevel: "standard",
      confirmedAt: null,
    });
  });
});

describe("save", () => {
  it("stores and returns the preferences, marking them saved and confirmed", async () => {
    const u = await freshUser();
    const res = await put(u, {
      favoriteSports: ["Football", "Tennis"],
      preferredMarkets: ["Match result", "Over/Under"],
      avoidedMarkets: ["Correct score"],
      slipStyle: "cautious",
      targetOddsMin: 2,
      targetOddsMax: 5,
      detailLevel: "brief",
    });
    expect(res.status).toBe(200);
    const data = ((await res.json()) as any).data;
    expect(data).toMatchObject({
      saved: true,
      favoriteSports: ["Football", "Tennis"],
      preferredMarkets: ["Match result", "Over/Under"],
      avoidedMarkets: ["Correct score"],
      slipStyle: "cautious",
      targetOddsMin: 2,
      targetOddsMax: 5,
      detailLevel: "brief",
    });
    expect(typeof data.confirmedAt).toBe("string");
    expect(await get(u)).toMatchObject({ saved: true, slipStyle: "cautious" });
  });

  it("an empty object is a valid save (the person chose nothing)", async () => {
    const u = await freshUser();
    expect((await put(u, {})).status).toBe(200);
    expect(await get(u)).toMatchObject({ saved: true, favoriteSports: [], detailLevel: "standard" });
  });

  it("replaces everything: a field left out is cleared", async () => {
    const u = await freshUser();
    await put(u, { favoriteSports: ["Football"], slipStyle: "ambitious", targetOddsMin: 3, detailLevel: "detailed" });
    await put(u, { favoriteSports: ["Cricket"] });
    expect(await get(u)).toMatchObject({ favoriteSports: ["Cricket"], slipStyle: null, targetOddsMin: null, detailLevel: "standard" });
  });

  it("trims, drops repeats ignoring case, and keeps the first spelling", async () => {
    const u = await freshUser();
    await put(u, { favoriteSports: [" Football ", "football", "FOOTBALL", "Tennis"] });
    expect((await get(u)).favoriteSports).toEqual(["Football", "Tennis"]);
  });

  it("rounds odds to 3 decimals like everywhere else", async () => {
    const u = await freshUser();
    await put(u, { targetOddsMin: 2.0004 });
    expect((await get(u)).targetOddsMin).toBe(2);
  });

  it("ignores attempts to set the owner or the confirmation time", async () => {
    const u = await freshUser();
    const other = await freshUser();
    await put(u, { userId: "x", user_id: "y", confirmedAt: "2000-01-01T00:00:00Z", explicitly_confirmed_at: "2000-01-01T00:00:00Z" });
    const mine = await get(u);
    expect(new Date(mine.confirmedAt).getFullYear()).toBeGreaterThan(2020);
    expect((await get(other)).saved).toBe(false);
  });

  it.each([
    ["a market both preferred and avoided, ignoring case", { preferredMarkets: ["Over/Under"], avoidedMarkets: ["over/under"] }, "avoidedMarkets"],
    ["a highest target below the lowest", { targetOddsMin: 5, targetOddsMax: 2 }, "targetOddsMax"],
    ["odds below 1", { targetOddsMin: 0.9 }, "targetOddsMin"],
    ["odds that are text", { targetOddsMax: "high" }, "targetOddsMax"],
    ["an unknown style", { slipStyle: "reckless" }, "slipStyle"],
    ["an unknown detail level", { detailLevel: "all" }, "detailLevel"],
    ["a blank sport", { favoriteSports: ["Football", "  "] }, "favoriteSports[1]"],
    ["a sport over 80 characters", { favoriteSports: ["s".repeat(81)] }, "favoriteSports[0]"],
    ["21 different sports", { favoriteSports: Array.from({ length: 21 }, (_, i) => `Sport ${i}`) }, "favoriteSports"],
    ["a list that is not a list", { preferredMarkets: "Over/Under" }, "preferredMarkets"],
    ["a sport that is not text", { favoriteSports: [5] }, "favoriteSports[0]"],
  ])("rejects %s with a 400 on the right field, saving nothing", async (_l, body, field) => {
    const u = await freshUser();
    const res = await put(u, body);
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error.issues.map((i: any) => i.field)).toContain(field);
    expect((await get(u)).saved).toBe(false);
  });

  it("collects every problem in one response", async () => {
    const res = await put(await freshUser(), { slipStyle: "x", detailLevel: "y", targetOddsMin: 0 });
    const fields = ((await res.json()) as any).error.issues.map((i: any) => i.field);
    expect(fields).toEqual(expect.arrayContaining(["slipStyle", "detailLevel", "targetOddsMin"]));
  });

  it("keeps the previous preferences when a save is rejected", async () => {
    const u = await freshUser();
    await put(u, { favoriteSports: ["Football"] });
    expect((await put(u, { slipStyle: "reckless" })).status).toBe(400);
    expect((await get(u)).favoriteSports).toEqual(["Football"]);
  });

  it("requires a JSON body", async () => {
    const res = await put(await freshUser(), "{}", { "content-type": "text/plain" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error.code).toBe("invalid_json");
  });
});

describe("clear", () => {
  it("removes everything and goes back to the defaults; clearing twice is fine", async () => {
    const u = await freshUser();
    await put(u, { favoriteSports: ["Football"] });
    const res = await handleClearPreferences(u);
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).data.saved).toBe(false);
    expect((await handleClearPreferences(u)).status).toBe(200);
    expect((await get(u)).favoriteSports).toEqual([]);
  });
});

describe("one user can never reach another's preferences", () => {
  it("each user reads, replaces and clears only their own", async () => {
    const ada = await freshUser();
    const bola = await freshUser();
    await put(ada, { favoriteSports: ["Football"], slipStyle: "cautious" });
    expect((await get(bola)).saved).toBe(false);
    await put(bola, { favoriteSports: ["Tennis"] });
    await handleClearPreferences(bola);
    expect(await get(ada)).toMatchObject({ saved: true, favoriteSports: ["Football"], slipStyle: "cautious" });
  });
});
