import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

// ─── CORS ────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── HuggingFace config ───────────────────────────────────────────────────────

const HF_API_URL = "https://router.huggingface.co/v1/chat/completions";
const HF_MODEL = "mistralai/Mistral-7B-Instruct-v0.3";

// Maximum tokens — kept deliberately small so free-tier HF doesn't reject/timeout
const MAX_TOKENS_PLAN = 2048;
const MAX_TOKENS_REGRET = 3000;
const MAX_TOKENS_INTENT = 512;

// Supabase Edge Functions have a 60-second wall-clock limit.
// We give HF 45 seconds so we still have time to respond.
const HF_TIMEOUT_MS = 45_000;

// ─── Response helpers ─────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ error: message }, status);
}

// ─── HuggingFace caller ───────────────────────────────────────────────────────

async function callHF(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.7,
  maxTokens = MAX_TOKENS_PLAN,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HF_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(HF_API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: HF_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature,
        max_tokens: maxTokens,
        stream: false,
      }),
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error("TIMEOUT");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`HF error ${res.status}:`, body);
    if (res.status === 429) throw new Error("RATE_LIMIT");
    if (res.status === 402) throw new Error("QUOTA_EXCEEDED");
    if (res.status === 401) throw new Error("INVALID_API_KEY");
    throw new Error(`HF_ERROR_${res.status}`);
  }

  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "";
  return content;
}

// ─── JSON extraction — multiple strategies ────────────────────────────────────

function extractJSON(raw: string): unknown {
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

  console.error("Could not extract JSON from AI response:", raw.slice(0, 500));
  throw new Error("AI returned unreadable content. Please try again.");
}

// ─── HF error → HTTP response ─────────────────────────────────────────────────

function handleHFError(err: unknown): Response {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === "RATE_LIMIT")
    return errorResponse(
      "AI rate limit hit — please wait a moment and try again.",
      429,
    );
  if (msg === "QUOTA_EXCEEDED")
    return errorResponse("HuggingFace quota exceeded. Check your plan.", 402);
  if (msg === "INVALID_API_KEY")
    return errorResponse("HuggingFace API key is invalid or expired.", 401);
  if (msg === "TIMEOUT")
    return errorResponse(
      "AI took too long to respond (>45 s). Try again or use a shorter trip.",
      504,
    );
  return errorResponse(msg, 500);
}

// ─── Traveler memory loader ───────────────────────────────────────────────────

async function loadMemoryContext(authHeader: string | null): Promise<string> {
  if (!authHeader) return "";

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseKey) return "";

  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return "";

    const { data: profile } = await supabase
      .from("profiles")
      .select("preferences, travel_personality, travel_history")
      .eq("id", user.id)
      .single();

    if (!profile) return "";

    const prefs = (profile.preferences as Record<string, unknown>) ?? {};
    const personality =
      (profile.travel_personality as Record<string, unknown>) ?? {};
    const history = (profile.travel_history as unknown[]) ?? [];

    if (!Object.keys(prefs).length && !Object.keys(personality).length)
      return "";

    let ctx = "\n\n## TRAVELER MEMORY (personalise the plan based on this):\n";

    const p = personality as Record<string, string>;
    if (p.type)
      ctx += `- Personality: ${p.type}${p.description ? ` (${p.description})` : ""}\n`;

    const pref = prefs as Record<string, unknown>;
    if (pref.preferred_pace)
      ctx += `- Preferred pace: ${pref.preferred_pace}\n`;
    if (
      Array.isArray(pref.favorite_categories) &&
      pref.favorite_categories.length
    )
      ctx += `- Favourite activities: ${(pref.favorite_categories as string[]).join(", ")}\n`;
    if (
      Array.isArray(pref.cuisine_preferences) &&
      pref.cuisine_preferences.length
    )
      ctx += `- Cuisine preferences: ${(pref.cuisine_preferences as string[]).join(", ")}\n`;
    if (pref.accommodation_style)
      ctx += `- Accommodation: ${pref.accommodation_style}\n`;
    if (pref.transport_preference)
      ctx += `- Transport: ${pref.transport_preference}\n`;
    if (pref.avg_daily_budget)
      ctx += `- Avg daily budget: ₹${pref.avg_daily_budget}\n`;

    const destinations = history
      .map((h) =>
        typeof h === "object" && h !== null
          ? (h as Record<string, string>).destination
          : String(h),
      )
      .filter(Boolean)
      .join(", ");
    if (destinations) ctx += `- Past destinations: ${destinations}\n`;

    ctx +=
      "\nIMPORTANT: Tailor activities, restaurants, pace, and budget allocation to the traveler's profile above.\n";
    return ctx;
  } catch (e) {
    console.error("Memory load error (non-fatal):", e);
    return "";
  }
}

// ─── Today's date in IST ──────────────────────────────────────────────────────

function todayIST(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  if (!body || typeof body.action !== "string") {
    return errorResponse(
      "Request body must include a string 'action' field",
      400,
    );
  }

  const { action, ...params } = body;

  // ── Check API key ───────────────────────────────────────────────────────────
  const HF_API_KEY = Deno.env.get("HF_API_KEY");
  if (!HF_API_KEY) {
    return errorResponse(
      "HF_API_KEY secret is not configured. Go to Supabase Dashboard → Settings → Edge Functions → Secrets and add it.",
      500,
    );
  }

  // ── Load traveler memory (optional) ────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  const memoryContext = await loadMemoryContext(authHeader);

  // ── Route ───────────────────────────────────────────────────────────────────

  // ════════════════════════════════════════════════════════════════════════════
  // ACTION: plan-itinerary
  // ════════════════════════════════════════════════════════════════════════════
  if (action === "plan-itinerary") {
    const { destination, days, travelers, budget, interests, tripType } =
      params as {
        destination?: string;
        days?: number;
        travelers?: number;
        budget?: number;
        interests?: string[];
        tripType?: string;
      };

    if (!destination) return errorResponse("destination is required", 400);
    if (!days) return errorResponse("days is required", 400);
    if (!travelers) return errorResponse("travelers is required", 400);
    if (!budget) return errorResponse("budget is required", 400);

    const startDate = todayIST();

    const systemPrompt =
      "You are an expert Indian travel planner. You MUST respond with valid JSON only. " +
      "No prose, no markdown fences, no explanation — output the JSON object and nothing else.";

    const userPrompt =
      `Create a ${days}-day travel itinerary for ${travelers} traveller(s) visiting ${destination}, India.` +
      memoryContext +
      `

Budget: ₹${budget} INR total
Trip type: ${tripType ?? "leisure"}
Interests: ${Array.isArray(interests) && interests.length ? interests.join(", ") : "culture, food, sightseeing"}
Start date: ${startDate}

Return EXACTLY this JSON structure (nothing else):
{
  "activities": [
    {
      "name": "Activity name",
      "description": "1–2 sentence description",
      "location_name": "Specific place name, City",
      "location_lat": 12.9716,
      "location_lng": 77.5946,
      "start_time": "${startDate}T09:00:00+05:30",
      "end_time": "${startDate}T11:00:00+05:30",
      "category": "food",
      "cost": 500,
      "estimated_steps": 3000,
      "review_score": 4.3,
      "priority": 0.8,
      "notes": "Practical tip for the traveller"
    }
  ],
  "total_cost": 15000,
  "explanation": "Why this itinerary suits the traveller"
}

Rules:
- category must be one of: food, attraction, transport, shopping, accommodation, other
- All costs in INR (₹)
- Spread activities across all ${days} days (aim for 3–5 per day)
- Use realistic Indian lat/lng coordinates for ${destination}
- Use ISO 8601 timestamps with +05:30 offset
- Keep total_cost within ₹${budget}`;

    try {
      const raw = await callHF(
        HF_API_KEY,
        systemPrompt,
        userPrompt,
        0.7,
        MAX_TOKENS_PLAN,
      );
      const parsed = extractJSON(raw);
      return jsonResponse(parsed);
    } catch (err) {
      // If the AI itself errored, propagate
      const msg = err instanceof Error ? err.message : String(err);
      if (
        ["RATE_LIMIT", "QUOTA_EXCEEDED", "INVALID_API_KEY", "TIMEOUT"].includes(
          msg,
        )
      ) {
        return handleHFError(err);
      }
      // JSON parse / empty response — return a graceful fallback with an error flag
      console.error("plan-itinerary parse error:", msg);
      return errorResponse(
        "The AI returned an unreadable response. Please try again — this usually resolves on retry.",
        502,
      );
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ACTION: regret-counterfactual
  // ════════════════════════════════════════════════════════════════════════════
  if (action === "regret-counterfactual") {
    const { destination, days, travelers, budget, interests, tripType } =
      params as {
        destination?: string;
        days?: number;
        travelers?: number;
        budget?: number;
        interests?: string[];
        tripType?: string;
      };

    if (!destination) return errorResponse("destination is required", 400);
    if (!days) return errorResponse("days is required", 400);
    if (!travelers) return errorResponse("travelers is required", 400);
    if (!budget) return errorResponse("budget is required", 400);

    const startDate = todayIST();

    const systemPrompt =
      "You are an expert travel planner specialising in regret-aware counterfactual planning. " +
      "You MUST respond with valid JSON only. No prose, no markdown fences, no explanation — " +
      "output the JSON object and nothing else.";

    const userPrompt =
      `Generate exactly 3 alternative itinerary plans for ${travelers} traveller(s) visiting ${destination} for ${days} days.` +
      memoryContext +
      `

Budget: ₹${budget} INR total
Trip type: ${tripType ?? "leisure"}
Interests: ${Array.isArray(interests) && interests.length ? interests.join(", ") : "culture, food, sightseeing"}
Start date: ${startDate}

The 3 plans must be:
1. variant "budget"     — Minimise cost. Street food, free attractions, budget stays.
2. variant "balanced"   — Best value. Mix of paid/free, mid-range dining.
3. variant "experience" — Maximise unique experiences within budget. Premium choices.

Risk metrics are 0–100:
- fatigue_level: higher = more exhausting (more activities / walking / early starts)
- budget_overrun_risk: budget=15, balanced=40, experience=70
- experience_quality: budget=50, balanced=70, experience=90

Return EXACTLY this JSON (nothing else):
{
  "plans": [
    {
      "variant": "budget",
      "label": "Budget Focused",
      "tagline": "Maximum savings, smart choices",
      "total_cost": 12000,
      "fatigue_level": 55,
      "budget_overrun_risk": 15,
      "experience_quality": 50,
      "regret_score": 0.35,
      "activities": [
        {
          "name": "Activity name",
          "description": "1–2 sentence description",
          "location_name": "Place, City",
          "location_lat": 12.9716,
          "location_lng": 77.5946,
          "start_time": "${startDate}T09:00:00+05:30",
          "end_time": "${startDate}T10:30:00+05:30",
          "category": "attraction",
          "cost": 0,
          "estimated_steps": 4000,
          "review_score": 4.2,
          "priority": 0.7,
          "notes": "Practical tip"
        }
      ],
      "daily_summary": ["Day 1: Morning temple visit, afternoon market, evening street food"],
      "pros": ["Very affordable", "Authentic local experience"],
      "cons": ["Fewer premium experiences", "More walking"]
    },
    {
      "variant": "balanced",
      "label": "Balanced",
      "tagline": "Best value for money",
      "total_cost": 20000,
      "fatigue_level": 45,
      "budget_overrun_risk": 40,
      "experience_quality": 70,
      "regret_score": 0.20,
      "activities": [],
      "daily_summary": [],
      "pros": [],
      "cons": []
    },
    {
      "variant": "experience",
      "label": "Experience Focused",
      "tagline": "Premium experiences, lasting memories",
      "total_cost": 28000,
      "fatigue_level": 60,
      "budget_overrun_risk": 70,
      "experience_quality": 90,
      "regret_score": 0.10,
      "activities": [],
      "daily_summary": [],
      "pros": [],
      "cons": []
    }
  ],
  "recommendation": "balanced",
  "comparison_note": "Brief explanation of trade-offs"
}

Rules:
- Fill ALL 3 plans with real activities (aim for ${Math.max(2, days) * 3}–${Math.max(2, days) * 4} activities each)
- category must be one of: food, attraction, transport, shopping, accommodation, other
- All costs in INR (₹)
- Use realistic Indian lat/lng for ${destination}
- Use ISO 8601 timestamps with +05:30 offset
- regret_score: 0.0–1.0, lower = less regret`;

    try {
      const raw = await callHF(
        HF_API_KEY,
        systemPrompt,
        userPrompt,
        0.7,
        MAX_TOKENS_REGRET,
      );
      const parsed = extractJSON(raw);
      return jsonResponse(parsed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        ["RATE_LIMIT", "QUOTA_EXCEEDED", "INVALID_API_KEY", "TIMEOUT"].includes(
          msg,
        )
      ) {
        return handleHFError(err);
      }
      console.error("regret-counterfactual parse error:", msg);
      return errorResponse(
        "The AI returned an unreadable response. Please try again — this usually resolves on retry.",
        502,
      );
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ACTION: extract-intent
  // ════════════════════════════════════════════════════════════════════════════
  if (action === "extract-intent") {
    const { transcript } = params as { transcript?: string };
    if (!transcript || transcript.trim() === "") {
      return errorResponse("transcript is required", 400);
    }

    const systemPrompt =
      "You extract structured travel intent from natural-language input. " +
      "Respond ONLY with valid JSON — no prose, no markdown fences.";

    const userPrompt = `Extract the travel intent from this text: "${transcript.trim()}"

Return EXACTLY this JSON (use null where information is missing):
{
  "destination": "City name or null",
  "start_date": "YYYY-MM-DD or null",
  "duration_days": 3,
  "travelers_count": 1,
  "budget_range": { "min": 10000, "max": 50000 },
  "interests": ["sightseeing", "food"],
  "trip_type": "solo",
  "confidence": 0.85
}

trip_type must be one of: solo, couple, friends, family, or null.`;

    try {
      const raw = await callHF(
        HF_API_KEY,
        systemPrompt,
        userPrompt,
        0.0,
        MAX_TOKENS_INTENT,
      );
      const parsed = extractJSON(raw);
      return jsonResponse(parsed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        ["RATE_LIMIT", "QUOTA_EXCEEDED", "INVALID_API_KEY", "TIMEOUT"].includes(
          msg,
        )
      ) {
        return handleHFError(err);
      }
      // For intent extraction a parse error is recoverable — return empty intent
      console.error("extract-intent parse error:", msg);
      return jsonResponse({
        destination: null,
        start_date: null,
        duration_days: null,
        travelers_count: null,
        budget_range: null,
        interests: [],
        trip_type: null,
        confidence: 0,
      });
    }
  }

  // ── Unknown action ──────────────────────────────────────────────────────────
  return errorResponse(
    `Unknown action: "${action}". Supported actions: plan-itinerary, regret-counterfactual, extract-intent`,
    400,
  );
});
