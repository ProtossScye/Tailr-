import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Runs every migration, in order, on an in-memory Postgres and checks that the
 * schema accepts good data and rejects bad data. Supabase's own pieces (the
 * auth schema and the anon/authenticated roles) are stubbed.
 */

const MIGRATIONS_DIR = join(__dirname, "..", "migrations");
const SAFE_MAX = "9007199254740991";

let db: PGlite;
let userId: string;
let otherUserId: string;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid());
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  `);
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  userId = (await db.query<{ id: string }>("insert into auth.users default values returning id")).rows[0]!.id;
  otherUserId = (await db.query<{ id: string }>("insert into auth.users default values returning id")).rows[0]!.id;
});

afterAll(async () => {
  await db.close();
});

async function insertBet(fields: Record<string, string | number | null> = {}) {
  const row: Record<string, string | number | null> = {
    user_id: userId,
    currency: "NGN",
    stake_minor: 500000,
    status: "pending",
    placed_at: "2026-10-15T12:00:00Z",
    ...fields,
  };
  const cols = Object.keys(row);
  const values = Object.values(row);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const result = await db.query<{ id: string }>(
    `insert into public.bets (${cols.join(", ")}) values (${placeholders}) returning id`,
    values,
  );
  return result.rows[0]!.id;
}

describe("bets accept valid rows", () => {
  it("pending", async () => {
    await expect(insertBet()).resolves.toBeTruthy();
  });
  it("won with a return above the stake", async () => {
    await expect(
      insertBet({ status: "won", settled_at: "2026-10-16T12:00:00Z", gross_return_minor: 900000 }),
    ).resolves.toBeTruthy();
  });
  it("won returning exactly the stake", async () => {
    await expect(
      insertBet({ status: "won", settled_at: "2026-10-16T12:00:00Z", gross_return_minor: 500000 }),
    ).resolves.toBeTruthy();
  });
  it("lost and void", async () => {
    await expect(insertBet({ status: "lost", settled_at: "2026-10-16T12:00:00Z" })).resolves.toBeTruthy();
    await expect(insertBet({ status: "void", settled_at: "2026-10-16T12:00:00Z" })).resolves.toBeTruthy();
  });
  it("USD, with odds and a note", async () => {
    await expect(
      insertBet({ currency: "USD", stake_minor: 2500, decimal_odds: 3.45, notes: "accumulator", bookmaker_label: "Bet9ja" }),
    ).resolves.toBeTruthy();
  });
  it("settled at exactly the placement time", async () => {
    await expect(
      insertBet({ status: "lost", placed_at: "2026-10-15T12:00:00Z", settled_at: "2026-10-15T12:00:00Z" }),
    ).resolves.toBeTruthy();
  });
  it("defaults: pending status and user_reported provenance", async () => {
    const id = await insertBet();
    const r = await db.query<{ status: string; provenance: string }>(
      "select status, provenance from public.bets where id = $1",
      [id],
    );
    expect(r.rows[0]).toEqual({ status: "pending", provenance: "user_reported" });
  });
});

describe("bets reject bad rows", () => {
  it.each([0, -100])("stake %s", async (stake) => {
    await expect(insertBet({ stake_minor: stake })).rejects.toThrow();
  });
  it("stake above the JS safe integer range", async () => {
    await expect(insertBet({ stake_minor: `${SAFE_MAX}0` as unknown as number })).rejects.toThrow();
  });
  it("unsupported currency", async () => {
    await expect(insertBet({ currency: "GBP" })).rejects.toThrow();
  });
  it("unknown status such as cashed_out", async () => {
    await expect(insertBet({ status: "cashed_out" })).rejects.toThrow();
  });
  it("won without a gross return", async () => {
    await expect(insertBet({ status: "won", settled_at: "2026-10-16T12:00:00Z" })).rejects.toThrow();
  });
  it("won returning less than the stake (partial returns unsupported)", async () => {
    await expect(
      insertBet({ status: "won", settled_at: "2026-10-16T12:00:00Z", gross_return_minor: 100000 }),
    ).rejects.toThrow();
  });
  it("won, lost or void without a settlement date", async () => {
    await expect(insertBet({ status: "won", gross_return_minor: 900000 })).rejects.toThrow();
    await expect(insertBet({ status: "lost" })).rejects.toThrow();
    await expect(insertBet({ status: "void" })).rejects.toThrow();
  });
  it("lost or void carrying a return amount", async () => {
    await expect(
      insertBet({ status: "lost", settled_at: "2026-10-16T12:00:00Z", gross_return_minor: 0 }),
    ).rejects.toThrow();
    await expect(
      insertBet({ status: "void", settled_at: "2026-10-16T12:00:00Z", gross_return_minor: 500000 }),
    ).rejects.toThrow();
  });
  it("pending with a settlement date or a return", async () => {
    await expect(insertBet({ settled_at: "2026-10-16T12:00:00Z" })).rejects.toThrow();
    await expect(insertBet({ gross_return_minor: 900000 })).rejects.toThrow();
  });
  it("negative return", async () => {
    await expect(
      insertBet({ status: "won", settled_at: "2026-10-16T12:00:00Z", gross_return_minor: -1 }),
    ).rejects.toThrow();
  });
  it("settled before it was placed", async () => {
    await expect(
      insertBet({ status: "lost", placed_at: "2026-10-16T12:00:00Z", settled_at: "2026-10-15T12:00:00Z" }),
    ).rejects.toThrow();
  });
  it("odds below 1", async () => {
    await expect(insertBet({ decimal_odds: 0.5 })).rejects.toThrow();
  });
  it("notes over 2000 characters", async () => {
    await expect(insertBet({ notes: "x".repeat(2001) })).rejects.toThrow();
  });
  it("a user that does not exist", async () => {
    await expect(insertBet({ user_id: "00000000-0000-0000-0000-000000000000" })).rejects.toThrow();
  });
  it("a missing placed_at", async () => {
    await expect(insertBet({ placed_at: null })).rejects.toThrow();
  });
});

describe("bet_selections", () => {
  async function insertSelection(betId: string, fields: Record<string, string | number | null> = {}) {
    const row: Record<string, string | number | null> = {
      bet_id: betId,
      event: "Arsenal vs Chelsea",
      selection: "Arsenal -1",
      ...fields,
    };
    const cols = Object.keys(row);
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
    return db.query(`insert into public.bet_selections (${cols.join(", ")}) values (${placeholders})`, Object.values(row));
  }

  it("accepts a normal leg", async () => {
    const betId = await insertBet();
    await expect(
      insertSelection(betId, { sport: "Football", market_type: "Asian handicap", odds_decimal: 1.95, sort_order: 0 }),
    ).resolves.toBeTruthy();
  });
  it("rejects empty event or selection", async () => {
    const betId = await insertBet();
    await expect(insertSelection(betId, { event: "" })).rejects.toThrow();
    await expect(insertSelection(betId, { selection: "" })).rejects.toThrow();
  });
  it("rejects odds below 1 and negative sort order", async () => {
    const betId = await insertBet();
    await expect(insertSelection(betId, { odds_decimal: 0.9 })).rejects.toThrow();
    await expect(insertSelection(betId, { sort_order: -1 })).rejects.toThrow();
  });
  it("rejects a leg for a bet that does not exist", async () => {
    await expect(insertSelection("00000000-0000-0000-0000-000000000000")).rejects.toThrow();
  });
  it("deleting a bet deletes its legs", async () => {
    const betId = await insertBet();
    await insertSelection(betId);
    await insertSelection(betId, { selection: "Over 2.5", sort_order: 1 });
    await db.query("delete from public.bets where id = $1", [betId]);
    const r = await db.query<{ n: number }>("select count(*)::int as n from public.bet_selections where bet_id = $1", [betId]);
    expect(r.rows[0]!.n).toBe(0);
  });
});

describe("profiles", () => {
  it("accepts a name and rejects an empty one", async () => {
    await db.query("insert into public.profiles (id, display_name) values ($1, 'Ada')", [userId]);
    await expect(db.query("insert into public.profiles (id, display_name) values ($1, '')", [otherUserId])).rejects.toThrow();
  });
  it("rejects a profile for a user that does not exist", async () => {
    await expect(
      db.query("insert into public.profiles (id) values ('00000000-0000-0000-0000-000000000000')"),
    ).rejects.toThrow();
  });
});

describe("housekeeping", () => {
  it("updated_at moves forward on update", async () => {
    const id = await insertBet();
    await db.query("update public.bets set created_at = now() - interval '1 day', updated_at = now() - interval '1 day' where id = $1", [id]);
    const before = (await db.query<{ updated_at: Date }>("select updated_at from public.bets where id = $1", [id])).rows[0]!.updated_at;
    await db.query("update public.bets set notes = 'edited' where id = $1", [id]);
    const after = (await db.query<{ updated_at: Date }>("select updated_at from public.bets where id = $1", [id])).rows[0]!.updated_at;
    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });

  it("deleting a user deletes their profile and bets", async () => {
    const temp = (await db.query<{ id: string }>("insert into auth.users default values returning id")).rows[0]!.id;
    await db.query("insert into public.profiles (id) values ($1)", [temp]);
    await insertBet({ user_id: temp });
    await db.query("delete from auth.users where id = $1", [temp]);
    const bets = await db.query<{ n: number }>("select count(*)::int as n from public.bets where user_id = $1", [temp]);
    const profiles = await db.query<{ n: number }>("select count(*)::int as n from public.profiles where id = $1", [temp]);
    expect(bets.rows[0]!.n).toBe(0);
    expect(profiles.rows[0]!.n).toBe(0);
  });
});

describe("security defaults", () => {
  it("row-level security is enabled on every tracker table", async () => {
    const r = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class
       where relnamespace = 'public'::regnamespace and relname in ('profiles', 'bets', 'bet_selections')
       order by relname`,
    );
    expect(r.rows).toEqual([
      { relname: "bet_selections", relrowsecurity: true },
      { relname: "bets", relrowsecurity: true },
      { relname: "profiles", relrowsecurity: true },
    ]);
  });

  it("the anon role has no access to the tracker tables", async () => {
    for (const table of ["profiles", "bets", "bet_selections"]) {
      for (const priv of ["select", "insert", "update", "delete"]) {
        const r = await db.query<{ ok: boolean }>("select has_table_privilege('anon', $1, $2) as ok", [`public.${table}`, priv]);
        expect(r.rows[0]!.ok, `anon ${priv} on ${table}`).toBe(false);
      }
    }
  });
});
