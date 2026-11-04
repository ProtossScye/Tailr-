import { NotFoundError } from "./errors";
import { toSlipView } from "./mapping";
import type { SlipRepository } from "./repository";
import type { CreateSlipInput, ListSlipsQuery, SlipPage, SlipView, UpdateSlipInput } from "./types";
import { Issues, isUuid, parseCreateSlip, parseUpdateSlip } from "./validate";

/**
 * Slip draft services. A draft is a working list of selections the user is putting together.
 * It is NEVER a bet: nothing here creates, settles or counts a bet, and combined odds are not
 * stored. A draft only becomes a bet when the user records it themselves through createBet.
 * Every call acts for the one signed-in user the repository is bound to.
 */

export interface SlipServiceDeps {
  repo: SlipRepository;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const NOT_FOUND = "Slip not found";

async function loadOrThrow(deps: SlipServiceDeps, id: string) {
  if (!isUuid(id)) throw new NotFoundError(NOT_FOUND);
  const found = await deps.repo.getSlip(id);
  if (found === null) throw new NotFoundError(NOT_FOUND);
  return found;
}

/** Saves a new manual draft with its selections. Owner, source and status cannot be set here. */
export async function createSlip(deps: SlipServiceDeps, input: CreateSlipInput): Promise<SlipView> {
  const { slip, selections } = parseCreateSlip(input);
  const id = await deps.repo.createSlip(slip, selections);
  const created = await deps.repo.getSlip(id);
  if (created === null) throw new Error("The slip was saved but could not be read back");
  return toSlipView(created);
}

export async function getSlip(deps: SlipServiceDeps, id: string): Promise<SlipView> {
  return toSlipView(await loadOrThrow(deps, id));
}

/** The user's drafts, most recently changed first. */
export async function listSlips(deps: SlipServiceDeps, query: ListSlipsQuery = {}): Promise<SlipPage> {
  const issues = new Issues();
  const limit = query.limit ?? DEFAULT_LIMIT;
  const offset = query.offset ?? 0;

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) issues.add("limit", `Use a whole number from 1 to ${MAX_LIMIT}`);
  if (!Number.isInteger(offset) || offset < 0) issues.add("offset", "Use a whole number, zero or more");
  if (query.status !== undefined && query.status !== "draft" && query.status !== "archived") {
    issues.add("status", "Choose draft or archived");
  }
  issues.throwIfAny();

  // One extra row tells us whether there is a next page.
  const rows = await deps.repo.listSlips({ status: query.status, limit: limit + 1, offset });
  return { items: rows.slice(0, limit).map(toSlipView), limit, offset, hasMore: rows.length > limit };
}

/** Edits a draft (rename, archive, restore) and, when given, replaces its selections as a whole. */
export async function updateSlip(deps: SlipServiceDeps, id: string, input: UpdateSlipInput): Promise<SlipView> {
  const { patch, selections } = parseUpdateSlip(input);
  await loadOrThrow(deps, id);
  const updated = await deps.repo.updateSlip(id, patch, selections);
  if (!updated) throw new NotFoundError(NOT_FOUND);
  return getSlip(deps, id);
}

/** Deletes the draft and its selections. Bets recorded from it are kept; only their link is cleared. */
export async function deleteSlip(deps: SlipServiceDeps, id: string): Promise<void> {
  if (!isUuid(id)) throw new NotFoundError(NOT_FOUND);
  const deleted = await deps.repo.deleteSlip(id);
  if (!deleted) throw new NotFoundError(NOT_FOUND);
}
