import { describe, expect, it } from "vitest";
import {
  computeGroupRegret,
  computePaceFit,
  computeUtility,
  explainGroupRegret,
  explainMemberRegret,
  preferencesFromProfile,
  regretBand,
  type MemberPreferences,
  type ScorablePlan,
} from "@/lib/groupRegret";

// ── Fixtures ────────────────────────────────────────────────────────────────

const beachLover: MemberPreferences = {
  id: "asha",
  name: "Asha",
  categoryWeights: { attraction: 0.9, food: 0.5, shopping: 0.2 },
};

const foodie: MemberPreferences = {
  id: "chitra",
  name: "Chitra",
  categoryWeights: { food: 0.95, attraction: 0.4, shopping: 0.4 },
};

const shopper: MemberPreferences = {
  id: "bikram",
  name: "Bikram",
  categoryWeights: { shopping: 0.9, food: 0.6, attraction: 0.3 },
};

function plan(
  variant: string,
  categories: string[],
  opts: { cost?: number; review?: number } = {},
): ScorablePlan {
  return {
    variant,
    total_cost: opts.cost ?? 10000,
    activities: categories.map((category) => ({
      category,
      cost: (opts.cost ?? 10000) / categories.length,
      review_score: opts.review ?? 4,
    })),
  };
}

// ── Utility ─────────────────────────────────────────────────────────────────

describe("computeUtility", () => {
  it("returns zero for a plan with no activities", () => {
    expect(computeUtility({ variant: "empty", activities: [] }, beachLover)).toBe(0);
  });

  it("scores a plan matching the member's interests above one that doesn't", () => {
    const matching = computeUtility(plan("a", ["attraction", "attraction"]), beachLover);
    const mismatched = computeUtility(plan("b", ["shopping", "shopping"]), beachLover);
    expect(matching).toBeGreaterThan(mismatched);
  });

  it("stays within [0,1]", () => {
    for (const categories of [["food"], ["shopping", "attraction"], ["other"]]) {
      const u = computeUtility(plan("x", categories), foodie);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(1);
    }
  });

  it("treats unknown categories as neutral rather than failing", () => {
    const u = computeUtility(plan("x", ["teleportation"]), beachLover);
    expect(Number.isFinite(u)).toBe(true);
    expect(u).toBeGreaterThan(0);
  });

  it("gives a member with no stated preferences the same score everywhere", () => {
    const blank: MemberPreferences = { id: "blank" };
    const a = computeUtility(plan("a", ["food", "food"], { review: 4 }), blank);
    const b = computeUtility(plan("b", ["shopping", "shopping"], { review: 4 }), blank);
    expect(a).toBeCloseTo(b, 6);
  });

  it("excludes transport and accommodation from the interest term", () => {
    // Both plans have one attraction; the second pads with transport. If padding
    // counted, the second would score lower purely from dilution.
    const pure = computeUtility(plan("a", ["attraction"]), beachLover);
    const padded = computeUtility(plan("b", ["attraction", "transport", "accommodation"]), beachLover);
    expect(padded).toBeCloseTo(pure, 6);
  });

  it("penalises a plan that blows the member's budget ceiling", () => {
    const affordable = computeUtility(
      plan("a", ["food"], { cost: 5000 }),
      { ...foodie, budgetCeiling: 10000 },
    );
    const expensive = computeUtility(
      plan("b", ["food"], { cost: 25000 }),
      { ...foodie, budgetCeiling: 10000 },
    );
    expect(expensive).toBeLessThan(affordable);
  });

  it("rewards better review scores", () => {
    const poor = computeUtility(plan("a", ["food"], { review: 2 }), foodie);
    const great = computeUtility(plan("b", ["food"], { review: 5 }), foodie);
    expect(great).toBeGreaterThan(poor);
  });
});

// ── Pace ────────────────────────────────────────────────────────────────────

describe("computePaceFit", () => {
  it("scores a relaxed traveller best on a sparse plan", () => {
    const sparse = plan("a", ["food", "attraction", "food"]);
    const relaxed = computePaceFit(sparse, { id: "r", pace: "relaxed" }, 1);
    const packed = computePaceFit(sparse, { id: "p", pace: "packed" }, 1);
    expect(relaxed).toBeGreaterThan(packed);
  });

  it("penalises too sparse as well as too packed", () => {
    const member: MemberPreferences = { id: "m", pace: "moderate" };
    const ideal = computePaceFit(plan("a", Array(5).fill("food")), member, 1);
    const sparse = computePaceFit(plan("b", ["food"]), member, 1);
    const dense = computePaceFit(plan("c", Array(12).fill("food")), member, 1);
    expect(ideal).toBeGreaterThan(sparse);
    expect(ideal).toBeGreaterThan(dense);
  });

  it("returns a neutral value for degenerate inputs", () => {
    expect(computePaceFit(plan("a", ["food"]), { id: "m" }, 0)).toBe(0.5);
    expect(computePaceFit({ variant: "a", activities: [] }, { id: "m" }, 3)).toBe(0.5);
  });
});

// ── Group regret ────────────────────────────────────────────────────────────

describe("computeGroupRegret", () => {
  const plans = [
    plan("attractions", ["attraction", "attraction", "attraction"]),
    plan("shopping", ["shopping", "shopping", "shopping"]),
    plan("mixed", ["attraction", "food", "shopping"]),
  ];
  const group = [beachLover, foodie, shopper];

  it("returns an empty result with no plans or no members", () => {
    expect(computeGroupRegret([], group).recommended).toBeNull();
    expect(computeGroupRegret(plans, []).recommended).toBeNull();
  });

  it("reports Least Misery as the strategy", () => {
    expect(computeGroupRegret(plans, group).strategy).toBe("least-misery");
  });

  it("scores every plan for every member", () => {
    const result = computeGroupRegret(plans, group);
    expect(result.plans).toHaveLength(3);
    for (const p of result.plans) {
      expect(p.members).toHaveLength(3);
    }
  });

  it("gives at least one member zero regret on their favourite plan", () => {
    const result = computeGroupRegret(plans, group);
    const anyZero = result.plans.some((p) => p.members.some((m) => m.regret === 0));
    expect(anyZero).toBe(true);
  });

  it("never produces negative regret", () => {
    const result = computeGroupRegret(plans, group);
    for (const p of result.plans) {
      for (const m of p.members) {
        expect(m.regret).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("sets group regret to the worst member's regret, not the average", () => {
    const result = computeGroupRegret(plans, group);
    for (const p of result.plans) {
      const worst = Math.max(...p.members.map((m) => m.regret));
      expect(p.groupRegret).toBeCloseTo(worst, 3);
      expect(p.groupRegret).toBeGreaterThanOrEqual(p.averageRegret);
    }
  });

  it("recommends the plan minimising the worst-case shortfall", () => {
    const result = computeGroupRegret(plans, group);
    const best = Math.min(...result.plans.map((p) => p.groupRegret));
    const chosen = result.plans.find((p) => p.variant === result.recommended);
    expect(chosen?.groupRegret).toBeCloseTo(best, 3);
  });

  it("prefers the compromise plan over a plan that maximises one member", () => {
    // The whole point of Least Misery: a plan great for Asha but poor for
    // Bikram should lose to a balanced one.
    const result = computeGroupRegret(plans, group);
    expect(result.recommended).toBe("mixed");
  });

  it("gives a single-member group zero regret on their best plan", () => {
    const result = computeGroupRegret(plans, [beachLover]);
    const chosen = result.plans.find((p) => p.variant === result.recommended);
    expect(chosen?.groupRegret).toBe(0);
  });

  it("is deterministic across repeated calls", () => {
    const a = computeGroupRegret(plans, group);
    const b = computeGroupRegret(plans, group);
    expect(a.recommended).toBe(b.recommended);
    expect(JSON.stringify(a.plans)).toBe(JSON.stringify(b.plans));
  });

  it("does not depend on prompt-supplied constants", () => {
    // Guards the regression this module was written to fix: the score must come
    // from preferences, so two different groups must get different answers over
    // the same plans.
    const foodGroup = computeGroupRegret(plans, [foodie, foodie]);
    const shopGroup = computeGroupRegret(plans, [shopper, shopper]);
    const foodScore = foodGroup.plans.find((p) => p.variant === "shopping")?.groupRegret;
    const shopScore = shopGroup.plans.find((p) => p.variant === "shopping")?.groupRegret;
    expect(foodScore).not.toBe(shopScore);
  });
});

// ── Explanation ─────────────────────────────────────────────────────────────

describe("regretBand", () => {
  it("bands values monotonically", () => {
    expect(regretBand(0.05)).toBe("low");
    expect(regretBand(0.25)).toBe("moderate");
    expect(regretBand(0.6)).toBe("high");
  });
});

describe("explanations", () => {
  it("tells a zero-regret member they got their best option", () => {
    const text = explainMemberRegret({
      memberId: "a",
      memberName: "Asha",
      utility: 0.8,
      bestAvailableUtility: 0.8,
      regret: 0,
    });
    expect(text).toContain("Asha");
    expect(text).toContain("best option");
  });

  it("quantifies the shortfall for a compromising member", () => {
    const text = explainMemberRegret({
      memberId: "b",
      memberName: "Bikram",
      utility: 0.5,
      bestAvailableUtility: 0.8,
      regret: 0.3,
    });
    expect(text).toContain("Bikram");
    expect(text).toContain("30%");
  });

  it("names the worst-off member in the group summary", () => {
    const text = explainGroupRegret({
      variant: "mixed",
      groupRegret: 0.3,
      averageRegret: 0.1,
      members: [
        { memberId: "a", memberName: "Asha", utility: 0.8, bestAvailableUtility: 0.8, regret: 0 },
        { memberId: "b", memberName: "Bikram", utility: 0.5, bestAvailableUtility: 0.8, regret: 0.3 },
      ],
    });
    expect(text).toContain("Bikram");
    expect(text).toContain("30%");
  });

  it("reports unanimity when nobody compromises", () => {
    const text = explainGroupRegret({
      variant: "mixed",
      groupRegret: 0,
      averageRegret: 0,
      members: [
        { memberId: "a", memberName: "Asha", utility: 0.8, bestAvailableUtility: 0.8, regret: 0 },
      ],
    });
    expect(text).toContain("preferred option");
  });
});

// ── Profile extraction ──────────────────────────────────────────────────────

describe("preferencesFromProfile", () => {
  it("falls back to the supplied id when the profile has none", () => {
    expect(preferencesFromProfile({}, "fallback-id").id).toBe("fallback-id");
  });

  it("reads the profiles.name column for the display name", () => {
    const p = preferencesFromProfile({ id: "x", name: "Asha" }, "x");
    expect(p.name).toBe("Asha");
  });

  it("prefers explicit numeric category weights", () => {
    const p = preferencesFromProfile(
      { id: "x", preferences: { category_weights: { food: 0.8, shopping: 0.1 } } },
      "x",
    );
    expect(p.categoryWeights?.food).toBe(0.8);
    expect(p.categoryWeights?.shopping).toBe(0.1);
  });

  it("clamps out-of-range weights", () => {
    const p = preferencesFromProfile(
      { id: "x", preferences: { category_weights: { food: 7, shopping: -3 } } },
      "x",
    );
    expect(p.categoryWeights?.food).toBe(1);
    expect(p.categoryWeights?.shopping).toBe(0);
  });

  it("derives weights from a favourite-categories list when no explicit weights exist", () => {
    const p = preferencesFromProfile(
      { id: "x", preferences: { favorite_categories: ["food", "shopping"] } },
      "x",
    );
    expect(p.categoryWeights?.food).toBe(0.9);
    expect(p.categoryWeights?.shopping).toBe(0.9);
  });

  it("accepts the British spelling of the favourites key", () => {
    const p = preferencesFromProfile(
      { id: "x", preferences: { favourite_categories: ["food"] } },
      "x",
    );
    expect(p.categoryWeights?.food).toBe(0.9);
  });

  it("reads a valid pace and ignores an invalid one", () => {
    expect(preferencesFromProfile({ id: "x", preferences: { preferred_pace: "Relaxed" } }, "x").pace).toBe("relaxed");
    expect(preferencesFromProfile({ id: "x", preferences: { preferred_pace: "frantic" } }, "x").pace).toBeUndefined();
  });

  it("survives malformed preference payloads", () => {
    for (const preferences of [null, undefined, "a string", 42, []]) {
      expect(() => preferencesFromProfile({ id: "x", preferences }, "x")).not.toThrow();
    }
  });

  it("leaves categoryWeights undefined when nothing was stated", () => {
    expect(preferencesFromProfile({ id: "x", preferences: {} }, "x").categoryWeights).toBeUndefined();
  });
});
