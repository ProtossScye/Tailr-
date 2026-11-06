import { AccountingError, lagosDateRange } from "../accounting";
import {
  NotFoundError,
  RepositoryError,
  ValidationError,
  clearPreferences,
  createBet,
  createSlip,
  deleteBet,
  deleteSlip,
  getBet,
  getDashboardStats,
  getPreferences,
  getSlip,
  listBets,
  listSlips,
  readSlipText,
  savePreferences,
  settleBet,
  updateBet,
  updateSlip,
  type PreferencesServiceDeps,
  type ServiceDeps,
  type SlipServiceDeps,
  type ListBetsQuery,
  type ListSlipsQuery,
} from "../services";
import type { BetStatus, Currency } from "../accounting";
import { readSlipWithAi, type ReadSlipAiDeps } from "../ai/read-slip";
import { MAX_IMAGE_BYTES } from "../ai/image";
import { readSlipImage } from "../ai/read-image";
import { readBodyLimited } from "./body";
import { AiFailedError, AiRateLimitedError, AiUnavailableError } from "../ai/types";
import type { ApiErrorBody, AiStatusJson, ImageReadJson } from "./types";

/**
 * Route logic as plain `(deps, Request) => Response` functions, so it can be tested without a
 * web server. `deps` is null when nobody is signed in. The files under app/api/ only build `deps`
 * from the session cookie and call these.
 *
 * Success: { data: ... }.  Failure: { error: { code, message, issues? } }.
 * 400 invalid input (with `issues` per field) | 401 not signed in | 404 not found (or not yours) | 500 anything else.
 */
export type Deps = ServiceDeps | null;
export type SlipDeps = SlipServiceDeps | null;
export type PreferencesDeps = PreferencesServiceDeps | null;
export type AiDeps = ReadSlipAiDeps | null;

const MAX_BODY_BYTES = 256 * 1024;

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function fail(status: number, code: ApiErrorBody["error"]["code"], message: string, issues?: ApiErrorBody["error"]["issues"]): Response {
  const error: ApiErrorBody["error"] = issues ? { code, message, issues } : { code, message };
  return json({ error }, status);
}

/** Runs one request: 401 without a session, and maps service errors to responses. */
async function run<D>(deps: D | null, work: (deps: D) => Promise<Response>): Promise<Response> {
  if (deps === null) return fail(401, "unauthenticated", "Sign in to continue.");
  try {
    return await work(deps);
  } catch (error) {
    if (error instanceof ValidationError) return fail(400, "validation_failed", "Some fields need fixing.", error.issues);
    if (error instanceof NotFoundError) return fail(404, "not_found", `${error.message}.`);
    if (error instanceof AiRateLimitedError) return fail(429, "rate_limited", "You have used your AI reads for now. Try again later, or use the standard reader.");
    if (error instanceof AiUnavailableError) return fail(503, "ai_unavailable", "AI reading is not switched on.");
    if (error instanceof AiFailedError) return fail(502, "ai_failed", "The AI reader could not read that. Try again, or use the standard reader.");
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
function withBody<D>(deps: D | null, request: Request, work: (deps: D, body: Record<string, unknown>) => Promise<Response>): Promise<Response> {
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

// Slip drafts. A draft is never a bet: these routes never create or change one.

export function handleListSlips(deps: SlipDeps, request: Request): Promise<Response> {
  return run(deps, async (d) => {
    const p = new URL(request.url).searchParams;
    const query: ListSlipsQuery = {};
    const status = p.get("status");
    if (status !== null) query.status = status as ListSlipsQuery["status"];
    for (const key of ["limit", "offset"] as const) {
      const raw = p.get(key);
      if (raw !== null) query[key] = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
    }
    return json({ data: await listSlips(d, query) });
  });
}

export function handleCreateSlip(deps: SlipDeps, request: Request): Promise<Response> {
  return withBody(deps, request, async (d, body) => json({ data: await createSlip(d, body as Body<Parameters<typeof createSlip>[1]>) }, 201));
}

export function handleGetSlip(deps: SlipDeps, id: string): Promise<Response> {
  return run(deps, async (d) => json({ data: await getSlip(d, id) }));
}

export function handleUpdateSlip(deps: SlipDeps, request: Request, id: string): Promise<Response> {
  return withBody(deps, request, async (d, body) => json({ data: await updateSlip(d, id, body as Body<Parameters<typeof updateSlip>[2]>) }));
}

export function handleDeleteSlip(deps: SlipDeps, id: string): Promise<Response> {
  return run(deps, async (d) => {
    await deleteSlip(d, id);
    return json({ data: { deleted: true } });
  });
}

// Preferences. Optional: GET returns the defaults (saved: false) until the person saves some.

export function handleGetPreferences(deps: PreferencesDeps): Promise<Response> {
  return run(deps, async (d) => json({ data: await getPreferences(d) }));
}

/** Replaces the whole set. A field left out is cleared. */
export function handleSavePreferences(deps: PreferencesDeps, request: Request): Promise<Response> {
  return withBody(deps, request, async (d, body) => json({ data: await savePreferences(d, body as Body<Parameters<typeof savePreferences>[1]>) }));
}

export function handleClearPreferences(deps: PreferencesDeps): Promise<Response> {
  return run(deps, async (d) => json({ data: await clearPreferences(d) }));
}

/**
 * Reads pasted slip text into a draft for review. Needs a signed-in user, but touches no stored data:
 * nothing is saved and the text is not kept or logged.
 */
export function handleParseSlip(deps: SlipDeps, request: Request): Promise<Response> {
  return withBody(deps, request, async (_d, body) => json({ data: readSlipText(body) }));
}

/**
 * Reads pasted text with AI. Same input and output shape as handleParseSlip, but the answer is an
 * untrusted draft, checked and grounded in the text. Rate limited per person; nothing is saved and the
 * text and the answer are not kept or logged.
 */
export function handleReadSlipWithAi(deps: AiDeps, request: Request): Promise<Response> {
  return withBody(deps, request, async (d, body) => json({ data: await readSlipWithAi(d, body) }));
}

/** Whether AI reading is switched on, so the page only offers it when it can work. */
export function handleAiStatus(deps: AiDeps): Promise<Response> {
  return run(deps, async (d) => json({ data: { available: d.provider !== null } satisfies AiStatusJson }));
}

/** Room for the multipart wrapping around the image itself. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

/**
 * Reads a screenshot of a slip. Multipart upload with one field, `image` (JPEG, PNG or WebP, up to
 * 3 MB; the app shrinks screenshots before sending). The size is enforced while reading, the type
 * from the file's own bytes. The image is read in memory and is never stored or logged.
 */
export function handleReadSlipImage(deps: AiDeps, request: Request): Promise<Response> {
  return run(deps, async (d) => {
    if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("multipart/form-data")) {
      return fail(400, "invalid_upload", "Send the image as a form upload with a field named image.");
    }
    const bytes = await readBodyLimited(request, MAX_IMAGE_BYTES + MULTIPART_OVERHEAD_BYTES);
    if (bytes === null) return fail(413, "too_large", "That image is too large. Try a smaller screenshot.");

    let form: FormData;
    try {
      form = await new Response(bytes as Uint8Array<ArrayBuffer>, { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData();
    } catch {
      return fail(400, "invalid_upload", "That upload could not be read.");
    }
    const file = form.get("image");
    if (typeof file === "string" || file === null) return fail(400, "invalid_upload", "Add an image in a field named image.");

    const result = await readSlipImage(d, { bytes: new Uint8Array(await file.arrayBuffer()) });
    return json({ data: result satisfies ImageReadJson });
  });
}
