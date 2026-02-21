// AI Chat service — uses Groq API (OpenAI-compatible) with llama-3.3-70b-versatile
// Supports streaming via OpenAI-compatible SSE format

import { supabase } from "@/integrations/supabase/client";

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY as string;
const GROQ_BASE = "https://api.groq.com/openai/v1";
const GROQ_MODEL = "llama-3.3-70b-versatile";

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

// ── Build OpenAI-compatible messages array ───────────────────────────────────

interface OAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function toOAIMessages(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): OAIMessage[] {
  return [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];
}

// ── Non-streaming chat (returns full text) ───────────────────────────────────

export async function sendChatMessage(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<string> {
  if (!GROQ_API_KEY) {
    throw new Error("VITE_GROQ_API_KEY is not configured");
  }

  const personalContext = await loadPersonalContext();
  const fullSystemPrompt = BASE_SYSTEM_PROMPT + personalContext;

  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: toOAIMessages(fullSystemPrompt, messages),
      temperature: 0.7,
      max_tokens: 1024,
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

// ── Streaming chat — calls onChunk for each delta, returns full text ──────────

export async function streamChatMessage(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  onChunk: (chunk: string) => void,
): Promise<string> {
  if (!GROQ_API_KEY) {
    throw new Error("VITE_GROQ_API_KEY is not configured");
  }

  const personalContext = await loadPersonalContext();
  const fullSystemPrompt = BASE_SYSTEM_PROMPT + personalContext;

  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: toOAIMessages(fullSystemPrompt, messages),
      temperature: 0.7,
      max_tokens: 1024,
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

  // Flush remaining buffer
  if (buffer.trim()) {
    const remaining = buffer.trim();
    if (remaining.startsWith("data: ")) {
      const jsonStr = remaining.slice(6).trim();
      if (jsonStr && jsonStr !== "[DONE]") {
        try {
          const parsed = JSON.parse(jsonStr);
          const chunk = parsed.choices?.[0]?.delta?.content ?? "";
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
