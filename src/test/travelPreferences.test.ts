import { describe, expect, it } from "vitest";
import {
  CATEGORY_LABELS,
  EDITABLE_CATEGORIES,
  NEUTRAL_WEIGHT,
  defaultDraft,
  draftDistinctiveness,
  draftFromPreferences,
  hasStatedPreferences,
  mergeTripStyle,
  normalisePace,
  preferencesPatch,
} from "@/lib/travelPreferences";
import {
  ACTIVITY_CATEGORIES,
  computeGroupRegret,
  preferencesFromProfile,
} from "@/lib/groupRegret";

// The point of this suite is the contract between the preferences UI and the
// scorer. P3 in the backlog was "the fairness metric has no input UI, so it is
// inert" — the tests that matter are the ones proving a saved draft actually
// changes what computeGroupRegret returns.

describe("normalisePace", () => {
  it("accepts the three legal pace values", () => {
    expect(normalisePace("relaxed")).toBe("relaxed");
    expect(normalisePace("moderate")).toBe("moderate");
    expect(normalisePace("packed")).toBe("packed");
  });

  it("maps the trip-creation chat's 'balanced' onto 'moderate'", () => {
    // The chat offered "balanced", which is not a legal Pace, so the scorer
    // discarded it silently. This is the specific data-loss bug.
    expect(normalisePace("balanced")).toBe("moderate");
  });

  it("is case and whitespace insensitive", () => {
    expect(normalisePace("  PACKED ")).toBe("packed");
  });

  it("returns undefined for anything unrecognised", () => {
    expect(normalisePace("brisk")).toBeUndefined();
    expect(normalisePace(42)).toBeUndefined();
    expect(normalisePace(null)).toBeUndefined();
    expect(normalisePace(undefined)).toBeUndefined();
  });
});

describe("draftFromPreferences", () => {
  it("returns neutral defaults for an empty blob", () => {
    const draft = draftFromPreferences(null);
    expect(draft.pace).toBe("moderate");
    expect(draft.budgetCeiling).toBeNull();
    for (const category of ACTIVITY_CATEGORIES) {
      expect(draft.categoryWeights[category]).toBe(NEUTRAL_WEIGHT);
    }
  });

  it("survives garbage input without throwing", () => {
    for (const input of ["string", 42, [], true, undefined]) {
      expect(() => draftFromPreferences(input)).not.toThrow();
    }
    expect(draftFromPreferences([]).pace).toBe("moderate");
  });

  it("reads explicit numeric category weights", () => {
    const draft = draftFromPreferences({
      category_weights: { food: 0.9, shopping: 0.1 },
    });
    expect(draft.categoryWeights.food).toBe(0.9);
    expect(draft.categoryWeights.shopping).toBe(0.1);
    expect(draft.categoryWeights.attraction).toBe(NEUTRAL_WEIGHT);
  });

  it("clamps out-of-range weights into [0,1]", () => {
    const draft = draftFromPreferences({
      category_weights: { food: 4, shopping: -2 },
    });
    expect(draft.categoryWeights.food).toBe(1);
    expect(draft.categoryWeights.shopping).toBe(0);
  });

  it("ignores unknown categories and non-numeric weights", () => {
    const draft = draftFromPreferences({
      category_weights: { spelunking: 0.9, food: "lots" },
    });
    expect(draft.categoryWeights.food).toBe(NEUTRAL_WEIGHT);
    expect(
      (draft.categoryWeights as Record<string, number>).spelunking,
    ).toBeUndefined();
  });

  it("derives weights from the chat's interest vocabulary", () => {
    const draft = draftFromPreferences({
      interests: ["nightlife", "culture", "food"],
    });
    expect(draft.categoryWeights.entertainment).toBeGreaterThan(NEUTRAL_WEIGHT);
    expect(draft.categoryWeights.attraction).toBeGreaterThan(NEUTRAL_WEIGHT);
    expect(draft.categoryWeights.food).toBeGreaterThan(NEUTRAL_WEIGHT);
    expect(draft.categoryWeights.shopping).toBe(NEUTRAL_WEIGHT);
  });

  it("prefers explicit weights over legacy interest tags", () => {
    const draft = draftFromPreferences({
      category_weights: { food: 0.2 },
      interests: ["food"],
    });
    // A slider the user set by hand must not be overwritten by an old tag.
    expect(draft.categoryWeights.food).toBe(0.2);
  });

  it("reads preferred_pace, falling back to the legacy pace key", () => {
    expect(draftFromPreferences({ preferred_pace: "packed" }).pace).toBe("packed");
    expect(draftFromPreferences({ pace: "balanced" }).pace).toBe("moderate");
    expect(
      draftFromPreferences({ preferred_pace: "relaxed", pace: "packed" }).pace,
    ).toBe("relaxed");
  });

  it("only accepts a positive finite budget ceiling", () => {
    expect(draftFromPreferences({ trip_budget_ceiling: 25000 }).budgetCeiling).toBe(
      25000,
    );
    expect(draftFromPreferences({ trip_budget_ceiling: 0 }).budgetCeiling).toBeNull();
    expect(draftFromPreferences({ trip_budget_ceiling: -5 }).budgetCeiling).toBeNull();
    expect(
      draftFromPreferences({ trip_budget_ceiling: "20000" }).budgetCeiling,
    ).toBeNull();
  });
});

describe("preferencesPatch", () => {
  it("writes exactly the keys groupRegret reads", () => {
    const patch = preferencesPatch({
      categoryWeights: { ...defaultDraft().categoryWeights, food: 1 },
      pace: "relaxed",
      budgetCeiling: 18000,
    });
    expect(patch.category_weights).toBeDefined();
    expect(patch.preferred_pace).toBe("relaxed");
    expect(patch.trip_budget_ceiling).toBe(18000);
  });

  it("preserves unrelated keys instead of replacing the column", () => {
    const patch = preferencesPatch(defaultDraft(), {
      food_preference: "vegetarian",
      accommodation: "hostel",
      something_else: { nested: true },
    });
    expect(patch.food_preference).toBe("vegetarian");
    expect(patch.accommodation).toBe("hostel");
    expect(patch.something_else).toEqual({ nested: true });
  });

  it("drops the ceiling key when there is no cap", () => {
    const patch = preferencesPatch(
      { ...defaultDraft(), budgetCeiling: null },
      { trip_budget_ceiling: 9000 },
    );
    expect("trip_budget_ceiling" in patch).toBe(false);
  });

  it("rounds a fractional ceiling", () => {
    const patch = preferencesPatch({
      ...defaultDraft(),
      budgetCeiling: 12345.67,
    });
    expect(patch.trip_budget_ceiling).toBe(12346);
  });

  it("normalises a stale legacy pace value rather than leaving it illegal", () => {
    const patch = preferencesPatch(
      { ...defaultDraft(), pace: "packed" },
      { pace: "balanced" },
    );
    expect(patch.pace).toBe("packed");
    expect(patch.preferred_pace).toBe("packed");
  });

  it("only writes weights for the editable categories", () => {
    const patch = preferencesPatch(defaultDraft());
    const weights = patch.category_weights as Record<string, number>;
    expect(Object.keys(weights).sort()).toEqual([...EDITABLE_CATEGORIES].sort());
    // Transport and accommodation are excluded from the interest term, so
    // writing weights for them would imply an effect they do not have.
    expect(weights.transport).toBeUndefined();
    expect(weights.accommodation).toBeUndefined();
  });
});

describe("round trip: UI draft → stored JSON → scorer input", () => {
  it("survives the full save/load cycle unchanged", () => {
    const original = {
      categoryWeights: { ...defaultDraft().categoryWeights, food: 0.9, shopping: 0.1 },
      pace: "packed" as const,
      budgetCeiling: 30000,
    };

    const stored = preferencesPatch(original);
    const reloaded = draftFromPreferences(stored);

    expect(reloaded.pace).toBe("packed");
    expect(reloaded.budgetCeiling).toBe(30000);
    expect(reloaded.categoryWeights.food).toBe(0.9);
    expect(reloaded.categoryWeights.shopping).toBe(0.1);
  });

  it("is readable by preferencesFromProfile, the scorer's own extractor", () => {
    const stored = preferencesPatch({
      categoryWeights: { ...defaultDraft().categoryWeights, food: 0.95 },
      pace: "relaxed",
      budgetCeiling: 15000,
    });

    const member = preferencesFromProfile(
      { id: "u1", name: "Asha", preferences: stored },
      "u1",
    );

    expect(member.pace).toBe("relaxed");
    expect(member.budgetCeiling).toBe(15000);
    expect(member.categoryWeights?.food).toBe(0.95);
  });

  it("changes the computed group regret, proving the metric is no longer inert", () => {
    // This is the assertion that P3 was actually fixed. Before the preferences
    // form existed, both members had empty preferences and every plan scored
    // identically — zero regret regardless of the plan.
    const foodLover = preferencesFromProfile(
      {
        id: "a",
        name: "A",
        preferences: preferencesPatch({
          categoryWeights: { ...defaultDraft().categoryWeights, food: 1, attraction: 0 },
          pace: "moderate",
          budgetCeiling: null,
        }),
      },
      "a",
    );
    const sightseer = preferencesFromProfile(
      {
        id: "b",
        name: "B",
        preferences: preferencesPatch({
          categoryWeights: { ...defaultDraft().categoryWeights, food: 0, attraction: 1 },
          pace: "moderate",
          budgetCeiling: null,
        }),
      },
      "b",
    );

    const plans = [
      {
        variant: "eat",
        activities: [{ category: "food" }, { category: "food" }],
        total_cost: 100,
      },
      {
        variant: "see",
        activities: [{ category: "attraction" }, { category: "attraction" }],
        total_cost: 100,
      },
      {
        variant: "mixed",
        activities: [{ category: "food" }, { category: "attraction" }],
        total_cost: 100,
      },
    ];

    const stated = computeGroupRegret(plans, [foodLover, sightseer]);
    const empty = computeGroupRegret(plans, [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ]);

    // Empty preferences: every plan identical, nothing to choose between.
    expect(empty.plans.every((p) => p.groupRegret === 0)).toBe(true);

    // Stated preferences: the single-interest plans hurt the other member, and
    // the compromise plan is the one that minimises the worst-off shortfall.
    expect(stated.recommended).toBe("mixed");
    const byVariant = new Map(stated.plans.map((p) => [p.variant, p]));
    expect(byVariant.get("eat")!.groupRegret).toBeGreaterThan(0);
    expect(byVariant.get("see")!.groupRegret).toBeGreaterThan(0);
    expect(byVariant.get("mixed")!.groupRegret).toBeLessThan(
      byVariant.get("eat")!.groupRegret,
    );
  });
});

describe("hasStatedPreferences", () => {
  it("is false for empty or unusable blobs", () => {
    expect(hasStatedPreferences(null)).toBe(false);
    expect(hasStatedPreferences({})).toBe(false);
    expect(hasStatedPreferences({ food_preference: "vegan" })).toBe(false);
    expect(hasStatedPreferences({ category_weights: {} })).toBe(false);
    expect(hasStatedPreferences({ category_weights: { nope: 1 } })).toBe(false);
    expect(hasStatedPreferences({ preferred_pace: "brisk" })).toBe(false);
    expect(hasStatedPreferences({ trip_budget_ceiling: 0 })).toBe(false);
  });

  it("is true once anything the scorer reads is present", () => {
    expect(hasStatedPreferences({ category_weights: { food: 0.8 } })).toBe(true);
    expect(hasStatedPreferences({ preferred_pace: "packed" })).toBe(true);
    expect(hasStatedPreferences({ trip_budget_ceiling: 100 })).toBe(true);
    expect(hasStatedPreferences({ interests: ["food"] })).toBe(true);
  });
});

describe("mergeTripStyle", () => {
  it("keeps category weights the preferences form wrote", () => {
    // The regression: the chat used to replace the whole preferences object.
    const existing = preferencesPatch({
      categoryWeights: { ...defaultDraft().categoryWeights, food: 0.95 },
      pace: "relaxed",
      budgetCeiling: 20000,
    });

    const merged = mergeTripStyle(existing, {
      food_preference: "vegetarian",
      accommodation: "hotel",
      pace: "balanced",
      interests: ["shopping"],
    });

    const weights = merged.category_weights as Record<string, number>;
    expect(weights.food).toBe(0.95);
    expect(merged.trip_budget_ceiling).toBe(20000);
    expect(merged.food_preference).toBe("vegetarian");
  });

  it("normalises the chat's pace into the key the scorer reads", () => {
    const merged = mergeTripStyle(null, { pace: "balanced" });
    expect(merged.preferred_pace).toBe("moderate");
    expect(merged.pace).toBe("moderate");
  });

  it("derives weights from interests when none are set yet", () => {
    const merged = mergeTripStyle(null, { interests: ["food", "nightlife"] });
    const weights = merged.category_weights as Record<string, number>;
    expect(weights.food).toBeGreaterThan(NEUTRAL_WEIGHT);
    expect(weights.entertainment).toBeGreaterThan(NEUTRAL_WEIGHT);
  });

  it("does not invent weights from an empty interest list", () => {
    const merged = mergeTripStyle(null, { interests: [] });
    expect(merged.category_weights).toBeUndefined();
  });

  it("leaves the blob untouched when there is nothing to merge", () => {
    expect(mergeTripStyle({ existing: 1 }, {})).toEqual({ existing: 1 });
  });
});

describe("draftDistinctiveness", () => {
  it("is zero for an all-neutral draft", () => {
    expect(draftDistinctiveness(defaultDraft())).toBe(0);
  });

  it("is one when every editable category is at an extreme", () => {
    const draft = defaultDraft();
    for (const category of EDITABLE_CATEGORIES) draft.categoryWeights[category] = 1;
    expect(draftDistinctiveness(draft)).toBeCloseTo(1, 5);
  });

  it("rises as the draft departs from neutral", () => {
    const draft = defaultDraft();
    const before = draftDistinctiveness(draft);
    draft.categoryWeights.food = 1;
    expect(draftDistinctiveness(draft)).toBeGreaterThan(before);
  });
});

describe("labels", () => {
  it("covers every category the planner can emit", () => {
    for (const category of ACTIVITY_CATEGORIES) {
      expect(CATEGORY_LABELS[category]).toBeTruthy();
    }
  });
});
