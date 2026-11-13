import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, newUser, seedBet, seedLeg, seedSlip, seedSlipLeg } from "./helpers";

/**
 * Deleting an account must remove everything the person owns. Supabase deletes the auth user and the
 * database follows the foreign keys, so these tests check the keys themselves: every table that points
 * at auth.users must cascade, which also guards tables added later.
 */

let db: PGlite;
beforeAll(async () => {
  db = await createDb();
});
afterAll(async () => {
  await db.close();
});

describe("deleting an account", () => {
  it("every foreign key to auth.users cascades, so no table can keep a deleted person's data", async () => {
    const rows = (
      await db.query<{ table_name: string; delete_rule: string }>(
        `select tc.table_name, rc.delete_rule
           from information_schema.table_constraints tc
           join information_schema.referential_constraints rc on rc.constraint_name = tc.constraint_name and rc.constraint_schema = tc.constraint_schema
           join information_schema.constraint_column_usage ccu on ccu.constraint_name = rc.unique_constraint_name and ccu.constraint_schema = rc.unique_constraint_schema
          where tc.constraint_type = 'FOREIGN KEY' and ccu.table_schema = 'auth' and ccu.table_name = 'users'
          order by tc.table_name`,
      )
    ).rows;
    expect(rows.map((r) => r.table_name)).toEqual(
      ["ai_calls", "bets", "profiles", "slip_drafts", "telegram_link_codes", "telegram_links", "user_feedback", "user_preferences"].sort(),
    );
    for (const r of rows) expect(r.delete_rule, r.table_name).toBe("CASCADE");
  });

  it("removes a person's bets, slips, preferences, AI log and Telegram connection, and nothing of anyone else's", async () => {
    const gone = await newUser(db, { display_name: "Ada" });
    const stays = await newUser(db, { display_name: "Bayo" });
    for (const u of [gone, stays]) {
      const bet = await seedBet(db, u);
      await seedLeg(db, bet);
      const slip = await seedSlip(db, u);
      await seedSlipLeg(db, slip);
      await db.query("insert into public.user_preferences (user_id) values ($1)", [u]);
      await db.query("insert into public.user_feedback (user_id, kind, message) values ($1, 'bug', 'x')", [u]);
      await db.query("insert into public.ai_calls (user_id, purpose) values ($1, 'read_slip')", [u]);
      await db.query("insert into public.telegram_links (user_id, telegram_user_id, chat_id) values ($1, $2, 1)", [u, Math.floor(Math.random() * 1e9)]);
      await db.query("insert into public.telegram_link_codes (user_id, code_hash, expires_at) values ($1, $2, now())", [u, u.replace(/-/g, "").padEnd(64, "a")]);
    }

    await db.query("delete from auth.users where id = $1", [gone]);

    const count = async (sql: string, id: string) => (await db.query<{ n: number }>(sql, [id])).rows[0]!.n;
    const checks: [string, string][] = [
      ["profiles", "select count(*)::int as n from public.profiles where id = $1"],
      ["bets", "select count(*)::int as n from public.bets where user_id = $1"],
      ["bet_selections", "select count(*)::int as n from public.bet_selections s join public.bets b on b.id = s.bet_id where b.user_id = $1"],
      ["slip_drafts", "select count(*)::int as n from public.slip_drafts where user_id = $1"],
      ["slip_selections", "select count(*)::int as n from public.slip_selections s join public.slip_drafts d on d.id = s.slip_draft_id where d.user_id = $1"],
      ["user_preferences", "select count(*)::int as n from public.user_preferences where user_id = $1"],
      ["ai_calls", "select count(*)::int as n from public.ai_calls where user_id = $1"],
      ["user_feedback", "select count(*)::int as n from public.user_feedback where user_id = $1"],
      ["telegram_links", "select count(*)::int as n from public.telegram_links where user_id = $1"],
      ["telegram_link_codes", "select count(*)::int as n from public.telegram_link_codes where user_id = $1"],
    ];
    for (const [table, sql] of checks) {
      expect(await count(sql, gone), `${table} left behind`).toBe(0);
      expect(await count(sql, stays), `${table} of the other person`).toBeGreaterThan(0);
    }
  });
});
