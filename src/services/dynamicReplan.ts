// Dynamic Replan AI service — uses Gemini directly, replacing the Supabase dynamic-replan edge function

import { callGemini, extractJSON, handleGeminiError } from "./gemini";
import { supabase } from "@/integrations/supabase/client";

export interface Disruption {
  type: string;
  severity: string;
  title: string;
  description: string;
  affected_activities: string[];
  time_window: string;
  confidence: number;
}

export interface DisruptionData {
  disruptions: Disruption[];
  overall_risk: string;
  needs_replan: boolean;
}

export interface ReplanActivity {
  name: string;
  description: string;
  location_name: string;
  location_lat?: number;
  location_lng?: number;
  start_time: string;
  end_time: string;
  category: string;
  cost: number;
  estimated_steps?: number;
  review_score?: number;
  priority?: number;
  notes: string;
  is_changed?: boolean;
}

export interface ReplanData {
  activities: ReplanActivity[];
  total_cost: number;
  changes_summary: string;
  changes_count: number;
}

// ── detect-disruptions ────────────────────────────────────────────────────────

export async function detectDisruptions(tripId: string): Promise<DisruptionData> {
  // Fetch trip
  const { data: trip, error: tripErr } = await supabase
    .from("trips")
    .select("*")
    .eq("id", tripId)
    .single();

  if (tripErr || !trip) {
    throw new Error(tripErr?.message ?? "Trip not found");
  }

  // Fetch latest itinerary
  const { data: itineraries } = await supabase
    .from("itineraries")
    .select("id")
    .eq("trip_id", tripId)
    .order("version", { ascending: false })
    .limit(1);

  let activities: Record<string, unknown>[] = [];
  const latestItinerary = itineraries?.[0];
  if (latestItinerary) {
    const { data: acts } = await supabase
      .from("activities")
      .select("name, location_name, start_time, category")
      .eq("itinerary_id", latestItinerary.id)
      .order("start_time", { ascending: true });
    activities = (acts as Record<string, unknown>[]) ?? [];
  }

  const activityList =
    activities.length > 0
      ? activities
          .map(
            (a) =>
              `${a.name} at ${a.location_name ?? "unknown"} (${new Date(a.start_time as string).toLocaleDateString("en-IN")})`,
          )
          .join(", ")
      : "No activities scheduled yet";

  const systemPrompt =
    "You are a travel disruption detection AI. Respond with valid JSON only. No markdown, no explanation outside the JSON object.";

  const userPrompt = `Analyse the following trip and detect potential real-world disruptions.

Trip: ${(trip as Record<string, unknown>).destination}, ${(trip as Record<string, unknown>).country ?? "India"}
Dates: ${(trip as Record<string, unknown>).start_date} to ${(trip as Record<string, unknown>).end_date}
Scheduled activities: ${activityList}

Check for:
1. Weather — monsoon season, extreme heat/cold, cyclone warnings for the destination and dates
2. Transport — common flight/train delay patterns for the region
3. Venue Closures — national holidays, maintenance, seasonal closures
4. Safety — travel advisories, local events causing crowds or unrest

Return EXACTLY this JSON:
{
  "disruptions": [
    {
      "type": "weather|flight_delay|venue_closed|safety|transport",
      "severity": "low|medium|high|critical",
      "title": "Short title (max 60 chars)",
      "description": "What happened and why it affects this trip",
      "affected_activities": ["activity names affected"],
      "time_window": "When this disruption occurs",
      "confidence": 0.85
    }
  ],
  "overall_risk": "low|medium|high",
  "needs_replan": true
}

Be realistic and specific to the destination and season. Return at least 1–2 disruptions for any trip. Respond with valid JSON only.`;

  try {
    const raw = await callGemini(systemPrompt, userPrompt, 0.4, 2048);
    return extractJSON(raw) as DisruptionData;
  } catch (err) {
    throw new Error(handleGeminiError(err));
  }
}

// ── auto-replan ───────────────────────────────────────────────────────────────

export async function autoReplan(
  tripId: string,
  disruption: {
    type: string;
    severity: string;
    description: string;
    affected_activities?: string[];
  },
): Promise<ReplanData> {
  // Fetch trip
  const { data: trip, error: tripErr } = await supabase
    .from("trips")
    .select("*")
    .eq("id", tripId)
    .single();

  if (tripErr || !trip) {
    throw new Error(tripErr?.message ?? "Trip not found");
  }

  const tripData = trip as Record<string, unknown>;

  // Fetch latest itinerary + activities
  const { data: itineraries } = await supabase
    .from("itineraries")
    .select("id")
    .eq("trip_id", tripId)
    .order("version", { ascending: false })
    .limit(1);

  let currentActivities: Record<string, unknown>[] = [];
  const latestItinerary = itineraries?.[0];
  if (latestItinerary) {
    const { data: acts } = await supabase
      .from("activities")
      .select("*")
      .eq("itinerary_id", latestItinerary.id)
      .order("start_time", { ascending: true });
    currentActivities = (acts as Record<string, unknown>[]) ?? [];
  }

  const tripDays = Math.max(
    1,
    Math.ceil(
      (new Date(tripData.end_date as string).getTime() -
        new Date(tripData.start_date as string).getTime()) /
        86_400_000,
    ),
  );

  const activityLines =
    currentActivities.length > 0
      ? currentActivities
          .map(
            (a) =>
              `- ${a.name} | ${a.location_name ?? "N/A"} | ${new Date(a.start_time as string).toLocaleString("en-IN")} | ₹${a.cost ?? 0} | ${a.category}`,
          )
          .join("\n")
      : "No activities scheduled";

  const systemPrompt =
    "You are an expert travel replanner. Respond with valid JSON only. No markdown, no explanation outside the JSON object.";

  const userPrompt = `A disruption has occurred. Create an updated itinerary that works around it.

## Disruption Details
Type: ${disruption.type}
Severity: ${disruption.severity}
Description: ${disruption.description}
Affected Activities: ${disruption.affected_activities?.join(", ") ?? "Multiple activities"}

## Trip Details
Destination: ${tripData.destination}, ${tripData.country ?? "India"}
Dates: ${tripData.start_date} to ${tripData.end_date} (${tripDays} days)
Budget: ₹${tripData.budget_total ?? 30000}

## Current Itinerary
${activityLines}

## Instructions
1. KEEP all unaffected activities exactly as-is (same times, locations, costs)
2. REPLACE or RESCHEDULE only the affected activities
3. For weather disruptions → suggest indoor or covered alternatives
4. For transport delays → reschedule time-sensitive activities
5. Stay within the original total budget
6. Add notes explaining why each changed activity was modified

Return EXACTLY this JSON:
{
  "activities": [
    {
      "name": "Activity name",
      "description": "Brief description",
      "location_name": "Location",
      "location_lat": 0.0,
      "location_lng": 0.0,
      "start_time": "ISO 8601 timestamp with +05:30 offset",
      "end_time": "ISO 8601 timestamp with +05:30 offset",
      "category": "food|attraction|transport|shopping|accommodation|other",
      "cost": 500,
      "estimated_steps": 2000,
      "review_score": 4.5,
      "priority": 0.8,
      "notes": "Reason for this activity (mention if it is a replacement)",
      "is_changed": false
    }
  ],
  "total_cost": 15000,
  "changes_summary": "Brief summary of what changed and why",
  "changes_count": 3
}

Respond with valid JSON only.`;

  try {
    const raw = await callGemini(systemPrompt, userPrompt, 0.5, 8192);
    return extractJSON(raw) as ReplanData;
  } catch (err) {
    throw new Error(handleGeminiError(err));
  }
}

// ── Unified action-based dispatcher (mirrors the edge-function interface) ─────

export async function dynamicReplan(body: {
  action: string;
  trip_id?: string;
  disruption?: {
    type: string;
    severity: string;
    description: string;
    affected_activities?: string[];
  };
}): Promise<unknown> {
  const { action, trip_id, disruption } = body;

  switch (action) {
    case "detect-disruptions": {
      if (!trip_id) throw new Error("trip_id is required");
      return detectDisruptions(trip_id);
    }

    case "auto-replan": {
      if (!trip_id) throw new Error("trip_id is required");
      if (!disruption) throw new Error("disruption object is required");
      return autoReplan(trip_id, disruption);
    }

    default:
      throw new Error(
        `Unknown action: "${action}". Supported: detect-disruptions, auto-replan`,
      );
  }
}
