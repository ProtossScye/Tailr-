import type { PGlite } from "@electric-sql/pglite";
import { fetchAllPages } from "../../lib/services/pagination";
import type {
  BetPatchRecord,
  BetRepository,
  BetRow,
  BetWithSelections,
  ListQuery,
  NewBetRecord,
  NewSelectionRecord,
  SelectionRow,
  StatsBetRow,
} from "../../lib/services/repository";
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
