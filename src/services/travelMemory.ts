// Travel Memory AI service — uses Gemini directly, replacing the Supabase travel-memory edge function

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

  if (!session?.user) {
    throw new Error("Authentication required");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("name, preferences, travel_personality, travel_history")
    .eq("id", session.user.id)
    .single();

  if (error) {
    throw new Error("Failed to fetch memory: " + error.message);
  }

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

  if (!session?.user) {
    throw new Error("Authentication required");
  }

  const userId = session.user.id;

  // Fetch all trips for this user
  const { data: trips, error: tripsError } = await supabase
    .from("trips")
    .select(
      "id, name, destination, country, start_date, end_date, budget_total, status, currency",
    )
    .order("created_at", { ascending: false })
    .limit(20);

  if (tripsError) {
    throw new Error("Failed to fetch trips: " + tripsError.message);
  }

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

  // Fetch itineraries for those trips
  const tripIds = trips.map((t) => t.id);
  const { data: itineraries } = await supabase
    .from("itineraries")
    .select("id, trip_id")
    .in("trip_id", tripIds);

  // Fetch activities across all itineraries
  let allActivities: Record<string, unknown>[] = [];
  if (itineraries && itineraries.length > 0) {
    const itineraryIds = itineraries.map((i) => i.id);
    const { data: activities } = await supabase
      .from("activities")
      .select("name, category, cost, location_name, status")
      .in("itinerary_id", itineraryIds)
      .limit(100);
    allActivities = (activities as Record<string, unknown>[]) ?? [];
  }

  // Fetch current profile to merge with existing memory
  const { data: profile } = await supabase
    .from("profiles")
    .select("preferences, travel_personality, travel_history, name")
    .eq("id", userId)
    .single();

  // Build trip summary for the AI prompt
  const tripSummary = trips
    .map(
      (t) =>
        `- "${t.name}" → ${t.destination}, ${(t as Record<string, unknown>).country ?? "India"} | ` +
        `${t.start_date} to ${t.end_date} | ` +
        `Budget: ₹${(t as Record<string, unknown>).budget_total ?? 0} ${(t as Record<string, unknown>).currency ?? "INR"} | ` +
        `Status: ${t.status}`,
    )
    .join("\n");

  const activitySummary = allActivities
    .slice(0, 60)
    .map(
      (a) =>
        `- ${a.name} | Category: ${a.category} | Cost: ₹${a.cost ?? 0} | ` +
        `Location: ${a.location_name ?? "N/A"} | Status: ${a.status ?? "pending"}`,
    )
    .join("\n");

  const existingPrefs = JSON.stringify(
    (profile?.preferences as Record<string, unknown>) ?? {},
    null,
    2,
  );
  const existingPersonality = JSON.stringify(
    (profile?.travel_personality as Record<string, unknown>) ?? {},
    null,
    2,
  );

  const systemPrompt =
    "You are a travel behaviour analyst. Analyse trip and activity data to extract a persistent memory profile for a traveller. Respond ONLY with valid JSON. No markdown, no explanation outside the JSON object.";

  const userPrompt = `Analyse this traveller's complete trip history and extract a persistent memory profile.

Traveller name: ${(profile as Record<string, unknown>)?.name ?? "Unknown"}

## Trips (${trips.length} total):
${tripSummary}

## Activities (${allActivities.length} total, showing up to 60):
${activitySummary || "No activities recorded yet"}

## Existing Preferences (to merge with, not overwrite):
${existingPrefs}

## Existing Travel Personality (to merge with, not overwrite):
${existingPersonality}

Instructions:
1. Analyse spending patterns, preferred destinations, activity categories, and pace
2. Identify personality traits from the data (adventurous, budget-conscious, foodie, etc.)
3. Merge with existing preferences — do not erase existing valid data
4. Generate actionable insights the AI travel assistant can use to personalise plans

Return EXACTLY this JSON structure:
{
  "preferences": {
    "favorite_categories": ["food", "attraction", "shopping"],
    "avg_daily_budget": 5000,
    "preferred_pace": "moderate",
    "cuisine_preferences": ["street food", "local cuisine"],
    "accommodation_style": "mid-range",
    "transport_preference": "mixed",
    "preferred_destinations": ["city names from history"],
    "time_preference": "morning",
    "group_size_preference": "solo"
  },
  "travel_personality": {
    "type": "Explorer",
    "risk_tolerance": "medium",
    "planning_style": "semi-planned",
    "social_preference": "small_groups",
    "description": "A concise one-sentence personality summary"
  },
  "travel_history": [
    {
      "destination": "City name",
      "country": "Country",
      "trips_count": 1,
      "total_spent": 15000,
      "favorite_activity": "Most visited activity name"
    }
  ],
  "insights": [
    "You tend to prefer street food over fine dining",
    "Your average trip lasts 3–4 days",
    "You favour morning activities and early starts"
  ]
}`;

  try {
    const raw = await callGemini(systemPrompt, userPrompt, 0.3, 2048);
    const memory = extractJSON(raw) as TravelMemory & { insights?: string[] };

    // Update the profile with learned memory
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        preferences: memory.preferences ?? {},
        travel_personality: memory.travel_personality ?? {},
        travel_history: memory.travel_history ?? [],
      })
      .eq("id", userId);

    if (updateError) {
      throw new Error("Failed to save travel memory: " + updateError.message);
    }

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

export async function clearMemory(): Promise<{ success: boolean; message: string }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    throw new Error("Authentication required");
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      preferences: {},
      travel_personality: {},
      travel_history: [],
    })
    .eq("id", session.user.id);

  if (error) {
    throw new Error("Failed to clear memory: " + error.message);
  }

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

  if (!session?.user) {
    throw new Error("Authentication required");
  }

  if (!preferences && !travel_personality && !travel_history) {
    throw new Error(
      "At least one of preferences, travel_personality, or travel_history must be provided",
    );
  }

  // Fetch existing values to merge
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

  if (error) {
    throw new Error("Failed to update memory: " + error.message);
  }

  return { success: true, updated };
}

// ── Unified action-based dispatcher (mirrors the edge-function interface) ─────

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
