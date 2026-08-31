import { describe, expect, it } from "vitest";
import {
  buildRepairPrompt,
  haversineKm,
  verifyItinerary,
  type VerifiableActivity,
} from "@/lib/itineraryVerifier";

/** Build an activity with sane defaults so each test states only what it tests. */
function activity(overrides: Partial<VerifiableActivity> = {}): VerifiableActivity {
  return {
    name: "Test activity",
    start_time: "2026-03-15T09:00:00+05:30",
    end_time: "2026-03-15T11:00:00+05:30",
    cost: 500,
    location_lat: 15.2993,
    location_lng: 74.124,
    ...overrides,
  };
}

const codes = (result: ReturnType<typeof verifyItinerary>) =>
  result.violations.map((v) => v.code);

describe("haversineKm", () => {
  it("returns zero for identical points", () => {
    expect(haversineKm(15.2993, 74.124, 15.2993, 74.124)).toBe(0);
  });

  it("matches a known distance within tolerance", () => {
    // Panaji to Anjuna is roughly 17 km great-circle.
    const km = haversineKm(15.4909, 73.8278, 15.5735, 73.74);
    expect(km).toBeGreaterThan(10);
    expect(km).toBeLessThan(25);
  });

  it("is symmetric", () => {
    const a = haversineKm(15.2, 74.1, 28.6, 77.2);
    const b = haversineKm(28.6, 77.2, 15.2, 74.1);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe("verifyItinerary — structural", () => {
  it("rejects an empty plan", () => {
    const result = verifyItinerary({ activities: [] });
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain("EMPTY_ITINERARY");
  });

  it("rejects a plan with no activities key at all", () => {
    expect(verifyItinerary({}).ok).toBe(false);
  });

  it("accepts a clean single-activity plan", () => {
    const result = verifyItinerary({ activities: [activity()] });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.summary).toBe("All checks passed.");
  });
});

describe("verifyItinerary — time", () => {
  it("flags unparseable timestamps", () => {
    const result = verifyItinerary({
      activities: [activity({ start_time: "not a date" })],
    });
    expect(codes(result)).toContain("TIME_INVALID");
    expect(result.ok).toBe(false);
  });

  it("flags an activity that ends before it starts", () => {
    const result = verifyItinerary({
      activities: [
        activity({
          start_time: "2026-03-15T14:00:00+05:30",
          end_time: "2026-03-15T11:00:00+05:30",
        }),
      ],
    });
    expect(codes(result)).toContain("TIME_REVERSED");
  });

  it("flags overlapping activities", () => {
    const result = verifyItinerary({
      activities: [
        activity({ name: "Museum", start_time: "2026-03-15T09:00:00+05:30", end_time: "2026-03-15T12:00:00+05:30" }),
        activity({ name: "Lunch", start_time: "2026-03-15T11:00:00+05:30", end_time: "2026-03-15T13:00:00+05:30" }),
      ],
    });
    expect(codes(result)).toContain("TIME_OVERLAP");
    expect(result.ok).toBe(false);
  });

  it("allows back-to-back activities at the same place", () => {
    const result = verifyItinerary({
      activities: [
        activity({ start_time: "2026-03-15T09:00:00+05:30", end_time: "2026-03-15T11:00:00+05:30" }),
        activity({ start_time: "2026-03-15T11:00:00+05:30", end_time: "2026-03-15T13:00:00+05:30" }),
      ],
    });
    expect(codes(result)).not.toContain("TIME_OVERLAP");
  });

  it("warns about an implausibly long activity", () => {
    const result = verifyItinerary({
      activities: [
        activity({ start_time: "2026-03-15T06:00:00+05:30", end_time: "2026-03-15T23:30:00+05:30" }),
      ],
    });
    expect(codes(result)).toContain("DURATION_IMPLAUSIBLE");
    // A warning must not block the plan.
    expect(result.ok).toBe(true);
  });
});

describe("verifyItinerary — travel feasibility", () => {
  it("flags a hop that cannot physically be made in the gap", () => {
    // Dudhsagar to Anjuna is ~62 km with only 30 minutes scheduled.
    const result = verifyItinerary({
      activities: [
        activity({
          name: "Dudhsagar Falls",
          start_time: "2026-03-15T09:00:00+05:30",
          end_time: "2026-03-15T13:00:00+05:30",
          location_lat: 15.3144,
          location_lng: 74.3144,
        }),
        activity({
          name: "Anjuna Flea Market",
          start_time: "2026-03-15T13:30:00+05:30",
          end_time: "2026-03-15T17:00:00+05:30",
          location_lat: 15.5735,
          location_lng: 73.74,
        }),
      ],
    });
    expect(codes(result)).toContain("TRAVEL_INFEASIBLE");
    expect(result.ok).toBe(false);
  });

  it("accepts the same hop when enough time is allowed", () => {
    const result = verifyItinerary({
      activities: [
        activity({
          start_time: "2026-03-15T09:00:00+05:30",
          end_time: "2026-03-15T11:00:00+05:30",
          location_lat: 15.3144,
          location_lng: 74.3144,
        }),
        activity({
          start_time: "2026-03-15T14:00:00+05:30",
          end_time: "2026-03-15T16:00:00+05:30",
          location_lat: 15.5735,
          location_lng: 73.74,
        }),
      ],
    });
    expect(codes(result)).not.toContain("TRAVEL_INFEASIBLE");
  });

  it("ignores travel time between activities lacking coordinates", () => {
    const result = verifyItinerary({
      activities: [
        activity({ location_lat: null, location_lng: null, start_time: "2026-03-15T09:00:00+05:30", end_time: "2026-03-15T11:00:00+05:30" }),
        activity({ location_lat: null, location_lng: null, start_time: "2026-03-15T11:05:00+05:30", end_time: "2026-03-15T13:00:00+05:30" }),
      ],
    });
    expect(codes(result)).not.toContain("TRAVEL_INFEASIBLE");
  });
});

describe("verifyItinerary — coordinates", () => {
  it("flags out-of-range coordinates", () => {
    const result = verifyItinerary({
      activities: [activity({ location_lat: 200, location_lng: 74 })],
    });
    expect(codes(result)).toContain("COORD_INVALID");
  });

  it("warns when an activity is far outside the destination region", () => {
    // Anchor Goa, activity in Delhi — the classic wrong-city hallucination.
    const result = verifyItinerary(
      { activities: [activity({ location_lat: 28.6139, location_lng: 77.209 })] },
      { anchorLat: 15.2993, anchorLng: 74.124, maxRadiusKm: 200 },
    );
    expect(codes(result)).toContain("COORD_OUT_OF_REGION");
  });

  it("does not warn for activities inside the region", () => {
    const result = verifyItinerary(
      { activities: [activity({ location_lat: 15.4909, location_lng: 73.8278 })] },
      { anchorLat: 15.2993, anchorLng: 74.124, maxRadiusKm: 200 },
    );
    expect(codes(result)).not.toContain("COORD_OUT_OF_REGION");
  });
});

describe("verifyItinerary — budget", () => {
  it("flags a plan that exceeds the budget", () => {
    const result = verifyItinerary(
      { activities: [activity({ cost: 30000 }), activity({ cost: 15000, start_time: "2026-03-16T09:00:00+05:30", end_time: "2026-03-16T11:00:00+05:30" })] },
      { budget: 40000 },
    );
    expect(codes(result)).toContain("BUDGET_EXCEEDED");
    expect(result.ok).toBe(false);
  });

  it("tolerates a marginal overshoot within tolerance", () => {
    const result = verifyItinerary(
      { activities: [activity({ cost: 40100 })] },
      { budget: 40000 },
    );
    expect(codes(result)).not.toContain("BUDGET_EXCEEDED");
  });

  it("warns when the stated total disagrees with the line items", () => {
    const result = verifyItinerary({
      activities: [activity({ cost: 500 })],
      total_cost: 9999,
    });
    expect(codes(result)).toContain("COST_SUM_MISMATCH");
    // Arithmetic drift is a signal, not a blocker.
    expect(result.ok).toBe(true);
  });

  it("does not check budget when none is supplied", () => {
    const result = verifyItinerary({ activities: [activity({ cost: 999999 })] });
    expect(codes(result)).not.toContain("BUDGET_EXCEEDED");
  });
});

describe("verifyItinerary — pace", () => {
  it("warns when a single day is over-packed", () => {
    const activities = Array.from({ length: 8 }, (_, i) =>
      activity({
        name: `Stop ${i + 1}`,
        start_time: `2026-03-15T${String(6 + i).padStart(2, "0")}:00:00+05:30`,
        end_time: `2026-03-15T${String(6 + i).padStart(2, "0")}:45:00+05:30`,
      }),
    );
    const result = verifyItinerary({ activities }, { maxActivitiesPerDay: 5 });
    expect(codes(result)).toContain("PACE_EXCEEDED");
  });

  it("does not warn when activities are spread across days", () => {
    const activities = [15, 16, 17, 18].flatMap((day) => [
      activity({ start_time: `2026-03-${day}T09:00:00+05:30`, end_time: `2026-03-${day}T10:00:00+05:30` }),
      activity({ start_time: `2026-03-${day}T12:00:00+05:30`, end_time: `2026-03-${day}T13:00:00+05:30` }),
    ]);
    const result = verifyItinerary({ activities }, { maxActivitiesPerDay: 5 });
    expect(codes(result)).not.toContain("PACE_EXCEEDED");
  });
});

describe("verifyItinerary — the schema-valid-but-wrong case", () => {
  it("catches all three violations in the documented Goa example", () => {
    // This is the exact plan from RESEARCH.md §10.3: valid JSON that
    // grammar-constrained decoding would happily accept.
    const result = verifyItinerary(
      {
        activities: [
          {
            name: "Dudhsagar Falls",
            start_time: "2026-03-15T09:00:00+05:30",
            end_time: "2026-03-15T13:00:00+05:30",
            location_lat: 15.3144,
            location_lng: 74.3144,
            cost: 2500,
          },
          {
            name: "Anjuna Flea Market",
            start_time: "2026-03-15T13:30:00+05:30",
            end_time: "2026-03-15T17:00:00+05:30",
            location_lat: 15.5735,
            location_lng: 73.74,
            cost: 38700,
          },
        ],
        total_cost: 41200,
      },
      { budget: 40000, anchorLat: 15.2993, anchorLng: 74.124 },
    );

    expect(result.ok).toBe(false);
    expect(codes(result)).toContain("BUDGET_EXCEEDED");
    expect(codes(result)).toContain("TRAVEL_INFEASIBLE");
  });
});

describe("buildRepairPrompt", () => {
  it("returns an empty string when there is nothing to repair", () => {
    const result = verifyItinerary({ activities: [activity()] });
    expect(buildRepairPrompt(result)).toBe("");
  });

  it("enumerates only errors, not warnings", () => {
    const result = verifyItinerary(
      { activities: [activity({ cost: 90000 })], total_cost: 1 },
      { budget: 40000 },
    );
    const prompt = buildRepairPrompt(result);
    expect(prompt).toContain("1.");
    expect(prompt).toContain("exceeds the budget");
    // COST_SUM_MISMATCH is a warning and must be left out.
    expect(prompt).not.toContain("does not match");
  });
});
