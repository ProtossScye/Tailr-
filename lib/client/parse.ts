/**
 * Reading a pasted slip. The server reads the text and returns a draft to review; nothing is saved
 * and nothing is looked up. A selection only becomes part of the slip when the person adds it.
 */
import type { AiStatusJson, ImageReadJson, ParsedSlipJson } from "@/lib/api/types";
import { api, apiUpload } from "./api";
import type { DraftLeg } from "./drafts";
import { oddsText } from "./slips";

export type ParsedSelectionJson = ParsedSlipJson["selections"][number];

export const MAX_PASTE_CHARS = 10_000;

export const parsePastedText = (text: string) => api<ParsedSlipJson>("/api/slips/parse", { method: "POST", body: { text } });

/** The same reading, done by AI and then checked against the text on the server. */
export const readWithAi = (text: string) => api<ParsedSlipJson>("/api/slips/parse-ai", { method: "POST", body: { text } });

/** Sends a prepared screenshot. The AI copies out its text, and the text reader reads that text. */
export function readScreenshot(image: Blob): Promise<ImageReadJson> {
  const form = new FormData();
  form.set("image", image, "slip.jpg");
  return apiUpload<ImageReadJson>("/api/slips/parse-image", form);
}

export const fetchAiStatus = () => api<AiStatusJson>("/api/ai/status");

/** A selection that has both an event and a pick can go straight onto the slip. */
export const isComplete = (s: ParsedSelectionJson): s is ParsedSelectionJson & { event: string; selection: string } => s.event !== null && s.selection !== null;

/** Only what was read. A missing value stays blank for the person to fill in. */
export function toDraftLeg(s: ParsedSelectionJson): DraftLeg {
  return { sport: s.sport ?? "", event: s.event ?? "", market: s.market ?? "", selection: s.selection ?? "", odds: oddsText(s.odds) };
}

const FIELD_LABEL = { event: "event", selection: "pick", odds: "odds" } as const;

/** "No odds", "No event or odds": what the text did not say. */
export function missingNote(s: ParsedSelectionJson): string | null {
  if (s.missing.length === 0) return null;
  const names = s.missing.map((m) => FIELD_LABEL[m]);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}` : (names[0] as string);
  return `No ${list} in the text`;
}

export const CONFIDENCE_LABEL: Record<ParsedSelectionJson["confidence"], string> = {
  high: "Read clearly",
  medium: "Check this",
  low: "Needs your help",
};

/**
 * The odds multiplied together, only when EVERY read selection has odds, so a combined figure is never
 * shown for a slip with a missing price. It is arithmetic on what the text said, to compare with any total
 * the text states.
 */
export function combinedFromRead(selections: readonly Pick<ParsedSelectionJson, "odds">[]): number | null {
  if (selections.length === 0 || selections.some((s) => s.odds === null)) return null;
  return Math.round(selections.reduce((acc, s) => acc * (s.odds as number), 1) * 1000) / 1000;
}
