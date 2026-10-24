// ─────────────────────────────────────────────────────────────────────────────
// Groq model configuration — the one place model IDs live
// ─────────────────────────────────────────────────────────────────────────────
// Groq retires models on a published schedule
// (https://console.groq.com/docs/deprecations). `llama-3.3-70b-versatile` was
// shut down on 16 Aug 2026 and was hard-coded in three files, so every AI
// surface failed at once with a 404 `model_not_found`. Model IDs now live here
// and are configured on the server with GROQ_MODEL and GROQ_VISION_MODEL.
// ─────────────────────────────────────────────────────────────────────────────

/** Groq's listed replacement for llama-3.3-70b-versatile. */
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
/** Groq's current multimodal model (text + image input). */
export const DEFAULT_GROQ_VISION_MODEL = "qwen/qwen3.8-27b";

export const GROQ_MODEL = DEFAULT_GROQ_MODEL;
export const GROQ_VISION_MODEL = DEFAULT_GROQ_VISION_MODEL;

/** gpt-oss models reason before answering; others do not take these params. */
function isReasoningModel(model: string): boolean {
  return model.startsWith("openai/gpt-oss");
}

/**
 * Extra request fields for `model`.
 *
 * gpt-oss writes its reasoning to a separate `reasoning` field, so `content`
 * stays clean for the existing parsers. "low" effort keeps chat responsive,
 * and `include_reasoning: false` skips sending reasoning text the app never
 * shows.
 */
export function groqModelParams(model: string = GROQ_MODEL): Record<string, unknown> {
  return isReasoningModel(model)
    ? { reasoning_effort: "low", include_reasoning: false }
    : {};
}

/**
 * Output-token budget for `model`. Reasoning tokens are drawn from the same
 * budget as the answer, so a reasoning model gets headroom on top — otherwise
 * a 512-token JSON call could spend it all thinking and return nothing.
 */
export function groqMaxTokens(requested: number, model: string = GROQ_MODEL): number {
  return isReasoningModel(model) ? requested + 1024 : requested;
}

/**
 * Removes inline `<think>…</think>` reasoning, which Qwen-family models can
 * emit in `content`. Anything spoken aloud or parsed must not include it.
 */
export function stripReasoning(text: string): string {
  return text.replace(/<think>[\s\S]*?(<\/think>|$)/gi, "").trim();
}

/**
 * Turns a failed Groq response into one of the app's well-known error codes,
 * or a short message. A retired model gets its own code so the UI can say so
 * instead of printing raw JSON.
 */
export function groqErrorCode(status: number, body: string): string {
  if (status === 429) return "RATE_LIMIT";
  if (status === 401) return "AUTH_REQUIRED";
  if (status === 404 || /model_not_found|model_decommissioned|decommissioned/i.test(body)) {
    return "MODEL_UNAVAILABLE";
  }
  if (status >= 500) return `GROQ_ERROR_${status}`;
  let detail = body.slice(0, 300);
  try {
    detail = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? detail;
  } catch {
    /* keep raw text */
  }
  return `Groq API error [${status}]: ${detail}`;
}
