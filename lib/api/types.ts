/**
 * Shapes of API responses, for the frontend to import (types only, no runtime code).
 * Over JSON, every Date becomes an ISO string; money stays integer minor units.
 * The service types describe the same fields with Date objects, so use Serialized<T>.
 */
import type { BetView, BetPage, DashboardStats } from "../services/types";

export type Serialized<T> = T extends Date
  ? string
  : T extends readonly (infer U)[]
    ? Serialized<U>[]
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T;

export type ApiErrorCode = "unauthenticated" | "validation_failed" | "not_found" | "invalid_json" | "server_error";

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string; issues?: { field: string; message: string }[] };
}

export type ApiOk<T> = { data: T };

export type BetJson = Serialized<BetView>;
export type BetPageJson = Serialized<BetPage>;
export type DashboardJson = Serialized<DashboardStats>;
