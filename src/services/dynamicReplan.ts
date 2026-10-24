// Dynamic Replan AI service — uses Groq via gemini.ts (drop-in)
// Uses JSON mode + simplified prompts to prevent truncation

import { callGemini, extractJSON, handleGeminiError } from "./gemini";
import { supabase } from "@/integrations/supabase/client";
import { geocodeDestination, getWeatherForecast } from "@/services/climate";
import { tripDayCount } from "@/lib/date";
import { formatMoney, normalizeCurrencyCode } from "@/lib/currency";
import { sumCosts } from "@/lib/budget";
import { generateWithRepair } from "@/lib/planRepair";
import { verifyItinerary, type VerificationResult } from "@/lib/itineraryVerifier";

export interface Disruption {
  type: string;
  severity: string;
  title: string;
  description: string;
  affected_activities: string[];
  time_window: string;
}

export interface DisruptionData {
  disruptions: Disruption[];
  overall_risk: string;
  needs_replan: boolean;
  assessed_dates: string[];
  unassessed_dates: string[];
  assessment_note: string;
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
  verification?: VerificationResult;
  attempts?: number;
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

  const { data: itineraries, error: itineraryErr } = await supabase
    .from("itineraries")
    .select("id")
    .eq("trip_id", tripId)
    .order("version", { ascending: false })
    .limit(1);

  if (itineraryErr) throw new Error(itineraryErr.message);

  let activities: Record<string, unknown>[] = [];
  const latestItinerary = itineraries?.[0];
  if (latestItinerary) {
    const { data: acts, error: activitiesErr } = await supabase
      .from("activities")
      .select("name, location_name, start_time, category")
      .eq("itinerary_id", latestItinerary.id)
      .order("start_time", { ascending: true });
    if (activitiesErr) throw new Error(activitiesErr.message);
    activities = (acts as Record<string, unknown>[]) ?? [];
  }

  const t = trip as Record<string, unknown>;
  const byDate = new Map<string, Record<string, unknown>[]>();
  for (const activity of activities) {
    const date = String(activity.start_time ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    byDate.set(date, [...(byDate.get(date) ?? []), activity]);
  }

  const dates = [...byDate.keys()].sort();
  const baseNote =
    "This check uses Open-Meteo weather forecasts only. Flight delays, venue closures, and safety advisories are not connected.";
  if (dates.length === 0) {
    return {
      disruptions: [],
      overall_risk: "low",
      needs_replan: false,
      assessed_dates: [],
      unassessed_dates: [],
      assessment_note: `There are no scheduled activities to assess. ${baseNote}`,
    };
  }

  const coords = await geocodeDestination(
    `${t.destination ?? ""} ${t.country ?? ""}`.trim(),
  );
  if (!coords) throw new Error("Could not locate the trip destination for a weather forecast.");

  const forecast = await getWeatherForecast({ lat: coords.lat, lon: coords.lon, days: 14 });
  const forecastByDate = new Map(forecast.daily.map((day) => [day.date, day]));
  const assessedDates = dates.filter((date) => forecastByDate.has(date));
  const unassessedDates = dates.filter((date) => !forecastByDate.has(date));
  const disruptions: Disruption[] = [];

  for (const date of assessedDates) {
    const day = forecastByDate.get(date)!;
    const concerns: string[] = [];
    if (day.isSevere) concerns.push(`${day.weatherLabel} is forecast`);
    if (day.precipitationSum >= 20) {
      concerns.push(`${day.precipitationSum.toFixed(1)} mm of precipitation is forecast`);
    }
    if (day.tempMax >= 40) concerns.push(`high temperature of ${day.tempMax}°C is forecast`);
    if (day.windspeedMax >= 60) concerns.push(`wind up to ${day.windspeedMax} km/h is forecast`);
    if (concerns.length === 0) continue;

    const severity =
      day.isSevere || day.precipitationSum >= 50 || day.tempMax >= 43 || day.windspeedMax >= 80
        ? "high"
        : "medium";
    disruptions.push({
      type: "weather",
      severity,
      title: `Weather risk on ${date}`,
      description: `Open-Meteo forecast: ${concerns.join("; ")}. This is a forecast, not a confirmed closure or disruption.`,
      affected_activities: (byDate.get(date) ?? []).map((activity) => String(activity.name ?? "Activity")),
      time_window: date,
    });
  }

  const overallRisk = disruptions.some((item) => item.severity === "high")
    ? "high"
    : disruptions.length > 0
      ? "medium"
      : "low";
  const coverage = unassessedDates.length
    ? `Forecast data was unavailable for ${unassessedDates.join(", ")}.`
    : `Forecast data covered all ${assessedDates.length} scheduled date(s).`;

  return {
    disruptions,
    overall_risk: overallRisk,
    needs_replan: disruptions.length > 0,
    assessed_dates: assessedDates,
    unassessed_dates: unassessedDates,
    assessment_note: `${coverage} ${baseNote}`,
  };
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

  if (currentActivities.length === 0) {
    throw new Error("Generate an itinerary before asking for a disruption replan.");
  }

  const tripDays = tripDayCount(
    String(tripData.start_date ?? ""),
    String(tripData.end_date ?? ""),
  );
  const budget = Number(tripData.budget_total ?? 0);
  if (!Number.isFinite(budget) || budget <= 0) {
    throw new Error("Set a positive trip budget before replanning.");
  }
  const currency = normalizeCurrencyCode(String(tripData.currency ?? "INR"));

  const activityLines =
    currentActivities.length > 0
      ? currentActivities
          .map(
            (a) =>
              `- ${a.name} | ${a.location_name ?? "N/A"} | ${new Date(a.start_time as string).toLocaleString("en-IN")} | ${formatMoney(Number(a.cost ?? 0), currency)} | ${a.category}`,
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
Budget: ${formatMoney(budget, currency)} total for all travellers

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
    const generation = await generateWithRepair<ReplanData>({
      generate: async (repairInstruction) => {
        const prompt = repairInstruction
          ? `${userPrompt}\n\n${repairInstruction}`
          : userPrompt;
        const raw = await callGemini(systemPrompt, prompt, 0.5, 8192, true);
        const result = extractJSON(raw) as ReplanData;
        if (!result || !Array.isArray(result.activities)) {
          throw new Error("The model returned an invalid activity list.");
        }
        return result;
      },
      verify: (candidate) =>
        verifyItinerary(candidate, {
          budget,
          days: tripDays,
          maxActivitiesPerDay: 6,
          startDate: String(tripData.start_date ?? ""),
          endDate: String(tripData.end_date ?? ""),
        }),
    });

    if (!generation.verification.ok) {
      const details = generation.verification.errors
        .slice(0, 3)
        .map((violation) => violation.message)
        .join(" ");
      throw new Error(`The replan still has feasibility issues after repair: ${details}`);
    }

    return {
      ...generation.plan,
      total_cost: sumCosts(generation.plan.activities),
      verification: generation.verification,
      attempts: generation.attempts,
    };
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("The replan still has")) throw err;
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
