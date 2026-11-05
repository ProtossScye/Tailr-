import type { PGlite } from "@electric-sql/pglite";
import { fetchAllPages } from "../../lib/services/pagination";
import type {
  BetPatchRecord,
  BetRepository,
  BetRow,
  BetWithSelections,
  ListQuery,
  ListSlipsQuery,
  NewBetRecord,
  NewSelectionRecord,
  NewSlipRecord,
  PreferencesRecord,
  PreferencesRepository,
  PreferencesRow,
  SelectionRow,
  SlipPatchRecord,
  SlipRepository,
  SlipRow,
  SlipSelectionRow,
  SlipWithSelections,
  StatsBetRow,
} from "../../lib/services/repository";
import type { AiUsageRepository } from "../../lib/ai/usage";
import { asUser } from "./helpers";

/**
 * Test-only BetRepository that runs the REAL SQL (tables, constraints, the
 * create_bet/update_bet functions and the privacy rules) on an in-memory Postgres,
 * acting as one signed-in user. It mirrors what the Supabase repository does.
 * Pass userId = null to act as a signed-in role with no identity.
 */
export function createPgliteBetRepository(
  db: PGlite,
  userId: string | null,
  options: { pageSize?: number } = {},
): BetRepository {
  const as = <T>(fn: () => Promise<T>) => asUser(db, userId, fn);

  async function legsFor(betIds: string[]): Promise<SelectionRow[]> {
    if (betIds.length === 0) return [];
    const placeholders = betIds.map((_, i) => `$${i + 1}`).join(", ");
    const r = await db.query<SelectionRow>(
      `select * from public.bet_selections where bet_id in (${placeholders}) order by sort_order, created_at`,
      betIds,
    );
    return r.rows;
  }

  return {
    createBet: (bet: NewBetRecord, selections: NewSelectionRecord[]) =>
      as(async () => {
        const r = await db.query<{ id: string }>("select public.create_bet($1::jsonb, $2::jsonb) as id", [
          JSON.stringify(bet),
          JSON.stringify(selections),
        ]);
        return r.rows[0]!.id;
      }),

    getBet: (id: string) =>
      as(async (): Promise<BetWithSelections | null> => {
        const r = await db.query<BetRow>("select * from public.bets where id = $1", [id]);
        const bet = r.rows[0];
        if (!bet) return null;
        return { bet, selections: await legsFor([bet.id]) };
      }),

    listBets: (query: ListQuery) =>
      as(async () => {
        const where: string[] = [];
        const params: unknown[] = [];
        if (query.status) {
          params.push(query.status);
          where.push(`status = $${params.length}`);
        }
        if (query.currency) {
          params.push(query.currency);
          where.push(`currency = $${params.length}`);
        }
        params.push(query.limit, query.offset);
        const sql = `select * from public.bets ${where.length ? `where ${where.join(" and ")}` : ""}
          order by placed_at desc, id asc limit $${params.length - 1} offset $${params.length}`;
        const bets = (await db.query<BetRow>(sql, params)).rows;
        const legs = await legsFor(bets.map((b) => b.id));
        return bets.map((bet) => ({ bet, selections: legs.filter((l) => l.bet_id === bet.id) }));
      }),

    listAllBetsForStats: () =>
      as(() =>
        fetchAllPages<StatsBetRow>(async (from, to) => {
          const r = await db.query<StatsBetRow>(
            `select id, currency, stake_minor, status, placed_at, settled_at, gross_return_minor
             from public.bets order by id limit $1 offset $2`,
            [to - from + 1, from],
          );
          return { rows: r.rows };
        }, options.pageSize ?? 1000),
      ),

    updateBet: (id: string, patch: BetPatchRecord, selections?: NewSelectionRecord[]) =>
      as(async () => {
        const r = await db.query<{ ok: boolean }>("select public.update_bet($1::uuid, $2::jsonb, $3::jsonb) as ok", [
          id,
          JSON.stringify(patch),
          selections === undefined ? null : JSON.stringify(selections),
        ]);
        return r.rows[0]!.ok === true;
      }),

    deleteBet: (id: string) =>
      as(async () => {
        const r = await db.query("delete from public.bets where id = $1", [id]);
        return (r.affectedRows ?? 0) > 0;
      }),
  };
}

/** Test-only SlipRepository over the real SQL, acting as one signed-in user. Mirrors the Supabase one. */
export function createPgliteSlipRepository(db: PGlite, userId: string | null): SlipRepository {
  const as = <T>(fn: () => Promise<T>) => asUser(db, userId, fn);

  async function legsFor(ids: string[]): Promise<SlipSelectionRow[]> {
    if (ids.length === 0) return [];
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
    return (await db.query<SlipSelectionRow>(`select * from public.slip_selections where slip_draft_id in (${placeholders}) order by sort_order, created_at`, ids)).rows;
  }

  return {
    createSlip: (slip: NewSlipRecord, selections: NewSelectionRecord[]) =>
      as(async () => {
        const r = await db.query<{ id: string }>("select public.create_slip($1::jsonb, $2::jsonb) as id", [JSON.stringify(slip), JSON.stringify(selections)]);
        return r.rows[0]!.id;
      }),

    getSlip: (id: string) =>
      as(async (): Promise<SlipWithSelections | null> => {
        const slip = (await db.query<SlipRow>("select * from public.slip_drafts where id = $1", [id])).rows[0];
        if (!slip) return null;
        return { slip, selections: await legsFor([slip.id]) };
      }),

    listSlips: (query: ListSlipsQuery) =>
      as(async () => {
        const params: unknown[] = [];
        let where = "";
        if (query.status) {
          params.push(query.status);
          where = `where status = $1`;
        }
        params.push(query.limit, query.offset);
        const sql = `select * from public.slip_drafts ${where} order by updated_at desc, id asc limit $${params.length - 1} offset $${params.length}`;
        const slips = (await db.query<SlipRow>(sql, params)).rows;
        const legs = await legsFor(slips.map((s) => s.id));
        return slips.map((slip) => ({ slip, selections: legs.filter((l) => l.slip_draft_id === slip.id) }));
      }),

    updateSlip: (id: string, patch: SlipPatchRecord, selections?: NewSelectionRecord[]) =>
      as(async () => {
        const r = await db.query<{ ok: boolean }>("select public.update_slip($1::uuid, $2::jsonb, $3::jsonb) as ok", [
          id,
          JSON.stringify(patch),
          selections === undefined ? null : JSON.stringify(selections),
        ]);
        return r.rows[0]!.ok === true;
      }),

    deleteSlip: (id: string) =>
      as(async () => {
        const r = await db.query("delete from public.slip_drafts where id = $1", [id]);
        return (r.affectedRows ?? 0) > 0;
      }),
  };
}

/** Test-only PreferencesRepository over the real SQL, acting as one signed-in user. */
export function createPglitePreferencesRepository(db: PGlite, userId: string | null): PreferencesRepository {
  const as = <T>(fn: () => Promise<T>) => asUser(db, userId, fn);
  return {
    getPreferences: () =>
      as(async () => (await db.query<PreferencesRow>("select * from public.user_preferences")).rows[0] ?? null),
    savePreferences: (record: PreferencesRecord) =>
      as(async () => {
        await db.query("select public.save_preferences($1::jsonb)", [JSON.stringify(record)]);
      }),
    clearPreferences: () =>
      as(async () => ((await db.query("delete from public.user_preferences")).affectedRows ?? 0) > 0),
  };
}

/** Test-only AiUsageRepository that calls the REAL begin_ai_call / finish_ai_call, acting as one user. */
export function createPgliteAiUsageRepository(db: PGlite, userId: string | null): AiUsageRepository {
  return {
    begin: (purpose, inputChars) =>
      asUser(db, userId, async () => {
        const r = await db.query<{ id: string | null }>("select public.begin_ai_call($1, $2) as id", [purpose, inputChars]);
        return r.rows[0]!.id;
      }),
    finish: (id, x) =>
      asUser(db, userId, async () => {
        await db.query("select public.finish_ai_call($1::uuid, $2, $3, $4, $5, $6)", [id, x.status, x.model, x.inputTokens, x.outputTokens, Math.round(x.latencyMs)]);
      }),
  };
}
