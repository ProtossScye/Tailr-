/**
 * Facts about a slip the person is building, worked out only from what they entered.
 * Nothing here looks up odds, fixtures or markets.
 */
import type { DraftLeg } from "./drafts";
import { combinedOdds, parseOdds } from "./money";

export const COMMON_SPORTS = ["Football", "Basketball", "Tennis", "American football", "Baseball", "Ice hockey", "Cricket", "Rugby", "Boxing", "MMA", "Table tennis", "Volleyball", "Esports"] as const;

export const COMMON_MARKETS = [
  "Match result",
  "Double chance",
  "Over/Under",
  "Handicap",
  "Both teams to score",
  "Player props",
  "Correct score",
  "Moneyline",
] as const;

export function legOdds(leg: DraftLeg): number | null {
  const parsed = parseOdds(leg.odds);
  return parsed.ok ? parsed.value : null;
}

export function slipCombinedOdds(legs: readonly DraftLeg[]): number | null {
  return combinedOdds(legs.map(legOdds));
}

export type TargetCheck =
  | { kind: "none" }
  | { kind: "unknown" }
  | { kind: "within"; combined: number }
  | { kind: "below"; combined: number; by: number }
  | { kind: "above"; combined: number; by: number };

/** Compares the combined odds with an optional target range. A preference, never a promise. */
export function checkTarget(combined: number | null, min: number | null, max: number | null): TargetCheck {
  if (min === null && max === null) return { kind: "none" };
  if (combined === null) return { kind: "unknown" };
  if (min !== null && combined < min) return { kind: "below", combined, by: Math.round((min - combined) * 1000) / 1000 };
  if (max !== null && combined > max) return { kind: "above", combined, by: Math.round((combined - max) * 1000) / 1000 };
  return { kind: "within", combined };
}

/** Indexes of selections whose market is not one of the preferred markets. Selections with no market are not flagged. */
export function outsidePreferred(legs: readonly DraftLeg[], preferred: readonly string[]): number[] {
  if (preferred.length === 0) return [];
  const wanted = preferred.map((m) => m.toLowerCase());
  const out: number[] = [];
  legs.forEach((leg, i) => {
    const market = leg.market.trim().toLowerCase();
    if (market !== "" && !wanted.includes(market)) out.push(i);
  });
  return out;
}

export function defaultDraftName(legs: readonly DraftLeg[], count: number): string {
  const first = legs.find((l) => l.event.trim() !== "");
  if (!first) return `Slip ${count + 1}`;
  return legs.length > 1 ? `${first.event.trim()} +${legs.length - 1}` : first.event.trim();
}
