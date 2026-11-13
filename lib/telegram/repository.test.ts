import { describe, expect, it } from "vitest";
import { RepositoryError } from "../services/errors";
import { createSupabaseTelegramLinkRepository, createSupabaseTelegramRepository } from "./repository";

type Rpc = { fn: string; args: Record<string, unknown> };
const rpcClient = (answer: { data?: unknown; error?: unknown }) => {
  const calls: Rpc[] = [];
  const client = { rpc: async (fn: string, args: Record<string, unknown>) => (calls.push({ fn, args }), { data: answer.data ?? null, error: answer.error ?? null }) };
  return { client: client as never, calls };
};

describe("the bot's repository", () => {
  it("calls only the telegram functions, with the right arguments", async () => {
    const t = rpcClient({ data: "ok" });
    const repo = createSupabaseTelegramRepository(t.client);
    await repo.acceptUpdate(7, 42);
    expect(t.calls).toEqual([{ fn: "telegram_accept_update", args: { p_update_id: 7, p_telegram_user_id: 42 } }]);

    const r = rpcClient({ data: "linked" });
    expect(await createSupabaseTelegramRepository(r.client).redeemLink("h".repeat(64), 42, 99)).toBe("linked");
    expect(r.calls).toEqual([{ fn: "telegram_redeem_link", args: { p_code_hash: "h".repeat(64), p_telegram_user_id: 42, p_chat_id: 99 } }]);

    const d = rpcClient({ data: "11111111-2222-3333-4444-555555555555" });
    const slip = { name: "A", source_bookmaker: null };
    const legs = [{ sport: null, event: "A v B", market_type: null, selection: "A", odds_decimal: 1.5 }];
    expect(await createSupabaseTelegramRepository(d.client).createDraft(42, slip, legs)).toBe("11111111-2222-3333-4444-555555555555");
    expect(d.calls).toEqual([{ fn: "telegram_create_draft", args: { p_telegram_user_id: 42, p_slip: slip, p_selections: legs } }]);
  });

  it("maps booleans and a missing draft", async () => {
    expect(await createSupabaseTelegramRepository(rpcClient({ data: true }).client).isLinked(1)).toBe(true);
    expect(await createSupabaseTelegramRepository(rpcClient({ data: false }).client).isLinked(1)).toBe(false);
    expect(await createSupabaseTelegramRepository(rpcClient({ data: null }).client).isLinked(1)).toBe(false);
    expect(await createSupabaseTelegramRepository(rpcClient({ data: true }).client).unlink(1)).toBe(true);
    expect(await createSupabaseTelegramRepository(rpcClient({ data: null }).client).createDraft(1, { name: "A", source_bookmaker: null }, [])).toBeNull();
  });

  it("accepts every answer the database defines and refuses anything else", async () => {
    for (const a of ["ok", "duplicate", "limited"]) expect(await createSupabaseTelegramRepository(rpcClient({ data: a }).client).acceptUpdate(1, 1)).toBe(a);
    for (const a of ["linked", "invalid", "limited", "taken"]) expect(await createSupabaseTelegramRepository(rpcClient({ data: a }).client).redeemLink("h", 1, 1)).toBe(a);
    await expect(createSupabaseTelegramRepository(rpcClient({ data: "maybe" }).client).acceptUpdate(1, 1)).rejects.toBeInstanceOf(RepositoryError);
    await expect(createSupabaseTelegramRepository(rpcClient({ data: 5 }).client).redeemLink("h", 1, 1)).rejects.toBeInstanceOf(RepositoryError);
    await expect(createSupabaseTelegramRepository(rpcClient({ data: 5 }).client).createDraft(1, { name: "A", source_bookmaker: null }, [])).rejects.toBeInstanceOf(RepositoryError);
  });

  it("turns a database error into a RepositoryError", async () => {
    const repo = createSupabaseTelegramRepository(rpcClient({ error: { message: "boom", code: "XX000" } }).client);
    await expect(repo.acceptUpdate(1, 1)).rejects.toBeInstanceOf(RepositoryError);
    await expect(repo.createDraft(1, { name: "A", source_bookmaker: null }, [])).rejects.toBeInstanceOf(RepositoryError);
  });
});

describe("the signed-in person's link repository", () => {
  const tableClient = (result: { data: unknown; error?: unknown }) => {
    const log: string[] = [];
    const chain: any = {
      select: (c?: string) => (log.push(`select ${c ?? ""}`.trim()), chain),
      maybeSingle: async () => ({ data: result.data, error: result.error ?? null }),
      delete: () => (log.push("delete"), chain),
      not: (...a: unknown[]) => (log.push(`not ${a.join(" ")}`), chain),
      then: (res: (v: unknown) => unknown) => res({ data: result.data, error: result.error ?? null }),
    };
    return { client: { from: (t: string) => (log.push(`from ${t}`), chain) } as never, log };
  };

  it("reads the connection time, or null", async () => {
    const t = tableClient({ data: { linked_at: "2026-11-12T10:00:00Z" } });
    expect(await createSupabaseTelegramLinkRepository(t.client).getLink()).toEqual({ linkedAt: "2026-11-12T10:00:00Z" });
    expect(t.log).toEqual(["from telegram_links", "select linked_at"]);
    expect(await createSupabaseTelegramLinkRepository(tableClient({ data: null }).client).getLink()).toBeNull();
  });

  it("makes a code through the database function and passes on its expiry or null", async () => {
    const t = rpcClient({ data: "2026-11-12T10:10:00Z" });
    expect(await createSupabaseTelegramLinkRepository(t.client).createCode("h".repeat(64))).toBe("2026-11-12T10:10:00Z");
    expect(t.calls).toEqual([{ fn: "create_telegram_link_code", args: { p_code_hash: "h".repeat(64) } }]);
    expect(await createSupabaseTelegramLinkRepository(rpcClient({ data: null }).client).createCode("h")).toBeNull();
  });

  it("removes the connection and says whether there was one", async () => {
    expect(await createSupabaseTelegramLinkRepository(tableClient({ data: [{ id: "x" }] }).client).removeLink()).toBe(true);
    expect(await createSupabaseTelegramLinkRepository(tableClient({ data: [] }).client).removeLink()).toBe(false);
  });

  it("turns errors into RepositoryError", async () => {
    await expect(createSupabaseTelegramLinkRepository(tableClient({ data: null, error: { message: "x" } }).client).getLink()).rejects.toBeInstanceOf(RepositoryError);
    await expect(createSupabaseTelegramLinkRepository(rpcClient({ error: { message: "x" } }).client).createCode("h")).rejects.toBeInstanceOf(RepositoryError);
    await expect(createSupabaseTelegramLinkRepository(tableClient({ data: null, error: { message: "x" } }).client).removeLink()).rejects.toBeInstanceOf(RepositoryError);
  });
});
