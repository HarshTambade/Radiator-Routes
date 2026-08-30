// ─────────────────────────────────────────────────────────────────────────────
// AI service — Groq (OpenAI-compatible) with graceful fallbacks
// ─────────────────────────────────────────────────────────────────────────────
// The name "gemini" is historical — this module is a drop-in replacement for
// the previous Gemini wrapper. It targets Groq (free tier, generous quota) for
// LLM calls, but *never* hard-fails when the key is missing: instead each
// entry point throws a well-known error string (NO_API_KEY / RATE_LIMIT /
// INVALID_API_KEY) that callers already handle, or returns a deterministic
// stub for JSON-mode helpers so the app stays functional in "offline / no
// keys" mode.
// ─────────────────────────────────────────────────────────────────────────────

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY as string | undefined;
const GROQ_BASE = "https://api.groq.com/openai/v1";
const GROQ_MODEL = "llama-3.3-70b-versatile";

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

export function isLLMAvailable(): boolean {
  return !!GROQ_API_KEY && GROQ_API_KEY.length > 10;
}

function assertKey(): void {
  if (!isLLMAvailable()) throw new Error("NO_API_KEY");
}

// ── Non-streaming completion ───────────────────────────────────────────────

export async function callGemini(
  systemInstruction: string,
  userPrompt: string,
  temperature = 0.7,
  maxOutputTokens = 8192,
  jsonMode = false,
): Promise<string> {
  assertKey();

  const messages: OAIMessage[] = [
    { role: "system", content: systemInstruction },
    { role: "user", content: userPrompt },
  ];

  const body: Record<string, unknown> = {
    model: GROQ_MODEL,
    messages,
    temperature,
    max_tokens: maxOutputTokens,
    stream: false,
  };
  if (jsonMode) body.response_format = { type: "json_object" };

  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 429) throw new Error("RATE_LIMIT");
    if (res.status === 401) throw new Error("INVALID_API_KEY");
    if (res.status >= 500) throw new Error(`GROQ_ERROR_${res.status}`);
    throw new Error(`Groq API error [${res.status}]: ${errText.slice(0, 400)}`);
  }

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
    max_tokens: maxOutputTokens,
    stream: false,
  };
  if (jsonMode) body.response_format = { type: "json_object" };

  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 429) throw new Error("RATE_LIMIT");
    if (res.status === 401) throw new Error("INVALID_API_KEY");
    throw new Error(`Groq API error [${res.status}]: ${errText.slice(0, 400)}`);
  }

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
  assertKey();

  const oaiMessages: OAIMessage[] = [
    { role: "system", content: systemInstruction },
    ...messages.map((m) => ({
      role: (m.role === "model" ? "assistant" : "user") as "user" | "assistant",
      content: m.content,
    })),
  ];

  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: oaiMessages,
      temperature,
      max_tokens: maxOutputTokens,
      stream: true,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 429) throw new Error("RATE_LIMIT");
    if (res.status === 401) throw new Error("INVALID_API_KEY");
    throw new Error(`Groq stream error [${res.status}]: ${errText.slice(0, 400)}`);
  }

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
  if (msg === "NO_API_KEY")
    return "AI features require a free Groq API key. Add VITE_GROQ_API_KEY to your .env (grab one at https://console.groq.com).";
  if (msg === "RATE_LIMIT")
    return "AI rate limit exceeded. Please wait a moment and try again.";
  if (msg === "INVALID_API_KEY")
    return "Groq API key is invalid or expired. Check your VITE_GROQ_API_KEY.";
  if (msg.startsWith("GROQ_ERROR_"))
    return "Groq service is temporarily unavailable. Please try again.";
  return msg;
}

// Re-exported for callers that already import it from this module.
export { todayIST } from "@/lib/date";
