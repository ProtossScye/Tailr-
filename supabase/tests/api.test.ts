import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  handleCreateBet,
  handleDashboard,
  handleDeleteBet,
  handleGetBet,
  handleListBets,
  handleSettleBet,
  handleUpdateBet,
  type Deps,
} from "../../lib/api/handlers";
import { RepositoryError } from "../../lib/services";
import type { BetRepository } from "../../lib/services";
import { createDb, newUser } from "./helpers";
import { createPgliteBetRepository } from "./pglite-repository";

/**
 * The API handlers end to end: real Request in, real Response out, over the real SQL and privacy
 * rules on an in-memory Postgres. The route files under app/api/ only add the session lookup.
 */

const NOW = new Date("2026-10-31T19:00:00Z");
const MISSING_ID = "00000000-0000-0000-0000-000000000000";
const URL_BASE = "http://localhost/api";

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
});
afterAll(async () => {
  await db.close();
});

async function freshUser(): Promise<Deps> {
  const id = await newUser(db);
  return { repo: createPgliteBetRepository(db, id), now: () => NOW };
}

function req(method: string, path: string, body?: unknown, headers: Record<string, string> = { "content-type": "application/json" }): Request {
  return new Request(`${URL_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

const goodBet = {
  currency: "NGN",
  stakeMinor: 500000,
  placedAt: "2026-10-15T12:00:00Z",
  selections: [{ event: "Arsenal vs Chelsea", selection: "Arsenal -1", oddsDecimal: 1.95 }],
};

async function create(deps: Deps, body: unknown = goodBet) {
  const res = await handleCreateBet(deps, req("POST", "/bets", body));
  return { res, json: (await res.json()) as any };
}

describe("signed-out visitors", () => {
  it("get 401 from every handler, and nothing else leaks", async () => {
    const responses = await Promise.all([
      handleListBets(null, req("GET", "/bets")),
      handleCreateBet(null, req("POST", "/bets", goodBet)),
      handleGetBet(null, MISSING_ID),
      handleUpdateBet(null, req("PATCH", "/x", { notes: "a" }), MISSING_ID),
      handleSettleBet(null, req("POST", "/x", { outcome: "lost" }), MISSING_ID),
      handleDeleteBet(null, MISSING_ID),
      handleDashboard(null, req("GET", "/dashboard")),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: { code: "unauthenticated", message: "Sign in to continue." } });
    }
  });
});

describe("create, read, list", () => {
  it("creates a pending bet (201) and reads it back with ISO dates", async () => {
    const deps = await freshUser();
    const { res, json } = await create(deps);
    expect(res.status).toBe(201);
    expect(json.data).toMatchObject({ currency: "NGN", stakeMinor: 500000, status: "pending", netProfitMinor: null, placedAt: "2026-10-15T12:00:00.000Z" });
    expect(res.headers.get("cache-control")).toBe("no-store");

    const got = await handleGetBet(deps, json.data.id);
    expect(got.status).toBe(200);
    expect(((await got.json()) as any).data.id).toBe(json.data.id);
  });

  it("ignores smuggled owner, status and return", async () => {
    const deps = await freshUser();
    const { res, json } = await create(deps, { ...goodBet, status: "won", grossReturnMinor: 9_000_000, userId: "00000000-0000-0000-0000-000000000001" });
    expect(res.status).toBe(201);
    expect(json.data.status).toBe("pending");
    expect(json.data.grossReturnMinor).toBeNull();
  });

  it("lists with filters and paging", async () => {
    const deps = await freshUser();
    for (let i = 0; i < 3; i++) await create(deps);
    const page = (await (await handleListBets(deps, req("GET", "/bets?limit=2&status=pending"))).json()) as any;
    expect(page.data.items).toHaveLength(2);
    expect(page.data.hasMore).toBe(true);
    const next = (await (await handleListBets(deps, req("GET", "/bets?limit=2&offset=2"))).json()) as any;
    expect(next.data.items).toHaveLength(1);
    expect(next.data.hasMore).toBe(false);
  });

  it("rejects bad query values with 400 and the field name", async () => {
    const deps = await freshUser();
    for (const [q, field] of [["limit=abc", "limit"], ["limit=0", "limit"], ["offset=-1", "offset"], ["limit=1.5", "limit"], ["status=lol", "status"], ["currency=EUR", "currency"]] as const) {
      const res = await handleListBets(deps, req("GET", `/bets?${q}`));
      expect(res.status, q).toBe(400);
      expect(((await res.json()) as any).error.issues.map((i: any) => i.field)).toContain(field);
    }
  });
});

describe("validation and bad bodies", () => {
  it("returns every problem at once as 400 validation_failed", async () => {
    const deps = await freshUser();
    const { res, json } = await create(deps, { currency: "EUR", stakeMinor: -5, placedAt: "2026-02-30T00:00:00Z", selections: [] });
    expect(res.status).toBe(400);
    expect(json.error.code).toBe("validation_failed");
    const fields = json.error.issues.map((i: any) => i.field);
    expect(fields).toEqual(expect.arrayContaining(["currency", "stakeMinor", "placedAt", "selections"]));
  });

  it.each([
    ["not json", "{nope"],
    ["an array", "[1]"],
    ["null", "null"],
    ["a number", "5"],
    ["empty", ""],
  ])("400 invalid_json for a body that is %s", async (_n, body) => {
    const deps = await freshUser();
    const res = await handleCreateBet(deps, req("POST", "/bets", body));
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error.code).toBe("invalid_json");
  });

  it("refuses a body that is not declared as JSON (cross-site form defence)", async () => {
    const deps = await freshUser();
    const res = await handleCreateBet(deps, req("POST", "/bets", goodBet, { "content-type": "text/plain" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error.code).toBe("invalid_json");
    expect(((await (await handleListBets(deps, req("GET", "/bets"))).json()) as any).data.items).toHaveLength(0);
  });

  it("refuses an oversized body", async () => {
    const deps = await freshUser();
    // Padding in an unknown key: the bet itself is valid, so only the size limit can reject it.
    const res = await handleCreateBet(deps, req("POST", "/bets", JSON.stringify({ ...goodBet, padding: "x".repeat(300_000) })));
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error.message).toMatch(/too large/i);
  });
});

describe("update, settle, delete", () => {
  it("edits, settles and corrects a bet", async () => {
    const deps = await freshUser();
    const { json } = await create(deps);
    const id = json.data.id;

    const edited = await handleUpdateBet(deps, req("PATCH", `/bets/${id}`, { notes: "banker" }), id);
    expect(((await edited.json()) as any).data.notes).toBe("banker");

    const won = await handleSettleBet(deps, req("POST", `/bets/${id}/settle`, { outcome: "won", grossReturnMinor: 900000 }), id);
    expect(((await won.json()) as any).data).toMatchObject({ status: "won", grossReturnMinor: 900000, netProfitMinor: 400000 });

    const lost = await handleSettleBet(deps, req("POST", `/bets/${id}/settle`, { outcome: "lost" }), id);
    expect(((await lost.json()) as any).data).toMatchObject({ status: "lost", netProfitMinor: -500000 });
  });

  it("rejects a win that pays less than the stake, telling the user to use void", async () => {
    const deps = await freshUser();
    const { json } = await create(deps);
    const res = await handleSettleBet(deps, req("POST", "/x", { outcome: "won", grossReturnMinor: 100 }), json.data.id);
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toMatch(/void/i);
  });

  it("cannot change the result through PATCH", async () => {
    const deps = await freshUser();
    const { json } = await create(deps);
    const res = await handleUpdateBet(deps, req("PATCH", "/x", { status: "won", grossReturnMinor: 900000 }), json.data.id);
    // An update with nothing editable in it is rejected.
    expect(res.status).toBe(400);
    const again = (await (await handleGetBet(deps, json.data.id)).json()) as any;
    expect(again.data.status).toBe("pending");
  });

  it("deletes a bet, then 404s", async () => {
    const deps = await freshUser();
    const { json } = await create(deps);
    const del = await handleDeleteBet(deps, json.data.id);
    expect(del.status).toBe(200);
    expect(((await del.json()) as any).data).toEqual({ deleted: true });
    expect((await handleGetBet(deps, json.data.id)).status).toBe(404);
    expect((await handleDeleteBet(deps, json.data.id)).status).toBe(404);
  });

  it("404s for a malformed id and for an id that does not exist", async () => {
    const deps = await freshUser();
    for (const id of ["abc", "../../etc/passwd", MISSING_ID]) {
      expect((await handleGetBet(deps, id)).status, id).toBe(404);
      expect((await handleUpdateBet(deps, req("PATCH", "/x", { notes: "a" }), id)).status).toBe(404);
      expect((await handleSettleBet(deps, req("POST", "/x", { outcome: "lost" }), id)).status).toBe(404);
    }
  });
});

describe("privacy between users", () => {
  it("another user's bet looks exactly like a missing one, and cannot be changed", async () => {
    const alice = await freshUser();
    const bob = await freshUser();
    const { json } = await create(alice);
    const id = json.data.id;

    const theirs = await handleGetBet(bob, id);
    const missing = await handleGetBet(bob, MISSING_ID);
    expect(theirs.status).toBe(404);
    expect(await theirs.json()).toEqual(await missing.json());

    expect((await handleUpdateBet(bob, req("PATCH", "/x", { notes: "hacked" }), id)).status).toBe(404);
    expect((await handleSettleBet(bob, req("POST", "/x", { outcome: "lost" }), id)).status).toBe(404);
    expect((await handleDeleteBet(bob, id)).status).toBe(404);

    expect(((await (await handleListBets(bob, req("GET", "/bets"))).json()) as any).data.items).toHaveLength(0);
    const still = ((await (await handleGetBet(alice, id)).json()) as any).data;
    expect(still).toMatchObject({ status: "pending", notes: null });
  });
});

describe("dashboard", () => {
  async function settled(deps: Deps, currency: string, stake: number, outcome: object, settledAt: string) {
    const { json } = await create(deps, { ...goodBet, currency, stakeMinor: stake });
    await handleSettleBet(deps, req("POST", "/x", { ...outcome, settledAt }), json.data.id);
  }

  it("returns separate NGN and USD summaries and respects Lagos dates (inclusive, half-open)", async () => {
    const deps = await freshUser();
    await settled(deps, "NGN", 500000, { outcome: "won", grossReturnMinor: 900000 }, "2026-10-20T10:00:00Z");
    await settled(deps, "NGN", 100000, { outcome: "lost" }, "2026-10-21T10:00:00Z");
    await settled(deps, "USD", 1000, { outcome: "lost" }, "2026-10-20T10:00:00Z");
    // 22:30 UTC on the 20th is 23:30 Lagos on the 20th: inside 2026-10-20, outside 2026-10-21.
    await settled(deps, "NGN", 200000, { outcome: "lost" }, "2026-10-20T22:30:00Z");
    // 23:00 UTC on the 20th is midnight Lagos on the 21st: starts the 21st.
    await settled(deps, "NGN", 300000, { outcome: "lost" }, "2026-10-20T23:00:00Z");

    const all = ((await (await handleDashboard(deps, req("GET", "/dashboard"))).json()) as any).data.byCurrency;
    expect(all.NGN.netProfitMinor).toBe(400000 - 100000 - 200000 - 300000);
    expect(all.USD.netProfitMinor).toBe(-1000);

    const day = ((await (await handleDashboard(deps, req("GET", "/dashboard?from=2026-10-20&to=2026-10-20"))).json()) as any).data.byCurrency;
    expect(day.NGN.netProfitMinor).toBe(400000 - 200000);
    expect(day.NGN.wins).toBe(1);
    expect(day.NGN.losses).toBe(1);
  });

  it("is empty-safe: ROI and win rate are null with no bets", async () => {
    const deps = await freshUser();
    const data = ((await (await handleDashboard(deps, req("GET", "/dashboard"))).json()) as any).data.byCurrency;
    expect(data.NGN).toMatchObject({ netProfitMinor: 0, roiPercent: null, winRatePercent: null });
  });

  it("only counts the signed-in user's bets", async () => {
    const alice = await freshUser();
    const bob = await freshUser();
    await settled(alice, "NGN", 500000, { outcome: "lost" }, "2026-10-20T10:00:00Z");
    const data = ((await (await handleDashboard(bob, req("GET", "/dashboard"))).json()) as any).data.byCurrency;
    expect(data.NGN.netProfitMinor).toBe(0);
  });

  it.each([
    ["only from", "from=2026-10-20"],
    ["only to", "to=2026-10-20"],
    ["reversed", "from=2026-10-21&to=2026-10-20"],
    ["impossible date", "from=2026-02-30&to=2026-03-01"],
    ["wrong format", "from=20-10-2026&to=21-10-2026"],
  ])("400 for a bad range: %s", async (_n, q) => {
    const deps = await freshUser();
    const res = await handleDashboard(deps, req("GET", `/dashboard?${q}`));
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error.code).toBe("validation_failed");
  });
});

describe("unexpected failures", () => {
  it("returns a masked 500 and logs the detail server-side", async () => {
    const broken = { listBets: async () => { throw new RepositoryError("listBets", { message: "password authentication failed for user secret_db_role", code: "28P01" }); } } as unknown as BetRepository;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await handleListBets({ repo: broken }, req("GET", "/bets"));
    expect(res.status).toBe(500);
    const text = JSON.stringify(await res.json());
    expect(text).not.toMatch(/secret_db_role|password|28P01/);
    expect(JSON.parse(text).error.code).toBe("server_error");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
