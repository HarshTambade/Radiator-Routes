// AI service — uses Groq API (OpenAI-compatible) with llama-3.3-70b-versatile
// Drop-in replacement for the previous Gemini service — all exports preserved

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY as string;
const GROQ_BASE = "https://api.groq.com/openai/v1";
const GROQ_MODEL = "llama-3.3-70b-versatile";

// ── Types ────────────────────────────────────────────────────────────────────

export interface GeminiMessage {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

export interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
      role: string;
    };
    finishReason: string;
  }>;
}

// Internal OpenAI-style message
interface OAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// ── Core non-streaming caller ────────────────────────────────────────────────

/**
 * Call Groq generateContent (non-streaming).
 * Returns the raw text content from the first choice.
 */
export async function callGemini(
  systemInstruction: string,
  userPrompt: string,
  temperature = 0.7,
  maxOutputTokens = 2048,
): Promise<string> {
  if (!GROQ_API_KEY) {
    throw new Error("VITE_GROQ_API_KEY is not configured");
  }

  const messages: OAIMessage[] = [
    { role: "system", content: systemInstruction },
    { role: "user", content: userPrompt },
  ];

  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature,
      max_tokens: maxOutputTokens,
      stream: false,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 429) throw new Error("RATE_LIMIT");
    if (res.status === 401) throw new Error("INVALID_API_KEY");
    if (res.status === 503 || res.status === 500)
      throw new Error(`GROQ_ERROR_${res.status}`);
    throw new Error(`Groq API error [${res.status}]: ${errText}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

/**
 * Call Groq with a multi-turn conversation.
 * Preserves the same signature as the old Gemini version.
 */
export async function callGeminiChat(
  systemInstruction: string,
  messages: Array<{ role: "user" | "model"; content: string }>,
  temperature = 0.7,
  maxOutputTokens = 1024,
): Promise<string> {
  if (!GROQ_API_KEY) {
    throw new Error("VITE_GROQ_API_KEY is not configured");
  }

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
      stream: false,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 429) throw new Error("RATE_LIMIT");
    if (res.status === 401) throw new Error("INVALID_API_KEY");
    throw new Error(`Groq API error [${res.status}]: ${errText}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

/**
 * Stream Groq response using Server-Sent Events (OpenAI SSE format).
 * Calls onChunk for each text delta, returns full text when done.
 */
export async function streamGemini(
  systemInstruction: string,
  messages: Array<{ role: "user" | "model"; content: string }>,
  onChunk: (chunk: string) => void,
  temperature = 0.7,
  maxOutputTokens = 1024,
): Promise<string> {
  if (!GROQ_API_KEY) {
    throw new Error("VITE_GROQ_API_KEY is not configured");
  }

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
    throw new Error(`Groq stream error [${res.status}]: ${errText}`);
  }

  if (!res.body) {
    // Fallback: non-streaming
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
        if (chunk) {
          fullText += chunk;
          onChunk(chunk);
        }
      } catch {
        // malformed chunk — skip
      }
    }
  }

  return fullText;
}

// ── JSON extraction — multiple strategies ────────────────────────────────────

export function extractJSON(raw: string): unknown {
  if (!raw || raw.trim() === "") {
    throw new Error("Empty response from AI");
  }

  // Strategy 1 — try the whole string first (model returned pure JSON)
  try {
    return JSON.parse(raw.trim());
  } catch {
    /* continue */
  }

  // Strategy 2 — strip markdown code fences  ```json ... ```
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      /* continue */
    }
  }

  // Strategy 3 — find the outermost { ... } block
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      /* continue */
    }
  }

  // Strategy 4 — find the outermost [ ... ] block (array response)
  const aStart = raw.indexOf("[");
  const aEnd = raw.lastIndexOf("]");
  if (aStart !== -1 && aEnd !== -1 && aEnd > aStart) {
    try {
      return JSON.parse(raw.slice(aStart, aEnd + 1));
    } catch {
      /* continue */
    }
  }

  throw new Error("AI returned unreadable content. Please try again.");
}

// ── Error → human-readable message ──────────────────────────────────────────

export function handleGeminiError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === "RATE_LIMIT")
    return "AI rate limit exceeded. Please wait a moment and try again.";
  if (msg === "INVALID_API_KEY") return "Groq API key is invalid or expired.";
  if (msg.startsWith("GROQ_ERROR_"))
    return "Groq service is temporarily unavailable. Please try again.";
  return msg;
}

// ── Today's date in IST ──────────────────────────────────────────────────────

export function todayIST(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
}
