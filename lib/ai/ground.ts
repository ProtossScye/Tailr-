import { collectSlipWarnings, findBookmaker, MAX_PARSED_SELECTIONS, type MissingField, type ParsedSelection, type ParsedSlip } from "../parser/parse-slip-text";
import type { AiSlip } from "./slip-schema";

/**
 * The model's answer is a draft it could have made up. Grounding keeps only what can be found, as
 * written, in the text the person pasted: an odds figure that is not in the text becomes "missing",
 * an invented fixture is flagged, a booking code that is not in the text is dropped. The result has
 * the same shape as the rule-based reader's, so the rest of Tailr treats both the same way.
 */

const tokens = (text: string): string[] => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const FILLER = new Set(["vs", "v", "versus"]);

function numbersIn(text: string): Set<number> {
  const out = new Set<number>();
  for (const m of text.matchAll(/\d+(?:\.\d+)?/g)) out.add(Number(m[0]));
  return out;
}

export function groundAiSlip(ai: AiSlip, sourceText: string): ParsedSlip {
  const sourceTokens = new Set(tokens(sourceText));
  const sourceNumbers = numbersIn(sourceText);
  const compact = sourceText.replace(/\s+/g, " ").toLowerCase();
  const warnings: string[] = ["Read by AI. It can make mistakes, so check every line against your slip."];
  const warn = (m: string) => {
    if (!warnings.includes(m)) warnings.push(m);
  };

  const inSource = (field: string): boolean => {
    const t = tokens(field).filter((w) => !FILLER.has(w));
    return t.length > 0 && t.every((w) => sourceTokens.has(w));
  };
  const oddsInSource = (n: number | null): number | null => {
    if (n === null) return null;
    const rounded = Math.round(n * 1000) / 1000;
    return rounded >= 1 && sourceNumbers.has(rounded) ? rounded : null;
  };

  let ungrounded = 0;
  let oddsDropped = 0;
  const selections: ParsedSelection[] = ai.selections.map((s) => {
    const eventOk = s.event !== null && inSource(s.event);
    const selectionOk = s.selection !== null && inSource(s.selection);
    const event = eventOk ? s.event : null;
    const selection = selectionOk ? s.selection : null;
    if ((s.event !== null && !eventOk) || (s.selection !== null && !selectionOk)) ungrounded++;

    const odds = oddsInSource(s.odds);
    if (s.odds !== null && odds === null) oddsDropped++;

    const sport = s.sport !== null && inSource(s.sport) ? s.sport : null;
    const market = s.market !== null && inSource(s.market) ? s.market : null;

    const missing: MissingField[] = [];
    if (event === null) missing.push("event");
    if (selection === null) missing.push("selection");
    if (odds === null) missing.push("odds");

    const quoted = s.sourceText !== "" && compact.includes(s.sourceText.replace(/\s+/g, " ").toLowerCase());
    // AI reads are never "high": a person should look at every one.
    const confidence = missing.length === 0 && quoted ? "medium" : "low";
    return { sourceLine: quoted ? s.sourceText : [event, selection].filter(Boolean).join(": "), sport, event, market, selection, odds, confidence, missing };
  });

  // A selection with nothing left that was actually in the text is not worth showing.
  const kept = selections.filter((s) => s.event !== null || s.selection !== null);
  const emptied = selections.length - kept.length;

  if (ungrounded > 0) warn(`${ungrounded} part(s) the AI returned were not found in your text and were removed.`);
  if (oddsDropped > 0) warn(`${oddsDropped} odds figure(s) the AI returned were not in your text and were left blank. Fill them in yourself.`);
  if (emptied > 0) warn(`${emptied} selection(s) the AI returned could not be matched to your text and were dropped.`);
  if (ai.droppedItems > 0) warn(`${ai.droppedItems} unusable item(s) in the AI's answer were skipped.`);
  if (ai.truncated || kept.length > MAX_PARSED_SELECTIONS) warn(`Only the first ${MAX_PARSED_SELECTIONS} selections are shown.`);
  const shown = kept.slice(0, MAX_PARSED_SELECTIONS);

  let bookmaker: string | null = null;
  if (ai.bookmaker !== null) {
    const named = findBookmaker(ai.bookmaker);
    const found = sourceText.split(/\n/).map(findBookmaker).find((b) => b !== null) ?? null;
    if (named !== null && named === found) bookmaker = named;
    else warn("A bookmaker the AI named is not in your text and was ignored.");
  }

  let bookingCode: string | null = null;
  if (ai.bookingCode !== null) {
    const code = ai.bookingCode.toUpperCase();
    if (/^[A-Z0-9]{4,12}$/.test(code) && sourceText.toUpperCase().includes(code)) {
      bookingCode = code;
      warn("Tailr can't check booking codes. Confirm the code with your bookmaker.");
    } else warn("A booking code the AI returned is not in your text and was ignored.");
  }

  let totalOdds: number | null = null;
  if (ai.totalOdds !== null) {
    totalOdds = oddsInSource(ai.totalOdds);
    if (totalOdds === null) warn("A total odds figure the AI returned is not in your text and was ignored.");
  }

  if (shown.length === 0) warn("No selections could be confirmed from your text. Try the standard reader or enter them by hand.");
  collectSlipWarnings(shown, totalOdds).forEach(warn);

  return { selections: shown, bookmaker, bookingCode, totalOdds, ignoredLines: [], warnings };
}
