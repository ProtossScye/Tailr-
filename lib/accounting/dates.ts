import { AccountingError } from "./errors";
import type { DateRange } from "./types";

/**
 * Lagos (Africa/Lagos) is UTC+1 all year with no daylight saving, so a Lagos
 * calendar day is a fixed 24-hour window: it starts at 23:00 UTC the previous
 * day. All ranges here are half-open: [start, end).
 *
 * These helpers use only UTC arithmetic, so results do not depend on the
 * server's or browser's local timezone.
 */
const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses "YYYY-MM-DD" and returns the UTC instant of Lagos midnight that starts it. */
function lagosMidnightUtcMs(ymd: string): number {
  const match = YMD.exec(ymd);
  if (!match) {
    throw new AccountingError(`Invalid date "${ymd}": expected YYYY-MM-DD`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const utcMidnight = Date.UTC(year, month - 1, day);
  const check = new Date(utcMidnight);
  // Reject impossible dates such as 2027-02-29 or 2026-13-01 (Date would roll them over).
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new AccountingError(`Invalid calendar date: ${ymd}`);
  }
  return utcMidnight - LAGOS_OFFSET_MS;
}

/** The Lagos calendar day "YYYY-MM-DD" as a half-open UTC range. */
export function lagosDayRange(ymd: string): DateRange {
  const start = lagosMidnightUtcMs(ymd);
  return { start: new Date(start), end: new Date(start + DAY_MS) };
}

/** Inclusive Lagos calendar dates (from..to) as one half-open UTC range. */
export function lagosDateRange(fromYmd: string, toYmd: string): DateRange {
  const start = lagosMidnightUtcMs(fromYmd);
  const lastDayStart = lagosMidnightUtcMs(toYmd);
  if (lastDayStart < start) {
    throw new AccountingError(`Invalid range: ${fromYmd} is after ${toYmd}`);
  }
  return { start: new Date(start), end: new Date(lastDayStart + DAY_MS) };
}

/** The Lagos calendar day that contains the given instant. */
export function lagosDayRangeContaining(instant: Date): DateRange {
  const ms = instant.getTime();
  if (Number.isNaN(ms)) {
    throw new AccountingError("Invalid date");
  }
  const lagosShifted = ms + LAGOS_OFFSET_MS;
  const dayStartShifted = Math.floor(lagosShifted / DAY_MS) * DAY_MS;
  const start = dayStartShifted - LAGOS_OFFSET_MS;
  return { start: new Date(start), end: new Date(start + DAY_MS) };
}
