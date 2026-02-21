import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const HF_API_URL = "https://router.huggingface.co/v1/chat/completions";
const HF_MODEL = "mistralai/Mistral-7B-Instruct-v0.3";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const HF_API_KEY = Deno.env.get("HF_API_KEY");
    if (!HF_API_KEY) {
      return new Response(
        JSON.stringify({ error: "HF_API_KEY is not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const authHeader = req.headers.get("Authorization");
    const body = await req.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "messages array is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Build personalized context by loading user's profile and trips
    let personalContext = "";

    if (authHeader) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");
        if (supabaseUrl && supabaseKey) {
          const supabase = createClient(supabaseUrl, supabaseKey, {
            global: { headers: { Authorization: authHeader } },
          });

          const {
            data: { user },
          } = await supabase.auth.getUser();

          if (user) {
            const [{ data: profile }, { data: trips }] = await Promise.all([
              supabase.from("profiles").select("*").eq("id", user.id).single(),
              supabase
                .from("trips")
                .select("*")
                .order("start_date", { ascending: false })
                .limit(10),
            ]);

            if (profile || trips) {
              personalContext = "\n\n## Traveler Profile:\n";

              if (profile) {
                personalContext += `- Name: ${profile.name || "Unknown"}\n`;
                if (
                  profile.preferences &&
                  Object.keys(profile.preferences).length > 0
                ) {
                  personalContext += `- Preferences: ${JSON.stringify(profile.preferences)}\n`;
                }
                if (
                  profile.travel_personality &&
                  Object.keys(profile.travel_personality).length > 0
                ) {
                  personalContext += `- Travel Personality: ${JSON.stringify(profile.travel_personality)}\n`;
                }
                if (
                  profile.travel_history &&
                  Array.isArray(profile.travel_history) &&
                  profile.travel_history.length > 0
                ) {
                  personalContext += `- Travel History: ${JSON.stringify(profile.travel_history)}\n`;
                }
              }

              if (trips && trips.length > 0) {
                personalContext += `\n## Current Trips (${trips.length}):\n`;
                for (const trip of trips) {
                  const budgetStr = trip.budget_total
                    ? `₹${Number(trip.budget_total).toLocaleString("en-IN")}`
                    : "Not set";
                  personalContext += `- "${trip.name}" → ${trip.destination}, ${trip.country || ""} | ${trip.start_date} to ${trip.end_date} | Budget: ${budgetStr} | Status: ${trip.status} | ID: ${trip.id}\n`;
                }
              }
            }
          }
        }
      } catch (profileError) {
        console.error("Error loading profile context:", profileError);
        // Continue without profile context — non-fatal
      }
    }

    const fullSystemPrompt = BASE_SYSTEM_PROMPT + personalContext;

    const hfResponse = await fetch(HF_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: HF_MODEL,
        messages: [{ role: "system", content: fullSystemPrompt }, ...messages],
        stream: true,
        max_tokens: 1024,
        temperature: 0.7,
      }),
    });

    if (!hfResponse.ok) {
      const errorText = await hfResponse.text();
      console.error("HuggingFace API error:", hfResponse.status, errorText);

      if (hfResponse.status === 429) {
        return new Response(
          JSON.stringify({
            error:
              "AI rate limit exceeded. Please wait a moment and try again.",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      if (hfResponse.status === 402) {
        return new Response(
          JSON.stringify({
            error: "HuggingFace quota exceeded. Please check your plan.",
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      if (hfResponse.status === 401) {
        return new Response(
          JSON.stringify({
            error: "HuggingFace API key is invalid or expired.",
          }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      return new Response(
        JSON.stringify({ error: `AI service error (${hfResponse.status})` }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Stream the SSE response directly back to the client
    return new Response(hfResponse.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: unknown) {
    console.error("AI Chat error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
