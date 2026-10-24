// ─────────────────────────────────────────────────────────────────────────────
// AI service — provider-agnostic LLM entry point
// ─────────────────────────────────────────────────────────────────────────────
// The name "gemini" is historical — this module is a drop-in replacement for
// the previous Gemini wrapper. It now dispatches to whichever backend the user
// has selected in Settings:
//
//   "groq"   → hosted Groq through the authenticated server-side provider proxy
//   "webllm" → on-device WebLLM on WebGPU (no key, no network, private)
//
// Every exported signature is unchanged, so aiPlanner, dynamicReplan,
// travelMemory and AccessibilityPanel work against either backend without
// modification.
//
// It *never* hard-fails when a backend is unavailable: each entry point throws
// a well-known error string (NO_API_KEY / NO_SESSION / RATE_LIMIT / AUTH_REQUIRED /
// NO_WEBGPU / WEBLLM_LOAD_FAILED) that callers already surface via
// handleGeminiError().
// ─────────────────────────────────────────────────────────────────────────────

import { getAIProvider, hasWebGPUAPI } from "@/lib/aiProvider";
import { isSupabaseConfigured } from "@/integrations/supabase/client";
import { groqProxyFetch } from "@/services/groqProxy";
import {
  GROQ_MODEL,
  groqErrorCode,
  groqMaxTokens,
  groqModelParams,
} from "@/lib/groqModels";

/**
 * Resolves the backend to actually use for this call.
 *
 * If the user picked WebLLM but the browser has no WebGPU at all, fall back to
 * Groq rather than failing — a stale preference (set on a capable machine, then
 * synced to a phone) should degrade instead of breaking every AI surface.
 */
function activeProvider(): "groq" | "webllm" {
  return getAIProvider() === "webllm" && hasWebGPUAPI() ? "webllm" : "groq";
}

// ── Public types (unchanged) ────────────────────────────────────────────────

export interface GeminiMessage {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

export interface GeminiResponse {
  candidates: Array<{
    content: { parts: Array<{ text: string }>; role: string };
    finishReason: string;
  }>;
}

interface OAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// ── Availability probe ─────────────────────────────────────────────────────

/** True when the authenticated server proxy can be reached. */
export function isGroqAvailable(): boolean {
  return isSupabaseConfigured;
}

/**
 * True when *some* backend can serve a request. WebLLM needs no key, so having
 * it selected on a WebGPU browser is enough — even when hosted AI is not configured.
 */
export function isLLMAvailable(): boolean {
  return activeProvider() === "webllm" || isGroqAvailable();
}

function assertKey(): void {
  if (!isGroqAvailable()) throw new Error("BACKEND_UNAVAILABLE");
}

// ── Non-streaming completion ───────────────────────────────────────────────

export async function callGemini(
  systemInstruction: string,
  userPrompt: string,
  temperature = 0.7,
  maxOutputTokens = 8192,
  jsonMode = false,
): Promise<string> {
  if (activeProvider() === "webllm") {
    const { webllmComplete } = await import("./webllm");
    // On-device context windows are 4096 tokens, so an 8192 default would be
    // rejected. Cap it and let the prompt keep whatever room it needs.
    return webllmComplete(
      systemInstruction,
      userPrompt,
      temperature,
      Math.min(maxOutputTokens, 2048),
      jsonMode,
    );
  }

  assertKey();

  const messages: OAIMessage[] = [
    { role: "system", content: systemInstruction },
    { role: "user", content: userPrompt },
  ];

  const body: Record<string, unknown> = {
    model: GROQ_MODEL,
    messages,
    temperature,
    max_tokens: groqMaxTokens(maxOutputTokens),
    stream: false,
    ...groqModelParams(),
  };
  if (jsonMode) body.response_format = { type: "json_object" };

  const res = await groqProxyFetch("chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(groqErrorCode(res.status, await res.text()));

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// ── Multi-turn (non-streaming) ─────────────────────────────────────────────

export async function callGeminiChat(
  systemInstruction: string,
  messages: Array<{ role: "user" | "model"; content: string }>,
  temperature = 0.7,
  maxOutputTokens = 2048,
  jsonMode = false,
): Promise<string> {
  if (activeProvider() === "webllm") {
    const { webllmChat } = await import("./webllm");
    return webllmChat(
      systemInstruction,
      messages,
      temperature,
      Math.min(maxOutputTokens, 2048),
      jsonMode,
    );
  }

  assertKey();

  const oaiMessages: OAIMessage[] = [
    { role: "system", content: systemInstruction },
    ...messages.map((m) => ({
      role: (m.role === "model" ? "assistant" : "user") as "user" | "assistant",
      content: m.content,
    })),
  ];

  const body: Record<string, unknown> = {
    model: GROQ_MODEL,
    messages: oaiMessages,
    temperature,
    max_tokens: groqMaxTokens(maxOutputTokens),
    stream: false,
    ...groqModelParams(),
  };
  if (jsonMode) body.response_format = { type: "json_object" };

  const res = await groqProxyFetch("chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(groqErrorCode(res.status, await res.text()));

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// ── Streaming completion (SSE) ─────────────────────────────────────────────

export async function streamGemini(
  systemInstruction: string,
  messages: Array<{ role: "user" | "model"; content: string }>,
  onChunk: (chunk: string) => void,
  temperature = 0.7,
  maxOutputTokens = 2048,
): Promise<string> {
  if (activeProvider() === "webllm") {
    const { webllmStream } = await import("./webllm");
    return webllmStream(
      systemInstruction,
      messages,
      onChunk,
      temperature,
      Math.min(maxOutputTokens, 2048),
    );
  }

  assertKey();

  const oaiMessages: OAIMessage[] = [
    { role: "system", content: systemInstruction },
    ...messages.map((m) => ({
      role: (m.role === "model" ? "assistant" : "user") as "user" | "assistant",
      content: m.content,
    })),
  ];

  const res = await groqProxyFetch("chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: oaiMessages,
      temperature,
      max_tokens: groqMaxTokens(maxOutputTokens),
      stream: true,
      ...groqModelParams(),
    }),
  });

  if (!res.ok) throw new Error(groqErrorCode(res.status, await res.text()));

  if (!res.body) {
    const text = await callGeminiChat(
      systemInstruction,
      messages,
      temperature,
      maxOutputTokens,
    );
    onChunk(text);
    return text;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, newlineIdx);
      buffer = buffer.slice(newlineIdx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.startsWith("data: ")) continue;
      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") break;
      if (!jsonStr) continue;
      try {
        const parsed = JSON.parse(jsonStr);
        const chunk = parsed.choices?.[0]?.delta?.content ?? "";
        if (chunk) { fullText += chunk; onChunk(chunk); }
      } catch { /* malformed chunk */ }
    }
  }

  if (buffer.trim()) {
    const remaining = buffer.trim();
    if (remaining.startsWith("data: ")) {
      const jsonStr = remaining.slice(6).trim();
      if (jsonStr && jsonStr !== "[DONE]") {
        try {
          const parsed = JSON.parse(jsonStr);
          const chunk = parsed.choices?.[0]?.delta?.content ?? "";
          if (chunk) { fullText += chunk; onChunk(chunk); }
        } catch { /* ignore */ }
      }
    }
  }

  return fullText;
}

// ── JSON extraction — multiple strategies ──────────────────────────────────

export function extractJSON(raw: string): unknown {
  if (!raw || raw.trim() === "") throw new Error("Empty response from AI");

  try { return JSON.parse(raw.trim()); } catch { /* continue */ }

  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch { /* continue */ }
  }

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)); } catch { /* continue */ }
  }

  const aStart = raw.indexOf("[");
  const aEnd = raw.lastIndexOf("]");
  if (aStart !== -1 && aEnd !== -1 && aEnd > aStart) {
    try { return JSON.parse(raw.slice(aStart, aEnd + 1)); } catch { /* continue */ }
  }

  throw new Error("AI returned unreadable content. Please try again.");
}

// ── Error → human-readable message ─────────────────────────────────────────

export function handleGeminiError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);

  // ── On-device (WebLLM) ──
  if (msg === "NO_WEBGPU") {
    const reason = err instanceof Error ? err.cause : undefined;
    return typeof reason === "string"
      ? `On-device AI needs WebGPU. ${reason} Switch back to Groq in Settings, or use Chrome/Edge.`
      : "On-device AI needs WebGPU, which this browser doesn't support. Switch back to Groq in Settings.";
  }
  if (msg === "WEBLLM_LOAD_FAILED")
    return "The on-device model failed to load. This is usually not enough GPU memory or an interrupted download — try a smaller model in Settings.";
  if (msg === "WEBLLM_NOT_READY")
    return "The on-device model isn't loaded yet. Open Settings and download a model first.";

  // ── Hosted (Groq) ──
  if (msg === "NO_API_KEY")
    return "Hosted AI is unavailable. Sign in and try again, or switch to on-device AI in Settings.";
  if (msg === "NO_SESSION")
    return "Sign in to use hosted AI, or switch to on-device AI in Settings.";
  if (msg === "BACKEND_UNAVAILABLE")
    return "Hosted AI is not configured for this deployment. Switch to on-device AI in Settings.";
  if (msg === "RATE_LIMIT")
    return "AI rate limit exceeded. Please wait a moment and try again, or switch to on-device AI in Settings.";
  if (msg === "AUTH_REQUIRED" || msg === "INVALID_API_KEY")
    return "Your hosted AI session is invalid or expired. Sign in again and retry.";
  if (msg.startsWith("GROQ_ERROR_"))
    return "Groq service is temporarily unavailable. Please try again.";
  if (msg === "MODEL_UNAVAILABLE")
    return `The hosted AI model "${GROQ_MODEL}" is unavailable. Contact the deployment operator or switch to on-device AI in Settings.`;

  return msg;
}

// Re-exported for callers that already import it from this module.
export { todayIST } from "@/lib/date";
