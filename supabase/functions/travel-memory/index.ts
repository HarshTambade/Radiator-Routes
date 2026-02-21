import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const HF_API_URL = "https://router.huggingface.co/v1/chat/completions";
const HF_MODEL = "mistralai/Mistral-7B-Instruct-v0.3";

// ─── helpers ──────────────────────────────────────────────────────────────────

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
  temperature = 0.3,
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
  if (msg === "RATE_LIMIT") {
    return errorResponse(
      "AI rate limit exceeded. Please wait a moment and try again.",
      429,
    );
  }
  if (msg === "QUOTA_EXCEEDED") {
    return errorResponse(
      "HuggingFace quota exceeded. Please check your plan.",
      402,
    );
  }
  if (msg === "INVALID_API_KEY") {
    return errorResponse("HuggingFace API key is invalid or expired.", 401);
  }
  return errorResponse(msg, 500);
}

// ─── main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
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

    // Auth is required — travel memory is always user-specific
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return errorResponse(
        "Authorization header is required for travel-memory",
        401,
      );
    }

    // Build authenticated Supabase client
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify the user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return errorResponse("Invalid or expired access token", 401);
    }

    // Parse request body
    const body = await req.json().catch(() => null);
    if (!body || typeof body.action !== "string") {
      return errorResponse("Request body must include an 'action' field", 400);
    }

    const { action } = body as { action: string };

    // ── action router ─────────────────────────────────────────────────────────

    switch (action) {
      // ── learn: analyse trip history and update the profile memory ──────────
      case "learn": {
        // Fetch all trips for this user (via trip_memberships)
        const { data: trips, error: tripsError } = await supabase
          .from("trips")
          .select(
            "id, name, destination, country, start_date, end_date, budget_total, status, currency",
          )
          .order("created_at", { ascending: false })
          .limit(20);

        if (tripsError) {
          console.error("Error fetching trips:", tripsError);
          return errorResponse(
            "Failed to fetch trips: " + tripsError.message,
            500,
          );
        }

        if (!trips || trips.length === 0) {
          return jsonResponse({
            success: false,
            message:
              "No trips found yet. Create some trips first to build your travel memory.",
          });
        }

        // Fetch itineraries for those trips
        const tripIds = trips.map((t) => t.id);
        const { data: itineraries, error: itiError } = await supabase
          .from("itineraries")
          .select("id, trip_id")
          .in("trip_id", tripIds);

        if (itiError) {
          console.error("Error fetching itineraries:", itiError);
        }

        // Fetch activities across all itineraries
        let allActivities: Record<string, unknown>[] = [];
        if (itineraries && itineraries.length > 0) {
          const itineraryIds = itineraries.map((i) => i.id);
          const { data: activities, error: actsError } = await supabase
            .from("activities")
            .select("name, category, cost, location_name, status")
            .in("itinerary_id", itineraryIds)
            .limit(100);

          if (actsError) {
            console.error("Error fetching activities:", actsError);
          } else {
            allActivities = (activities as Record<string, unknown>[]) ?? [];
          }
        }

        // Fetch current profile to merge with existing memory
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("preferences, travel_personality, travel_history, name")
          .eq("id", user.id)
          .single();

        if (profileError) {
          console.error("Error fetching profile:", profileError);
        }

        // Build trip summary for the AI prompt
        const tripSummary = trips
          .map(
            (t) =>
              `- "${t.name}" → ${t.destination}, ${t.country ?? "India"} | ` +
              `${t.start_date} to ${t.end_date} | ` +
              `Budget: ₹${t.budget_total ?? 0} ${t.currency ?? "INR"} | ` +
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
          profile?.preferences ?? {},
          null,
          2,
        );
        const existingPersonality = JSON.stringify(
          profile?.travel_personality ?? {},
          null,
          2,
        );

        const systemPrompt =
          "You are a travel behaviour analyst. Analyse trip and activity data to extract a persistent memory profile for a traveller. Respond ONLY with valid JSON. No markdown, no explanation outside the JSON object.";

        const userPrompt = `Analyse this traveller's complete trip history and extract a persistent memory profile.

Traveller name: ${profile?.name ?? "Unknown"}

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
          const content = await callHF(
            HF_API_KEY,
            systemPrompt,
            userPrompt,
            0.3,
            2048,
          );
          const memory = extractJSON(content) as {
            preferences?: Record<string, unknown>;
            travel_personality?: Record<string, unknown>;
            travel_history?: unknown[];
            insights?: string[];
          };

          // Update the profile with learned memory
          const { error: updateError } = await supabase
            .from("profiles")
            .update({
              preferences: memory.preferences ?? {},
              travel_personality: memory.travel_personality ?? {},
              travel_history: memory.travel_history ?? [],
            })
            .eq("id", user.id);

          if (updateError) {
            console.error("Error updating profile:", updateError);
            return errorResponse(
              "Failed to save travel memory: " + updateError.message,
              500,
            );
          }

          return jsonResponse({
            success: true,
            trips_analysed: trips.length,
            activities_analysed: allActivities.length,
            memory,
          });
        } catch (err) {
          return handleHFError(err);
        }
      }

      // ── get-memory: return the stored memory for the current user ──────────
      case "get-memory": {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("name, preferences, travel_personality, travel_history")
          .eq("id", user.id)
          .single();

        if (profileError) {
          console.error("Error fetching profile:", profileError);
          return errorResponse(
            "Failed to fetch memory: " + profileError.message,
            500,
          );
        }

        return jsonResponse({
          name: profile?.name ?? "",
          preferences: profile?.preferences ?? {},
          travel_personality: profile?.travel_personality ?? {},
          travel_history: profile?.travel_history ?? [],
        });
      }

      // ── clear-memory: reset the memory fields for the current user ─────────
      case "clear-memory": {
        const { error: clearError } = await supabase
          .from("profiles")
          .update({
            preferences: {},
            travel_personality: {},
            travel_history: [],
          })
          .eq("id", user.id);

        if (clearError) {
          console.error("Error clearing memory:", clearError);
          return errorResponse(
            "Failed to clear memory: " + clearError.message,
            500,
          );
        }

        return jsonResponse({
          success: true,
          message: "Travel memory cleared.",
        });
      }

      // ── update-memory: manually patch specific memory fields ───────────────
      case "update-memory": {
        const { preferences, travel_personality, travel_history } = body as {
          preferences?: Record<string, unknown>;
          travel_personality?: Record<string, unknown>;
          travel_history?: unknown[];
        };

        // Fetch existing values to merge
        const { data: existing } = await supabase
          .from("profiles")
          .select("preferences, travel_personality, travel_history")
          .eq("id", user.id)
          .single();

        const merged: Record<string, unknown> = {};

        if (preferences !== undefined) {
          merged.preferences = {
            ...((existing?.preferences as Record<string, unknown>) ?? {}),
            ...preferences,
          };
        }

        if (travel_personality !== undefined) {
          merged.travel_personality = {
            ...((existing?.travel_personality as Record<string, unknown>) ??
              {}),
            ...travel_personality,
          };
        }

        if (travel_history !== undefined) {
          merged.travel_history = travel_history;
        }

        if (Object.keys(merged).length === 0) {
          return errorResponse(
            "At least one of preferences, travel_personality, or travel_history must be provided",
            400,
          );
        }

        const { error: updateError } = await supabase
          .from("profiles")
          .update(merged)
          .eq("id", user.id);

        if (updateError) {
          console.error("Error updating memory:", updateError);
          return errorResponse(
            "Failed to update memory: " + updateError.message,
            500,
          );
        }

        return jsonResponse({ success: true, updated: Object.keys(merged) });
      }

      // ── unknown action ─────────────────────────────────────────────────────
      default:
        return errorResponse(
          `Unknown action: "${action}". Supported actions: learn, get-memory, clear-memory, update-memory`,
          400,
        );
    }
  } catch (error: unknown) {
    console.error("Travel-memory function error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return errorResponse(message, 500);
  }
});
