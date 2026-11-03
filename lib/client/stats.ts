/**
 * Pure analytics over bets the API already returned. Definitions match lib/accounting:
 *  - net profit and ROI use won and lost bets only (void adds 0 and is left out of the stake base)
 *  - win rate = wins / (wins + losses)
 *  - pending bets are counted separately and never feed P/L, ROI or win rate
 * Currencies are never mixed: callers pass one currency's bets.
 */
import type { BetJson } from "@/lib/api/types";
import { lagosYmd, weekStartYmd, weekdayIndex } from "./dates";

/** Below this many won/lost bets, rates are shown as "too few bets" instead of a verdict. */
export const MIN_BETS_FOR_RATES = 10;

export interface BetStats {
  /** Won + lost bets. */
  settled: number;
  wins: number;
  losses: number;
  voids: number;
  pending: number;
  netMinor: number;
  stakedMinor: number;
  avgStakeMinor: number | null;
  roiPercent: number | null;
  winRatePercent: number | null;
  /** Mean of the odds recorded on bets, or null when none have odds. */
  avgOdds: number | null;
}

export function summarizeBets(bets: readonly BetJson[]): BetStats {
  let wins = 0;
  let losses = 0;
  let voids = 0;
  let pending = 0;
  let netMinor = 0;
  let stakedMinor = 0;
  let oddsSum = 0;
  let oddsCount = 0;
  for (const bet of bets) {
    if (bet.status === "pending") pending += 1;
    else if (bet.status === "void") voids += 1;
    else {
      if (bet.status === "won") wins += 1;
      else losses += 1;
      netMinor += bet.netProfitMinor ?? 0;
      stakedMinor += bet.stakeMinor;
    }
    if (bet.status === "won" || bet.status === "lost") {
      if (bet.decimalOdds !== null) {
        oddsSum += bet.decimalOdds;
        oddsCount += 1;
      }
    }
  }
  const settled = wins + losses;
  return {
    settled,
    wins,
    losses,
    voids,
    pending,
    netMinor,
    stakedMinor,
    avgStakeMinor: settled > 0 ? Math.round(stakedMinor / settled) : null,
    roiPercent: stakedMinor > 0 ? (netMinor / stakedMinor) * 100 : null,
    winRatePercent: settled > 0 ? (wins / settled) * 100 : null,
    avgOdds: oddsCount > 0 ? oddsSum / oddsCount : null,
  };
}

export function hasEnoughBets(stats: BetStats): boolean {
  return stats.settled >= MIN_BETS_FOR_RATES;
}

/** Bets settled inside inclusive Lagos dates (pending bets have no settlement date and are left out). */
export function settledBetween(bets: readonly BetJson[], from: string | null, to: string | null): BetJson[] {
  return bets.filter((bet) => {
    if (bet.settledAt === null) return false;
    if (from === null || to === null) return true;
    const day = lagosYmd(new Date(bet.settledAt));
    return day >= from && day <= to;
  });
}

// ---- cumulative profit/loss series ---------------------------------------------------------

export type Bucket = "day" | "week" | "month" | "year";

export interface SeriesPoint {
  /** Bucket key: YYYY-MM-DD (day, or Monday of the week), YYYY-MM, or YYYY. */
  key: string;
  /** Net profit settled in this bucket, minor units. */
  deltaMinor: number;
  /** Running total up to and including this bucket. */
  cumulativeMinor: number;
}

export function bucketKey(settledAtIso: string, bucket: Bucket): string {
  const ymd = lagosYmd(new Date(settledAtIso));
  if (bucket === "day") return ymd;
  if (bucket === "week") return weekStartYmd(ymd);
  if (bucket === "month") return ymd.slice(0, 7);
  return ymd.slice(0, 4);
}

/** Settled won/lost bets grouped into buckets with a running total. Empty buckets are skipped. */
export function cumulativeSeries(bets: readonly BetJson[], bucket: Bucket): SeriesPoint[] {
  const totals = new Map<string, number>();
  for (const bet of bets) {
    if (bet.settledAt === null || (bet.status !== "won" && bet.status !== "lost")) continue;
    const key = bucketKey(bet.settledAt, bucket);
    totals.set(key, (totals.get(key) ?? 0) + (bet.netProfitMinor ?? 0));
  }
  let running = 0;
  return [...totals.keys()]
    .sort()
    .map((key) => {
      const deltaMinor = totals.get(key) ?? 0;
      running += deltaMinor;
      return { key, deltaMinor, cumulativeMinor: running };
    });
}

// ---- grouped breakdowns ---------------------------------------------------------------------

export interface GroupRow {
  key: string;
  stats: BetStats;
}

/** Sorted by number of settled bets, then name. Groups with only pending bets still appear. */
export function groupBets(bets: readonly BetJson[], keyOf: (bet: BetJson) => string): GroupRow[] {
  const groups = new Map<string, BetJson[]>();
  for (const bet of bets) {
    const key = keyOf(bet);
    const list = groups.get(key);
    if (list) list.push(bet);
    else groups.set(key, [bet]);
  }
  return [...groups.entries()]
    .map(([key, list]) => ({ key, stats: summarizeBets(list) }))
    .sort((a, b) => b.stats.settled - a.stats.settled || a.key.localeCompare(b.key));
}

export const UNSPECIFIED = "Not recorded";
export const MIXED = "Mixed";

/** One label for a whole bet from a per-leg field: the shared value, "Mixed" if legs differ, or "Not recorded". */
function sharedLegValue(bet: BetJson, pick: (leg: BetJson["selections"][number]) => string | null): string {
  const values = new Set<string>();
  for (const leg of bet.selections) {
    const value = pick(leg)?.trim();
    values.add(value ? value : UNSPECIFIED);
  }
  if (values.size === 0) return UNSPECIFIED;
  if (values.size === 1) return [...values][0] as string;
  return MIXED;
}

export const sportOf = (bet: BetJson): string => sharedLegValue(bet, (leg) => leg.sport);
export const marketOf = (bet: BetJson): string => sharedLegValue(bet, (leg) => leg.marketType);
export const bookmakerOf = (bet: BetJson): string => bet.bookmakerLabel?.trim() || UNSPECIFIED;

export const ODDS_RANGES = [
  { key: "Under 1.50", min: 1, max: 1.5 },
  { key: "1.50 to 1.99", min: 1.5, max: 2 },
  { key: "2.00 to 2.99", min: 2, max: 3 },
  { key: "3.00 to 4.99", min: 3, max: 5 },
  { key: "5.00 to 9.99", min: 5, max: 10 },
  { key: "10.00 and above", min: 10, max: Number.POSITIVE_INFINITY },
] as const;

export function oddsRangeOf(bet: BetJson): string {
  const odds = bet.decimalOdds;
  if (odds === null) return UNSPECIFIED;
  const range = ODDS_RANGES.find((r) => odds >= r.min && odds < r.max);
  return range ? range.key : UNSPECIFIED;
}

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** Weekday of the settlement date in Lagos. */
export function weekdayOf(bet: BetJson): string {
  if (bet.settledAt === null) return UNSPECIFIED;
  return WEEKDAYS[weekdayIndex(lagosYmd(new Date(bet.settledAt)))] ?? UNSPECIFIED;
}

export function orderedWeekdays(rows: readonly GroupRow[]): GroupRow[] {
  return [...rows].sort((a, b) => WEEKDAYS.indexOf(a.key as (typeof WEEKDAYS)[number]) - WEEKDAYS.indexOf(b.key as (typeof WEEKDAYS)[number]));
}

export function orderedOddsRanges(rows: readonly GroupRow[]): GroupRow[] {
  const order: string[] = ODDS_RANGES.map((r) => r.key);
  return [...rows].sort((a, b) => {
    const ai = order.indexOf(a.key);
    const bi = order.indexOf(b.key);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

// ---- streaks --------------------------------------------------------------------------------

export interface Streaks {
  longestWin: number;
  longestLoss: number;
  /** Current run at the end of the history: kind and length. Voids and pending bets do not break a run. */
  current: { kind: "won" | "lost"; length: number } | null;
}

export function streaks(bets: readonly BetJson[]): Streaks {
  const ordered = bets
    .filter((b) => (b.status === "won" || b.status === "lost") && b.settledAt !== null)
    .sort((a, b) => new Date(a.settledAt as string).getTime() - new Date(b.settledAt as string).getTime());
  let longestWin = 0;
  let longestLoss = 0;
  let run = 0;
  let kind: "won" | "lost" | null = null;
  for (const bet of ordered) {
    const next = bet.status as "won" | "lost";
    run = next === kind ? run + 1 : 1;
    kind = next;
    if (kind === "won") longestWin = Math.max(longestWin, run);
    else longestLoss = Math.max(longestLoss, run);
  }
  return { longestWin, longestLoss, current: kind === null ? null : { kind, length: run } };
}
