import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS_DIR = join(__dirname, "..", "migrations");

/**
 * An in-memory Postgres shaped like Supabase: the auth schema, auth.uid(), and the
 * anon and authenticated roles with Supabase's default table privileges are stubbed,
 * then every migration is applied in order.
 */
export async function createDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    create schema auth;
    grant usage on schema auth to anon, authenticated;
    create table auth.users (id uuid primary key default gen_random_uuid(), raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  `);
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  return db;
}

/** Creates an auth user (the sign-up trigger then creates their profile). */
export async function newUser(db: PGlite, metadata?: Record<string, unknown>): Promise<string> {
  const r = await db.query<{ id: string }>(
    "insert into auth.users (raw_user_meta_data) values ($1::jsonb) returning id",
    [metadata === undefined ? null : JSON.stringify(metadata)],
  );
  return r.rows[0]!.id;
}

/** Inserts a pending bet as the database owner, bypassing row-level security. */
export async function seedBet(db: PGlite, userId: string, stakeMinor = 500000): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into public.bets (user_id, currency, stake_minor, status, placed_at)
     values ($1, 'NGN', $2, 'pending', '2026-10-15T12:00:00Z') returning id`,
    [userId, stakeMinor],
  );
  return r.rows[0]!.id;
}

/** Inserts a bet leg as the database owner, bypassing row-level security. */
export async function seedLeg(db: PGlite, betId: string, selection = "Arsenal -1"): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into public.bet_selections (bet_id, event, selection)
     values ($1, 'Arsenal vs Chelsea', $2) returning id`,
    [betId, selection],
  );
  return r.rows[0]!.id;
}

/**
 * Runs fn as a signed-in user, the way Supabase does: the `authenticated` role with
 * the user's id in the request claims. Pass null for a signed-in role with no identity.
 */
export async function asUser<T>(db: PGlite, userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
  await db.exec("set role authenticated");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

/** Runs fn as a signed-out visitor (the `anon` role). */
export async function asAnon<T>(db: PGlite, fn: () => Promise<T>): Promise<T> {
  await db.exec("set role anon");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}
