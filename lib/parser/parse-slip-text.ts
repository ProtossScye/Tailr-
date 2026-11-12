/**
 * Reads a slip someone pasted as text into structured selections.
 *
 * This is plain, deterministic code, not AI, and its output is an untrusted DRAFT for the person to
 * check. The rule that shapes everything here: read only what the text says. Nothing is looked up,
 * guessed or converted, so it never adds odds, markets, sports, fixtures or booking codes that are
 * not in the text, and anything it is unsure of is flagged (confidence, missing fields, warnings,
 * and the lines it set aside). It never throws on odd input.
 */

export const MAX_PARSED_SELECTIONS = 50;
const MAX_CHARS = 10_000;
const MAX_FIELD = 200;

export type MissingField = "event" | "selection" | "odds";
export type Confidence = "high" | "medium" | "low";

export interface ParsedSelection {
  /** The line it was read from, cleaned of emoji and extra spaces. */
  sourceLine: string;
  /** Only when a line like "Football:" said so. Never guessed from team names. */
  sport: string | null;
  event: string | null;
  /** Only when the text names a market (for example "Match result" or "1X2"). "to win" is not a market. */
  market: string | null;
  selection: string | null;
  /** Decimal odds exactly as written. American, fractional and comma odds are never converted. */
  odds: number | null;
  /**
   * high: event, selection and odds all read from one line. medium: odds missing, or the event
   * came from the line above. low: no event or no selection, an unclear line, or text cut to fit.
   */
  confidence: Confidence;
  missing: MissingField[];
}

export interface ParsedSlip {
  selections: ParsedSelection[];
  /** Only a bookmaker named in the text. */
  bookmaker: string | null;
  /** Only a code the text labels as a booking code. Tailr cannot check that it works. */
  bookingCode: string | null;
  /** The total the text claims. Shown for comparison; never used as the slip's odds. */
  totalOdds: number | null;
  /** Lines that were not a selection, so the person can see what was left out. */
  ignoredLines: string[];
  warnings: string[];
}

// Vocabulary -----------------------------------------------------------------------------

const SPORTS = [
  "football",
  "basketball",
  "tennis",
  "american football",
  "baseball",
  "ice hockey",
  "cricket",
  "rugby",
  "boxing",
  "mma",
  "table tennis",
  "volleyball",
  "esports",
];
const SPORT_HEADER = new RegExp(`^(${SPORTS.join("|")})\\s*:?$`, "i");

const BOOKMAKERS: readonly (readonly [string, RegExp])[] = [
  ["Bet9ja", /\bbet\s?9ja\b/i],
  ["SportyBet", /\bsporty\s?bet\b/i],
  ["1xBet", /\b1x\s?bet\b/i],
  ["BetKing", /\bbet\s?king\b/i],
  ["Betway", /\bbetway\b/i],
  ["Bet365", /\bbet\s?365\b/i],
  ["NairaBet", /\bnaira\s?bet\b/i],
  ["MSport", /\bm\s?sport\b/i],
  ["BangBet", /\bbang\s?bet\b/i],
  ["Betano", /\bbetano\b/i],
  ["Paripesa", /\bparipesa\b/i],
  ["22Bet", /\b22\s?bet\b/i],
  ["Melbet", /\bmelbet\b/i],
  ["Parimatch", /\bparimatch\b/i],
];

/** Names a person might write for a market, mapped to the name Tailr uses. Exact matches only. */
const MARKET_ALIASES: Record<string, string> = {
  "match result": "Match result",
  "1x2": "Match result",
  "full time result": "Match result",
  "ft result": "Match result",
  "match winner": "Match result",
  "double chance": "Double chance",
  "over/under": "Over/Under",
  "over under": "Over/Under",
  totals: "Over/Under",
  "goals over/under": "Over/Under",
  handicap: "Handicap",
  "asian handicap": "Handicap",
  "european handicap": "Handicap",
  "both teams to score": "Both teams to score",
  "correct score": "Correct score",
  moneyline: "Moneyline",
  "player props": "Player props",
  "draw no bet": "Draw no bet",
  dnb: "Draw no bet",
};

/** Markets whose name is also what the person picked: "Both teams to score" on its own is a pick. */
const SELF_PICK_MARKETS = new Set(["both teams to score"]);

const marketOf = (text: string): string | null => MARKET_ALIASES[text.trim().toLowerCase()] ?? null;

/** Words that make a line without an event look like a pick rather than chatter. */
const STRONG_PICK =
  /\b(?:to win|to draw|to score|draw|over|under|btts|gg|ng|1x|x2|double chance|handicap|dnb|clean sheet)\b|(?:^|\s)[+-]\d/i;

const VS = /^(.+?)\s+(?:vs\.?|v)\s+(.+)$/i;
/** "Event - pick" or "Event: pick", where the left side is an event. */
const EVENT_THEN_PICK = /^(.+?\s(?:vs\.?|v)\s.+?)(?:\s+[-–—]\s+|:\s+)(.+)$/i;
/** Something that shows a pick sits before a bare trailing number, so a time like 12.30 is not read as odds. */
const PICK_BEFORE_NUMBER = /\s[-–—]\s|\||:\s|\b(?:to win|win|draw|over|under|btts|gg|ng|dnb|handicap)\b/i;

// Cleaning -------------------------------------------------------------------------------

function cleanLine(raw: string): string {
  let line = raw
    .replace(/[\p{Extended_Pictographic}️‍]/gu, " ")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  line = line.replace(/^(?:[•▪►▶*·]+\s*|[-–—]\s+)+/, "");
  line = line.replace(/^#?\d{1,2}[.)]\s+/, "");
  return line.trim();
}

const stripTrailingPunctuation = (text: string): string => text.replace(/[,;:\s]+$/, "").trim();

export function findBookmaker(line: string): string | null {
  for (const [name, pattern] of BOOKMAKERS) if (pattern.test(line)) return name;
  return null;
}

// Odds -----------------------------------------------------------------------------------

// The lookahead stops "@1,85" and "@5/2" from being read as the odds 1 and 5.
const NUM = String.raw`(\d+(?:\.\d{1,3})?)(?![\d,/]|\.\d)`;
const AT_ODDS = new RegExp(String.raw`@\s*${NUM}`, "g");
const LABEL_ODDS = new RegExp(String.raw`\bodds?\s*[:=]?\s*${NUM}`, "gi");
const PAREN_ODDS = /\(\s*(\d+\.\d{1,3})\s*\)\s*$/;
const BARE_ODDS = /(?:^|\s)(\d+\.\d{2,3})$/;
const BARE_FRACTION = /(?:^|\s)(\d{1,3}\/\d{1,3})$/;
/** "1.50 Arsenal vs Chelsea - Arsenal to win": a price first, only trusted when an event and a pick follow and it is not a clock time like "3.30 pm". */
const LEADING_ODDS = /^(\d+\.\d{2,3})(?!\s*(?:am|pm|:))\s+(\S.*)$/i;
const LEADING_ODDS_WARNING = "Some odds were read from the start of a line. If one of those numbers is a time, correct it.";
const NOT_ODDS_BEFORE = /^(?:over|under|o|u|handicap|hcp|ah|at|[+-])$/i;

function lastMatch(pattern: RegExp, text: string): RegExpMatchArray | null {
  let last: RegExpMatchArray | null = null;
  for (const m of text.matchAll(pattern)) last = m;
  return last;
}

const cut = (text: string, m: RegExpMatchArray): string => `${text.slice(0, m.index)} ${text.slice((m.index ?? 0) + m[0].length)}`.replace(/\s+/g, " ").trim();

interface OddsReading {
  odds: number | null;
  rest: string;
  warnings: string[];
}

/** Takes a decimal price out of a line if one is clearly there, and says so when a price is there but unusable. */
function extractOdds(line: string): OddsReading {
  const warnings: string[] = [];
  let rest = line;
  let raw: string | null = null;

  const at = lastMatch(AT_ODDS, rest);
  const label = at ? null : lastMatch(LABEL_ODDS, rest);
  const paren = at || label ? null : PAREN_ODDS.exec(rest.trimEnd());
  const chosen = at ?? label ?? paren;
  if (chosen) {
    raw = chosen[1] as string;
    rest = cut(rest, chosen);
  } else {
    const trimmed = rest.trimEnd();
    const bare = BARE_ODDS.exec(trimmed);
    if (bare) {
      const before = trimmed.slice(0, bare.index).trim();
      const previous = before.split(" ").pop() ?? "";
      if (before !== "" && PICK_BEFORE_NUMBER.test(before) && !NOT_ODDS_BEFORE.test(previous)) {
        raw = bare[1] as string;
        rest = before;
      }
    }
    if (raw === null) {
      const fraction = BARE_FRACTION.exec(trimmed);
      if (fraction) {
        const before = trimmed.slice(0, fraction.index).trim();
        if (before !== "" && PICK_BEFORE_NUMBER.test(before)) {
          warnings.push(`Fractional odds (${fraction[1]}) are not converted. Enter decimal odds like 1.85.`);
          rest = before.replace(/@\s*$/, "").trim();
        }
      }
    }
  }

  let odds: number | null = null;
  if (raw !== null) {
    const value = Number(raw);
    if (value < 1) warnings.push(`Odds of ${raw} are below 1.00 and were not used.`);
    else odds = Math.round(value * 1000) / 1000;
  } else {
    // An @ that was not followed by a clean decimal price: say why it was not used.
    const leftover = /@\s*(\S+)/.exec(rest);
    if (leftover) {
      const token = leftover[1] as string;
      if (/^[+-]\d{3,4}$/.test(token)) warnings.push(`American-style odds (${token}) are not converted. Enter decimal odds like 1.85.`);
      else if (/^\d{1,3}\/\d{1,3}$/.test(token)) warnings.push(`Fractional odds (${token}) are not converted. Enter decimal odds like 1.85.`);
      else warnings.push(`Could not read the odds "@${token}". Enter decimal odds like 1.85.`);
      rest = cut(rest, leftover);
    }
  }
  // Last of all, so a price that was written but unusable (fractions, American) is never replaced by a number at the start.
  if (odds === null && raw === null && warnings.length === 0) {
    const leading = LEADING_ODDS.exec(rest);
    if (leading && EVENT_THEN_PICK.test(leading[2] as string)) {
      const value = Number(leading[1]);
      if (value >= 1) {
        odds = Math.round(value * 1000) / 1000;
        rest = leading[2] as string;
        warnings.push(LEADING_ODDS_WARNING);
      }
    }
  }
  return { odds, rest, warnings };
}

// A stated total: "Total odds 4.02", "Combined odds @ 4.50", "Same game multi odds: 4.50".
const TOTAL_WORD = String.raw`(?:same[-\s]?game(?:[-\s](?:multi|parlay))?|sgm|sgp|total|combined|accumulator|acca|overall|multi|parlay)`;
const TOTAL_LINE = new RegExp(String.raw`^${TOTAL_WORD}(?:\s+(?:${TOTAL_WORD}|odds?|price))*\s*[:=\-@]?\s*(\d+(?:\.\d+)?)\s*$`, "i");
/** A same game multi label at the start of a line, with whatever separator follows it. */
const SGM_HEAD = /^(?:same[-\s]?game[-\s]?(?:multi|parlay)s?|sgm|sgp)\b[\s:\-–—|]*/i;
// Structure ------------------------------------------------------------------------------

interface Draft {
  sourceLine: string;
  sport: string | null;
  event: string | null;
  market: string | null;
  selection: string | null;
  odds: number | null;
  adopted: boolean;
  unclear: boolean;
  truncated: boolean;
}

function finalize(d: Draft): ParsedSelection {
  const missing: MissingField[] = [];
  if (d.event === null) missing.push("event");
  if (d.selection === null) missing.push("selection");
  if (d.odds === null) missing.push("odds");
  let confidence: Confidence;
  if (d.event === null || d.selection === null || d.truncated || d.unclear) confidence = "low";
  else if (d.adopted || d.odds === null) confidence = "medium";
  else confidence = "high";
  return { sourceLine: d.sourceLine, sport: d.sport, event: d.event, market: d.market, selection: d.selection, odds: d.odds, confidence, missing };
}

interface Classified {
  event: string | null;
  market: string | null;
  picks: string[];
}

function classify(parts: string[]): Classified {
  let event: string | null = null;
  let market: string | null = null;
  const picks: string[] = [];
  for (const part of parts) {
    if (event === null && VS.test(part)) {
      event = part;
      continue;
    }
    const colon = /^(.+?):\s+(.+)$/.exec(part);
    const named = colon ? marketOf(colon[1] as string) : null;
    if (colon && named) {
      market = market ?? named;
      picks.push(stripTrailingPunctuation(colon[2] as string));
      continue;
    }
    const alone = marketOf(part);
    if (alone && market === null) {
      market = alone;
      if (SELF_PICK_MARKETS.has(part.trim().toLowerCase())) picks.push(part);
      continue;
    }
    picks.push(part);
  }
  return { event, market, picks };
}

/** Checks that apply however a slip was read: the same pick twice, and a stated total that does not match the legs. */
export function collectSlipWarnings(selections: readonly ParsedSelection[], totalOdds: number | null, sameGame = false): string[] {
  const out: string[] = [];
  const seen = new Map<string, number>();
  for (const s of selections) {
    if (s.event === null || s.selection === null) continue;
    const key = `${s.event.toLowerCase()}|${s.selection.toLowerCase()}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
    if (seen.get(key) === 2) out.push(`"${s.event}: ${s.selection}" appears more than once on the slip.`);
  }
  // A same game multi is priced as one bet, so its total is not the product of its legs.
  const oneEvent = selections.length > 1 && selections.every((s) => s.event !== null && s.event.toLowerCase() === (selections[0]?.event ?? "").toLowerCase());
  if (!sameGame && !oneEvent && totalOdds !== null && selections.length > 0 && selections.every((s) => s.odds !== null)) {
    const product = selections.reduce((acc, s) => acc * (s.odds as number), 1);
    if (Math.abs(product - totalOdds) / totalOdds > 0.01) {
      out.push(`The total odds on the slip (${totalOdds.toFixed(2)}) do not match the product of the selections' odds (${product.toFixed(2)}).`);
    }
  }
  return out;
}

export function parseSlipText(input: string): ParsedSlip {
  const warnings: string[] = [];
  const warn = (message: string) => {
    if (!warnings.includes(message)) warnings.push(message);
  };

  let text = typeof input === "string" ? input : "";
  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS);
    warn("Only the first 10,000 characters were read.");
  }

  const lines = text.split(/\r\n|\r|\n/).map(cleanLine).filter((l) => l !== "");
  if (lines.length === 0) warn("There was nothing to read.");

  const drafts: Draft[] = [];
  const ignoredLines: string[] = [];
  let bookmaker: string | null = null;
  let bookingCode: string | null = null;
  let totalOdds: number | null = null;
  let sport: string | null = null;
  // `pending` is an event line still waiting for its pick lines. `previous` is the selection on the
  // line just above, which a lone "Odds: 1.85" line may complete.
  const state: { pending: { event: string; sourceLine: string; used: boolean } | null; previous: Draft | null } = { pending: null, previous: null };

  const ignore = (line: string) => {
    ignoredLines.push(line.length > MAX_FIELD ? `${line.slice(0, MAX_FIELD)}…` : line);
    state.previous = null;
  };

  const fit = (value: string | null, draftFlags: { truncated: boolean }): string | null => {
    if (value === null) return null;
    if ([...value].length <= MAX_FIELD) return value;
    draftFlags.truncated = true;
    warn("A selection was too long to fit and was cut to 200 characters.");
    return [...value].slice(0, MAX_FIELD).join("");
  };

  const emit = (fields: { sourceLine: string; event: string | null; market: string | null; selection: string | null; odds: number | null; adopted?: boolean; unclear?: boolean }) => {
    const flags = { truncated: false };
    const draft: Draft = {
      sourceLine: fields.sourceLine,
      sport,
      event: fit(fields.event, flags),
      market: fit(fields.market, flags),
      selection: fit(fields.selection, flags),
      odds: fields.odds,
      adopted: fields.adopted ?? false,
      unclear: fields.unclear ?? false,
      truncated: flags.truncated,
    };
    drafts.push(draft);
    state.previous = draft;
  };

  const flushPending = () => {
    // An event that picks were read for is complete; only an event left on its own is reported.
    if (state.pending && !state.pending.used) emit({ sourceLine: state.pending.sourceLine, event: state.pending.event, market: null, selection: null, odds: null });
    state.pending = null;
  };

  let sameGame = false;
  for (const rawLine of lines) {
    let line = rawLine;
    // A sport header applies to the lines below it, exactly as written.
    const header = SPORT_HEADER.exec(line);
    if (header) {
      flushPending();
      sport = (header[1] as string).trim();
      state.previous = null;
      continue;
    }

    const code = /\b(?:booking\s*code|book\s*code|code)\s*[:\-=]?\s*([A-Za-z0-9]{4,12})\b/i.exec(line);
    if (code && !VS.test(line) && (/\d/.test(code[1] as string) || code[1] === (code[1] as string).toUpperCase())) {
      bookingCode = bookingCode ?? (code[1] as string).toUpperCase();
      bookmaker = bookmaker ?? findBookmaker(line);
      warn("Tailr can't check booking codes. Confirm the code with your bookmaker.");
      state.previous = null;
      continue;
    }

    if (SGM_HEAD.test(line)) sameGame = true;

    const total = TOTAL_LINE.exec(line);
    if (total) {
      const value = Number(total[1]);
      if (value >= 1) totalOdds = totalOdds ?? Math.round(value * 1000) / 1000;
      else warn(`The total odds of ${total[1]} are below 1.00 and were not used.`);
      state.previous = null;
      continue;
    }

    // "Same Game Multi - Arsenal vs Chelsea": the label is not part of the event name.
    const head = SGM_HEAD.exec(line);
    if (head) {
      line = line.slice(head[0].length).trim();
      if (line === "") {
        flushPending();
        state.previous = null;
        continue;
      }
    }

    const oddsOnly = /^odds?\s*[:=@-]?\s*(\d+(?:\.\d+)?)$/i.exec(line);
    if (oddsOnly) {
      const value = Number(oddsOnly[1]);
      const target = state.previous;
      if (target !== null && target.odds === null && value >= 1) {
        target.odds = Math.round(value * 1000) / 1000;
      } else {
        ignore(line);
      }
      continue;
    }

    const named = findBookmaker(line);
    if (named) {
      const bookmakerPattern = BOOKMAKERS.find(([n]) => n === named)?.[1] as RegExp;
      const leftover = line
        .replace(bookmakerPattern, " ")
        .replace(/\b(?:slip|ticket|code|booking|bet|odds|today|tips?|accumulator|acca)\b/gi, " ")
        .replace(/[^\p{L}\p{N}]+/gu, "");
      if (leftover === "") {
        bookmaker = bookmaker ?? named;
        state.previous = null;
        continue;
      }
      bookmaker = bookmaker ?? named;
    }

    // A line that may be a selection.
    const reading = extractOdds(line);
    const parts = (reading.rest.includes("|") ? reading.rest.split("|") : EVENT_THEN_PICK.exec(reading.rest)?.slice(1, 3) ?? [reading.rest])
      .map((p) => stripTrailingPunctuation(p.trim()))
      .filter((p) => p !== "");
    if (parts.length === 0) {
      ignore(line);
      continue;
    }

    const { event, market, picks } = classify(parts);
    const selection = picks.length > 0 ? picks.join(" - ") : null;
    const unclear = picks.length > 1;

    if (event !== null) {
      flushPending();
      reading.warnings.forEach(warn);
      if (selection !== null || reading.odds !== null || market !== null) {
        emit({ sourceLine: line, event, market, selection, odds: reading.odds, unclear });
      } else {
        state.pending = { event, sourceLine: line, used: false };
        state.previous = null;
      }
      continue;
    }

    // No event on this line: it is a pick only if it reads like one.
    if (selection !== null && (STRONG_PICK.test(selection) || reading.odds !== null)) {
      reading.warnings.forEach(warn);
      const adopted = state.pending;
      emit({ sourceLine: line, event: adopted ? adopted.event : null, market, selection, odds: reading.odds, adopted: adopted !== null, unclear });
      if (adopted) adopted.used = true;
      continue;
    }
    // In a same game multi, a short line under the match is a pick (for example a player), even with no price.
    if (sameGame && state.pending && selection !== null && [...selection].length <= 80 && !/[.!?]$/.test(selection)) {
      reading.warnings.forEach(warn);
      state.pending.used = true;
      emit({ sourceLine: line, event: state.pending.event, market, selection, odds: reading.odds, adopted: true, unclear });
      continue;
    }
    ignore(line);
  }
  flushPending();

  if (drafts.length > MAX_PARSED_SELECTIONS) {
    drafts.length = MAX_PARSED_SELECTIONS;
    warn(`Only the first ${MAX_PARSED_SELECTIONS} selections were kept.`);
  }
  const selections = drafts.map(finalize);

  collectSlipWarnings(selections, totalOdds, sameGame).forEach(warn);

  return { selections, bookmaker, bookingCode, totalOdds, ignoredLines, warnings };
}
