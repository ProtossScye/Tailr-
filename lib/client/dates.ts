/**
 * Lagos calendar helpers for the UI. Lagos is UTC+1 all year with no daylight saving, which is
 * why a fixed "+01:00" offset is safe here.
 */

const TZ = "Africa/Lagos";

const ymdFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const hourFormat = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" });

/** The Lagos calendar date of an instant, as YYYY-MM-DD. */
export function lagosYmd(instant: Date): string {
  return ymdFormat.format(instant);
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** 0 = Monday ... 6 = Sunday. */
export function weekdayIndex(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export function weekStartYmd(ymd: string): string {
  return addDaysYmd(ymd, -weekdayIndex(ymd));
}

export type RangeFilter = "today" | "7d" | "30d" | "all";

export interface YmdRange {
  from: string;
  to: string;
}

const DAYS: Record<Exclude<RangeFilter, "all">, number> = { today: 1, "7d": 7, "30d": 30 };

/** Inclusive Lagos dates for a filter, ending today. null means all time. */
export function rangeFor(filter: RangeFilter, now: Date = new Date()): YmdRange | null {
  if (filter === "all") return null;
  const to = lagosYmd(now);
  return { from: addDaysYmd(to, -(DAYS[filter] - 1)), to };
}

/** The same number of days immediately before `range`. */
export function previousRange(range: YmdRange): YmdRange {
  const length = daysBetween(range.from, range.to) + 1;
  return { from: addDaysYmd(range.from, -length), to: addDaysYmd(range.from, -1) };
}

function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = to.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export function greeting(now: Date = new Date()): string {
  const hour = Number(hourFormat.format(now));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** "2026-11-03T11:16" (what a datetime-local input gives) -> ISO with the Lagos offset. */
export function lagosLocalToIso(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const iso = `${local}:00+01:00`;
  return Number.isNaN(new Date(iso).getTime()) ? null : iso;
}

/** An instant -> "2026-11-03T11:16" in Lagos time, for filling a datetime-local input. */
export function isoToLagosLocal(iso: string | Date): string {
  const instant = typeof iso === "string" ? new Date(iso) : iso;
  const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(instant);
  return `${lagosYmd(instant)}T${hhmm}`;
}

const timeFormat = new Intl.DateTimeFormat("en-NG", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });
const shortDate = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short" });
const longDate = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });

/** "Today · 7:42 pm", "Yesterday · 9:12 pm", "12 Oct · 4:18 pm". */
export function formatWhen(iso: string, now: Date = new Date()): string {
  const instant = new Date(iso);
  const day = lagosYmd(instant);
  const today = lagosYmd(now);
  const time = timeFormat.format(instant).toLowerCase();
  if (day === today) return `Today · ${time}`;
  if (day === addDaysYmd(today, -1)) return `Yesterday · ${time}`;
  return `${shortDate.format(instant)} · ${time}`;
}

export function formatDay(iso: string): string {
  return longDate.format(new Date(iso));
}

/** Short axis label for a chart bucket key (YYYY-MM-DD, YYYY-MM or YYYY). */
export function bucketLabel(key: string): string {
  if (/^\d{4}$/.test(key)) return key;
  if (/^\d{4}-\d{2}$/.test(key)) {
    const [y, m] = key.split("-").map(Number) as [number, number];
    return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "short", year: "2-digit" }).format(new Date(Date.UTC(y, m - 1, 1)));
  }
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  return shortDate.format(new Date(Date.UTC(y, m - 1, d, 12)));
}
