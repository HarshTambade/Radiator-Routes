// ─────────────────────────────────────────────────────────────────────────────
// Generate → verify → repair
// ─────────────────────────────────────────────────────────────────────────────
// `lib/itineraryVerifier.ts` already detects infeasible plans, and both planner
// paths already call it. What was missing is the other half: feeding the detected
// violations back for one more attempt. Until now `buildRepairPrompt()` had no
// callers, so a plan that failed verification was shown to the user with a
// warning and nothing more.
//
// This is the part of the pipeline with published evidence behind it. LLMs cannot
// reliably satisfy multi-constraint travel plans, and self-critique does not fix
// it — pairing generation with an *external* check and re-prompting does
// (arXiv:2404.11891). TravelPlanner measured GPT-4 at a 0.6% success rate on
// this task (arXiv:2402.01622).
//
// Design constraints that matter more than they look:
//
//   • Exactly one repair pass by default. Each pass is a full model call; an
//     unbounded loop would be slow, expensive, and — since nothing guarantees
//     monotonic improvement — not obviously convergent.
//   • A repair attempt that throws must not lose the original plan. A network
//     blip during regeneration would otherwise turn "flawed plan" into "no plan".
//   • The result is chosen on measured error count, not on the assumption that
//     the second attempt is better. Ties keep the first plan rather than churning.
// ─────────────────────────────────────────────────────────────────────────────

import {
  buildRepairPrompt,
  type VerificationResult,
  type Violation,
} from "./itineraryVerifier";

export interface VerifiedGeneration<T> {
  /** The plan that was kept. */
  plan: T;
  /** Verification of the kept plan. */
  verification: VerificationResult;
  /** Verification of the first attempt, so the UI can report what changed. */
  firstVerification: VerificationResult;
  /** Model calls made: 1 when the first plan passed, 2 when a repair ran. */
  attempts: number;
  /** True when a repair pass was attempted. */
  repaired: boolean;
  /** True when the repair pass reduced the number of blocking errors. */
  improved: boolean;
  /** Set when the repair call itself failed; the first plan was kept. */
  repairError?: string;
}

export interface GenerateWithRepairOptions<T> {
  /**
   * Produces a plan. Receives the repair instruction on the second call and
   * nothing on the first, so the same function serves both passes.
   */
  generate: (repairInstruction?: string) => Promise<T>;
  /** Deterministic feasibility check. Must not call the network. */
  verify: (plan: T) => VerificationResult;
  /** Repair passes to allow. Defaults to 1; 0 disables repair entirely. */
  maxRepairs?: number;
}

/**
 * Generates a plan and, if it fails verification, regenerates once with the
 * violations fed back.
 *
 * Returns whichever attempt verified better. The first plan is never discarded
 * before the replacement has been generated *and* checked.
 */
export async function generateWithRepair<T>({
  generate,
  verify,
  maxRepairs = 1,
}: GenerateWithRepairOptions<T>): Promise<VerifiedGeneration<T>> {
  const firstPlan = await generate();
  const firstVerification = verify(firstPlan);

  const base: VerifiedGeneration<T> = {
    plan: firstPlan,
    verification: firstVerification,
    firstVerification,
    attempts: 1,
    repaired: false,
    improved: false,
  };

  if (firstVerification.ok || maxRepairs < 1) return base;

  const instruction = buildRepairPrompt(firstVerification);
  // Empty means there were no *errors* to fix — only warnings, which are
  // legitimate choices rather than defects. Re-prompting for those tends to make
  // the model rewrite the whole plan.
  if (!instruction) return base;

  let repairedPlan: T;
  try {
    repairedPlan = await generate(instruction);
  } catch (error) {
    // A failed repair leaves the user with the flawed plan and an explanation,
    // which is strictly better than nothing at all.
    return {
      ...base,
      repaired: true,
      attempts: 2,
      repairError: error instanceof Error ? error.message : String(error),
    };
  }

  const repairedVerification = verify(repairedPlan);

  // Strictly fewer blocking errors wins. A tie keeps the first plan: the second
  // attempt has no claim to being better, and swapping would change the plan
  // under the user for no measured gain.
  const better =
    repairedVerification.errors.length < firstVerification.errors.length;

  return {
    plan: better ? repairedPlan : firstPlan,
    verification: better ? repairedVerification : firstVerification,
    firstVerification,
    attempts: 2,
    repaired: true,
    improved: better,
  };
}

/**
 * Folds several per-plan verifications into one, prefixing each message with the
 * plan it came from.
 *
 * The multi-candidate planner returns three plans in a single response, so a
 * repair prompt has to name which plan each problem belongs to or the model
 * cannot act on it.
 */
export function mergeVerifications(
  results: Array<{ label: string; result: VerificationResult }>,
): VerificationResult {
  const relabel = (label: string) => (violation: Violation): Violation => ({
    ...violation,
    message: `[${label}] ${violation.message}`,
  });

  const violations = results.flatMap(({ label, result }) =>
    result.violations.map(relabel(label)),
  );
  const errors = violations.filter((v) => v.severity === "error");
  const warnings = violations.filter((v) => v.severity === "warning");

  const failing = results.filter(({ result }) => !result.ok).length;
  const summary =
    failing === 0
      ? "All plans passed verification."
      : `${failing} of ${results.length} plans failed verification: ` +
        errors.map((v) => v.message).join(" ");

  return {
    ok: errors.length === 0,
    violations,
    errors,
    warnings,
    summary,
  };
}

/**
 * One-line, user-facing account of what the repair pass did.
 *
 * Deliberately reports the arithmetic rather than claiming success: "fixed 2 of 3
 * problems" is checkable, "plan optimised" is not.
 */
export function describeRepair(result: VerifiedGeneration<unknown>): string {
  if (!result.repaired) {
    return result.verification.ok
      ? "Plan passed all feasibility checks."
      : `Plan has ${result.verification.errors.length} unresolved issue(s).`;
  }

  if (result.repairError) {
    return (
      `Could not regenerate to fix ` +
      `${result.firstVerification.errors.length} issue(s): ${result.repairError}`
    );
  }

  const before = result.firstVerification.errors.length;
  const after = result.verification.errors.length;

  if (after === 0) {
    return `Fixed ${before} feasibility issue(s) on a second pass.`;
  }
  if (result.improved) {
    return `Second pass fixed ${before - after} of ${before} issue(s); ${after} remain.`;
  }
  return `Second pass did not improve on ${before} issue(s); kept the original plan.`;
}
