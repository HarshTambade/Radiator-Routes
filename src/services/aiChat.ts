// AI Chat service — uses Gemini directly, replacing the Supabase ai-chat edge function
// Supports streaming via Gemini's streamGenerateContent endpoint

import { supabase } from "@/integrations/supabase/client";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_MODEL = "gemini-2.5-flash-preview-05-20";

const BASE_SYSTEM_PROMPT = `You are Jinny, a Personal AI Travel Proxy Agent for Radiator Routes. You act as the traveler's intelligent travel representative — negotiating, planning, optimizing, and protecting their interests.

## Your Core Capabilities:

### 1. Auto-Negotiate Itinerary
When multiple travelers are on a group trip, represent THIS traveler's preferences. Suggest compromises that respect their interests (food preferences, budget limits, activity types, pace).

### 2. Personal Travel Concierge
You know this traveler's history, preferences, and personality. Give personalized suggestions — not generic ones. Reference their past trips, preferred cuisines, budget habits, and travel style.

### 3. Real-Time Trip Assistant
Monitor and advise on weather changes, flight delays, local events, and safety alerts. Proactively suggest itinerary adjustments when disruptions occur.

### 4. Budget Optimizer
Track spending against budget. Suggest cost-saving swaps, alert when overspending, and recommend budget reallocation across activities.

## Behavior Rules:
- Always speak in the traveler's language (detect from their messages)
- Be proactive — don't just answer, anticipate needs
- When creating trips, respond with JSON in \`\`\`json ... \`\`\` blocks:
{
  "action": "create_trip",
  "name": "Trip name",
  "destination": "City",
  "country": "Country",
  "days": 5,
  "budget": 50000,
  "trip_type": "solo|group|random"
}
- For itinerary generation, use:
{
  "action": "generate_itinerary",
  "trip_id": "uuid",
  "activities": [{"name":"...", "time":"...", "cost": 0, "category":"..."}]
}
- For budget alerts, use:
{
  "action": "budget_alert",
  "message": "...",
  "spent": 0,
  "remaining": 0,
  "suggestions": ["..."]
}
- Use emojis sparingly. Be concise, warm, and actionable.`;

// ── Load personalised context from Supabase ──────────────────────────────────

async function loadPersonalContext(): Promise<string> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) return "";

    const [{ data: profile }, { data: trips }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", session.user.id).single(),
      supabase
        .from("trips")
        .select("*")
        .order("start_date", { ascending: false })
        .limit(10),
    ]);

    if (!profile && (!trips || trips.length === 0)) return "";

    let ctx = "\n\n## Traveler Profile:\n";

    if (profile) {
      const p = profile as Record<string, unknown>;
      ctx += `- Name: ${p.name ?? "Unknown"}\n`;
      if (p.preferences && Object.keys(p.preferences as object).length > 0) {
        ctx += `- Preferences: ${JSON.stringify(p.preferences)}\n`;
      }
      if (
        p.travel_personality &&
        Object.keys(p.travel_personality as object).length > 0
      ) {
        ctx += `- Travel Personality: ${JSON.stringify(p.travel_personality)}\n`;
      }
      if (
        p.travel_history &&
        Array.isArray(p.travel_history) &&
        (p.travel_history as unknown[]).length > 0
      ) {
        ctx += `- Travel History: ${JSON.stringify(p.travel_history)}\n`;
      }
    }

    if (trips && trips.length > 0) {
      ctx += `\n## Current Trips (${trips.length}):\n`;
      for (const trip of trips) {
        const t = trip as Record<string, unknown>;
        const budgetStr = t.budget_total
          ? `₹${Number(t.budget_total).toLocaleString("en-IN")}`
          : "Not set";
        ctx += `- "${t.name}" → ${t.destination}, ${t.country ?? ""} | ${t.start_date} to ${t.end_date} | Budget: ${budgetStr} | Status: ${t.status} | ID: ${t.id}\n`;
      }
    }

    return ctx;
  } catch (err) {
    console.error("Error loading personal context:", err);
    return "";
  }
}

// ── Gemini message type ───────────────────────────────────────────────────────

interface GeminiMessage {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

// ── Map chat history to Gemini format ────────────────────────────────────────

function toGeminiMessages(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): GeminiMessage[] {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

// ── Non-streaming chat (returns full text) ───────────────────────────────────

export async function sendChatMessage(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error("VITE_GEMINI_API_KEY is not configured");
  }

  const personalContext = await loadPersonalContext();
  const fullSystemPrompt = BASE_SYSTEM_PROMPT + personalContext;

  const url = `${GEMINI_BASE}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const body = {
    system_instruction: {
      parts: [{ text: fullSystemPrompt }],
    },
    contents: toGeminiMessages(messages),
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024,
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

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

// ── Streaming chat — calls onChunk for each delta, returns full text ──────────

export async function streamChatMessage(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  onChunk: (chunk: string) => void,
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error("VITE_GEMINI_API_KEY is not configured");
  }

  const personalContext = await loadPersonalContext();
  const fullSystemPrompt = BASE_SYSTEM_PROMPT + personalContext;

  const url = `${GEMINI_BASE}/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;

  const body = {
    system_instruction: {
      parts: [{ text: fullSystemPrompt }],
    },
    contents: toGeminiMessages(messages),
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1024,
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

  if (!res.body) {
    // Fallback to non-streaming
    const text = await sendChatMessage(messages);
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

  // Flush any remaining buffer
  if (buffer.trim()) {
    const remaining = buffer.trim();
    if (remaining.startsWith("data: ")) {
      const jsonStr = remaining.slice(6).trim();
      if (jsonStr && jsonStr !== "[DONE]") {
        try {
          const parsed = JSON.parse(jsonStr);
          const chunk = parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
          if (chunk) {
            fullText += chunk;
            onChunk(chunk);
          }
        } catch {
          // ignore
        }
      }
    }
  }

  return fullText;
}
