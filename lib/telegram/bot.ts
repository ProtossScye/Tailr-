import { parseSlipText } from "../parser/parse-slip-text";
import { MAX_PASTE_CHARS } from "../services/slip-parse";
import { parseCreateSlip } from "../services/validate";
import { hashLinkCode, normalizeLinkCode } from "./code";
import { MESSAGES, draftReply } from "./messages";
import type { BotDeps, RedeemResult, TelegramUpdate } from "./types";

/**
 * What the Telegram bot does with one update. Private chats only: in a group, supergroup or channel
 * it says nothing and looks nothing up. It never reads or writes a bet; the most it does is save a
 * draft for the Tailr account the sender has connected. Message text is never stored or logged.
 * Never throws: a failure becomes a short apology.
 */
export async function handleUpdate(deps: BotDeps, update: TelegramUpdate): Promise<void> {
  const message = update.message;
  if (!message || message.chat?.type !== "private") return;
  const from = message.from;
  if (!from || from.is_bot === true) return;

  const chatId = message.chat.id;
  const reply = (text: string) => deps.api.sendMessage(chatId, text);

  try {
    const accepted = await deps.repo.acceptUpdate(update.update_id, from.id);
    if (accepted === "duplicate") return;
    if (accepted === "limited") return await reply(MESSAGES.rateLimited);

    const text = typeof message.text === "string" ? message.text : null;
    if (text === null) {
      if (message.photo || message.document) await reply(MESSAGES.screenshot);
      return;
    }

    const command = /^\/([A-Za-z_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/.exec(text.trim());
    if (command) return await runCommand(deps, { telegramUserId: from.id, chatId, name: (command[1] as string).toLowerCase(), argument: (command[2] ?? "").trim() }, reply);

    await saveSlip(deps, from.id, text, reply);
  } catch {
    // The error is not shown or logged here: it could carry details from the database.
    try {
      await reply(MESSAGES.failed);
    } catch {
      // Nothing more can be done for this message.
    }
  }
}

const REDEEM_REPLY: Record<RedeemResult, string> = {
  linked: MESSAGES.linked,
  invalid: MESSAGES.badCode,
  limited: MESSAGES.linkLimited,
  taken: MESSAGES.taken,
};

async function runCommand(
  deps: BotDeps,
  c: { telegramUserId: number; chatId: number; name: string; argument: string },
  reply: (text: string) => Promise<void>,
): Promise<void> {
  switch (c.name) {
    case "start":
    case "link": {
      if (c.name === "start" && c.argument === "") return await reply(MESSAGES.welcome);
      const code = normalizeLinkCode(c.argument);
      if (code === null) return await reply(MESSAGES.badCodeShape);
      return await reply(REDEEM_REPLY[await deps.repo.redeemLink(hashLinkCode(code), c.telegramUserId, c.chatId)]);
    }
    case "unlink":
      return await reply((await deps.repo.unlink(c.telegramUserId)) ? MESSAGES.unlinked : MESSAGES.notConnected);
    default:
      return await reply(MESSAGES.help);
  }
}

async function saveSlip(deps: BotDeps, telegramUserId: number, text: string, reply: (text: string) => Promise<void>): Promise<void> {
  if (!(await deps.repo.isLinked(telegramUserId))) return await reply(MESSAGES.needConnect);
  if ([...text].length > MAX_PASTE_CHARS) return await reply(MESSAGES.tooLong);

  const parsed = parseSlipText(text);
  const complete = parsed.selections.filter((s) => s.event !== null && s.selection !== null);
  if (complete.length === 0) return await reply(MESSAGES.nothingFound);

  const { slip, selections } = parseCreateSlip({
    sourceBookmaker: parsed.bookmaker,
    selections: complete.map((s) => ({ sport: s.sport, event: s.event, marketType: s.market, selection: s.selection, oddsDecimal: s.odds })),
  });
  const id = await deps.repo.createDraft(telegramUserId, slip, selections);
  if (id === null) return await reply(MESSAGES.needConnect);

  await reply(
    draftReply({
      legs: selections.map((s) => ({ event: s.event, selection: s.selection, odds: s.odds_decimal })),
      skipped: parsed.selections.length - complete.length,
      warnings: parsed.warnings,
      url: `${deps.appUrl}/create?draft=${id}`,
    }),
  );
}
