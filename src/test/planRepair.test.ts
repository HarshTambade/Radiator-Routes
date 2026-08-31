import { describe, expect, it, vi } from "vitest";
import {
  describeRepair,
  generateWithRepair,
  mergeVerifications,
} from "@/lib/planRepair";
import { verifyItinerary, type VerifiablePlan } from "@/lib/itineraryVerifier";

// Helpers ────────────────────────────────────────────────────────────────────

/** A plan with one activity that is fine. */
const goodPlan = {
  activities: [
    {
      name: "Basilica of Bom Jesus",
      start_time: "2026-09-01T09:00:00+05:30",
      end_time: "2026-09-01T11:00:00+05:30",
      cost: 0,
      location_lat: 15.5009,
      location_lng: 73.9116,
    },
  ],
  total_cost: 0,
};

/** A plan whose single activity ends before it starts — a blocking error. */
const brokenPlan = {
  activities: [
    {
      name: "Reversed visit",
      start_time: "2026-09-01T14:00:00+05:30",
      end_time: "2026-09-01T11:00:00+05:30",
      cost: 0,
    },
  ],
  total_cost: 0,
};

/** Two blocking errors: reversed times and an impossible hop. */
const veryBrokenPlan = {
  activities: [
    {
      name: "Reversed visit",
      start_time: "2026-09-01T14:00:00+05:30",
      end_time: "2026-09-01T11:00:00+05:30",
      cost: 0,
    },
    {
      name: "Missing times",
      cost: 0,
    },
  ],
  total_cost: 0,
};

const verify = (plan: VerifiablePlan) => verifyItinerary(plan, {});

describe("generateWithRepair", () => {
  it("makes a single call when the first plan verifies", async () => {
    const generate = vi.fn().mockResolvedValue(goodPlan);
    const result = await generateWithRepair({ generate, verify });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith();
    expect(result.attempts).toBe(1);
    expect(result.repaired).toBe(false);
    expect(result.verification.ok).toBe(true);
    expect(result.plan).toBe(goodPlan);
  });

  it("regenerates once with the violations fed back", async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce(brokenPlan)
      .mockResolvedValueOnce(goodPlan);

    const result = await generateWithRepair({ generate, verify });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.attempts).toBe(2);
    expect(result.repaired).toBe(true);
    expect(result.improved).toBe(true);
    expect(result.plan).toBe(goodPlan);
    expect(result.verification.ok).toBe(true);
    // The first verification is retained so the UI can say what was fixed.
    expect(result.firstVerification.ok).toBe(false);
  });

  it("passes a repair instruction naming the actual violations", async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce(brokenPlan)
      .mockResolvedValueOnce(goodPlan);

    await generateWithRepair({ generate, verify });

    const instruction = generate.mock.calls[1][0] as string;
    expect(instruction).toContain("failed validation");
    expect(instruction).toContain("Reversed visit");
  });

  it("keeps the repaired plan only when it has strictly fewer errors", async () => {
    // Second attempt is still broken, but less so.
    const generate = vi
      .fn()
      .mockResolvedValueOnce(veryBrokenPlan)
      .mockResolvedValueOnce(brokenPlan);

    const result = await generateWithRepair({ generate, verify });

    expect(result.improved).toBe(true);
    expect(result.plan).toBe(brokenPlan);
    expect(result.verification.errors.length).toBeLessThan(
      result.firstVerification.errors.length,
    );
  });

  it("keeps the original when the repair is no better", async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce(brokenPlan)
      .mockResolvedValueOnce(veryBrokenPlan);

    const result = await generateWithRepair({ generate, verify });

    expect(result.improved).toBe(false);
    expect(result.plan).toBe(brokenPlan);
  });

  it("keeps the original on an equal-scoring repair rather than churning", async () => {
    const equallyBroken = structuredClone(brokenPlan);
    const generate = vi
      .fn()
      .mockResolvedValueOnce(brokenPlan)
      .mockResolvedValueOnce(equallyBroken);

    const result = await generateWithRepair({ generate, verify });

    expect(result.improved).toBe(false);
    expect(result.plan).toBe(brokenPlan);
  });

  it("does not lose the first plan when the repair call throws", async () => {
    // A network blip during regeneration must not turn "flawed plan" into
    // "no plan" — that would be a worse outcome than not repairing at all.
    const generate = vi
      .fn()
      .mockResolvedValueOnce(brokenPlan)
      .mockRejectedValueOnce(new Error("Failed to fetch"));

    const result = await generateWithRepair({ generate, verify });

    expect(result.plan).toBe(brokenPlan);
    expect(result.repaired).toBe(true);
    expect(result.improved).toBe(false);
    expect(result.repairError).toContain("Failed to fetch");
  });

  it("propagates a failure on the first call", async () => {
    const generate = vi.fn().mockRejectedValue(new Error("no provider"));
    await expect(generateWithRepair({ generate, verify })).rejects.toThrow(
      "no provider",
    );
  });

  it("skips repair when maxRepairs is zero", async () => {
    const generate = vi.fn().mockResolvedValue(brokenPlan);
    const result = await generateWithRepair({ generate, verify, maxRepairs: 0 });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.repaired).toBe(false);
    expect(result.verification.ok).toBe(false);
  });

  it("does not repair for warnings alone", async () => {
    // Warnings are legitimate choices, not defects. Re-prompting for them tends
    // to make the model rewrite the whole plan.
    const warnOnly = {
      activities: [
        {
          name: "Very long museum visit",
          start_time: "2026-09-01T06:00:00+05:30",
          end_time: "2026-09-01T23:00:00+05:30",
          cost: 100,
        },
      ],
      total_cost: 500, // cost-sum mismatch: also a warning
    };

    const generate = vi.fn().mockResolvedValue(warnOnly);
    const result = await generateWithRepair({ generate, verify });

    expect(result.verification.warnings.length).toBeGreaterThan(0);
    expect(result.verification.errors).toHaveLength(0);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.repaired).toBe(false);
  });

  it("caps the model calls at two", async () => {
    // Each pass is a full model call and nothing guarantees convergence.
    const generate = vi.fn().mockResolvedValue(veryBrokenPlan);
    const result = await generateWithRepair({ generate, verify });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.attempts).toBe(2);
  });
});

describe("mergeVerifications", () => {
  it("labels every message with the plan it came from", () => {
    const merged = mergeVerifications([
      { label: "budget", result: verify(brokenPlan) },
      { label: "balanced", result: verify(goodPlan) },
    ]);

    expect(merged.ok).toBe(false);
    expect(merged.errors.every((v) => v.message.startsWith("["))).toBe(true);
    expect(merged.errors.some((v) => v.message.includes("[budget]"))).toBe(true);
  });

  it("is ok only when every plan is ok", () => {
    expect(
      mergeVerifications([
        { label: "a", result: verify(goodPlan) },
        { label: "b", result: verify(goodPlan) },
      ]).ok,
    ).toBe(true);

    expect(
      mergeVerifications([
        { label: "a", result: verify(goodPlan) },
        { label: "b", result: verify(brokenPlan) },
      ]).ok,
    ).toBe(false);
  });

  it("counts failing plans in the summary", () => {
    const merged = mergeVerifications([
      { label: "budget", result: verify(brokenPlan) },
      { label: "balanced", result: verify(brokenPlan) },
      { label: "experience", result: verify(goodPlan) },
    ]);
    expect(merged.summary).toContain("2 of 3");
  });

  it("keeps the error/warning split intact", () => {
    const merged = mergeVerifications([
      { label: "budget", result: verify(veryBrokenPlan) },
    ]);
    expect(merged.errors.length).toBeGreaterThan(0);
    expect(
      merged.violations.length,
    ).toBe(merged.errors.length + merged.warnings.length);
  });

  it("handles an empty input", () => {
    const merged = mergeVerifications([]);
    expect(merged.ok).toBe(true);
    expect(merged.violations).toHaveLength(0);
  });
});

describe("describeRepair", () => {
  it("reports a clean first pass", async () => {
    const result = await generateWithRepair({
      generate: vi.fn().mockResolvedValue(goodPlan),
      verify,
    });
    expect(describeRepair(result)).toContain("passed all feasibility checks");
  });

  it("reports the arithmetic rather than claiming success", async () => {
    const result = await generateWithRepair({
      generate: vi
        .fn()
        .mockResolvedValueOnce(veryBrokenPlan)
        .mockResolvedValueOnce(brokenPlan),
      verify,
    });
    const text = describeRepair(result);
    // Checkable numbers, not "plan optimised".
    expect(text).toMatch(/\d+ of \d+/);
    expect(text).toContain("remain");
  });

  it("reports a fully successful repair", async () => {
    const result = await generateWithRepair({
      generate: vi
        .fn()
        .mockResolvedValueOnce(brokenPlan)
        .mockResolvedValueOnce(goodPlan),
      verify,
    });
    expect(describeRepair(result)).toContain("Fixed 1 feasibility issue");
  });

  it("says when the repair call failed", async () => {
    const result = await generateWithRepair({
      generate: vi
        .fn()
        .mockResolvedValueOnce(brokenPlan)
        .mockRejectedValueOnce(new Error("timeout")),
      verify,
    });
    expect(describeRepair(result)).toContain("Could not regenerate");
    expect(describeRepair(result)).toContain("timeout");
  });

  it("says when the second pass did not help", async () => {
    const result = await generateWithRepair({
      generate: vi
        .fn()
        .mockResolvedValueOnce(brokenPlan)
        .mockResolvedValueOnce(veryBrokenPlan),
      verify,
    });
    expect(describeRepair(result)).toContain("did not improve");
  });
});
