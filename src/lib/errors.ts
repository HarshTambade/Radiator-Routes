// ─────────────────────────────────────────────────────────────────────────────
// Error helpers
// ─────────────────────────────────────────────────────────────────────────────
// `catch` clauses are typed `unknown` (correct — anything can be thrown), so
// reading `.message` needs a narrowing step. These helpers make that a
// one-liner instead of a reason to reach for `any`.
// ─────────────────────────────────────────────────────────────────────────────

/** Extract a human-readable message from an unknown thrown value. */
export function errorMessage(err: unknown, fallback = "Unknown error"): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const rec = err as Record<string, unknown>;
    // Supabase / fetch-style error shapes
    for (const key of ["message", "error_description", "error", "msg"]) {
      const v = rec[key];
      if (typeof v === "string" && v) return v;
    }
    try {
      return JSON.stringify(err);
    } catch {
      /* fall through to default */
    }
  }
  return fallback;
}

/** Narrow an unknown throwable to a real Error instance. */
export function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(errorMessage(err));
}

/** True when the thrown value carries the given sentinel message. */
export function isErrorCode(err: unknown, code: string): boolean {
  return errorMessage(err) === code;
}
