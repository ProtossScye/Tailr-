/**
 * Suggested changes to a slip, worked out ONLY from what the person entered and what they said they
 * prefer. Every suggestion is a REMOVAL of a selection already on the slip: Tailr never adds a
 * selection, changes odds or picks a fixture, because it has no fixture or odds feed. Nothing is
 * applied until the person accepts it. Each suggestion carries a reason and the trade-off.
 */
import type { DraftLeg } from "./drafts";
import { combinedOdds } from "./money";
import { legOdds } from "./slip";

export type SuggestionKind = "duplicate" | "avoided_market" | "outside_preferred" | "target_odds";

export interface Suggestion {
  /** Stable while the slip is unchanged, so a rejected suggestion stays rejected. */
  key: string;
  kind: SuggestionKind;
  /** Indexes into the slip's selections. */
  remove: number[];
  reason: string;
  tradeoff: string;
  /** Combined odds of the whole slip before and after, when every kept selection has odds. */
  before: number | null;
  after: number | null;
}

export interface SuggestionInput {
  legs: readonly DraftLeg[];
  avoidedMarkets: readonly string[];
  preferredMarkets: readonly string[];
  targetMin: number | null;
  targetMax: number | null;
}

export interface SuggestionResult {
  suggestions: Suggestion[];
  /** Things worth knowing that Tailr cannot fix by removing anything. */
  notes: string[];
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
export const legFingerprint = (l: DraftLeg) => `${norm(l.event)}|${norm(l.selection)}|${norm(l.market)}`;
const label = (l: DraftLeg) => `${l.event.trim()}: ${l.selection.trim()}`;
const fmt = (n: number | null) => (n === null ? null : n.toFixed(2));

function oddsAfter(legs: readonly DraftLeg[], remove: readonly number[]): number | null {
  const kept = legs.filter((_, i) => !remove.includes(i));
  return combinedOdds(kept.map(legOdds));
}

function oddsText(before: number | null, after: number | null, count: number): string {
  const legsText = `${count} fewer selection${count === 1 ? "" : "s"}`;
  if (before !== null && after !== null) return `Combined odds go from ${fmt(before)} to ${fmt(after)} with ${legsText}.`;
  return `${legsText[0]!.toUpperCase()}${legsText.slice(1)}. Combined odds cannot be shown until every selection has odds.`;
}

/**
 * `dismissed` holds the keys of suggestions the person rejected. Removals are suggested in this order:
 * duplicates, markets to avoid, markets outside the preferred list, then (only when nothing above is
 * pending) the target odds range.
 */
export function suggestChanges(input: SuggestionInput, dismissed: ReadonlySet<string> = new Set()): SuggestionResult {
  const { legs } = input;
  const notes: string[] = [];
  const found: Suggestion[] = [];
  if (legs.length === 0) return { suggestions: [], notes: ["Add a selection first."] };

  const before = combinedOdds(legs.map(legOdds));
  const make = (kind: SuggestionKind, remove: number[], reason: string, why: string): Suggestion => {
    // Before and after are shown together or not at all.
    const after = before === null ? null : oddsAfter(legs, remove);
    const key = `${kind}:${remove.map((i) => legFingerprint(legs[i]!)).join("+")}`;
    return { key, kind, remove, reason, tradeoff: `${why} ${oddsText(before, after, remove.length)}`, before, after };
  };

  // Never suggest removing every selection.
  const canRemove = (indexes: number[], already: number[]) => legs.length - new Set([...already, ...indexes]).size >= 1;
  const claimed: number[] = [];
  const push = (s: Suggestion) => {
    if (dismissed.has(s.key)) return;
    if (!canRemove(s.remove, claimed)) return;
    claimed.push(...s.remove);
    found.push(s);
  };

  // 1. The same pick twice: keep the first.
  const first = new Map<string, number>();
  legs.forEach((l, i) => {
    if (norm(l.event) === "" || norm(l.selection) === "") return;
    const fp = legFingerprint(l);
    const at = first.get(fp);
    if (at === undefined) first.set(fp, i);
    else push(make("duplicate", [i], `"${label(l)}" is on the slip more than once.`, "Keeping the first copy loses nothing you picked."));
  });

  // 2. Markets the person said they avoid.
  const avoid = input.avoidedMarkets.map(norm).filter(Boolean);
  legs.forEach((l, i) => {
    if (claimed.includes(i) || !avoid.includes(norm(l.market))) return;
    push(make("avoided_market", [i], `"${label(l)}" is in ${l.market.trim()}, a market you said you avoid.`, "You can still keep it if you want it."));
  });

  // 3. Markets outside the preferred list. A selection with no market is never flagged.
  const preferred = input.preferredMarkets.map(norm).filter(Boolean);
  if (preferred.length > 0) {
    legs.forEach((l, i) => {
      const m = norm(l.market);
      if (claimed.includes(i) || m === "" || preferred.includes(m) || avoid.includes(m)) return;
      push(make("outside_preferred", [i], `"${label(l)}" is in ${l.market.trim()}, which is not one of your preferred markets.`, "This is optional. A preferred-markets list is a preference, not a rule."));
    });
  }

  // 4. Target odds, by removal only, and only once the changes above are settled.
  const { targetMin: lo, targetMax: hi } = input;
  if (lo !== null || hi !== null) {
    const pending = found.length > 0;
    if (pending) {
      notes.push("Settle the changes above first. Tailr then checks your target odds on what is left.");
    } else if (before === null) {
      notes.push("Add odds to every selection and Tailr can compare the slip with your target odds.");
    } else if (hi !== null && before > hi) {
      const best = bestRemoval(legs, lo, hi);
      if (best && !dismissed.has(best.key)) found.push(best);
      else if (!best) notes.push(`Combined odds ${fmt(before)} are above your target of ${hi}. Removing up to 3 selections cannot bring them inside your range.`);
    } else if (lo !== null && before < lo) {
      notes.push(`Combined odds ${fmt(before)} are below your target of ${lo}. Removing selections only lowers them, and Tailr cannot choose a selection for you, so add one yourself if you want to go higher.`);
    }
  }

  return { suggestions: found, notes };
}

/** The smallest set of removals (at most 3, keeping one selection) that lands inside the range. */
function bestRemoval(legs: readonly DraftLeg[], lo: number | null, hi: number | null): Suggestion | null {
  const n = legs.length;
  const inside = (c: number) => (lo === null || c >= lo) && (hi === null || c <= hi);
  const odds = legs.map(legOdds) as number[];
  const total = odds.reduce((a, b) => a * b, 1);
  const attempt = (picked: number[]): number | null => {
    const c = Math.round((total / picked.reduce((a, i) => a * odds[i]!, 1)) * 1000) / 1000;
    return inside(c) ? c : null;
  };
  for (let size = 1; size <= Math.min(3, n - 1); size++) {
    let best: { idx: number[]; c: number } | null = null;
    const walk = (start: number, picked: number[]) => {
      if (picked.length === size) {
        const c = attempt(picked);
        if (c !== null && (best === null || (hi !== null ? c > best.c : c < best.c))) best = { idx: [...picked], c };
        return;
      }
      for (let i = start; i < n; i++) walk(i + 1, [...picked, i]);
    };
    walk(0, []);
    if (best) {
      const { idx, c } = best as { idx: number[]; c: number };
      const names = idx.map((i) => `"${label(legs[i]!)}"`).join(", ");
      const range = lo !== null && hi !== null ? `${lo} to ${hi}` : hi !== null ? `at most ${hi}` : `at least ${lo}`;
      const before = combinedOdds(legs.map(legOdds));
      return {
        key: `target_odds:${idx.map((i) => legFingerprint(legs[i]!)).join("+")}`,
        kind: "target_odds",
        remove: idx,
        reason: `Combined odds ${fmt(before)} are above your target (${range}). Removing ${names} brings them to ${fmt(c)}.`,
        tradeoff: `Fewer selections is a smaller accumulator, so it is more likely to come in and pays less. ${oddsText(before, c, idx.length)} Several removals can fit; this keeps the highest odds that are still in range.`,
        before,
        after: c,
      };
    }
  }
  return null;
}

/** The slip after taking the removals out. Order is kept. */
export function applyRemoval<T>(legs: readonly T[], remove: readonly number[]): T[] {
  return legs.filter((_, i) => !remove.includes(i));
}
