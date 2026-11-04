/**
 * Legacy: slip drafts used to live on this device only (localStorage). They now save to the account
 * (lib/client/slips.ts); this file remains to read and clear any left over, and for draftToText. A
 * draft never becomes a bet by itself: recording a placed bet is a
 * separate, explicit step in the Add bet form.
 */

export interface DraftLeg {
  sport: string;
  event: string;
  market: string;
  selection: string;
  /** Kept as typed so a half-entered price is not lost. Parse with parseOdds when calculating. */
  odds: string;
}

export interface SlipDraft {
  id: string;
  name: string;
  updatedAt: string;
  legs: DraftLeg[];
}

const KEY = "tailr.slipDrafts.v1";
const MAX_DRAFTS = 50;

function isLeg(value: unknown): value is DraftLeg {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return ["sport", "event", "market", "selection", "odds"].every((k) => typeof v[k] === "string");
}

function isDraft(value: unknown): value is SlipDraft {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.name === "string" && typeof v.updatedAt === "string" && Array.isArray(v.legs) && v.legs.every(isLeg);
}

export function loadDrafts(storage: Pick<Storage, "getItem"> | null = safeStorage()): SlipDraft[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isDraft) : [];
  } catch {
    return [];
  }
}

export function saveDraft(draft: SlipDraft, storage: Pick<Storage, "getItem" | "setItem"> | null = safeStorage()): boolean {
  if (!storage) return false;
  try {
    const others = loadDrafts(storage).filter((d) => d.id !== draft.id);
    const next = [draft, ...others].slice(0, MAX_DRAFTS);
    storage.setItem(KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export function deleteDraft(id: string, storage: Pick<Storage, "getItem" | "setItem"> | null = safeStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(KEY, JSON.stringify(loadDrafts(storage).filter((d) => d.id !== id)));
    return true;
  } catch {
    return false;
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function newDraftId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `d-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Plain text a person can paste into a chat or note. Only what they entered; nothing is invented. */
export function draftToText(legs: readonly DraftLeg[], combined: number | null): string {
  const lines = legs.map((leg, i) => {
    const parts = [leg.event.trim(), [leg.market.trim(), leg.selection.trim()].filter(Boolean).join(": ")].filter(Boolean);
    const odds = leg.odds.trim() ? ` @ ${leg.odds.trim()}` : "";
    return `${i + 1}. ${parts.join(" | ")}${odds}`;
  });
  if (combined !== null) lines.push(`Combined odds: ${combined.toFixed(2)}`);
  return lines.join("\n");
}
