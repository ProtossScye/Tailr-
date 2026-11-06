/**
 * Helpers that make adding selections quicker: which markets to offer for a sport, which sports to
 * offer as one-tap switches, and "same event as the selection above". These only save typing. They
 * never fill in odds, picks or fixtures, and the person can always type something else.
 */
import { COMMON_MARKETS } from "./slip";

/** Market names offered for each sport. Labels only, so the person picks from familiar words. "Other" is always available. */
const MARKETS_BY_SPORT: Record<string, readonly string[]> = {
  football: ["Match result", "Double chance", "Draw no bet", "Over/Under", "Both teams to score", "Handicap", "Correct score", "Half-time result", "Player props"],
  basketball: ["Moneyline", "Handicap", "Over/Under", "Player props"],
  "american football": ["Moneyline", "Handicap", "Over/Under", "Player props"],
  baseball: ["Moneyline", "Handicap", "Over/Under", "Player props"],
  "ice hockey": ["Moneyline", "Match result", "Handicap", "Over/Under", "Player props"],
  tennis: ["Match result", "Handicap", "Over/Under", "Set betting"],
  "table tennis": ["Match result", "Handicap", "Over/Under"],
  volleyball: ["Match result", "Handicap", "Over/Under", "Set betting"],
  cricket: ["Match result", "Handicap", "Over/Under", "Player props"],
  rugby: ["Match result", "Handicap", "Over/Under", "Player props"],
  boxing: ["Match result", "Over/Under"],
  mma: ["Match result", "Over/Under"],
  esports: ["Match result", "Handicap", "Over/Under"],
};

/** Markets for a sport, or the general list when the sport is unknown, blank or custom. */
export function marketsForSport(sport: string): readonly string[] {
  return MARKETS_BY_SPORT[sport.trim().toLowerCase()] ?? COMMON_MARKETS;
}

/** The listed option that matches `value` ignoring case, or null when it is custom text. */
export function matchOption(value: string, options: readonly string[]): string | null {
  const v = value.trim().toLowerCase();
  if (v === "") return null;
  return options.find((o) => o.toLowerCase() === v) ?? null;
}

/**
 * Sports to offer as one-tap switches: the ones already on this slip (latest first), then favourites,
 * so a mixed-sport slip can flip between them without opening the list.
 */
export function quickSports(legs: readonly { sport: string }[], favorites: readonly string[], max = 4): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (s: string) => {
    const t = s.trim();
    if (t === "" || seen.has(t.toLowerCase())) return;
    seen.add(t.toLowerCase());
    out.push(t);
  };
  for (let i = legs.length - 1; i >= 0; i -= 1) add(legs[i]!.sport);
  favorites.forEach(add);
  return out.slice(0, max);
}

/** The market to keep when the sport changes: the same one if the new sport offers it, otherwise cleared. */
export function marketAfterSportChange(market: string, newSport: string): string {
  if (market.trim() === "") return "";
  return matchOption(market, marketsForSport(newSport)) ?? "";
}

/**
 * `linked[i]` means "selection i is the same event as the one above". Copies each linked selection's
 * event from the one above it, so changing the first event updates the rest of the run.
 */
export function resolveLinkedEvents<T extends { event: string }>(legs: readonly T[], linked: readonly boolean[]): T[] {
  const out = legs.map((l) => ({ ...l }));
  for (let i = 1; i < out.length; i += 1) {
    if (linked[i]) out[i]!.event = out[i - 1]!.event;
  }
  return out;
}

/**
 * Keeps `linked` in step when a selection is removed. The selection that moves up into its place
 * becomes a plain one, keeping the event it already has, so nothing is silently rewritten.
 */
export function removeLinkedAt(linked: readonly boolean[], index: number): boolean[] {
  const next = linked.filter((_, i) => i !== index);
  if (next.length > 0) next[0] = false;
  if (index < next.length) next[index] = false;
  return next;
}

/** A new selection starts linked only if the last one was, so a run of picks from one game stays a run. */
export function nextLinked(linked: readonly boolean[], count: number): boolean[] {
  const last = linked[count - 1] ?? false;
  return [...linked.slice(0, count), count > 0 ? last : false];
}

/** True when two or more selections are all from the same event, normally a same-game multi. */
export function isSameGame(legs: readonly { event: string }[]): boolean {
  if (legs.length < 2) return false;
  const norm = (e: string) => e.trim().toLowerCase().replace(/\s+/g, " ");
  const first = norm(legs[0]!.event);
  return first !== "" && legs.every((l) => norm(l.event) === first);
}

export const SAME_GAME_NOTE = "These are all from one game. Bookmakers price a same-game multi as a whole, so their price is not the selections multiplied. Use the price on your bet slip.";
