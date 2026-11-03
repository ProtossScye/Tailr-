/**
 * Add/edit bet form logic, kept free of React so it can be tested. The form keeps everything as the
 * text the person typed; buildBetPayload turns it into the exact JSON the API expects, or returns
 * one message per field.
 */
import type { Currency } from "@/lib/accounting";
import type { BetJson } from "@/lib/api/types";
import { isoToLagosLocal, lagosLocalToIso } from "./dates";
import { combinedOdds, minorToInput, parseAmountToMinor, parseOdds } from "./money";

export const MAX_LEGS = 50;

export interface LegValues {
  sport: string;
  event: string;
  market: string;
  selection: string;
  odds: string;
}

export interface BetFormValues {
  currency: Currency;
  stake: string;
  /** datetime-local text, Lagos time. */
  placedLocal: string;
  bookmaker: string;
  totalOdds: string;
  notes: string;
  legs: LegValues[];
}

export const emptyLeg = (): LegValues => ({ sport: "", event: "", market: "", selection: "", odds: "" });

export function emptyForm(now: Date = new Date()): BetFormValues {
  return {
    currency: "NGN",
    stake: "",
    placedLocal: isoToLagosLocal(now),
    bookmaker: "",
    totalOdds: "",
    notes: "",
    legs: [emptyLeg()],
  };
}

export function valuesFromBet(bet: BetJson): BetFormValues {
  return {
    currency: bet.currency,
    stake: minorToInput(bet.stakeMinor),
    placedLocal: isoToLagosLocal(bet.placedAt),
    bookmaker: bet.bookmakerLabel ?? "",
    totalOdds: bet.decimalOdds === null ? "" : String(bet.decimalOdds),
    notes: bet.notes ?? "",
    legs:
      bet.selections.length > 0
        ? [...bet.selections]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((s) => ({
              sport: s.sport ?? "",
              event: s.event,
              market: s.marketType ?? "",
              selection: s.selection,
              odds: s.oddsDecimal === null ? "" : String(s.oddsDecimal),
            }))
        : [emptyLeg()],
  };
}

export interface BetPayload {
  currency: Currency;
  stakeMinor: number;
  bookmakerLabel: string | null;
  decimalOdds: number | null;
  placedAt: string;
  notes: string | null;
  selections: {
    sport: string | null;
    event: string;
    marketType: string | null;
    selection: string;
    oddsDecimal: number | null;
  }[];
}

export type FormErrors = Record<string, string>;

const blankToNull = (text: string): string | null => (text.trim() === "" ? null : text.trim());

/** Mirrors the server's limits closely enough to catch mistakes early. The server still has the last word. */
export function buildBetPayload(values: BetFormValues, now: Date = new Date()): { ok: true; payload: BetPayload } | { ok: false; errors: FormErrors } {
  const errors: FormErrors = {};

  const stake = parseAmountToMinor(values.stake);
  if (!stake.ok) errors.stake = stake.error;

  const placedAt = lagosLocalToIso(values.placedLocal);
  if (placedAt === null) errors.placedAt = "Choose the date and time you placed the bet.";
  else if (new Date(placedAt).getTime() > now.getTime() + 5 * 60_000) errors.placedAt = "The placed time cannot be in the future.";

  if (values.bookmaker.trim().length > 80) errors.bookmaker = "Keep the bookmaker name under 80 characters.";
  if (values.notes.length > 2000) errors.notes = "Notes can be up to 2,000 characters.";

  let decimalOdds: number | null = null;
  if (values.totalOdds.trim() !== "") {
    const odds = parseOdds(values.totalOdds);
    if (odds.ok) decimalOdds = odds.value;
    else errors.totalOdds = odds.error;
  }

  if (values.legs.length < 1) errors.legs = "Add at least one selection.";
  if (values.legs.length > MAX_LEGS) errors.legs = `A bet can have up to ${MAX_LEGS} selections.`;

  const selections: BetPayload["selections"] = [];
  values.legs.forEach((leg, i) => {
    if (leg.event.trim() === "") errors[`legs.${i}.event`] = "Enter the event, for example Arsenal v Chelsea.";
    else if (leg.event.trim().length > 200) errors[`legs.${i}.event`] = "Keep the event under 200 characters.";
    if (leg.selection.trim() === "") errors[`legs.${i}.selection`] = "Enter your pick, for example Arsenal to win.";
    else if (leg.selection.trim().length > 200) errors[`legs.${i}.selection`] = "Keep the pick under 200 characters.";
    if (leg.sport.trim().length > 80) errors[`legs.${i}.sport`] = "Keep the sport under 80 characters.";
    if (leg.market.trim().length > 80) errors[`legs.${i}.market`] = "Keep the market under 80 characters.";
    let oddsDecimal: number | null = null;
    if (leg.odds.trim() !== "") {
      const odds = parseOdds(leg.odds);
      if (odds.ok) oddsDecimal = odds.value;
      else errors[`legs.${i}.odds`] = odds.error;
    }
    selections.push({
      sport: blankToNull(leg.sport),
      event: leg.event.trim(),
      marketType: blankToNull(leg.market),
      selection: leg.selection.trim(),
      oddsDecimal,
    });
  });

  if (Object.keys(errors).length > 0 || !stake.ok || placedAt === null) return { ok: false, errors };

  return {
    ok: true,
    payload: {
      currency: values.currency,
      stakeMinor: stake.minor,
      bookmakerLabel: blankToNull(values.bookmaker),
      decimalOdds,
      placedAt,
      notes: blankToNull(values.notes),
      selections,
    },
  };
}

/** Combined odds of the legs as typed, or null unless every leg has valid odds. */
export function legsCombinedOdds(legs: readonly LegValues[]): number | null {
  return combinedOdds(
    legs.map((leg) => {
      const parsed = parseOdds(leg.odds);
      return parsed.ok ? parsed.value : null;
    }),
  );
}

const SIMPLE_FIELDS: Record<string, string> = {
  stakeMinor: "stake",
  placedAt: "placedAt",
  bookmakerLabel: "bookmaker",
  decimalOdds: "totalOdds",
  notes: "notes",
  currency: "currency",
  selections: "legs",
};

const LEG_FIELDS: Record<string, string> = {
  event: "event",
  selection: "selection",
  sport: "sport",
  marketType: "market",
  oddsDecimal: "odds",
};

/** Maps the API's `issues[].field` names onto the form's error keys. Anything unknown lands on `form`. */
export function mapIssues(issues: readonly { field: string; message: string }[]): FormErrors {
  const errors: FormErrors = {};
  const put = (key: string, message: string) => {
    errors[key] = errors[key] ? `${errors[key]} ${message}` : message;
  };
  for (const issue of issues) {
    const leg = /^selections\[(\d+)\]\.(\w+)$/.exec(issue.field);
    if (leg) {
      const field = LEG_FIELDS[leg[2] as string];
      put(field ? `legs.${leg[1]}.${field}` : "form", issue.message);
      continue;
    }
    const simple = SIMPLE_FIELDS[issue.field];
    put(simple ?? "form", issue.message);
  }
  return errors;
}
