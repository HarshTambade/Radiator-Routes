// AI Planner service — uses Gemini directly, replacing the Supabase ai-planner edge function

import { callGemini, extractJSON, todayIST, handleGeminiError } from "./gemini";
import { supabase } from "@/integrations/supabase/client";

// ── Traveler memory loader ────────────────────────────────────────────────────

async function loadMemoryContext(): Promise<string> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) return "";

    const { data: profile } = await supabase
      .from("profiles")
      .select("preferences, travel_personality, travel_history")
      .eq("id", session.user.id)
      .single();

    if (!profile) return "";

    const prefs = (profile.preferences as Record<string, unknown>) ?? {};
    const personality =
      (profile.travel_personality as Record<string, unknown>) ?? {};
    const history = (profile.travel_history as unknown[]) ?? [];

    if (!Object.keys(prefs).length && !Object.keys(personality).length)
      return "";

    let ctx =
      "\n\n## TRAVELER MEMORY (personalise the plan based on this):\n";

    const p = personality as Record<string, string>;
    if (p.type)
      ctx += `- Personality: ${p.type}${p.description ? ` (${p.description})` : ""}\n`;

    const pref = prefs as Record<string, unknown>;
    if (pref.preferred_pace) ctx += `- Preferred pace: ${pref.preferred_pace}\n`;
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

// ── plan-itinerary ────────────────────────────────────────────────────────────

export async function planItinerary(params: {
  destination: string;
  days: number;
  travelers: number;
  budget: number;
  interests?: string[];
  tripType?: string;
}): Promise<unknown> {
  const {
    destination,
    days,
    travelers,
    budget,
    interests = ["culture", "food", "sightseeing"],
    tripType = "leisure",
  } = params;

  if (!destination) throw new Error("destination is required");
  if (!days) throw new Error("days is required");
  if (!travelers) throw new Error("travelers is required");
  if (!budget) throw new Error("budget is required");

  const startDate = todayIST();
  const memoryContext = await loadMemoryContext();

  const systemPrompt =
    "You are an expert Indian travel planner. You MUST respond with valid JSON only. " +
    "No prose, no markdown fences, no explanation — output the JSON object and nothing else.";

  const userPrompt =
    `Create a ${days}-day travel itinerary for ${travelers} traveller(s) visiting ${destination}, India.` +
    memoryContext +
    `

Budget: ₹${budget} INR total
Trip type: ${tripType}
Interests: ${interests.join(", ")}
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
    const raw = await callGemini(systemPrompt, userPrompt, 0.7, 4096);
    return extractJSON(raw);
  } catch (err) {
    throw new Error(handleGeminiError(err));
  }
}

// ── regret-counterfactual ─────────────────────────────────────────────────────

export async function regretCounterfactual(params: {
  destination: string;
  days: number;
  travelers: number;
  budget: number;
  interests?: string[];
  tripType?: string;
}): Promise<unknown> {
  const {
    destination,
    days,
    travelers,
    budget,
    interests = ["culture", "food", "sightseeing"],
    tripType = "leisure",
  } = params;

  if (!destination) throw new Error("destination is required");
  if (!days) throw new Error("days is required");
  if (!travelers) throw new Error("travelers is required");
  if (!budget) throw new Error("budget is required");

  const startDate = todayIST();
  const memoryContext = await loadMemoryContext();

  const systemPrompt =
    "You are an expert travel planner specialising in regret-aware counterfactual planning. " +
    "You MUST respond with valid JSON only. No prose, no markdown fences, no explanation — " +
    "output the JSON object and nothing else.";

  const userPrompt =
    `Generate exactly 3 alternative itinerary plans for ${travelers} traveller(s) visiting ${destination} for ${days} days.` +
    memoryContext +
    `

Budget: ₹${budget} INR total
Trip type: ${tripType}
Interests: ${interests.join(", ")}
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
    const raw = await callGemini(systemPrompt, userPrompt, 0.7, 8192);
    return extractJSON(raw);
  } catch (err) {
    throw new Error(handleGeminiError(err));
  }
}

// ── extract-intent ────────────────────────────────────────────────────────────

export async function extractIntent(params: {
  transcript: string;
}): Promise<unknown> {
  const { transcript } = params;

  if (!transcript || transcript.trim() === "") {
    throw new Error("transcript is required");
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
    const raw = await callGemini(systemPrompt, userPrompt, 0.0, 512);
    return extractJSON(raw);
  } catch (err) {
    // For intent extraction a parse error is recoverable — return empty intent
    console.error("extract-intent error:", err);
    return {
      destination: null,
      start_date: null,
      duration_days: null,
      travelers_count: null,
      budget_range: null,
      interests: [],
      trip_type: null,
      confidence: 0,
    };
  }
}

// ── Unified action-based dispatcher (mirrors the edge-function interface) ─────

export async function aiPlanner(body: {
  action: string;
  [key: string]: unknown;
}): Promise<unknown> {
  const { action, ...params } = body;

  switch (action) {
    case "plan-itinerary":
      return planItinerary(params as Parameters<typeof planItinerary>[0]);

    case "regret-counterfactual":
      return regretCounterfactual(
        params as Parameters<typeof regretCounterfactual>[0],
      );

    case "extract-intent":
      return extractIntent(params as Parameters<typeof extractIntent>[0]);

    default:
      throw new Error(
        `Unknown action: "${action}". Supported: plan-itinerary, regret-counterfactual, extract-intent`,
      );
  }
}
