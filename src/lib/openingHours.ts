// ─────────────────────────────────────────────────────────────────────────────
// Opening hours — parsing and containment
// ─────────────────────────────────────────────────────────────────────────────
// The itinerary verifier could not catch the third violation in the documented
// Goa example — a Wednesday-only market booked on a Sunday — because no POI hours
// data was stored anywhere. `activities.opening_hours` now holds it, and this
// module turns whatever is in that column into a decidable question:
// "is the place open for the whole of this activity's time window?"
//
// Two input shapes are accepted, because the data can come from different places
// and normalising at write time would lose information:
//
//   structured  { days: { wed: [["06:00", "14:00"]] }, closed_dates: [...] }
//   OSM string  { osm: "We 06:00-14:00" }   — or a bare string
//
// The OSM parser covers the common subset only. Anything it cannot read returns
// null, which the verifier treats as *unknown*, not as closed. That asymmetry is
// deliberate: wrongly telling someone a market is shut is worse than failing to
// warn them, and an unparsed rule is not evidence of anything.
//
// Provenance travels with the data. Model-supplied hours are a guess and are
// reported as warnings; OSM or hand-entered hours are treated as authoritative
// and block the plan. Without that distinction the verifier would present an
// LLM's guess about a market's schedule as a hard fact — the same mistake this
// codebase has been unpicking elsewhere.
// ─────────────────────────────────────────────────────────────────────────────

export type Weekday = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

/** Minutes from local midnight. May exceed 1440 for ranges crossing midnight. */
export type MinuteRange = [number, number];

/** Where the hours came from. Drives whether a violation blocks or warns. */
export type OpeningHoursSource = "osm" | "manual" | "model" | "unknown";

export interface OpeningHours {
  /** Open continuously; no day or time restriction applies. */
  alwaysOpen?: boolean;
  /**
   * Intervals per weekday.
   *
   * When present, a weekday absent from this map is **closed** — matching OSM
   * semantics, where listing `We 06:00-14:00` means Wednesdays only. An empty
   * map means nothing was stated and no check runs.
   */
  days?: Partial<Record<Weekday, MinuteRange[]>>;
  /** Local calendar dates (YYYY-MM-DD) the place is shut regardless of weekday. */
  closedDates?: string[];
  source: OpeningHoursSource;
}

const WEEKDAYS: readonly Weekday[] = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
] as const;

/** OSM two-letter day abbreviations, in the same order as `Date.getDay()`. */
const OSM_DAYS: Record<string, Weekday> = {
  su: "sun",
  mo: "mon",
  tu: "tue",
  we: "wed",
  th: "thu",
  fr: "fri",
  sa: "sat",
};

/** Long and short spellings accepted in the structured shape. */
const DAY_ALIASES: Record<string, Weekday> = {
  ...OSM_DAYS,
  sun: "sun",
  mon: "mon",
  tue: "tue",
  tues: "tue",
  wed: "wed",
  thu: "thu",
  thur: "thu",
  thurs: "thu",
  fri: "fri",
  sat: "sat",
  sunday: "sun",
  monday: "mon",
  tuesday: "tue",
  wednesday: "wed",
  thursday: "thu",
  friday: "fri",
  saturday: "sat",
};

export const weekdayFor = (date: Date): Weekday => WEEKDAYS[date.getDay()];

/** Local calendar date as YYYY-MM-DD. Avoids UTC drift from toISOString(). */
export function localDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** "HH:MM" → minutes from midnight, or null when unparseable. */
export function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  // 24:00 is a legal end-of-day marker in OSM.
  if (hours > 24 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function normaliseDay(raw: string): Weekday | undefined {
  return DAY_ALIASES[raw.trim().toLowerCase()];
}

/** Turns a start/end pair into minutes, extending past midnight when needed. */
function toRange(start: number, end: number): MinuteRange {
  // 22:00-02:00 means "until 2am tomorrow", not an empty interval.
  return [start, end <= start ? end + 1440 : end];
}

// ── OSM string parsing ──────────────────────────────────────────────────────

/** Expands `Mo-Fr` / `Mo,We` / `Mo` into concrete weekdays. */
function expandDaySpec(spec: string): Weekday[] | null {
  const out: Weekday[] = [];

  for (const part of spec.split(",")) {
    const token = part.trim().toLowerCase();
    if (!token) continue;

    const range = /^([a-z]{2,9})\s*-\s*([a-z]{2,9})$/.exec(token);
    if (range) {
      const from = normaliseDay(range[1]);
      const to = normaliseDay(range[2]);
      if (!from || !to) return null;
      // Ranges wrap: Sa-Su is Saturday and Sunday.
      let index = WEEKDAYS.indexOf(from);
      const end = WEEKDAYS.indexOf(to);
      for (let guard = 0; guard < 7; guard++) {
        out.push(WEEKDAYS[index]);
        if (index === end) break;
        index = (index + 1) % 7;
      }
      continue;
    }

    const single = normaliseDay(token);
    if (!single) return null;
    out.push(single);
  }

  return out.length > 0 ? out : null;
}

/** Expands `09:00-17:00,19:00-23:00` into minute ranges. */
function parseTimeSpec(spec: string): MinuteRange[] | null {
  const out: MinuteRange[] = [];

  for (const part of spec.split(",")) {
    const token = part.trim();
    if (!token) continue;
    const match = /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(token);
    if (!match) return null;
    const start = parseClock(match[1]);
    const end = parseClock(match[2]);
    if (start === null || end === null) return null;
    out.push(toRange(start, end));
  }

  return out.length > 0 ? out : null;
}

/**
 * Parses the common subset of the OSM `opening_hours` syntax.
 *
 * Handled: `24/7`, `Mo-Fr 09:00-17:00`, `We 06:00-14:00`, day lists, multiple
 * time ranges, several rules joined by `;`, and `off`/`closed` for a day.
 *
 * Not handled: month and week selectors, public-holiday rules, `sunrise`/`sunset`
 * offsets, ordinal weekdays such as `Mo[1]`. Anything unrecognised returns null
 * rather than a partial guess.
 */
export function parseOsmOpeningHours(
  raw: string,
  source: OpeningHoursSource = "osm",
): OpeningHours | null {
  const input = raw.trim();
  if (!input) return null;

  if (/^24\s*\/\s*7$/i.test(input)) return { alwaysOpen: true, source };

  const days: Partial<Record<Weekday, MinuteRange[]>> = {};
  let sawRule = false;

  for (const rule of input.split(";")) {
    const token = rule.trim();
    if (!token) continue;

    // Split leading day spec from the trailing time spec.
    const match = /^([A-Za-z,\s-]+?)\s+(.+)$/.exec(token);

    if (!match) {
      // A bare time range with no day spec applies to every day.
      const ranges = parseTimeSpec(token);
      if (!ranges) return null;
      for (const day of WEEKDAYS) days[day] = ranges;
      sawRule = true;
      continue;
    }

    const targetDays = expandDaySpec(match[1]);
    if (!targetDays) return null;

    const timeSpec = match[2].trim();

    if (/^(off|closed)$/i.test(timeSpec)) {
      // Explicit closure. An empty interval list means "listed but shut".
      for (const day of targetDays) days[day] = [];
      sawRule = true;
      continue;
    }

    const ranges = parseTimeSpec(timeSpec);
    if (!ranges) return null;
    for (const day of targetDays) days[day] = ranges;
    sawRule = true;
  }

  if (!sawRule) return null;
  return { days, source };
}

// ── Structured parsing ──────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseSource(value: unknown): OpeningHoursSource {
  if (typeof value !== "string") return "unknown";
  const token = value.trim().toLowerCase();
  return token === "osm" || token === "manual" || token === "model"
    ? token
    : "unknown";
}

/**
 * Normalises whatever is in `activities.opening_hours` into an `OpeningHours`.
 *
 * Returns null for anything unusable — null column, wrong type, unparseable OSM
 * string, or a `days` map with no readable entries. Null means unknown, and the
 * verifier skips the check rather than assuming closure.
 */
export function parseOpeningHours(raw: unknown): OpeningHours | null {
  if (raw == null) return null;

  if (typeof raw === "string") return parseOsmOpeningHours(raw, "unknown");

  const record = asRecord(raw);
  if (!record) return null;

  const source = parseSource(record.source);

  if (typeof record.osm === "string") {
    const parsed = parseOsmOpeningHours(record.osm, source);
    if (!parsed) return null;
    // An explicit closed-dates list is still usable alongside an OSM string.
    const closedDates = parseClosedDates(record.closed_dates ?? record.closedDates);
    return closedDates ? { ...parsed, closedDates } : parsed;
  }

  if (record.always_open === true || record.alwaysOpen === true) {
    return { alwaysOpen: true, source };
  }

  if (/^24\s*\/\s*7$/.test(String(record.hours ?? ""))) {
    return { alwaysOpen: true, source };
  }

  const dayInput = asRecord(record.days);
  const closedDates = parseClosedDates(record.closed_dates ?? record.closedDates);

  if (!dayInput) {
    // Closed dates alone are still a usable constraint.
    return closedDates ? { closedDates, source } : null;
  }

  const days: Partial<Record<Weekday, MinuteRange[]>> = {};
  let sawDay = false;

  for (const [key, value] of Object.entries(dayInput)) {
    const day = normaliseDay(key);
    if (!day) continue;

    if (value === null || value === false) {
      days[day] = []; // listed and shut
      sawDay = true;
      continue;
    }

    if (!Array.isArray(value)) continue;

    if (value.length === 0) {
      days[day] = [];
      sawDay = true;
      continue;
    }

    const ranges: MinuteRange[] = [];
    for (const entry of value) {
      if (!Array.isArray(entry) || entry.length < 2) continue;
      const start = typeof entry[0] === "string" ? parseClock(entry[0]) : null;
      const end = typeof entry[1] === "string" ? parseClock(entry[1]) : null;
      if (start === null || end === null) continue;
      ranges.push(toRange(start, end));
    }

    // A day whose every interval was unreadable is unknown, not shut.
    if (ranges.length > 0) {
      days[day] = ranges;
      sawDay = true;
    }
  }

  if (!sawDay) return closedDates ? { closedDates, source } : null;
  return closedDates ? { days, closedDates, source } : { days, source };
}

function parseClosedDates(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const dates = value.filter(
    (entry): entry is string =>
      typeof entry === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry.trim()),
  );
  return dates.length > 0 ? dates.map((d) => d.trim()) : undefined;
}

// ── Containment ─────────────────────────────────────────────────────────────

export type OpeningVerdict =
  | { status: "unknown" }
  | { status: "open" }
  | { status: "closed-that-day"; weekday: Weekday; date: string }
  | { status: "outside-hours"; weekday: Weekday; open: MinuteRange[] };

/**
 * Decides whether a place is open for the whole of `[startMs, endMs]`.
 *
 * Requires the *entire* window to fall inside a single opening interval. A visit
 * that starts an hour before closing and runs two hours past it is not "mostly
 * open"; it does not fit.
 */
export function checkOpenDuring(
  hours: OpeningHours,
  startMs: number,
  endMs: number,
): OpeningVerdict {
  const start = new Date(startMs);
  const date = localDateKey(start);

  if (hours.closedDates?.includes(date)) {
    return { status: "closed-that-day", weekday: weekdayFor(start), date };
  }

  if (hours.alwaysOpen) return { status: "open" };

  const days = hours.days;
  if (!days || Object.keys(days).length === 0) return { status: "unknown" };

  const weekday = weekdayFor(start);
  const intervals = days[weekday];

  // Absent weekday means closed: `We 06:00-14:00` states Wednesdays only. This
  // is the check that catches a Wednesday-only market booked on a Sunday.
  if (intervals === undefined || intervals.length === 0) {
    return { status: "closed-that-day", weekday, date };
  }

  const startMinutes = start.getHours() * 60 + start.getMinutes();
  // Derived from the duration rather than the end timestamp's clock, so an
  // activity running past midnight stays comparable to the same day's intervals.
  const endMinutes = startMinutes + Math.max(0, (endMs - startMs) / 60_000);

  const fits = intervals.some(
    ([open, close]) => startMinutes >= open && endMinutes <= close,
  );

  return fits
    ? { status: "open" }
    : { status: "outside-hours", weekday, open: intervals };
}

/** "09:00-17:00" for a message. Wraps values past midnight back into range. */
export function formatRanges(ranges: MinuteRange[]): string {
  const clock = (minutes: number) => {
    const normalised = minutes % 1440 === 0 && minutes > 0 ? 1440 : minutes % 1440;
    const h = Math.floor(normalised / 60);
    const m = normalised % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };
  return ranges.map(([open, close]) => `${clock(open)}-${clock(close)}`).join(", ");
}

/** Human weekday name for a message. */
export const WEEKDAY_NAMES: Record<Weekday, string> = {
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
};
