// ─────────────────────────────────────────────────────────────────────────────
// Itinerary constraint verifier
// ─────────────────────────────────────────────────────────────────────────────
// Grammar-constrained decoding (`response_format: json_object`) guarantees that
// a model's output is *syntactically* valid JSON. It says nothing about whether
// the plan is *semantically* possible: a schema-valid itinerary can still blow
// the budget, double-book an hour, or put two consecutive activities 400 km
// apart with a 20-minute gap.
//
// The published evidence is that LLMs cannot reliably satisfy multi-constraint
// travel plans, and that self-critique does not fix it — pairing generation with
// an external check does (arXiv:2404.11891). TravelPlanner measured GPT-4 at a
// 0.6% success rate on exactly this task (arXiv:2402.01622).
//
// So this module is deliberately deterministic: no model calls, no network, pure
// functions over the generated plan. That also means it runs unchanged when the
// app is offline and the plan came from an on-device model.
// ─────────────────────────────────────────────────────────────────────────────

export type Severity = "error" | "warning";

export type ViolationCode =
  | "BUDGET_EXCEEDED"
  | "COST_SUM_MISMATCH"
  | "TIME_OVERLAP"
  | "TIME_INVALID"
  | "TIME_REVERSED"
  | "TRAVEL_INFEASIBLE"
  | "PACE_EXCEEDED"
  | "COORD_INVALID"
  | "COORD_OUT_OF_REGION"
  | "EMPTY_ITINERARY"
  | "DURATION_IMPLAUSIBLE";

export interface Violation {
  code: ViolationCode;
  severity: Severity;
  /** Human-readable, safe to show a user. */
  message: string;
  /** Indices into the activities array this violation concerns. */
  activityIndices: number[];
}

export interface VerifiableActivity {
  name?: string;
  start_time?: string;
  end_time?: string;
  cost?: number;
  location_lat?: number | null;
  location_lng?: number | null;
}

export interface VerifiablePlan {
  activities?: VerifiableActivity[];
  total_cost?: number;
}

export interface VerifyConstraints {
  /** Total trip budget in the trip's currency. */
  budget?: number;
  /** Trip length in days, used for the pace check. */
  days?: number;
  /** Maximum activities per day before the plan is considered punishing. */
  maxActivitiesPerDay?: number;
  /** Destination centre, used to catch coordinates in the wrong hemisphere. */
  anchorLat?: number;
  anchorLng?: number;
  /** How far an activity may sit from the anchor before it looks wrong (km). */
  maxRadiusKm?: number;
}

export interface VerificationResult {
  ok: boolean;
  violations: Violation[];
  errors: Violation[];
  warnings: Violation[];
  /** Compact summary suitable for feeding back to a model for repair. */
  summary: string;
}

// ── Tunables ────────────────────────────────────────────────────────────────

/**
 * Assumed average ground speed for feasibility checks. Deliberately generous:
 * the goal is to catch impossible hops (city-to-city in 20 minutes), not to
 * second-guess plausible ones.
 */
const ASSUMED_SPEED_KMH = 45;

/** Slack added to every travel estimate to absorb parking, walking, waiting. */
const TRAVEL_SLACK_MINUTES = 15;

/** Activities longer than this are almost certainly a model error. */
const MAX_PLAUSIBLE_DURATION_HOURS = 14;

/** Budget overshoot tolerated before flagging, as a fraction. */
const BUDGET_TOLERANCE = 0.02;

/** Rounding tolerance when checking that costs sum to total_cost. */
const COST_SUM_TOLERANCE = 1;

const DEFAULT_MAX_PER_DAY = 6;
const DEFAULT_MAX_RADIUS_KM = 200;

// ── Geo ─────────────────────────────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in km. */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

const hasCoords = (a: VerifiableActivity): boolean =>
  typeof a.location_lat === "number" &&
  typeof a.location_lng === "number" &&
  Number.isFinite(a.location_lat) &&
  Number.isFinite(a.location_lng);

const inCoordRange = (lat: number, lng: number): boolean =>
  lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

// ── Helpers ─────────────────────────────────────────────────────────────────

const label = (a: VerifiableActivity, index: number) =>
  a.name?.trim() || `activity ${index + 1}`;

function parseTime(value?: string): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/** Local calendar day key, so "day" means the traveller's day. */
function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// ── Individual checks ───────────────────────────────────────────────────────

function checkBudget(
  plan: VerifiablePlan,
  activities: VerifiableActivity[],
  constraints: VerifyConstraints,
): Violation[] {
  const out: Violation[] = [];
  const summed = activities.reduce((total, a) => total + (a.cost ?? 0), 0);

  if (typeof constraints.budget === "number" && constraints.budget > 0) {
    const ceiling = constraints.budget * (1 + BUDGET_TOLERANCE);
    if (summed > ceiling) {
      out.push({
        code: "BUDGET_EXCEEDED",
        severity: "error",
        message: `Activities total ${Math.round(summed)}, which exceeds the budget of ${Math.round(constraints.budget)}.`,
        activityIndices: [],
      });
    }
  }

  // A mismatch here means the model's own arithmetic disagrees with its line
  // items — a strong signal the rest of the plan is unreliable too.
  if (typeof plan.total_cost === "number") {
    const drift = Math.abs(plan.total_cost - summed);
    if (drift > COST_SUM_TOLERANCE) {
      out.push({
        code: "COST_SUM_MISMATCH",
        severity: "warning",
        message: `Stated total ${Math.round(plan.total_cost)} does not match the sum of activity costs (${Math.round(summed)}).`,
        activityIndices: [],
      });
    }
  }

  return out;
}

function checkTimes(activities: VerifiableActivity[]): Violation[] {
  const out: Violation[] = [];

  activities.forEach((a, i) => {
    const start = parseTime(a.start_time);
    const end = parseTime(a.end_time);

    if (start === null || end === null) {
      out.push({
        code: "TIME_INVALID",
        severity: "error",
        message: `${label(a, i)} has a missing or unparseable start/end time.`,
        activityIndices: [i],
      });
      return;
    }

    if (end <= start) {
      out.push({
        code: "TIME_REVERSED",
        severity: "error",
        message: `${label(a, i)} ends at or before it starts.`,
        activityIndices: [i],
      });
      return;
    }

    const hours = (end - start) / 3_600_000;
    if (hours > MAX_PLAUSIBLE_DURATION_HOURS) {
      out.push({
        code: "DURATION_IMPLAUSIBLE",
        severity: "warning",
        message: `${label(a, i)} runs ${hours.toFixed(1)} hours, which looks like a scheduling error.`,
        activityIndices: [i],
      });
    }
  });

  return out;
}

/** Detects overlapping intervals among activities that have valid times. */
function checkOverlaps(activities: VerifiableActivity[]): Violation[] {
  const timed = activities
    .map((a, index) => ({
      index,
      activity: a,
      start: parseTime(a.start_time),
      end: parseTime(a.end_time),
    }))
    .filter(
      (x): x is { index: number; activity: VerifiableActivity; start: number; end: number } =>
        x.start !== null && x.end !== null && x.end > x.start,
    )
    .sort((a, b) => a.start - b.start);

  const out: Violation[] = [];

  for (let i = 1; i < timed.length; i++) {
    const previous = timed[i - 1];
    const current = timed[i];
    if (current.start < previous.end) {
      out.push({
        code: "TIME_OVERLAP",
        severity: "error",
        message: `${label(current.activity, current.index)} starts before ${label(previous.activity, previous.index)} finishes.`,
        activityIndices: [previous.index, current.index],
      });
    }
  }

  return out;
}

/**
 * Checks that consecutive activities are actually reachable in the gap between
 * them. Only compares activities that both carry coordinates and valid times.
 */
function checkTravelFeasibility(activities: VerifiableActivity[]): Violation[] {
  const points = activities
    .map((a, index) => ({
      index,
      activity: a,
      start: parseTime(a.start_time),
      end: parseTime(a.end_time),
    }))
    .filter(
      (x): x is { index: number; activity: VerifiableActivity; start: number; end: number } =>
        x.start !== null && x.end !== null && hasCoords(x.activity),
    )
    .sort((a, b) => a.start - b.start);

  const out: Violation[] = [];

  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1];
    const to = points[i];

    const km = haversineKm(
      from.activity.location_lat as number,
      from.activity.location_lng as number,
      to.activity.location_lat as number,
      to.activity.location_lng as number,
    );
    if (km < 1) continue; // same place, nothing to check

    const gapMinutes = (to.start - from.end) / 60_000;
    const neededMinutes = (km / ASSUMED_SPEED_KMH) * 60 + TRAVEL_SLACK_MINUTES;

    if (gapMinutes < neededMinutes) {
      out.push({
        code: "TRAVEL_INFEASIBLE",
        severity: "error",
        message:
          `${label(from.activity, from.index)} to ${label(to.activity, to.index)} is about ${Math.round(km)} km, ` +
          `which needs roughly ${Math.round(neededMinutes)} min of travel but only ${Math.round(gapMinutes)} min is scheduled.`,
        activityIndices: [from.index, to.index],
      });
    }
  }

  return out;
}

function checkCoordinates(
  activities: VerifiableActivity[],
  constraints: VerifyConstraints,
): Violation[] {
  const out: Violation[] = [];
  const radius = constraints.maxRadiusKm ?? DEFAULT_MAX_RADIUS_KM;
  const anchored =
    typeof constraints.anchorLat === "number" &&
    typeof constraints.anchorLng === "number";

  activities.forEach((a, i) => {
    if (!hasCoords(a)) return;
    const lat = a.location_lat as number;
    const lng = a.location_lng as number;

    if (!inCoordRange(lat, lng)) {
      out.push({
        code: "COORD_INVALID",
        severity: "error",
        message: `${label(a, i)} has coordinates outside the valid range.`,
        activityIndices: [i],
      });
      return;
    }

    // Catches the classic failure where a model invents a plausible-looking
    // landmark in the wrong country.
    if (anchored) {
      const km = haversineKm(
        constraints.anchorLat as number,
        constraints.anchorLng as number,
        lat,
        lng,
      );
      if (km > radius) {
        out.push({
          code: "COORD_OUT_OF_REGION",
          severity: "warning",
          message: `${label(a, i)} is about ${Math.round(km)} km from the destination, well outside the expected area.`,
          activityIndices: [i],
        });
      }
    }
  });

  return out;
}

function checkPace(
  activities: VerifiableActivity[],
  constraints: VerifyConstraints,
): Violation[] {
  const limit = constraints.maxActivitiesPerDay ?? DEFAULT_MAX_PER_DAY;
  const perDay = new Map<string, number[]>();

  activities.forEach((a, index) => {
    const start = parseTime(a.start_time);
    if (start === null) return;
    const key = dayKey(start);
    const bucket = perDay.get(key);
    if (bucket) bucket.push(index);
    else perDay.set(key, [index]);
  });

  const out: Violation[] = [];
  for (const [key, indices] of perDay) {
    if (indices.length > limit) {
      out.push({
        code: "PACE_EXCEEDED",
        severity: "warning",
        message: `${indices.length} activities scheduled on ${key.split("-").slice(0).join("-")} exceeds the comfortable limit of ${limit} per day.`,
        activityIndices: indices,
      });
    }
  }

  return out;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Runs every check against a generated plan. Pure, synchronous, offline-safe.
 *
 * `ok` is true when there are no **errors**; warnings do not block a plan, they
 * annotate it. That split matters: an over-packed day is worth surfacing but is
 * a legitimate choice, whereas a 62 km hop in 20 minutes is simply impossible.
 */
export function verifyItinerary(
  plan: VerifiablePlan,
  constraints: VerifyConstraints = {},
): VerificationResult {
  const activities = plan.activities ?? [];

  if (activities.length === 0) {
    const violation: Violation = {
      code: "EMPTY_ITINERARY",
      severity: "error",
      message: "The plan contains no activities.",
      activityIndices: [],
    };
    return {
      ok: false,
      violations: [violation],
      errors: [violation],
      warnings: [],
      summary: violation.message,
    };
  }

  const violations = [
    ...checkTimes(activities),
    ...checkOverlaps(activities),
    ...checkTravelFeasibility(activities),
    ...checkCoordinates(activities, constraints),
    ...checkBudget(plan, activities, constraints),
    ...checkPace(activities, constraints),
  ];

  const errors = violations.filter((v) => v.severity === "error");
  const warnings = violations.filter((v) => v.severity === "warning");

  return {
    ok: errors.length === 0,
    violations,
    errors,
    warnings,
    summary: summarise(errors, warnings),
  };
}

function summarise(errors: Violation[], warnings: Violation[]): string {
  if (errors.length === 0 && warnings.length === 0) {
    return "All checks passed.";
  }
  const parts: string[] = [];
  if (errors.length) parts.push(`${errors.length} blocking issue(s)`);
  if (warnings.length) parts.push(`${warnings.length} warning(s)`);
  return `${parts.join(", ")}: ${[...errors, ...warnings].map((v) => v.message).join(" ")}`;
}

/**
 * Formats violations as a repair instruction to append to a regeneration
 * prompt. Only errors are included — asking a model to also chase warnings
 * tends to make it rewrite the whole plan.
 */
export function buildRepairPrompt(result: VerificationResult): string {
  if (result.errors.length === 0) return "";
  const lines = result.errors.map((v, i) => `${i + 1}. ${v.message}`).join("\n");
  return (
    `The previous plan failed validation. Fix these specific problems and return ` +
    `the corrected plan in the same JSON shape:\n${lines}`
  );
}
