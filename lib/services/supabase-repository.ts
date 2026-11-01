import type { SupabaseClient } from "@supabase/supabase-js";
import { RepositoryError } from "./errors";
import { fetchAllPages } from "./pagination";
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
} from "./repository";

const STATS_COLUMNS = "id,currency,stake_minor,status,placed_at,settled_at,gross_return_minor";
const PAGE_SIZE = 1000;

type EmbeddedBet = BetRow & { bet_selections: SelectionRow[] | null };

function split(row: EmbeddedBet): BetWithSelections {
  const { bet_selections, ...bet } = row;
  return { bet, selections: [...(bet_selections ?? [])].sort((a, b) => a.sort_order - b.sort_order) };
}

/**
 * Supabase implementation. Pass a client that is signed in AS THE USER (the publishable
 * key plus the user's session), so the database's privacy rules apply. Never pass a
 * client built with the secret key: it bypasses every privacy rule.
 */
export function createSupabaseBetRepository(client: SupabaseClient): BetRepository {
  return {
    async createBet(bet: NewBetRecord, selections: NewSelectionRecord[]) {
      const { data, error } = await client.rpc("create_bet", { p_bet: bet, p_selections: selections });
      if (error) throw new RepositoryError("createBet", error);
      if (typeof data !== "string") throw new RepositoryError("createBet", "No id returned");
      return data;
    },

    async getBet(id: string) {
      const { data, error } = await client
        .from("bets")
        .select("*, bet_selections(*)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new RepositoryError("getBet", error);
      return data === null ? null : split(data as unknown as EmbeddedBet);
    },

    async listBets(query: ListQuery) {
      let request = client.from("bets").select("*, bet_selections(*)");
      if (query.status) request = request.eq("status", query.status);
      if (query.currency) request = request.eq("currency", query.currency);
      const { data, error } = await request
        .order("placed_at", { ascending: false })
        .order("id", { ascending: true })
        .range(query.offset, query.offset + query.limit - 1);
      if (error) throw new RepositoryError("listBets", error);
      return ((data ?? []) as unknown as EmbeddedBet[]).map(split);
    },

    async listAllBetsForStats() {
      return fetchAllPages<StatsBetRow>(async (from, to) => {
        const { data, error, count } = await client
          .from("bets")
          .select(STATS_COLUMNS, from === 0 ? { count: "exact" } : undefined)
          .order("id", { ascending: true })
          .range(from, to);
        if (error) throw new RepositoryError("listAllBetsForStats", error);
        return { rows: (data ?? []) as unknown as StatsBetRow[], total: from === 0 ? count : undefined };
      }, PAGE_SIZE);
    },

    async updateBet(id: string, patch: BetPatchRecord, selections?: NewSelectionRecord[]) {
      const { data, error } = await client.rpc("update_bet", {
        p_id: id,
        p_patch: patch,
        p_selections: selections ?? null,
      });
      if (error) throw new RepositoryError("updateBet", error);
      return data === true;
    },

    async deleteBet(id: string) {
      const { data, error } = await client.from("bets").delete().eq("id", id).select("id");
      if (error) throw new RepositoryError("deleteBet", error);
      return (data ?? []).length > 0;
    },
  };
}
