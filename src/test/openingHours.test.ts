import { describe, expect, it } from "vitest";
import {
  checkOpenDuring,
  formatRanges,
  localDateKey,
  parseClock,
  parseOpeningHours,
  parseOsmOpeningHours,
  weekdayFor,
} from "@/lib/openingHours";
import { verifyItinerary } from "@/lib/itineraryVerifier";

// Fixed reference dates. 2026-09-02 is a Wednesday, 2026-09-06 a Sunday.
const WEDNESDAY = "2026-09-02";
const SUNDAY = "2026-09-06";

/** Local-time ISO string, so tests do not depend on the runner's zone offset. */
function at(date: string, time: string): string {
  return `${date}T${time}:00`;
}

const ms = (date: string, time: string) => new Date(at(date, time)).getTime();

describe("parseClock", () => {
  it("reads HH:MM into minutes from midnight", () => {
    expect(parseClock("00:00")).toBe(0);
    expect(parseClock("09:30")).toBe(570);
    expect(parseClock("23:59")).toBe(1439);
  });

  it("accepts 24:00 as an end-of-day marker", () => {
    expect(parseClock("24:00")).toBe(1440);
  });

  it("rejects malformed input", () => {
    expect(parseClock("9am")).toBeNull();
    expect(parseClock("25:00")).toBeNull();
    expect(parseClock("09:75")).toBeNull();
    expect(parseClock("")).toBeNull();
  });
});

describe("weekdayFor / localDateKey", () => {
  it("agrees with the reference dates", () => {
    expect(weekdayFor(new Date(at(WEDNESDAY, "10:00")))).toBe("wed");
    expect(weekdayFor(new Date(at(SUNDAY, "10:00")))).toBe("sun");
  });

  it("formats the local date without UTC drift", () => {
    // toISOString() would shift the date for late-evening local times in +05:30.
    expect(localDateKey(new Date(at(WEDNESDAY, "23:30")))).toBe(WEDNESDAY);
  });
});

describe("parseOsmOpeningHours", () => {
  it("reads 24/7", () => {
    expect(parseOsmOpeningHours("24/7")?.alwaysOpen).toBe(true);
    expect(parseOsmOpeningHours("24 / 7")?.alwaysOpen).toBe(true);
  });

  it("reads a single day rule", () => {
    const hours = parseOsmOpeningHours("We 06:00-14:00");
    expect(hours?.days?.wed).toEqual([[360, 840]]);
    // Every other day is absent, which means closed.
    expect(hours?.days?.sun).toBeUndefined();
  });

  it("expands a day range", () => {
    const hours = parseOsmOpeningHours("Mo-Fr 09:00-17:00");
    expect(Object.keys(hours!.days!).sort()).toEqual(
      ["fri", "mon", "thu", "tue", "wed"].sort(),
    );
    expect(hours?.days?.sat).toBeUndefined();
  });

  it("expands a wrapping day range", () => {
    const hours = parseOsmOpeningHours("Sa-Su 10:00-16:00");
    expect(Object.keys(hours!.days!).sort()).toEqual(["sat", "sun"]);
  });

  it("expands a day list", () => {
    const hours = parseOsmOpeningHours("Mo,We,Fr 08:00-12:00");
    expect(Object.keys(hours!.days!).sort()).toEqual(["fri", "mon", "wed"]);
  });

  it("reads several rules joined by semicolons", () => {
    const hours = parseOsmOpeningHours("Mo-Fr 09:00-17:00; Sa 10:00-14:00");
    expect(hours?.days?.mon).toEqual([[540, 1020]]);
    expect(hours?.days?.sat).toEqual([[600, 840]]);
    expect(hours?.days?.sun).toBeUndefined();
  });

  it("reads split hours on one day", () => {
    const hours = parseOsmOpeningHours("Mo 09:00-12:00,14:00-18:00");
    expect(hours?.days?.mon).toEqual([
      [540, 720],
      [840, 1080],
    ]);
  });

  it("reads an explicit closure as listed-but-shut", () => {
    const hours = parseOsmOpeningHours("Mo-Sa 09:00-17:00; Su off");
    expect(hours?.days?.sun).toEqual([]);
    expect(hours?.days?.mon).toEqual([[540, 1020]]);
  });

  it("extends a range that crosses midnight", () => {
    const hours = parseOsmOpeningHours("Fr 22:00-02:00");
    // 02:00 the next day, not an empty interval.
    expect(hours?.days?.fri).toEqual([[1320, 1560]]);
  });

  it("applies a bare time range to every day", () => {
    const hours = parseOsmOpeningHours("09:00-17:00");
    expect(Object.keys(hours!.days!)).toHaveLength(7);
  });

  it("returns null rather than guessing at unsupported syntax", () => {
    // Month selectors, holiday rules and sunset offsets are out of scope. An
    // unparsed rule must not be mistaken for a closure.
    expect(parseOsmOpeningHours("Apr-Oct Mo-Fr 09:00-17:00")).toBeNull();
    expect(parseOsmOpeningHours("sunrise-sunset")).toBeNull();
    expect(parseOsmOpeningHours("Mo[1] 09:00-17:00")).toBeNull();
    expect(parseOsmOpeningHours("")).toBeNull();
    expect(parseOsmOpeningHours("nonsense")).toBeNull();
  });
});

describe("parseOpeningHours", () => {
  it("returns null for absent data", () => {
    expect(parseOpeningHours(null)).toBeNull();
    expect(parseOpeningHours(undefined)).toBeNull();
    expect(parseOpeningHours({})).toBeNull();
    expect(parseOpeningHours(42)).toBeNull();
    expect(parseOpeningHours([])).toBeNull();
  });

  it("reads the structured day shape", () => {
    const hours = parseOpeningHours({
      days: { wed: [["06:00", "14:00"]] },
      source: "osm",
    });
    expect(hours?.days?.wed).toEqual([[360, 840]]);
    expect(hours?.source).toBe("osm");
  });

  it("accepts long and short weekday spellings", () => {
    const hours = parseOpeningHours({
      days: { Monday: [["09:00", "17:00"]], Tu: [["09:00", "17:00"]] },
    });
    expect(hours?.days?.mon).toBeDefined();
    expect(hours?.days?.tue).toBeDefined();
  });

  it("treats an empty array or null as listed-but-shut", () => {
    const hours = parseOpeningHours({
      days: { mon: [["09:00", "17:00"]], sun: [], sat: null },
    });
    expect(hours?.days?.sun).toEqual([]);
    expect(hours?.days?.sat).toEqual([]);
  });

  it("reads an embedded OSM string", () => {
    const hours = parseOpeningHours({ osm: "We 06:00-14:00", source: "osm" });
    expect(hours?.days?.wed).toEqual([[360, 840]]);
    expect(hours?.source).toBe("osm");
  });

  it("reads a bare string with unknown provenance", () => {
    const hours = parseOpeningHours("24/7");
    expect(hours?.alwaysOpen).toBe(true);
    expect(hours?.source).toBe("unknown");
  });

  it("defaults an unrecognised source to unknown", () => {
    expect(parseOpeningHours({ osm: "24/7", source: "vibes" })?.source).toBe(
      "unknown",
    );
  });

  it("reads closed dates on their own", () => {
    const hours = parseOpeningHours({ closed_dates: ["2026-12-25"] });
    expect(hours?.closedDates).toEqual(["2026-12-25"]);
  });

  it("ignores malformed closed dates", () => {
    expect(parseOpeningHours({ closed_dates: ["25/12/2026", 7] })).toBeNull();
  });

  it("treats a day with only unreadable intervals as unknown, not shut", () => {
    // Silence about a day must never be turned into a closure.
    expect(parseOpeningHours({ days: { mon: [["9am", "5pm"]] } })).toBeNull();
  });

  it("reads always-open flags", () => {
    expect(parseOpeningHours({ always_open: true })?.alwaysOpen).toBe(true);
    expect(parseOpeningHours({ hours: "24/7" })?.alwaysOpen).toBe(true);
  });
});

describe("checkOpenDuring", () => {
  const wednesdayOnly = parseOpeningHours({
    osm: "We 06:00-14:00",
    source: "osm",
  })!;

  it("passes a visit inside the opening window", () => {
    expect(
      checkOpenDuring(
        wednesdayOnly,
        ms(WEDNESDAY, "08:00"),
        ms(WEDNESDAY, "10:00"),
      ),
    ).toEqual({ status: "open" });
  });

  it("catches a Wednesday-only market booked on a Sunday", () => {
    // The documented Goa violation the verifier previously could not detect.
    const verdict = checkOpenDuring(
      wednesdayOnly,
      ms(SUNDAY, "08:00"),
      ms(SUNDAY, "10:00"),
    );
    expect(verdict.status).toBe("closed-that-day");
    expect(verdict).toMatchObject({ weekday: "sun", date: SUNDAY });
  });

  it("catches a visit outside the hours on an open day", () => {
    const verdict = checkOpenDuring(
      wednesdayOnly,
      ms(WEDNESDAY, "15:00"),
      ms(WEDNESDAY, "16:00"),
    );
    expect(verdict.status).toBe("outside-hours");
  });

  it("requires the whole window to fit, not just the start", () => {
    // Arriving an hour before closing and staying two hours does not fit.
    const verdict = checkOpenDuring(
      wednesdayOnly,
      ms(WEDNESDAY, "13:00"),
      ms(WEDNESDAY, "16:00"),
    );
    expect(verdict.status).toBe("outside-hours");
  });

  it("reports unknown when nothing was stated", () => {
    expect(
      checkOpenDuring(
        { source: "unknown" },
        ms(WEDNESDAY, "10:00"),
        ms(WEDNESDAY, "11:00"),
      ),
    ).toEqual({ status: "unknown" });
  });

  it("passes anything when always open", () => {
    expect(
      checkOpenDuring(
        { alwaysOpen: true, source: "osm" },
        ms(SUNDAY, "03:00"),
        ms(SUNDAY, "05:00"),
      ),
    ).toEqual({ status: "open" });
  });

  it("honours a closed date over the weekday rule", () => {
    const hours = parseOpeningHours({
      osm: "Mo-Su 09:00-17:00",
      closed_dates: [WEDNESDAY],
      source: "osm",
    })!;
    const verdict = checkOpenDuring(
      hours,
      ms(WEDNESDAY, "10:00"),
      ms(WEDNESDAY, "11:00"),
    );
    expect(verdict.status).toBe("closed-that-day");
  });

  it("accepts a visit inside a window that crosses midnight", () => {
    const hours = parseOpeningHours({ osm: "We 22:00-02:00", source: "osm" })!;
    expect(
      checkOpenDuring(
        hours,
        ms(WEDNESDAY, "23:00"),
        new Date(at("2026-09-03", "01:00")).getTime(),
      ),
    ).toEqual({ status: "open" });
  });

  it("picks whichever split interval fits", () => {
    const hours = parseOpeningHours({
      osm: "We 09:00-12:00,14:00-18:00",
      source: "osm",
    })!;
    expect(
      checkOpenDuring(hours, ms(WEDNESDAY, "15:00"), ms(WEDNESDAY, "16:00")).status,
    ).toBe("open");
    // The 12:00-14:00 gap is a real closure.
    expect(
      checkOpenDuring(hours, ms(WEDNESDAY, "12:30"), ms(WEDNESDAY, "13:30")).status,
    ).toBe("outside-hours");
  });
});

describe("formatRanges", () => {
  it("renders minute ranges as clock times", () => {
    expect(formatRanges([[540, 1020]])).toBe("09:00-17:00");
    expect(formatRanges([[540, 720], [840, 1080]])).toBe("09:00-12:00, 14:00-18:00");
  });

  it("wraps a past-midnight end back into range", () => {
    expect(formatRanges([[1320, 1560]])).toBe("22:00-02:00");
  });
});

// ── Integration with the verifier ───────────────────────────────────────────

describe("verifyItinerary opening-hours check", () => {
  const market = (date: string, openingHours: unknown) => ({
    activities: [
      {
        name: "Anjuna Flea Market",
        start_time: at(date, "09:00"),
        end_time: at(date, "11:00"),
        cost: 500,
        opening_hours: openingHours,
      },
    ],
    total_cost: 500,
  });

  it("blocks a Wednesday-only market booked on a Sunday when hours are authoritative", () => {
    const result = verifyItinerary(
      market(SUNDAY, { osm: "We 06:00-14:00", source: "osm" }),
      {},
    );
    expect(result.ok).toBe(false);
    expect(result.errors.some((v) => v.code === "CLOSED_ON_DAY")).toBe(true);
    expect(result.errors[0].message).toContain("Sunday");
  });

  it("only warns when the hours came from a model", () => {
    // A model's claim about a market's schedule is a guess. Blocking a plan on
    // it would present generated data as a hard fact.
    const result = verifyItinerary(
      market(SUNDAY, { osm: "We 06:00-14:00", source: "model" }),
      {},
    );
    expect(result.ok).toBe(true);
    expect(result.warnings.some((v) => v.code === "CLOSED_ON_DAY")).toBe(true);
    expect(result.warnings[0].message).toContain("unverified");
  });

  it("passes the same market on a Wednesday", () => {
    const result = verifyItinerary(
      market(WEDNESDAY, { osm: "We 06:00-14:00", source: "osm" }),
      {},
    );
    expect(result.violations.filter((v) => v.code === "CLOSED_ON_DAY")).toHaveLength(
      0,
    );
  });

  it("flags a booking outside the hours on an open day", () => {
    const result = verifyItinerary(
      {
        activities: [
          {
            name: "Late museum visit",
            start_time: at(WEDNESDAY, "19:00"),
            end_time: at(WEDNESDAY, "21:00"),
            cost: 0,
            opening_hours: { osm: "Mo-Su 09:00-17:00", source: "osm" },
          },
        ],
        total_cost: 0,
      },
      {},
    );
    expect(result.errors.some((v) => v.code === "OUTSIDE_OPENING_HOURS")).toBe(true);
    expect(result.errors[0].message).toContain("09:00-17:00");
  });

  it("runs no check when hours are absent", () => {
    const result = verifyItinerary(market(SUNDAY, null), {});
    expect(
      result.violations.filter(
        (v) => v.code === "CLOSED_ON_DAY" || v.code === "OUTSIDE_OPENING_HOURS",
      ),
    ).toHaveLength(0);
  });

  it("runs no check when hours are unparseable", () => {
    // Absence of readable data is not evidence of closure.
    const result = verifyItinerary(
      market(SUNDAY, { osm: "Apr-Oct We 06:00-14:00", source: "osm" }),
      {},
    );
    expect(
      result.violations.filter((v) => v.code === "CLOSED_ON_DAY"),
    ).toHaveLength(0);
  });

  it("does not double-report an activity with broken times", () => {
    // Reversed times are already a TIME_REVERSED error; adding an opening-hours
    // complaint on top would be noise.
    const result = verifyItinerary(
      {
        activities: [
          {
            name: "Reversed",
            start_time: at(SUNDAY, "14:00"),
            end_time: at(SUNDAY, "11:00"),
            cost: 0,
            opening_hours: { osm: "We 06:00-14:00", source: "osm" },
          },
        ],
      },
      {},
    );
    expect(result.errors.some((v) => v.code === "TIME_REVERSED")).toBe(true);
    expect(result.errors.some((v) => v.code === "CLOSED_ON_DAY")).toBe(false);
  });

  it("names the activity so the user can act on it", () => {
    const result = verifyItinerary(
      market(SUNDAY, { osm: "We 06:00-14:00", source: "manual" }),
      {},
    );
    expect(result.errors[0].message).toContain("Anjuna Flea Market");
    expect(result.errors[0].activityIndices).toEqual([0]);
  });
});
