import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  handleCreateBet,
  handleCreateSlip,
  handleDeleteSlip,
  handleGetBet,
  handleGetSlip,
  handleListSlips,
  handleUpdateSlip,
  type Deps,
  type SlipDeps,
} from "../../lib/api/handlers";
import { createDb, newUser } from "./helpers";
import { createPgliteBetRepository, createPgliteSlipRepository } from "./pglite-repository";

/** Slip drafts over the API: real Request in, real Response out, real SQL and privacy rules. */

const NOW = new Date("2026-10-31T19:00:00Z");
const MISSING_ID = "00000000-0000-4000-8000-000000000000";

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
});
afterAll(async () => {
  await db.close();
});

async function freshUser(): Promise<{ slips: SlipDeps; bets: Deps }> {
  const id = await newUser(db);
  return { slips: { repo: createPgliteSlipRepository(db, id) }, bets: { repo: createPgliteBetRepository(db, id), now: () => NOW } };
}

const req = (method: string, body?: unknown, headers: Record<string, string> = { "content-type": "application/json" }) =>
  new Request("http://localhost/api/slips", { method, headers, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });

const goodSlip = {
  name: "Saturday",
  sourceBookmaker: "Bet9ja",
  selections: [
    { event: "Arsenal v Chelsea", selection: "Arsenal", oddsDecimal: 1.85 },
    { event: "Lakers v Celtics", selection: "Lakers" },
  ],
};

async function create(slips: SlipDeps, body: unknown = goodSlip) {
  const res = await handleCreateSlip(slips, req("POST", body));
  return { res, json: (await res.json()) as any };
}

describe("signed-out visitors", () => {
  it("get 401 on every slip route", async () => {
    for (const res of [
      await handleListSlips(null, req("GET")),
      await handleCreateSlip(null, req("POST", goodSlip)),
      await handleGetSlip(null, MISSING_ID),
      await handleUpdateSlip(null, req("PATCH", { name: "x" }), MISSING_ID),
      await handleDeleteSlip(null, MISSING_ID),
    ]) {
      expect(res.status).toBe(401);
      expect(((await res.json()) as any).error.code).toBe("unauthenticated");
    }
  });
});

describe("create and read", () => {
  it("saves a manual draft and returns it with ordered selections", async () => {
    const { slips } = await freshUser();
    const { res, json } = await create(slips);
    expect(res.status).toBe(201);
    expect(json.data).toMatchObject({ name: "Saturday", sourceType: "manual", sourceBookmaker: "Bet9ja", status: "draft" });
    expect(json.data.selections.map((s: any) => s.event)).toEqual(["Arsenal v Chelsea", "Lakers v Celtics"]);
    expect(json.data.selections.map((s: any) => s.verificationStatus)).toEqual(["user_entered", "user_entered"]);
    expect(json.data.selections[1].oddsDecimal).toBeNull();
    const got = await handleGetSlip(slips, json.data.id);
    expect(((await got.json()) as any).data.id).toBe(json.data.id);
  });

  it("names an unnamed draft after its first event, with +N for the rest", async () => {
    const { slips } = await freshUser();
    const { json } = await create(slips, { selections: goodSlip.selections });
    expect(json.data.name).toBe("Arsenal v Chelsea +1");
    const one = await create(slips, { name: "  ", selections: [goodSlip.selections[0]] });
    expect(one.json.data.name).toBe("Arsenal v Chelsea");
  });

  it("keeps a long default name within the 120 character limit", async () => {
    const { slips } = await freshUser();
    const { res, json } = await create(slips, { selections: [{ event: "e".repeat(200), selection: "x" }, goodSlip.selections[0]] });
    expect(res.status).toBe(201);
    expect([...json.data.name].length).toBeLessThanOrEqual(120);
    expect(json.data.name.endsWith(" +1")).toBe(true);
  });

  it("ignores attempts to set the owner, source, status or verification", async () => {
    const { slips } = await freshUser();
    const { json } = await create(slips, {
      ...goodSlip,
      userId: "x",
      sourceType: "image",
      status: "archived",
      selections: [{ event: "A v B", selection: "A", verificationStatus: "verified" }],
    });
    expect(json.data).toMatchObject({ sourceType: "manual", status: "draft" });
    expect(json.data.selections[0].verificationStatus).toBe("user_entered");
  });

  it("collects every problem in one 400", async () => {
    const { slips } = await freshUser();
    const { res, json } = await create(slips, { name: "n".repeat(121), selections: [{ event: "", selection: "x", oddsDecimal: 0.5 }] });
    expect(res.status).toBe(400);
    const fields = json.error.issues.map((i: any) => i.field);
    expect(fields).toEqual(expect.arrayContaining(["name", "selections[0].event", "selections[0].oddsDecimal"]));
  });

  it.each([
    ["no selections", { name: "x", selections: [] }],
    ["selections missing", { name: "x" }],
    ["51 selections", { selections: Array.from({ length: 51 }, (_, i) => ({ event: `E${i}`, selection: "s" })) }],
  ])("rejects %s", async (_l, body) => {
    const { slips } = await freshUser();
    const { res } = await create(slips, body);
    expect(res.status).toBe(400);
  });

  it("says 'slip', not 'bet', in the limit message", async () => {
    const { slips } = await freshUser();
    const { json } = await create(slips, { selections: Array.from({ length: 51 }, (_, i) => ({ event: `E${i}`, selection: "s" })) });
    expect(json.error.issues[0].message).toContain("A slip can have at most 50");
  });

  it("requires a JSON body", async () => {
    const { slips } = await freshUser();
    const res = await handleCreateSlip(slips, req("POST", JSON.stringify(goodSlip), { "content-type": "text/plain" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error.code).toBe("invalid_json");
  });
});

describe("list", () => {
  it("lists the most recently changed first, filters by status and pages", async () => {
    const { slips } = await freshUser();
    const a = (await create(slips, { name: "A", selections: [goodSlip.selections[0]] })).json.data.id;
    await create(slips, { name: "B", selections: [goodSlip.selections[0]] });
    await create(slips, { name: "C", selections: [goodSlip.selections[0]] });
    await handleUpdateSlip(slips, req("PATCH", { name: "A edited" }), a);

    const all = ((await (await handleListSlips(slips, req("GET"))).json()) as any).data;
    expect(all.items[0].name).toBe("A edited");
    expect(all.items).toHaveLength(3);

    await handleUpdateSlip(slips, req("PATCH", { status: "archived" }), a);
    const drafts = ((await (await handleListSlips(slips, new Request("http://localhost/api/slips?status=draft"))).json()) as any).data;
    expect(drafts.items.map((s: any) => s.name).sort()).toEqual(["B", "C"]);
    const archived = ((await (await handleListSlips(slips, new Request("http://localhost/api/slips?status=archived"))).json()) as any).data;
    expect(archived.items.map((s: any) => s.name)).toEqual(["A edited"]);

    const page = ((await (await handleListSlips(slips, new Request("http://localhost/api/slips?limit=2&offset=0"))).json()) as any).data;
    expect(page.items).toHaveLength(2);
    expect(page.hasMore).toBe(true);
  });

  it.each(["limit=0", "limit=201", "limit=abc", "offset=-1", "status=placed"])("rejects ?%s", async (q) => {
    const { slips } = await freshUser();
    const res = await handleListSlips(slips, new Request(`http://localhost/api/slips?${q}`));
    expect(res.status).toBe(400);
  });
});

describe("update and delete", () => {
  it("renames, archives, and replaces selections", async () => {
    const { slips } = await freshUser();
    const id = (await create(slips)).json.data.id;
    const res = await handleUpdateSlip(
      slips,
      req("PATCH", { name: "Renamed", status: "archived", sourceBookmaker: null, selections: [{ event: "New v Game", selection: "New" }] }),
      id,
    );
    const data = ((await res.json()) as any).data;
    expect(data).toMatchObject({ name: "Renamed", status: "archived", sourceBookmaker: null });
    expect(data.selections.map((s: any) => s.event)).toEqual(["New v Game"]);
  });

  it("rejects an empty patch, a blank name and a bad status", async () => {
    const { slips } = await freshUser();
    const id = (await create(slips)).json.data.id;
    for (const body of [{}, { name: "" }, { status: "placed" }, { selections: [] }]) {
      expect((await handleUpdateSlip(slips, req("PATCH", body), id)).status).toBe(400);
    }
  });

  it("deletes a draft and then reports it gone", async () => {
    const { slips } = await freshUser();
    const id = (await create(slips)).json.data.id;
    expect((await handleDeleteSlip(slips, id)).status).toBe(200);
    expect((await handleGetSlip(slips, id)).status).toBe(404);
    expect((await handleDeleteSlip(slips, id)).status).toBe(404);
  });

  it("answers 404 'Slip not found' for a missing id and for an id that is not a uuid", async () => {
    const { slips } = await freshUser();
    for (const id of [MISSING_ID, "nope"]) {
      const res = await handleGetSlip(slips, id);
      expect(res.status).toBe(404);
      expect(((await res.json()) as any).error.message).toBe("Slip not found.");
    }
  });
});

describe("one user can never reach another's drafts", () => {
  it("looks identical to a draft that does not exist", async () => {
    const ada = await freshUser();
    const bola = await freshUser();
    const id = (await create(ada.slips)).json.data.id;

    expect((await handleGetSlip(bola.slips, id)).status).toBe(404);
    expect((await handleUpdateSlip(bola.slips, req("PATCH", { name: "hacked" }), id)).status).toBe(404);
    expect((await handleDeleteSlip(bola.slips, id)).status).toBe(404);
    const list = ((await (await handleListSlips(bola.slips, req("GET"))).json()) as any).data;
    expect(list.items).toEqual([]);

    const still = ((await (await handleGetSlip(ada.slips, id)).json()) as any).data;
    expect(still.name).toBe("Saturday");
  });
});

describe("recording a bet from a draft", () => {
  const bet = (slipDraftId: unknown) => ({
    currency: "NGN",
    stakeMinor: 500000,
    placedAt: "2026-10-15T12:00:00Z",
    slipDraftId,
    selections: [{ event: "Arsenal v Chelsea", selection: "Arsenal" }],
  });
  const post = (deps: Deps, body: unknown) => handleCreateBet(deps, new Request("http://localhost/api/bets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

  it("links the bet to the user's own draft, and the draft stays a draft", async () => {
    const u = await freshUser();
    const slipId = (await create(u.slips)).json.data.id;
    const res = await post(u.bets, bet(slipId));
    expect(res.status).toBe(201);
    const created = ((await res.json()) as any).data;
    expect(created.slipDraftId).toBe(slipId);
    expect(created.status).toBe("pending");

    const slip = ((await (await handleGetSlip(u.slips, slipId)).json()) as any).data;
    expect(slip.status).toBe("draft");
    expect(slip.selections).toHaveLength(2);
  });

  it("works with no draft and with null", async () => {
    const u = await freshUser();
    for (const body of [bet(undefined), bet(null)]) {
      const res = await post(u.bets, body);
      expect(res.status).toBe(201);
      expect(((await res.json()) as any).data.slipDraftId).toBeNull();
    }
  });

  it("refuses someone else's draft and a missing one with a 400 on slipDraftId, saving no bet", async () => {
    const ada = await freshUser();
    const bola = await freshUser();
    const adaSlip = (await create(ada.slips)).json.data.id;
    for (const id of [adaSlip, MISSING_ID]) {
      const res = await post(bola.bets, bet(id));
      expect(res.status).toBe(400);
      expect(((await res.json()) as any).error.issues[0].field).toBe("slipDraftId");
    }
    const list = await bola.bets!.repo.listBets({ limit: 10, offset: 0 });
    expect(list).toEqual([]);
  });

  it("refuses an id that is not a uuid", async () => {
    const u = await freshUser();
    const res = await post(u.bets, bet("not-a-uuid"));
    expect(res.status).toBe(400);
  });

  it("deleting the draft keeps the bet and clears the link", async () => {
    const u = await freshUser();
    const slipId = (await create(u.slips)).json.data.id;
    const betId = (((await (await post(u.bets, bet(slipId))).json()) as any).data).id;
    await handleDeleteSlip(u.slips, slipId);
    const after = ((await (await handleGetBet(u.bets, betId)).json()) as any).data;
    expect(after.slipDraftId).toBeNull();
    expect(after.selections).toHaveLength(1);
  });
});
