import type { SupabaseClient } from "@supabase/supabase-js";
import { RepositoryError } from "../services/errors";
import type { AiFailureKind } from "./types";

export type AiCallStatus = "ok" | AiFailureKind;

/** The per-person usage log and limit. Holds sizes, model and token counts only, never text or answers. */
export interface AiUsageRepository {
  /** An id for the call, or null when the person has reached their limit. */
  begin(purpose: "read_slip", inputChars: number): Promise<string | null>;
  finish(id: string, result: { status: AiCallStatus; model: string | null; inputTokens: number | null; outputTokens: number | null; latencyMs: number }): Promise<void>;
}

export function createSupabaseAiUsageRepository(client: SupabaseClient): AiUsageRepository {
  return {
    async begin(purpose, inputChars) {
      const { data, error } = await client.rpc("begin_ai_call", { p_purpose: purpose, p_input_chars: inputChars });
      if (error) throw new RepositoryError("begin_ai_call", error);
      return typeof data === "string" ? data : null;
    },
    async finish(id, r) {
      const { error } = await client.rpc("finish_ai_call", {
        p_id: id,
        p_status: r.status,
        p_model: r.model,
        p_input_tokens: r.inputTokens,
        p_output_tokens: r.outputTokens,
        p_latency_ms: Math.max(0, Math.round(r.latencyMs)),
      });
      if (error) throw new RepositoryError("finish_ai_call", error);
    },
  };
}
