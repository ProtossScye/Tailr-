/**
 * Thin client for the /api routes. Components call this instead of fetch so that error handling is
 * the same everywhere: 401 sends the person to sign in, and unexpected failures become a friendly
 * message (never raw server text).
 */
import type { ApiErrorBody, ApiErrorCode, ApiOk, BetJson, BetPageJson, DashboardJson } from "@/lib/api/types";

export interface FieldIssue {
  field: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | "network" | "unknown";
  readonly issues: FieldIssue[];

  constructor(status: number, code: ApiError["code"], message: string, issues: FieldIssue[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

const FRIENDLY = {
  network: "Could not reach Tailr. Check your connection and try again.",
  server: "Something went wrong on our side. Try again in a moment.",
} as const;

function signInUrl(): string {
  const here = `${window.location.pathname}${window.location.search}`;
  return `/sign-in?next=${encodeURIComponent(here)}`;
}

async function send<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, cache: "no-store" });
  } catch {
    throw new ApiError(0, "network", FRIENDLY.network);
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.ok && payload !== null && typeof payload === "object" && "data" in payload) {
    return (payload as ApiOk<T>).data;
  }

  if (response.status === 401) {
    window.location.assign(signInUrl());
    throw new ApiError(401, "unauthenticated", "Sign in to continue.");
  }

  const error = (payload as ApiErrorBody | null)?.error;
  if (response.status === 400 && error) {
    throw new ApiError(400, error.code, error.message, error.issues ?? []);
  }
  if ((response.status === 413 || response.status === 429 || response.status === 502 || response.status === 503) && error) {
    throw new ApiError(response.status, error.code, error.message);
  }
  if (response.status === 404) throw new ApiError(404, "not_found", "We could not find that. It may have been deleted.");
  throw new ApiError(response.status, "server_error", FRIENDLY.server);
}

export function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  return send<T>(path, {
    method: init.method ?? "GET",
    headers: init.body === undefined ? undefined : { "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

/** Sends a file. The browser sets the multipart Content-Type (with its boundary) itself. */
export function apiUpload<T>(path: string, form: FormData): Promise<T> {
  return send<T>(path, { method: "POST", body: form });
}

/** Every bet, newest placed first, fetched page by page. */
export async function fetchAllBets(): Promise<BetJson[]> {
  const all: BetJson[] = [];
  let offset = 0;
  for (let guard = 0; guard < 100; guard += 1) {
    const page = await api<BetPageJson>(`/api/bets?limit=200&offset=${offset}`);
    all.push(...page.items);
    if (!page.hasMore) return all;
    offset += page.items.length;
    if (page.items.length === 0) return all;
  }
  return all;
}

export function fetchDashboard(range: { from: string; to: string } | null): Promise<DashboardJson> {
  const query = range ? `?from=${range.from}&to=${range.to}` : "";
  return api<DashboardJson>(`/api/dashboard${query}`);
}

export function messageFor(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return FRIENDLY.server;
}
