// AI Planner service — uses Groq API via gemini.ts (drop-in)
// Uses JSON mode + simplified prompts to prevent truncation

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

    let ctx = "\n\nTRAVELER PREFERENCES:\n";
    const p = personality as Record<string, string>;
    if (p.type) ctx += `- Personality: ${p.type}\n`;
    const pref = prefs as Record<string, unknown>;
    if (pref.preferred_pace) ctx += `- Pace: ${pref.preferred_pace}\n`;
    if (
      Array.isArray(pref.favorite_categories) &&
      pref.favorite_categories.length
    )
      ctx += `- Likes: ${(pref.favorite_categories as string[]).join(", ")}\n`;
    if (
      Array.isArray(pref.cuisine_preferences) &&
      pref.cuisine_preferences.length
    )
      ctx += `- Cuisine: ${(pref.cuisine_preferences as string[]).join(", ")}\n`;
    if (pref.accommodation_style)
      ctx += `- Stay: ${pref.accommodation_style}\n`;
    if (pref.avg_daily_budget)
      ctx += `- Avg daily budget: ₹${pref.avg_daily_budget}\n`;
    const dests = history
      .map((h) =>
        typeof h === "object" && h !== null
          ? (h as Record<string, string>).destination
          : String(h),
      )
      .filter(Boolean)
      .join(", ");
    if (dests) ctx += `- Past destinations: ${dests}\n`;
    return ctx;
  } catch {
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
    "You are an expert Indian travel planner. " +
    "Always respond with a single valid JSON object. " +
    "No markdown, no code fences, no explanation — pure JSON only.";

  const userPrompt = `Plan a ${days}-day trip to ${destination} for ${travelers} person(s).
Budget: ₹${budget} total. Trip type: ${tripType}. Interests: ${interests.join(", ")}.
Start date: ${startDate}.${memoryContext}

Return a JSON object with this exact shape:
{
  "activities": [
    {
      "name": string,
      "description": string,
      "location_name": string,
      "location_lat": number,
      "location_lng": number,
      "start_time": "YYYY-MM-DDTHH:MM:SS+05:30",
      "end_time": "YYYY-MM-DDTHH:MM:SS+05:30",
      "category": "food" | "attraction" | "transport" | "shopping" | "accommodation" | "other",
      "cost": number,
      "estimated_steps": number,
      "review_score": number,
      "priority": number,
      "notes": string
    }
  ],
  "total_cost": number,
  "explanation": string
}

Rules:
- Aim for ${Math.min(days * 4, 20)} activities spread across ${days} days
- Use real lat/lng for ${destination}
- All costs in INR, total_cost <= ₹${budget}
- start_time and end_time must use +05:30 timezone offset`;

  try {
    const raw = await callGemini(systemPrompt, userPrompt, 0.7, 8192, true);
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
    "Always respond with a single valid JSON object. " +
    "No markdown, no code fences, no explanation — pure JSON only.";

  const activitiesPerPlan = Math.min(days * 3, 12);

  const userPrompt = `Generate 3 trip plans to ${destination} for ${travelers} person(s), ${days} days.
Budget: ₹${budget}. Type: ${tripType}. Interests: ${interests.join(", ")}.
Start date: ${startDate}.${memoryContext}

Plans:
1. "budget" — minimise cost, street food, free attractions
2. "balanced" — best value, mix of paid/free
3. "experience" — premium unique experiences

Return a JSON object:
{
  "plans": [
    {
      "variant": "budget" | "balanced" | "experience",
      "label": string,
      "tagline": string,
      "total_cost": number,
      "fatigue_level": number (0-100),
      "budget_overrun_risk": number (0-100),
      "experience_quality": number (0-100),
      "regret_score": number (0.0-1.0, lower=less regret),
      "activities": [
        {
          "name": string,
          "description": string,
          "location_name": string,
          "location_lat": number,
          "location_lng": number,
          "start_time": "YYYY-MM-DDTHH:MM:SS+05:30",
          "end_time": "YYYY-MM-DDTHH:MM:SS+05:30",
          "category": "food" | "attraction" | "transport" | "shopping" | "accommodation" | "other",
          "cost": number,
          "estimated_steps": number,
          "review_score": number,
          "priority": number,
          "notes": string
        }
      ],
      "daily_summary": [string],
      "pros": [string],
      "cons": [string]
    }
  ],
  "recommendation": "budget" | "balanced" | "experience",
  "comparison_note": string
}

Rules:
- Each plan must have ${activitiesPerPlan} activities using real ${destination} places
- Use +05:30 timezone offset in all timestamps
- budget plan: regret_score ~0.35, total_cost ~${Math.round(budget * 0.6)}
- balanced plan: regret_score ~0.20, total_cost ~${Math.round(budget * 0.8)}
- experience plan: regret_score ~0.10, total_cost ~${Math.round(budget * 1.0)}`;

  try {
    const raw = await callGemini(systemPrompt, userPrompt, 0.7, 8192, true);
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
  if (!transcript || transcript.trim() === "")
    throw new Error("transcript is required");

  const systemPrompt =
    "You extract structured travel intent from natural language. " +
    "Respond with a single valid JSON object only. No prose, no markdown.";

  const userPrompt = `Extract travel intent from: "${transcript.trim()}"

Return JSON:
{
  "destination": string | null,
  "start_date": "YYYY-MM-DD" | null,
  "duration_days": number | null,
  "travelers_count": number | null,
  "budget_range": { "min": number, "max": number } | null,
  "interests": [string],
  "trip_type": "solo" | "couple" | "friends" | "family" | null,
  "confidence": number (0-1)
}`;

  try {
    const raw = await callGemini(systemPrompt, userPrompt, 0.0, 512, true);
    return extractJSON(raw);
  } catch {
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

// ── Unified action-based dispatcher ──────────────────────────────────────────

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
