import { AccountingError, lagosDateRange } from "../accounting";
import {
  NotFoundError,
  RepositoryError,
  ValidationError,
  createBet,
  deleteBet,
  getBet,
  getDashboardStats,
  listBets,
  settleBet,
  updateBet,
  type ServiceDeps,
  type ListBetsQuery,
} from "../services";
import type { BetStatus, Currency } from "../accounting";
import type { ApiErrorBody } from "./types";

/**
 * Route logic as plain `(deps, Request) => Response` functions, so it can be tested without a
 * web server. `deps` is null when nobody is signed in. The files under app/api/ only build `deps`
 * from the session cookie and call these.
 *
 * Success: { data: ... }.  Failure: { error: { code, message, issues? } }.
 * 400 invalid input (with `issues` per field) | 401 not signed in | 404 not found (or not yours) | 500 anything else.
 */
export type Deps = ServiceDeps | null;

const MAX_BODY_BYTES = 256 * 1024;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function fail(status: number, code: ApiErrorBody["error"]["code"], message: string, issues?: ApiErrorBody["error"]["issues"]): Response {
  const error: ApiErrorBody["error"] = issues ? { code, message, issues } : { code, message };
  return json({ error }, status);
}

/** Runs one request: 401 without a session, and maps service errors to responses. */
async function run(deps: Deps, work: (deps: ServiceDeps) => Promise<Response>): Promise<Response> {
  if (deps === null) return fail(401, "unauthenticated", "Sign in to continue.");
  try {
    return await work(deps);
  } catch (error) {
    if (error instanceof ValidationError) return fail(400, "validation_failed", "Some fields need fixing.", error.issues);
    if (error instanceof NotFoundError) return fail(404, "not_found", "Bet not found.");
    // Details stay in the server log. Never send database messages to the browser.
    const detail = error instanceof RepositoryError ? `${error.message} (${error.code ?? "no code"})` : error;
    console.error("[api] unexpected error:", detail);
    return fail(500, "server_error", "Something went wrong. Try again.");
  }
}

class BadBody extends Error {}

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  // Browsers can send a cross-site form as text/plain without a CORS check; JSON needs one.
  // Requiring this header closes that door as a second line of defence behind SameSite cookies.
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    throw new BadBody("Send the body as JSON with Content-Type: application/json.");
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new BadBody("Request body is too large.");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new BadBody("Request body must be valid JSON.");
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new BadBody("Request body must be a JSON object.");
  return value as Record<string, unknown>;
}

/** Like run(), but first reads the JSON body (400 invalid_json if it is not a JSON object). */
function withBody(deps: Deps, request: Request, work: (deps: ServiceDeps, body: Record<string, unknown>) => Promise<Response>): Promise<Response> {
  return run(deps, async (d) => {
    let body: Record<string, unknown>;
    try {
      body = await readJsonObject(request);
    } catch (e) {
      if (e instanceof BadBody) return fail(400, "invalid_json", e.message);
      throw e;
    }
    return work(d, body);
  });
}

// The services validate the shape of `body` themselves and ignore unknown keys.
type Body<T> = T & Record<string, unknown>;

export function handleListBets(deps: Deps, request: Request): Promise<Response> {
  return run(deps, async (d) => {
    const p = new URL(request.url).searchParams;
    const query: ListBetsQuery = {};
    const status = p.get("status");
    const currency = p.get("currency");
    if (status !== null) query.status = status as BetStatus;
    if (currency !== null) query.currency = currency as Currency;
    // Numbers arrive as text. Anything that is not a plain integer becomes NaN, which the service rejects.
    for (const key of ["limit", "offset"] as const) {
      const raw = p.get(key);
      if (raw !== null) query[key] = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
    }
    return json({ data: await listBets(d, query) });
  });
}

export function handleCreateBet(deps: Deps, request: Request): Promise<Response> {
  return withBody(deps, request, async (d, body) => json({ data: await createBet(d, body as Body<Parameters<typeof createBet>[1]>) }, 201));
}

export function handleGetBet(deps: Deps, id: string): Promise<Response> {
  return run(deps, async (d) => json({ data: await getBet(d, id) }));
}

export function handleUpdateBet(deps: Deps, request: Request, id: string): Promise<Response> {
  return withBody(deps, request, async (d, body) => json({ data: await updateBet(d, id, body as Body<Parameters<typeof updateBet>[2]>) }));
}

export function handleSettleBet(deps: Deps, request: Request, id: string): Promise<Response> {
  return withBody(deps, request, async (d, body) => json({ data: await settleBet(d, id, body as Body<Parameters<typeof settleBet>[2]>) }));
}

export function handleDeleteBet(deps: Deps, id: string): Promise<Response> {
  return run(deps, async (d) => {
    await deleteBet(d, id);
    return json({ data: { deleted: true } });
  });
}

/** `from` and `to` are Lagos calendar dates (YYYY-MM-DD), both inclusive. Give both or neither. */
export function handleDashboard(deps: Deps, request: Request): Promise<Response> {
  return run(deps, async (d) => {
    const p = new URL(request.url).searchParams;
    const from = p.get("from");
    const to = p.get("to");
    if ((from === null) !== (to === null)) {
      throw new ValidationError([{ field: from === null ? "from" : "to", message: "Give both from and to, or neither" }]);
    }
    let range;
    if (from !== null && to !== null) {
      try {
        range = lagosDateRange(from, to);
      } catch (e) {
        if (e instanceof AccountingError) throw new ValidationError([{ field: "range", message: e.message }]);
        throw e;
      }
    }
    return json({ data: await getDashboardStats(d, range ? { range } : {}) });
  });
}
