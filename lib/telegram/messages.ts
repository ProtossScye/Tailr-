import type { ParsedSlip } from "../parser/parse-slip-text";

export const TELEGRAM_LIMIT = 4096;
const MAX_LISTED = 10;
const MAX_WARNINGS = 3;
const MAX_LINE = 120;

const EXAMPLE = "Arsenal vs Chelsea - Arsenal to win @1.85";

export const MESSAGES = {
  welcome: `Hi, I'm the Tailr bot. I turn a slip you send me as text into a draft in your Tailr account. A draft is never a placed bet.

To connect: open Tailr, go to Profile, then Telegram, and tap Connect. Then send me /link followed by the code, or tap the button in Tailr.`,
  help: `Send me a slip as text, one selection per line, for example:
${EXAMPLE}

I save it as a draft in Tailr (not a placed bet) and send you a link to check it.

/link CODE  connect your Tailr account
/unlink  disconnect it
/help  show this again`,
  needConnect: `I can't save slips until you connect your Tailr account. Open Tailr, go to Profile, then Telegram, tap Connect, and send me the code with /link.`,
  linked: "Connected. Send me a slip as text and I'll save it as a draft for you to check in Tailr.",
  badCodeShape: "That doesn't look like a Tailr code. Open Tailr, go to Profile, then Telegram, and copy the code from there.",
  badCode: "That code is wrong or has expired. Make a new one in Tailr: Profile, then Telegram, then Connect.",
  linkLimited: "Too many wrong codes. Wait an hour, then make a new code in Tailr and try again.",
  taken: "This Telegram account is already connected to a Tailr account. Send /unlink to disconnect it, then try your code again.",
  unlinked: "Disconnected. I won't save anything for that account until you connect again.",
  notConnected: "This chat isn't connected to a Tailr account.",
  rateLimited: "You're sending too many messages. Try again in a little while.",
  tooLong: "That's too long for me to read. Send up to 10,000 characters.",
  screenshot: "I can't read screenshots in Telegram yet. Paste the slip as text here, or open Tailr and use Create to read a screenshot.",
  nothingFound: `I couldn't find any selections in that. Send one per line with the match, the pick and the odds, for example:
${EXAMPLE}`,
  failed: "Something went wrong on our side. Please send that again in a moment.",
} as const;

const clip = (text: string, max: number): string => {
  const chars = [...text];
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join("")}…`;
};

export interface DraftLeg {
  event: string;
  selection: string;
  odds: number | null;
}

/** The reply after a draft is saved: what was read, what to check, and where to review it. Always under Telegram's length limit. */
export function draftReply(args: { legs: DraftLeg[]; skipped: number; warnings: ParsedSlip["warnings"]; url: string }): string {
  const { legs, skipped, warnings, url } = args;
  const parts: string[] = [`Saved as a draft (not a placed bet). I read ${legs.length} ${legs.length === 1 ? "selection" : "selections"}:`];

  const listed = legs.slice(0, MAX_LISTED).map((l, i) => `${i + 1}. ${clip(`${l.event} · ${l.selection} · ${l.odds === null ? "odds missing" : l.odds.toFixed(2)}`, MAX_LINE)}`);
  parts.push(listed.join("\n"));
  if (legs.length > MAX_LISTED) parts.push(`…and ${legs.length - MAX_LISTED} more.`);

  if (skipped > 0) parts.push(`${skipped} ${skipped === 1 ? "line was" : "lines were"} left out because it had no match or no pick.`);
  const notes = warnings.slice(0, MAX_WARNINGS).map((w) => `- ${clip(w, 200)}`);
  if (notes.length > 0) parts.push(`Check:\n${notes.join("\n")}`);
  parts.push(`Review and edit it here:\n${url}`);

  return clip(parts.join("\n\n"), TELEGRAM_LIMIT);
}
