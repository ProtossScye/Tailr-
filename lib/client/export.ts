import { minorToInput } from "./money";
import type { BetJson } from "@/lib/api/types";

function cell(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  // Quote anything with a delimiter, quote or newline. Also defuse spreadsheet formulas.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

const HEADER = [
  "id",
  "currency",
  "stake",
  "status",
  "net_profit",
  "total_return",
  "total_odds",
  "bookmaker",
  "placed_at",
  "settled_at",
  "selections",
  "notes",
];

/** One row per bet. Money is written as plain decimals (no symbol, no thousands separators). */
export function betsToCsv(bets: readonly BetJson[]): string {
  const rows = bets.map((bet) =>
    [
      bet.id,
      bet.currency,
      minorToInput(bet.stakeMinor),
      bet.status,
      bet.netProfitMinor === null ? null : minorToInput(bet.netProfitMinor),
      bet.grossReturnMinor === null ? null : minorToInput(bet.grossReturnMinor),
      bet.decimalOdds,
      bet.bookmakerLabel,
      bet.placedAt,
      bet.settledAt,
      bet.selections.map((s) => [s.event, s.marketType, s.selection, s.oddsDecimal].filter((v) => v !== null && v !== "").join(" | ")).join(" ; "),
      bet.notes,
    ]
      .map(cell)
      .join(","),
  );
  return [HEADER.join(","), ...rows].join("\n") + "\n";
}
