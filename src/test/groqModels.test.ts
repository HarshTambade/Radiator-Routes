import { describe, expect, it } from "vitest";
import {
  DEFAULT_GROQ_MODEL,
  GROQ_PROXY_MAX_TOKENS,
  groqErrorCode,
  groqMaxTokens,
  groqModelParams,
  stripReasoning,
} from "@/lib/groqModels";

describe("groqModels", () => {
  it("defaults away from the retired llama-3.3-70b-versatile", () => {
    expect(DEFAULT_GROQ_MODEL).toBe("openai/gpt-oss-120b");
  });

  it("maps a retired model to MODEL_UNAVAILABLE instead of raw JSON", () => {
    const body = JSON.stringify({
      error: {
        message: "The model `llama-3.3-70b-versatile` does not exist or you do not have access to it.",
        type: "invalid_request_error",
        code: "model_not_found",
      },
    });
    expect(groqErrorCode(404, body)).toBe("MODEL_UNAVAILABLE");
    expect(groqErrorCode(400, '{"error":{"code":"model_decommissioned"}}')).toBe("MODEL_UNAVAILABLE");
  });

  it("keeps the existing well-known codes", () => {
    expect(groqErrorCode(429, "")).toBe("RATE_LIMIT");
    expect(groqErrorCode(401, "")).toBe("AUTH_REQUIRED");
    expect(groqErrorCode(503, "")).toBe("GROQ_ERROR_503");
    expect(groqErrorCode(400, '{"error":{"message":"bad temperature"}}')).toBe(
      "Groq API error [400]: bad temperature",
    );
  });

  it("only sends reasoning params to reasoning models", () => {
    expect(groqModelParams("openai/gpt-oss-120b")).toEqual({
      reasoning_effort: "low",
      include_reasoning: false,
    });
    expect(groqModelParams("qwen/qwen3.8-27b")).toEqual({});
  });

  it("gives reasoning models token headroom so JSON answers are not truncated", () => {
    expect(groqMaxTokens(512, "openai/gpt-oss-120b")).toBe(1536);
    expect(groqMaxTokens(512, "qwen/qwen3.8-27b")).toBe(512);
  });

  it("never exceeds the groq-proxy max_tokens limit", () => {
    expect(groqMaxTokens(8192, "openai/gpt-oss-120b")).toBe(GROQ_PROXY_MAX_TOKENS);
    expect(groqMaxTokens(7168, "openai/gpt-oss-120b")).toBe(GROQ_PROXY_MAX_TOKENS);
    expect(groqMaxTokens(9000, "qwen/qwen3.8-27b")).toBe(GROQ_PROXY_MAX_TOKENS);
  });

  it("strips inline reasoning before text is spoken", () => {
    expect(stripReasoning("<think>scan left</think>A door ahead.")).toBe("A door ahead.");
    expect(stripReasoning("<think>unterminated")).toBe("");
  });
});
