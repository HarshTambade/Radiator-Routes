// ─────────────────────────────────────────────────────────────────────────────
// Travel preference elicitation — the input side of group regret scoring
// ─────────────────────────────────────────────────────────────────────────────
// `lib/groupRegret.ts` computes a Least Misery fairness score from each member's
// stated preferences, reading three keys out of the loose `profiles.preferences`
// JSON blob:
//
//   category_weights     Record<ActivityCategory, number in [0,1]>
//   preferred_pace       "relaxed" | "moderate" | "packed"
//   trip_budget_ceiling  number, per-trip spend cap in the trip's currency
//
// Nothing in the app wrote those keys, so every member scored every plan
// identically. That yields zero regret for everyone — arithmetically correct and
// completely uninformative. The metric was machinery with no fuel.
//
// This module is the fuel line. It is deliberately pure so the round trip
// (UI state → JSON → groupRegret) is testable without a database or a browser.
//
// Two compatibility problems it also has to solve, both real data already in
// production profiles:
//
//   1. `TripCreationChat` wrote `{ pace, interests, food_preference,
//      accommodation }` — none of which groupRegret reads. `pace` even used the
//      value "balanced", which is not one of the three legal Pace values, so it
//      was silently discarded.
//   2. That same write replaced the whole `preferences` object, so anything
//      stored under other keys was destroyed. Merging is not optional here.
// ─────────────────────────────────────────────────────────────────────────────

import {
  ACTIVITY_CATEGORIES,
  type ActivityCategory,
  type Pace,
} from "./groupRegret";

/**
 * Categories worth putting a control on.
 *
 * `computeUtility` excludes transport and accommodation from its interest term —
 * nobody chooses a trip *for* the airport transfer, so counting them dilutes the
 * signal. Offering sliders for them would imply an effect they do not have, so
 * they are omitted rather than shown and ignored.
 */
export const EDITABLE_CATEGORIES: readonly ActivityCategory[] = [
  "food",
  "attraction",
  "entertainment",
  "shopping",
  "other",
] as const;

/** Human labels for the editable categories. */
export const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  food: "Food & dining",
  attraction: "Sights & attractions",
  entertainment: "Nightlife & entertainment",
  shopping: "Shopping & markets",
  other: "Everything else",
  transport: "Transport",
  accommodation: "Accommodation",
};

export const PACE_LABELS: Record<Pace, string> = {
  relaxed: "Relaxed",
  moderate: "Moderate",
  packed: "Packed",
};

/** Activities per day each pace treats as ideal. Mirrors groupRegret's model. */
export const PACE_HINTS: Record<Pace, string> = {
  relaxed: "About 3 activities a day",
  moderate: "About 5 activities a day",
  packed: "About 8 activities a day",
};

export const PACE_VALUES: readonly Pace[] = [
  "relaxed",
  "moderate",
  "packed",
] as const;

/** Weight applied when a member expressed no opinion. Matches groupRegret. */
export const NEUTRAL_WEIGHT = 0.5;

/**
 * Editable form state. Weights are kept in [0,1] here — the same units
 * groupRegret consumes — so the UI is the only place that deals in percentages.
 */
export interface PreferenceDraft {
  categoryWeights: Record<ActivityCategory, number>;
  pace: Pace;
  /** Null means "no personal cap", which is different from a cap of zero. */
  budgetCeiling: number | null;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function neutralWeights(): Record<ActivityCategory, number> {
  return ACTIVITY_CATEGORIES.reduce(
    (acc, category) => {
      acc[category] = NEUTRAL_WEIGHT;
      return acc;
    },
    {} as Record<ActivityCategory, number>,
  );
}

export function defaultDraft(): PreferenceDraft {
  return {
    categoryWeights: neutralWeights(),
    pace: "moderate",
    budgetCeiling: null,
  };
}

// ── Legacy vocabulary ───────────────────────────────────────────────────────

/**
 * The interest words the trip-creation chat collects, mapped onto the seven
 * categories the planner actually emits. Without this, a user who said
 * "nightlife" and "nature" contributed nothing to scoring.
 */
const INTEREST_TO_CATEGORY: Record<string, ActivityCategory> = {
  culture: "attraction",
  beaches: "attraction",
  nature: "attraction",
  photography: "attraction",
  sightseeing: "attraction",
  food: "food",
  cuisine: "food",
  shopping: "shopping",
  adventure: "entertainment",
  nightlife: "entertainment",
  entertainment: "entertainment",
};

/** Weight given to a category the member named as an interest. */
const STATED_INTEREST_WEIGHT = 0.9;

/**
 * Normalises the pace vocabulary. The chat's "balanced" and the schema's
 * "moderate" mean the same thing; only the latter is a legal `Pace`.
 */
export function normalisePace(raw: unknown): Pace | undefined {
  if (typeof raw !== "string") return undefined;
  const value = raw.trim().toLowerCase();
  if (value === "relaxed" || value === "slow") return "relaxed";
  if (value === "moderate" || value === "balanced") return "moderate";
  if (value === "packed" || value === "fast" || value === "intense") {
    return "packed";
  }
  return undefined;
}

// ── Read: stored JSON → form state ──────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normaliseCategory(raw: string): ActivityCategory | undefined {
  const value = raw.trim().toLowerCase();
  return (ACTIVITY_CATEGORIES as readonly string[]).includes(value)
    ? (value as ActivityCategory)
    : undefined;
}

/**
 * Builds form state from a stored `profiles.preferences` blob.
 *
 * Precedence matches `preferencesFromProfile`: explicit `category_weights` win,
 * then the older favourite/interest lists, then neutral. Anything unparseable is
 * ignored rather than guessed at.
 */
export function draftFromPreferences(raw: unknown): PreferenceDraft {
  const prefs = asRecord(raw);
  const draft = defaultDraft();

  const explicit = asRecord(prefs.category_weights);
  let sawExplicit = false;
  for (const [key, value] of Object.entries(explicit)) {
    const category = normaliseCategory(key);
    if (!category) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    draft.categoryWeights[category] = clamp01(value);
    sawExplicit = true;
  }

  // Only fall back to the coarse lists when no numeric weights exist, so an
  // explicit slider setting is never overwritten by an older interest tag.
  if (!sawExplicit) {
    const lists = [
      prefs.favorite_categories,
      prefs.favourite_categories,
      prefs.interests,
    ];
    for (const list of lists) {
      if (!Array.isArray(list)) continue;
      for (const entry of list) {
        if (typeof entry !== "string") continue;
        const category =
          normaliseCategory(entry) ??
          INTEREST_TO_CATEGORY[entry.trim().toLowerCase()];
        if (category) draft.categoryWeights[category] = STATED_INTEREST_WEIGHT;
      }
    }
  }

  draft.pace =
    normalisePace(prefs.preferred_pace) ?? normalisePace(prefs.pace) ?? "moderate";

  const ceiling = prefs.trip_budget_ceiling;
  draft.budgetCeiling =
    typeof ceiling === "number" && Number.isFinite(ceiling) && ceiling > 0
      ? ceiling
      : null;

  return draft;
}

// ── Write: form state → stored JSON ─────────────────────────────────────────

/**
 * Produces the full `preferences` object to persist.
 *
 * `existing` is spread first so unrelated keys written by other parts of the app
 * (`food_preference`, `accommodation`, `travel_personality` hints) survive. The
 * canonical keys are then overwritten with the values groupRegret reads.
 *
 * Legacy `pace` is normalised in place rather than deleted: leaving "balanced"
 * behind would let a later read pick up a value that is not a legal Pace.
 */
export function preferencesPatch(
  draft: PreferenceDraft,
  existing?: unknown,
): Record<string, unknown> {
  const base = { ...asRecord(existing) };

  const weights: Partial<Record<ActivityCategory, number>> = {};
  for (const category of EDITABLE_CATEGORIES) {
    weights[category] = clamp01(draft.categoryWeights[category] ?? NEUTRAL_WEIGHT);
  }

  base.category_weights = weights;
  base.preferred_pace = draft.pace;

  if (draft.budgetCeiling != null && draft.budgetCeiling > 0) {
    base.trip_budget_ceiling = Math.round(draft.budgetCeiling);
  } else {
    delete base.trip_budget_ceiling;
  }

  // Keep the legacy key consistent instead of leaving a stale illegal value.
  if ("pace" in base) base.pace = draft.pace;

  return base;
}

/**
 * Whether a stored blob contains anything the fairness metric can actually use.
 *
 * Drives the "preferences not set" prompt. A member with nothing stated scores
 * every plan the same, so the honest UI move is to say so rather than show a
 * zero and let it read as "perfectly fair".
 */
export function hasStatedPreferences(raw: unknown): boolean {
  const prefs = asRecord(raw);

  const explicit = asRecord(prefs.category_weights);
  for (const [key, value] of Object.entries(explicit)) {
    if (!normaliseCategory(key)) continue;
    if (typeof value === "number" && Number.isFinite(value)) return true;
  }

  if (normalisePace(prefs.preferred_pace)) return true;
  if (
    typeof prefs.trip_budget_ceiling === "number" &&
    prefs.trip_budget_ceiling > 0
  ) {
    return true;
  }

  for (const list of [
    prefs.favorite_categories,
    prefs.favourite_categories,
    prefs.interests,
  ]) {
    if (Array.isArray(list) && list.some((e) => typeof e === "string")) {
      return true;
    }
  }

  return false;
}

/**
 * How far a draft departs from neutral, in [0,1]. Used to tell a user whether
 * their settings are distinctive enough to affect scoring: all-neutral weights
 * are indistinguishable from having said nothing.
 */
export function draftDistinctiveness(draft: PreferenceDraft): number {
  const spread = EDITABLE_CATEGORIES.map((c) =>
    Math.abs((draft.categoryWeights[c] ?? NEUTRAL_WEIGHT) - NEUTRAL_WEIGHT),
  );
  return spread.reduce((a, b) => a + b, 0) / (spread.length * NEUTRAL_WEIGHT);
}

/** The coarse trip-style answers the trip-creation chat collects. */
export interface TripStyleAnswers {
  food_preference?: string;
  accommodation?: string;
  /** Chat vocabulary, which includes the illegal-for-Pace value "balanced". */
  pace?: string;
  interests?: string[];
}

/**
 * Folds the trip-creation chat's answers into an existing preferences blob.
 *
 * Replaces a write that built a fresh four-key object and replaced the column
 * outright, destroying anything else stored there — including the category
 * weights and budget cap the preferences form writes.
 *
 * Interests are translated into `category_weights` so they reach the scoring
 * model, but only when no explicit weights exist yet: a slider the user set by
 * hand is a stronger statement than a tag they tapped while creating a trip.
 */
export function mergeTripStyle(
  existing: unknown,
  answers: TripStyleAnswers,
): Record<string, unknown> {
  const base = { ...asRecord(existing) };

  if (answers.food_preference) base.food_preference = answers.food_preference;
  if (answers.accommodation) base.accommodation = answers.accommodation;
  if (Array.isArray(answers.interests) && answers.interests.length > 0) {
    base.interests = answers.interests;
  }

  const pace = normalisePace(answers.pace);
  if (pace) {
    base.preferred_pace = pace;
    base.pace = pace;
  }

  const explicit = asRecord(base.category_weights);
  const hasExplicitWeights = Object.entries(explicit).some(
    ([key, value]) =>
      normaliseCategory(key) &&
      typeof value === "number" &&
      Number.isFinite(value),
  );

  if (!hasExplicitWeights && Array.isArray(answers.interests)) {
    const weights: Partial<Record<ActivityCategory, number>> = {};
    for (const entry of answers.interests) {
      if (typeof entry !== "string") continue;
      const category =
        normaliseCategory(entry) ??
        INTEREST_TO_CATEGORY[entry.trim().toLowerCase()];
      if (category) weights[category] = STATED_INTEREST_WEIGHT;
    }
    if (Object.keys(weights).length > 0) base.category_weights = weights;
  }

  return base;
}
