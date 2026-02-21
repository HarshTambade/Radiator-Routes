// Gemini AI service — replaces HuggingFace across all features
// Uses Google Gemini API directly from the browser

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
// Use gemini-2.5-flash for best performance
const GEMINI_MODEL = "gemini-2.5-flash-preview-05-20";

// ── Core Gemini caller ───────────────────────────────────────────────────────

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

/**
 * Call Gemini generateContent (non-streaming).
 * Returns the raw text content from the first candidate.
 */
export async function callGemini(
  systemInstruction: string,
  userPrompt: string,
  temperature = 0.7,
  maxOutputTokens = 2048,
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error("VITE_GEMINI_API_KEY is not configured");
  }

  const url = `${GEMINI_BASE}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const body = {
    system_instruction: {
      parts: [{ text: systemInstruction }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: userPrompt }],
      },
    ],
    generationConfig: {
      temperature,
      maxOutputTokens,
      responseMimeType: "text/plain",
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 429) throw new Error("RATE_LIMIT");
    if (res.status === 403) throw new Error("INVALID_API_KEY");
    if (res.status === 500 || res.status === 503)
      throw new Error(`GEMINI_ERROR_${res.status}`);
    throw new Error(`Gemini API error [${res.status}]: ${errText}`);
  }

  const data = (await res.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return text;
}

/**
 * Call Gemini with a multi-turn conversation (for chat).
 * Returns the text of the assistant's reply.
 */
export async function callGeminiChat(
  systemInstruction: string,
  messages: Array<{ role: "user" | "model"; content: string }>,
  temperature = 0.7,
  maxOutputTokens = 1024,
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error("VITE_GEMINI_API_KEY is not configured");
  }

  const url = `${GEMINI_BASE}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const contents: GeminiMessage[] = messages.map((m) => ({
    role: m.role,
    parts: [{ text: m.content }],
  }));

  const body = {
    system_instruction: {
      parts: [{ text: systemInstruction }],
    },
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 429) throw new Error("RATE_LIMIT");
    if (res.status === 403) throw new Error("INVALID_API_KEY");
    throw new Error(`Gemini API error [${res.status}]: ${errText}`);
  }

  const data = (await res.json()) as GeminiResponse;
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

/**
 * Stream Gemini response using Server-Sent Events.
 * Calls onChunk for each text delta, returns full text when done.
 */
export async function streamGemini(
  systemInstruction: string,
  messages: Array<{ role: "user" | "model"; content: string }>,
  onChunk: (chunk: string) => void,
  temperature = 0.7,
  maxOutputTokens = 1024,
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error("VITE_GEMINI_API_KEY is not configured");
  }

  const url = `${GEMINI_BASE}/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;

  const contents: GeminiMessage[] = messages.map((m) => ({
    role: m.role,
    parts: [{ text: m.content }],
  }));

  const body = {
    system_instruction: {
      parts: [{ text: systemInstruction }],
    },
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 429) throw new Error("RATE_LIMIT");
    if (res.status === 403) throw new Error("INVALID_API_KEY");
    throw new Error(`Gemini stream error [${res.status}]: ${errText}`);
  }

  if (!res.body) throw new Error("No response body for streaming");

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

      try {
        const parsed = JSON.parse(jsonStr) as GeminiResponse;
        const chunk = parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
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
  if (msg === "INVALID_API_KEY") return "Gemini API key is invalid or expired.";
  if (msg.startsWith("GEMINI_ERROR_"))
    return "Gemini service is temporarily unavailable. Please try again.";
  return msg;
}

// ── Today's date in IST ──────────────────────────────────────────────────────

export function todayIST(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
}
