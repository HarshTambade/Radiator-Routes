// Travel Memory AI service — uses Groq via gemini.ts (drop-in)
// Uses JSON mode + simplified prompts to prevent truncation

import { callGemini, extractJSON, handleGeminiError } from "./gemini";
import { supabase } from "@/integrations/supabase/client";

export interface TravelMemory {
  preferences: {
    favorite_categories?: string[];
    avg_daily_budget?: number;
    preferred_pace?: string;
    cuisine_preferences?: string[];
    accommodation_style?: string;
    transport_preference?: string;
    preferred_destinations?: string[];
    time_preference?: string;
    group_size_preference?: string;
  };
  travel_personality: {
    type?: string;
    risk_tolerance?: string;
    planning_style?: string;
    social_preference?: string;
    description?: string;
  };
  travel_history: Array<{
    destination: string;
    country: string;
    trips_count: number;
    total_spent: number;
    favorite_activity: string;
  }>;
  insights?: string[];
}

// ── get-memory ────────────────────────────────────────────────────────────────

export async function getMemory(): Promise<TravelMemory & { name: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) throw new Error("Authentication required");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("name, preferences, travel_personality, travel_history")
    .eq("id", session.user.id)
    .single();

  if (error) throw new Error("Failed to fetch memory: " + error.message);

  return {
    name: (profile?.name as string) ?? "",
    preferences: (profile?.preferences as TravelMemory["preferences"]) ?? {},
    travel_personality:
      (profile?.travel_personality as TravelMemory["travel_personality"]) ?? {},
    travel_history:
      (profile?.travel_history as TravelMemory["travel_history"]) ?? [],
  };
}

// ── learn ─────────────────────────────────────────────────────────────────────

export async function learnMemory(): Promise<{
  success: boolean;
  trips_analysed: number;
  activities_analysed: number;
  memory: TravelMemory;
  message?: string;
}> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) throw new Error("Authentication required");

  const userId = session.user.id;

  const { data: trips, error: tripsError } = await supabase
    .from("trips")
    .select(
      "id, name, destination, country, start_date, end_date, budget_total, status, currency",
    )
    .order("created_at", { ascending: false })
    .limit(20);

  if (tripsError)
    throw new Error("Failed to fetch trips: " + tripsError.message);

  if (!trips || trips.length === 0) {
    return {
      success: false,
      trips_analysed: 0,
      activities_analysed: 0,
      memory: { preferences: {}, travel_personality: {}, travel_history: [] },
      message:
        "No trips found yet. Create some trips first to build your travel memory.",
    };
  }

  const tripIds = trips.map((t) => t.id);
  const { data: itineraries } = await supabase
    .from("itineraries")
    .select("id, trip_id")
    .in("trip_id", tripIds);

  let allActivities: Record<string, unknown>[] = [];
  if (itineraries && itineraries.length > 0) {
    const itineraryIds = itineraries.map((i) => i.id);
    const { data: activities } = await supabase
      .from("activities")
      .select("name, category, cost, location_name, status")
      .in("itinerary_id", itineraryIds)
      .limit(60);
    allActivities = (activities as Record<string, unknown>[]) ?? [];
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("preferences, travel_personality, travel_history, name")
    .eq("id", userId)
    .single();

  const tripSummary = trips
    .map(
      (t) =>
        `- "${t.name}" → ${t.destination}, ${(t as Record<string, unknown>).country ?? "India"} | ` +
        `${t.start_date} to ${t.end_date} | ` +
        `₹${(t as Record<string, unknown>).budget_total ?? 0} | ` +
        `${t.status}`,
    )
    .join("\n");

  const activitySummary =
    allActivities.length > 0
      ? allActivities
          .map(
            (a) =>
              `${a.name} | ${a.category} | ₹${a.cost ?? 0} | ${a.location_name ?? "N/A"}`,
          )
          .join("\n")
      : "No activities recorded yet";

  const existingPrefs = JSON.stringify(
    (profile?.preferences as Record<string, unknown>) ?? {},
  );
  const existingPersonality = JSON.stringify(
    (profile?.travel_personality as Record<string, unknown>) ?? {},
  );

  const systemPrompt =
    "You are a travel behaviour analyst. " +
    "Always respond with a single valid JSON object only. No markdown, no prose.";

  const userPrompt = `Analyse this traveller's trip history and build a memory profile.

Traveller: ${(profile as Record<string, unknown>)?.name ?? "Unknown"}

Trips (${trips.length}):
${tripSummary}

Activities (${allActivities.length}):
${activitySummary}

Existing preferences (merge, do not erase): ${existingPrefs}
Existing personality (merge, do not erase): ${existingPersonality}

Return JSON:
{
  "preferences": {
    "favorite_categories": [string],
    "avg_daily_budget": number,
    "preferred_pace": "slow" | "moderate" | "fast",
    "cuisine_preferences": [string],
    "accommodation_style": string,
    "transport_preference": string,
    "preferred_destinations": [string],
    "time_preference": string,
    "group_size_preference": string
  },
  "travel_personality": {
    "type": string,
    "risk_tolerance": "low" | "medium" | "high",
    "planning_style": string,
    "social_preference": string,
    "description": string
  },
  "travel_history": [
    {
      "destination": string,
      "country": string,
      "trips_count": number,
      "total_spent": number,
      "favorite_activity": string
    }
  ],
  "insights": [string]
}`;

  try {
    const raw = await callGemini(systemPrompt, userPrompt, 0.3, 2048, true);
    const memory = extractJSON(raw) as TravelMemory & { insights?: string[] };

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        preferences: memory.preferences ?? {},
        travel_personality: memory.travel_personality ?? {},
        travel_history: memory.travel_history ?? [],
      })
      .eq("id", userId);

    if (updateError)
      throw new Error("Failed to save travel memory: " + updateError.message);

    return {
      success: true,
      trips_analysed: trips.length,
      activities_analysed: allActivities.length,
      memory,
    };
  } catch (err) {
    throw new Error(handleGeminiError(err));
  }
}

// ── clear-memory ──────────────────────────────────────────────────────────────

export async function clearMemory(): Promise<{
  success: boolean;
  message: string;
}> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) throw new Error("Authentication required");

  const { error } = await supabase
    .from("profiles")
    .update({
      preferences: {},
      travel_personality: {},
      travel_history: [],
    })
    .eq("id", session.user.id);

  if (error) throw new Error("Failed to clear memory: " + error.message);

  return { success: true, message: "Travel memory cleared." };
}

// ── update-memory ─────────────────────────────────────────────────────────────

export async function updateMemory(params: {
  preferences?: Record<string, unknown>;
  travel_personality?: Record<string, unknown>;
  travel_history?: unknown[];
}): Promise<{ success: boolean; updated: string[] }> {
  const { preferences, travel_personality, travel_history } = params;

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) throw new Error("Authentication required");

  if (!preferences && !travel_personality && !travel_history)
    throw new Error(
      "At least one of preferences, travel_personality, or travel_history must be provided",
    );

  const { data: existing } = await supabase
    .from("profiles")
    .select("preferences, travel_personality, travel_history")
    .eq("id", session.user.id)
    .single();

  const merged: Record<string, unknown> = {};
  const updated: string[] = [];

  if (preferences !== undefined) {
    merged.preferences = {
      ...((existing?.preferences as Record<string, unknown>) ?? {}),
      ...preferences,
    };
    updated.push("preferences");
  }

  if (travel_personality !== undefined) {
    merged.travel_personality = {
      ...((existing?.travel_personality as Record<string, unknown>) ?? {}),
      ...travel_personality,
    };
    updated.push("travel_personality");
  }

  if (travel_history !== undefined) {
    merged.travel_history = travel_history;
    updated.push("travel_history");
  }

  const { error } = await supabase
    .from("profiles")
    .update(merged)
    .eq("id", session.user.id);

  if (error) throw new Error("Failed to update memory: " + error.message);

  return { success: true, updated };
}

// ── Unified dispatcher ────────────────────────────────────────────────────────

export async function travelMemory(body: {
  action: string;
  preferences?: Record<string, unknown>;
  travel_personality?: Record<string, unknown>;
  travel_history?: unknown[];
}): Promise<unknown> {
  const { action, ...params } = body;

  switch (action) {
    case "get-memory":
      return getMemory();
    case "learn":
      return learnMemory();
    case "clear-memory":
      return clearMemory();
    case "update-memory":
      return updateMemory(params as Parameters<typeof updateMemory>[0]);
    default:
      throw new Error(
        `Unknown action: "${action}". Supported: get-memory, learn, clear-memory, update-memory`,
      );
  }
}
