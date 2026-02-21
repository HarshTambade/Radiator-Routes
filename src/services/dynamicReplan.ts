// Dynamic Replan AI service — uses Groq via gemini.ts (drop-in)
// Uses JSON mode + simplified prompts to prevent truncation

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

export async function detectDisruptions(
  tripId: string,
): Promise<DisruptionData> {
  const { data: trip, error: tripErr } = await supabase
    .from("trips")
    .select("*")
    .eq("id", tripId)
    .single();

  if (tripErr || !trip) {
    throw new Error(tripErr?.message ?? "Trip not found");
  }

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

  const t = trip as Record<string, unknown>;
  const activityList =
    activities.length > 0
      ? activities
          .map(
            (a) =>
              `${a.name} at ${a.location_name ?? "unknown"} (${new Date(a.start_time as string).toLocaleDateString("en-IN")})`,
          )
          .join("; ")
      : "No activities scheduled yet";

  const systemPrompt =
    "You are a travel disruption detection AI. " +
    "Always respond with a single valid JSON object only. No markdown, no prose.";

  const userPrompt = `Analyse this trip and detect real-world disruptions.

Trip: ${t.destination}, ${t.country ?? "India"}
Dates: ${t.start_date} to ${t.end_date}
Activities: ${activityList}

Check for: weather (monsoon/heat/cyclone), transport delays, venue closures (holidays/maintenance), safety advisories.

Return JSON:
{
  "disruptions": [
    {
      "type": "weather" | "flight_delay" | "venue_closed" | "safety" | "transport",
      "severity": "low" | "medium" | "high" | "critical",
      "title": string,
      "description": string,
      "affected_activities": [string],
      "time_window": string,
      "confidence": number (0-1)
    }
  ],
  "overall_risk": "low" | "medium" | "high",
  "needs_replan": boolean
}

Be realistic and specific. Include at least 1-2 disruptions.`;

  try {
    const raw = await callGemini(systemPrompt, userPrompt, 0.4, 2048, true);
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
  const { data: trip, error: tripErr } = await supabase
    .from("trips")
    .select("*")
    .eq("id", tripId)
    .single();

  if (tripErr || !trip) {
    throw new Error(tripErr?.message ?? "Trip not found");
  }

  const tripData = trip as Record<string, unknown>;

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
    "You are an expert travel replanner. " +
    "Always respond with a single valid JSON object only. No markdown, no prose.";

  const userPrompt = `A disruption occurred. Replan the itinerary around it.

Disruption: ${disruption.type} (${disruption.severity})
Details: ${disruption.description}
Affected: ${disruption.affected_activities?.join(", ") ?? "Multiple activities"}

Trip: ${tripData.destination}, ${tripData.country ?? "India"}
Dates: ${tripData.start_date} to ${tripData.end_date} (${tripDays} days)
Budget: ₹${tripData.budget_total ?? 30000}

Current activities:
${activityLines}

Rules:
- Keep unaffected activities as-is
- Replace/reschedule only affected ones
- Weather disruption → indoor alternatives
- Transport delay → reschedule time-sensitive activities
- Stay within original budget

Return JSON:
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
      "notes": string,
      "is_changed": boolean
    }
  ],
  "total_cost": number,
  "changes_summary": string,
  "changes_count": number
}`;

  try {
    const raw = await callGemini(systemPrompt, userPrompt, 0.5, 8192, true);
    return extractJSON(raw) as ReplanData;
  } catch (err) {
    throw new Error(handleGeminiError(err));
  }
}

// ── Unified dispatcher ────────────────────────────────────────────────────────

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
    case "detect-disruptions":
      if (!trip_id) throw new Error("trip_id is required");
      return detectDisruptions(trip_id);

    case "auto-replan":
      if (!trip_id) throw new Error("trip_id is required");
      if (!disruption) throw new Error("disruption object is required");
      return autoReplan(trip_id, disruption);

    default:
      throw new Error(
        `Unknown action: "${action}". Supported: detect-disruptions, auto-replan`,
      );
  }
}
