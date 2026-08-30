// ─────────────────────────────────────────────────────────────────────────────
// Local-date helpers
// ─────────────────────────────────────────────────────────────────────────────
// Trip dates are calendar dates, not instants. Using `new Date("2026-03-15")`
// parses as UTC midnight, which shifts a day backwards for anyone west of
// Greenwich. These helpers keep everything in the user's local calendar.
// ─────────────────────────────────────────────────────────────────────────────

/** Format a Date as a local `YYYY-MM-DD` string (no timezone shift). */
export function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parse a `YYYY-MM-DD` string as local midnight (not UTC). */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Whole days between two `YYYY-MM-DD` strings. */
export function daysBetween(start: string, end: string): number {
  return Math.round(
    (parseLocalDate(end).getTime() - parseLocalDate(start).getTime()) / 86_400_000,
  );
}

/** Today's date shifted to IST, as `YYYY-MM-DD`. */
export function todayIST(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
}

/** `YYYY-MM-DD` for N days from today, in local time. */
export function daysFromToday(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return formatLocalDate(d);
}

/** Start of the current local day — safe for day-count comparisons. */
export function startOfToday(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}
