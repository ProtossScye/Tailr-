/**
 * Slip drafts saved to the person's account, through /api/slips. A draft is never a bet: recording a
 * placed bet stays a separate, explicit step in the Add bet form.
 */
import type { SlipJson, SlipPageJson } from "@/lib/api/types";
import { api } from "./api";
import { deleteDraft, loadDrafts, type DraftLeg, type SlipDraft } from "./drafts";
import { parseOdds } from "./money";

export interface SlipSelectionPayload {
  sport: string | null;
  event: string;
  marketType: string | null;
  selection: string;
  oddsDecimal: number | null;
}

const blankToNull = (text: string): string | null => (text.trim() === "" ? null : text.trim());

/** Only odds the person typed are sent. Blank or unreadable odds become null; nothing is filled in. */
export function legToSelection(leg: DraftLeg): SlipSelectionPayload {
  const odds = leg.odds.trim() === "" ? null : parseOdds(leg.odds);
  return {
    sport: blankToNull(leg.sport),
    event: leg.event.trim(),
    marketType: blankToNull(leg.market),
    selection: leg.selection.trim(),
    oddsDecimal: odds !== null && odds.ok ? odds.value : null,
  };
}

export function oddsText(value: number | null): string {
  if (value === null) return "";
  return Number.isInteger(Math.round(value * 100)) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-9 ? value.toFixed(2) : String(value);
}

export function slipToDraft(slip: SlipJson): SlipDraft {
  return {
    id: slip.id,
    name: slip.name,
    updatedAt: slip.updatedAt,
    legs: [...slip.selections]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => ({ sport: s.sport ?? "", event: s.event, market: s.marketType ?? "", selection: s.selection, odds: oddsText(s.oddsDecimal) })),
  };
}

/** Every active draft, most recently changed first. */
export async function fetchSlips(): Promise<SlipDraft[]> {
  const page = await api<SlipPageJson>("/api/slips?status=draft&limit=200");
  return page.items.map(slipToDraft);
}

export async function fetchSlip(id: string): Promise<SlipDraft> {
  return slipToDraft(await api<SlipJson>(`/api/slips/${encodeURIComponent(id)}`));
}

/** Creates the draft when `id` is null, otherwise updates it. Returns what the server saved. */
export async function saveSlip(id: string | null, name: string, legs: readonly DraftLeg[]): Promise<SlipDraft> {
  const body = { name, selections: legs.map(legToSelection) };
  const saved =
    id === null
      ? await api<SlipJson>("/api/slips", { method: "POST", body })
      : await api<SlipJson>(`/api/slips/${encodeURIComponent(id)}`, { method: "PATCH", body });
  return slipToDraft(saved);
}

export async function deleteSlip(id: string): Promise<void> {
  await api<{ deleted: true }>(`/api/slips/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/**
 * Moves drafts that were saved on this device before accounts held them. Each one is removed from
 * the device only after the server has saved it, so a failure part way never loses or duplicates one.
 * Returns how many were moved.
 */
export async function moveLocalDraftsToAccount(): Promise<number> {
  let moved = 0;
  for (const draft of [...loadDrafts()].reverse()) {
    await saveSlip(null, draft.name, draft.legs);
    deleteDraft(draft.id);
    moved += 1;
  }
  return moved;
}
