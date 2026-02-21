import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const HF_API_URL = "https://router.huggingface.co/v1/chat/completions";
const HF_MODEL = "mistralai/Mistral-7B-Instruct-v0.3";

// ─── helpers ─────────────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ error: message }, status);
}

async function callHF(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  temperature = 0.5,
  maxTokens = 2048,
): Promise<string> {
  const res = await fetch(HF_API_URL, {
    method: "POST",
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
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("RATE_LIMIT");
    if (res.status === 402) throw new Error("QUOTA_EXCEEDED");
    if (res.status === 401) throw new Error("INVALID_API_KEY");
    throw new Error(`HuggingFace API error [${res.status}]: ${text}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

function extractJSON(content: string): unknown {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No valid JSON found in AI response");
  return JSON.parse(match[0]);
}

function handleHFError(err: unknown): Response {
  const msg = err instanceof Error ? err.message : "Unknown error";
  if (msg === "RATE_LIMIT")
    return errorResponse(
      "AI rate limit exceeded. Please try again in a moment.",
      429,
    );
  if (msg === "QUOTA_EXCEEDED")
    return errorResponse("HuggingFace quota exceeded.", 402);
  if (msg === "INVALID_API_KEY")
    return errorResponse("HuggingFace API key is invalid or expired.", 401);
  return errorResponse(msg, 500);
}

// ─── main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const HF_API_KEY = Deno.env.get("HF_API_KEY");
    if (!HF_API_KEY) return errorResponse("HF_API_KEY is not configured", 500);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      return errorResponse("Supabase environment variables are not set", 500);
    }

    // Parse request body
    const body = await req.json().catch(() => null);
    if (!body || typeof body.action !== "string") {
      return errorResponse("Request body must include an 'action' field", 400);
    }

    const { action, trip_id, disruption } = body as {
      action: string;
      trip_id?: string;
      disruption?: {
        type: string;
        severity: string;
        description: string;
        affected_activities?: string[];
      };
    };

    const authHeader = req.headers.get("Authorization");

    // Build supabase client (use auth header if present, fallback to anon)
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader ?? `Bearer ${supabaseAnonKey}`,
        },
      },
    });

    // ── action router ─────────────────────────────────────────────────────────

    switch (action) {
      // ── detect-disruptions ──────────────────────────────────────────────────
      case "detect-disruptions": {
        if (!trip_id) return errorResponse("trip_id is required", 400);

        // Fetch trip
        const { data: trip, error: tripErr } = await supabase
          .from("trips")
          .select("*")
          .eq("id", trip_id)
          .single();

        if (tripErr || !trip) {
          return errorResponse(
            tripErr?.message ?? "Trip not found",
            tripErr ? 500 : 404,
          );
        }

        // Fetch latest itinerary + activities
        const { data: itineraries } = await supabase
          .from("itineraries")
          .select("id")
          .eq("trip_id", trip_id)
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

Trip: ${trip.destination}, ${trip.country ?? "India"}
Dates: ${trip.start_date} to ${trip.end_date}
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
          const content = await callHF(
            HF_API_KEY,
            systemPrompt,
            userPrompt,
            0.4,
            2048,
          );
          const parsed = extractJSON(content);
          return jsonResponse(parsed);
        } catch (err) {
          return handleHFError(err);
        }
      }

      // ── auto-replan ─────────────────────────────────────────────────────────
      case "auto-replan": {
        if (!trip_id) return errorResponse("trip_id is required", 400);
        if (!disruption)
          return errorResponse("disruption object is required", 400);

        // Fetch trip
        const { data: trip, error: tripErr } = await supabase
          .from("trips")
          .select("*")
          .eq("id", trip_id)
          .single();

        if (tripErr || !trip) {
          return errorResponse(
            tripErr?.message ?? "Trip not found",
            tripErr ? 500 : 404,
          );
        }

        // Fetch latest itinerary + activities
        const { data: itineraries } = await supabase
          .from("itineraries")
          .select("id")
          .eq("trip_id", trip_id)
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
            (new Date(trip.end_date as string).getTime() -
              new Date(trip.start_date as string).getTime()) /
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
Destination: ${trip.destination}, ${trip.country ?? "India"}
Dates: ${trip.start_date} to ${trip.end_date} (${tripDays} days)
Budget: ₹${trip.budget_total ?? 30000}

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
          const content = await callHF(
            HF_API_KEY,
            systemPrompt,
            userPrompt,
            0.5,
            4096,
          );
          const parsed = extractJSON(content);
          return jsonResponse(parsed);
        } catch (err) {
          return handleHFError(err);
        }
      }

      // ── unknown ─────────────────────────────────────────────────────────────
      default:
        return errorResponse(
          `Unknown action: "${action}". Supported: detect-disruptions, auto-replan`,
          400,
        );
    }
  } catch (error: unknown) {
    console.error("Dynamic-replan function error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return errorResponse(message, 500);
  }
});
