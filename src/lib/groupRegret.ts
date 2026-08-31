// ─────────────────────────────────────────────────────────────────────────────
// Group regret scoring — Least Misery over computed member utilities
// ─────────────────────────────────────────────────────────────────────────────
// This replaces a prior implementation in which the "regret score" was written
// into the LLM prompt as a constant (budget ~0.35, balanced ~0.20, experience
// ~0.10) and rendered in the UI as though it had been measured. That number was
// unfalsifiable: it could never be wrong, because it was never computed.
//
// What replaces it is deliberately boring and deterministic:
//
//   1. Score each candidate plan from each member's stated preferences → utility
//   2. Member regret = best utility that member could have had − what they got
//   3. Group regret  = the WORST member's regret  (Least Misery)
//   4. Recommend the plan minimising group regret
//
// Least Misery is a long-established group-recommendation aggregation strategy;
// Masthoff's user studies found people actually reason this way and care about
// avoiding individual misery (Masthoff, UMUAI 2004). Step 2 is anticipated
// regret in the Loomes–Sugden / Bell (1982) sense: the gap between an outcome
// and the best alternative that was available.
//
// Note on naming: this is NOT counterfactual regret minimisation (Zinkevich et
// al., 2007). CFR is iterative self-play over an extensive-form game to
// approximate a Nash equilibrium. There is no game tree and no repeated play
// here, so the term does not apply and is avoided.
//
// The LLM's job shrinks to what it is good at — proposing candidate plans. The
// scoring is arithmetic, runs offline, and can be shown to be wrong.
// ─────────────────────────────────────────────────────────────────────────────

/** Activity categories the planner emits. */
export type ActivityCategory =
  | "food"
  | "attraction"
  | "transport"
  | "shopping"
  | "accommodation"
  | "entertainment"
  | "other";

export const ACTIVITY_CATEGORIES: readonly ActivityCategory[] = [
  "food",
  "attraction",
  "transport",
  "shopping",
  "accommodation",
  "entertainment",
  "other",
] as const;

export type Pace = "relaxed" | "moderate" | "packed";

/** One traveller's declared preferences. All fields optional — see DEFAULTS. */
export interface MemberPreferences {
  /** Stable id, used for attribution in explanations. */
  id: string;
  /** Display name for explanations. */
  name?: string;
  /** Per-category weight in [0,1]. Missing categories fall back to neutral. */
  categoryWeights?: Partial<Record<ActivityCategory, number>>;
  /** Preferred trip intensity. */
  pace?: Pace;
  /** Personal spend ceiling for the trip. Exceeding it costs utility. */
  budgetCeiling?: number;
}

export interface ScorableActivity {
  category?: string;
  cost?: number;
  review_score?: number | null;
}

export interface ScorablePlan {
  /** Stable identifier, e.g. "budget" | "balanced" | "experience". */
  variant: string;
  activities?: ScorableActivity[];
  total_cost?: number;
}

export interface MemberRegret {
  memberId: string
  memberName?: string;
  /** Utility this member gets from the selected plan, in [0,1]. */
  utility: number;
  /** Best utility this member could have had across all candidates. */
  bestAvailableUtility: number;
  /** bestAvailableUtility − utility, in [0,1]. Zero means "their favourite". */
  regret: number;
}

export interface PlanRegret {
  variant: string;
  /** Least Misery: the maximum regret across members. Lower is better. */
  groupRegret: number;
  /** Mean regret, reported for comparison but not used for selection. */
  averageRegret: number;
  /** Per-member breakdown, so the score can be explained and audited. */
  members: MemberRegret[];
}

export interface GroupRegretResult {
  plans: PlanRegret[];
  /** Variant minimising groupRegret. Null when there is nothing to score. */
  recommended: string | null;
  /** Aggregation strategy used, recorded so the number is interpretable. */
  strategy: "least-misery";
}

// ── Defaults ────────────────────────────────────────────────────────────────

/** Neutral weight when a member expressed no opinion about a category. */
const NEUTRAL_WEIGHT = 0.5;

/** Activities per day each pace considers ideal. */
const PACE_IDEAL_PER_DAY: Record<Pace, number> = {
  relaxed: 3,
  moderate: 5,
  packed: 8,
};

/**
 * How much of the utility each component contributes. Interest dominates
 * because it is the thing members actually stated; the rest are modifiers.
 */
const COMPONENT_WEIGHTS = {
  interest: 0.6,
  quality: 0.2,
  affordability: 0.2,
} as const;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function normaliseCategory(raw?: string): ActivityCategory {
  const value = (raw ?? "other").toLowerCase() as ActivityCategory;
  return ACTIVITY_CATEGORIES.includes(value) ? value : "other";
}

// ── Utility model ───────────────────────────────────────────────────────────

/**
 * Utility of `plan` for `member`, in [0,1].
 *
 * Three components:
 *   interest      — mean category weight across the plan's activities
 *   quality       — mean normalised review score (neutral when unknown)
 *   affordability — 1 when within the member's ceiling, decaying past it
 *
 * Transport and accommodation are excluded from the interest term: nobody picks
 * a trip *for* the airport transfer, so counting them would dilute signal.
 */
export function computeUtility(
  plan: ScorablePlan,
  member: MemberPreferences,
): number {
  const activities = plan.activities ?? [];
  if (activities.length === 0) return 0;

  const weights = member.categoryWeights ?? {};

  const experiential = activities.filter((a) => {
    const category = normaliseCategory(a.category);
    return category !== "transport" && category !== "accommodation";
  });
  const interestPool = experiential.length > 0 ? experiential : activities;

  const interest =
    interestPool.reduce((sum, a) => {
      const category = normaliseCategory(a.category);
      return sum + (weights[category] ?? NEUTRAL_WEIGHT);
    }, 0) / interestPool.length;

  const rated = activities.filter(
    (a) => typeof a.review_score === "number" && (a.review_score as number) > 0,
  );
  const quality =
    rated.length === 0
      ? NEUTRAL_WEIGHT
      : rated.reduce((sum, a) => sum + (a.review_score as number), 0) /
        (rated.length * 5);

  const spend =
    typeof plan.total_cost === "number"
      ? plan.total_cost
      : activities.reduce((sum, a) => sum + (a.cost ?? 0), 0);

  let affordability = 1;
  if (typeof member.budgetCeiling === "number" && member.budgetCeiling > 0) {
    // Linear decay: at 2x the ceiling affordability reaches 0.
    const overshoot = (spend - member.budgetCeiling) / member.budgetCeiling;
    affordability = overshoot <= 0 ? 1 : clamp01(1 - overshoot);
  }

  return clamp01(
    COMPONENT_WEIGHTS.interest * clamp01(interest) +
      COMPONENT_WEIGHTS.quality * clamp01(quality) +
      COMPONENT_WEIGHTS.affordability * affordability,
  );
}

/**
 * Pace fit in [0,1] — how well a plan's daily density matches a member's taste.
 * Exposed separately because it is a useful explanation on its own, and folding
 * it into utility would double-count activity count.
 */
export function computePaceFit(
  plan: ScorablePlan,
  member: MemberPreferences,
  days: number,
): number {
  const count = plan.activities?.length ?? 0;
  if (days <= 0 || count === 0) return NEUTRAL_WEIGHT;

  const ideal = PACE_IDEAL_PER_DAY[member.pace ?? "moderate"];
  const actual = count / days;
  // Symmetric penalty: too sparse is as poor a fit as too packed.
  return clamp01(1 - Math.abs(actual - ideal) / ideal);
}

// ── Regret ──────────────────────────────────────────────────────────────────

/**
 * Scores every candidate plan for every member and returns per-plan group
 * regret under Least Misery.
 *
 * Regret is defined *relative to the candidate set*: a member's regret is zero
 * for whichever offered plan suits them best. This is the honest reading — the
 * group is choosing among these options, not against an unreachable ideal — and
 * it guarantees at least one plan has a member with zero regret.
 */
export function computeGroupRegret(
  plans: ScorablePlan[],
  members: MemberPreferences[],
): GroupRegretResult {
  if (plans.length === 0 || members.length === 0) {
    return { plans: [], recommended: null, strategy: "least-misery" };
  }

  // utilities[memberIndex][planIndex]
  const utilities = members.map((member) =>
    plans.map((plan) => computeUtility(plan, member)),
  );
  const bestPerMember = utilities.map((row) => Math.max(...row));

  const scored: PlanRegret[] = plans.map((plan, planIndex) => {
    const memberRegrets: MemberRegret[] = members.map((member, memberIndex) => {
      const utility = utilities[memberIndex][planIndex];
      const best = bestPerMember[memberIndex];
      return {
        memberId: member.id,
        memberName: member.name,
        utility: round3(utility),
        bestAvailableUtility: round3(best),
        regret: round3(Math.max(0, best - utility)),
      };
    });

    const values = memberRegrets.map((m) => m.regret);
    return {
      variant: plan.variant,
      groupRegret: round3(Math.max(...values)),
      averageRegret: round3(values.reduce((a, b) => a + b, 0) / values.length),
      members: memberRegrets,
    };
  });

  // Ties broken by average regret, then by original order — deterministic.
  const recommended = [...scored].sort(
    (a, b) =>
      a.groupRegret - b.groupRegret ||
      a.averageRegret - b.averageRegret ||
      plans.findIndex((p) => p.variant === a.variant) -
        plans.findIndex((p) => p.variant === b.variant),
  )[0].variant;

  return { plans: scored, recommended, strategy: "least-misery" };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

// ── Explanation ─────────────────────────────────────────────────────────────

/** Qualitative band for a regret value, for UI copy. */
export function regretBand(regret: number): "low" | "moderate" | "high" {
  if (regret < 0.15) return "low";
  if (regret < 0.35) return "moderate";
  return "high";
}

/**
 * Per-member sentence explaining what the selected plan costs them. Unlike the
 * previous single opaque number, every member can see their own trade-off.
 */
export function explainMemberRegret(member: MemberRegret): string {
  const who = member.memberName ?? "This traveller";
  if (member.regret <= 0.001) {
    return `${who} gets their best option of the three.`;
  }
  return (
    `${who} gives up ${(member.regret * 100).toFixed(0)}% of the value ` +
    `their preferred option would have offered.`
  );
}

/** Group-level summary naming the worst-off member, since that drives the score. */
export function explainGroupRegret(plan: PlanRegret): string {
  const band = regretBand(plan.groupRegret);
  const worst = plan.members.reduce(
    (a, b) => (b.regret > a.regret ? b : a),
    plan.members[0],
  );

  if (!worst || plan.groupRegret <= 0.001) {
    return "Every traveller gets their preferred option.";
  }

  const who = worst.memberName ?? "one traveller";
  const pct = (plan.groupRegret * 100).toFixed(0);

  if (band === "low") {
    return `Well balanced — the least satisfied traveller (${who}) gives up only ${pct}%.`;
  }
  if (band === "moderate") {
    return `Some trade-offs — ${who} gives up ${pct}% versus their preferred option.`;
  }
  return `Unbalanced — ${who} gives up ${pct}%, which is a significant compromise.`;
}

// ── Preference extraction ───────────────────────────────────────────────────

/**
 * Builds a `MemberPreferences` from a Supabase `profiles` row.
 *
 * Preferences are stored as loose JSON, so every field is defensive. A member
 * who has set nothing scores every plan identically, which correctly yields
 * zero regret for them rather than a fabricated opinion.
 */
export function preferencesFromProfile(
  profile: {
    id?: string;
    /** `profiles.name` in the Supabase schema. */
    name?: string | null;
    preferences?: unknown;
  },
  fallbackId: string,
): MemberPreferences {
  const raw =
    profile.preferences && typeof profile.preferences === "object"
      ? (profile.preferences as Record<string, unknown>)
      : {};

  const categoryWeights: Partial<Record<ActivityCategory, number>> = {};

  // Explicit numeric weights win.
  const explicit = raw.category_weights;
  if (explicit && typeof explicit === "object") {
    for (const [key, value] of Object.entries(explicit)) {
      const category = normaliseCategory(key);
      if (typeof value === "number" && Number.isFinite(value)) {
        categoryWeights[category] = clamp01(value);
      }
    }
  }

  // Otherwise derive from the simpler favourite-categories list the app collects.
  if (Object.keys(categoryWeights).length === 0) {
    const favourites = raw.favorite_categories ?? raw.favourite_categories;
    if (Array.isArray(favourites)) {
      for (const entry of favourites) {
        if (typeof entry !== "string") continue;
        categoryWeights[normaliseCategory(entry)] = 0.9;
      }
    }
  }

  const paceRaw = typeof raw.preferred_pace === "string" ? raw.preferred_pace.toLowerCase() : "";
  const pace: Pace | undefined =
    paceRaw === "relaxed" || paceRaw === "moderate" || paceRaw === "packed"
      ? paceRaw
      : undefined;

  const ceiling =
    typeof raw.trip_budget_ceiling === "number"
      ? raw.trip_budget_ceiling
      : undefined;

  return {
    id: profile.id ?? fallbackId,
    name: profile.name ?? undefined,
    categoryWeights:
      Object.keys(categoryWeights).length > 0 ? categoryWeights : undefined,
    pace,
    budgetCeiling: ceiling,
  };
}
