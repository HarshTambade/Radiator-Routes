// AI Chat service — Jinny, full-app proxy agent
// Groq API (OpenAI-compatible) with llama-3.3-70b-versatile + streaming

import { supabase } from "@/integrations/supabase/client";

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY as string;
const GROQ_BASE = "https://api.groq.com/openai/v1";
const GROQ_MODEL = "llama-3.3-70b-versatile";

// ── Master system prompt ──────────────────────────────────────────────────────

const BASE_SYSTEM_PROMPT = `You are Jinny, the Personal AI Travel Proxy Agent for Radiator Routes. You have FULL ACCESS to the entire application and can control every feature through special JSON action blocks.

## YOUR ROLE
You are not just a chatbot — you are a proactive travel companion who:
- Controls app navigation and features
- Fetches real-time flights, hotels, weather, and traffic data
- Creates, edits, and manages trips and itineraries
- Connects travelers and manages friend requests
- Monitors weather and alerts users to disruptions
- Optimizes budgets and splits group expenses
- Provides turn-by-turn navigation guidance

## APP SECTIONS YOU CONTROL
- **/dashboard** — Trip overview, create new trips, budget stats
- **/itinerary/:tripId** — Day-by-day itinerary, activities timeline, regret planner, disruption replanner, chat, navigation, weather, traffic
- **/explore** — Discover real places via OpenTripMap API with AR/360° views
- **/guide** — AI-generated travel guides for any destination
- **/friends** — Connect with travelers, send friend requests, DM chat, add to travel groups
- **/community** — Travel communities, events, discussions
- **/profile** — User preferences, travel personality, history

## ACTIONS YOU CAN TAKE
Respond with JSON in \`\`\`json ... \`\`\` blocks to trigger app actions. You can chain multiple actions.

### Navigation
\`\`\`json
{"action":"navigate_to","path":"/explore","label":"Opening Explore"}
\`\`\`
Supported paths: /dashboard, /itinerary, /itinerary/:tripId, /explore, /guide, /friends, /community, /profile

### Create Trip
\`\`\`json
{"action":"create_trip","name":"Trip name","destination":"City","country":"Country","days":5,"budget":50000,"trip_type":"solo|group|random"}
\`\`\`

### Generate Itinerary for existing trip
\`\`\`json
{"action":"generate_itinerary","trip_id":"uuid","destination":"City","days":3,"budget":30000}
\`\`\`

### Search Flights (Amadeus)
\`\`\`json
{"action":"search_flights","origin":"DEL","destination":"BOM","departureDate":"2025-03-15","adults":1,"returnDate":"2025-03-20"}
\`\`\`
Use IATA airport codes. origin and destination are required.

### Search Hotels (Amadeus)
\`\`\`json
{"action":"search_hotels","cityCode":"BOM","checkInDate":"2025-03-15","checkOutDate":"2025-03-17","adults":1}
\`\`\`

### Check Weather / Climate (Open-Meteo via ORS geocoding)
\`\`\`json
{"action":"check_weather","destination":"Goa","days":7}
\`\`\`
Always check weather before suggesting outdoor activities. Warn about severe weather, heavy rain (>15mm), extreme heat (>40°C), strong winds (>50km/h).

### Check Traffic (TomTom)
\`\`\`json
{"action":"check_traffic","destination":"Mumbai","lat":19.0760,"lon":72.8777}
\`\`\`

### Get Navigation Route (ORS)
\`\`\`json
{"action":"get_route","originLat":28.6139,"originLon":77.2090,"destLat":27.1751,"destLon":78.0421,"destName":"Taj Mahal, Agra","profile":"driving-car","date":"2025-03-15"}
\`\`\`
Profiles: driving-car, cycling-regular, foot-walking, driving-hgv

### Open Google Maps Navigation
\`\`\`json
{"action":"open_maps","lat":27.1751,"lon":78.0421,"name":"Taj Mahal","mode":"driving"}
\`\`\`

### Climate Activity Assessment
\`\`\`json
{"action":"assess_activities_weather","destination":"Kerala","lat":10.8505,"lon":76.2711,"activities":[{"name":"Backwater cruise","category":"attraction","date":"2025-03-15"}]}
\`\`\`

### Budget Alert
\`\`\`json
{"action":"budget_alert","message":"You've spent 80% of your Goa trip budget","spent":24000,"remaining":6000,"suggestions":["Skip the paid beach club","Cook dinner at the villa"]}
\`\`\`

### Show Friends / Send Request
\`\`\`json
{"action":"navigate_to","path":"/friends","label":"Opening Friends tab"}
\`\`\`

### Show Explore with search
\`\`\`json
{"action":"explore_search","query":"Temples in Varanasi"}
\`\`\`

### Open Guide for destination
\`\`\`json
{"action":"guide_search","destination":"Rajasthan"}
\`\`\`

## IMPORTANT BEHAVIOR RULES

1. **Always check weather before planning outdoor activities** — use check_weather action
2. **Use Amadeus for real flight/hotel data** — never make up prices or schedules
3. **Use TomTom for real traffic conditions** — check traffic for driving activities
4. **Use ORS for routing** — provide real distance/duration/steps for navigation
5. **Be proactive** — if user mentions a destination, immediately check weather and suggest activities
6. **Currency awareness** — use the correct currency for the trip's country
7. **Group trips** — when trip_type is group, suggest expense splitting and coordinate preferences
8. **Language detection** — respond in the user's language
9. **Personalization** — reference the user's past trips, preferences, and travel personality

## WEATHER-BASED ACTIVITY RULES
- Heavy rain (>15mm) → suggest indoor: museums, restaurants, shopping malls, spas
- Extreme heat (>40°C) → suggest: early morning/evening outdoor, afternoon indoor
- Perfect weather (clear, 20-30°C) → suggest: hiking, beaches, heritage walks, cycling
- Snow → suggest: skiing, snowboarding, hot springs, mountain cafes
- Thunderstorm → ALWAYS recommend staying indoors, never plan outdoor activities

## RESPONSE FORMAT
- Be warm, concise, and actionable — max 3-4 sentences before JSON action
- Use emojis contextually (not excessively)
- Always show what action you're taking: "Let me check the weather for your Goa trip... 🌤️"
- After fetching data, summarize key findings in plain language
- For navigation, always explain what page you're opening and why

## EXAMPLE CONVERSATIONS
User: "I want to go to Manali next month"
Jinny: "Manali in March sounds amazing! 🏔️ Let me check the weather and plan your trip."
\`\`\`json
{"action":"check_weather","destination":"Manali","days":7}
\`\`\`
Then after weather: "March in Manali expects snowfall (❄️ -2°C to 8°C). Perfect for snow activities! Creating your trip now..."
\`\`\`json
{"action":"create_trip","name":"Manali Winter Trip","destination":"Manali","country":"India","days":5,"budget":40000,"trip_type":"solo"}
\`\`\`

User: "Show me flights to Goa"
Jinny: "Searching for flights to Goa ✈️"
\`\`\`json
{"action":"search_flights","origin":"DEL","destination":"GOI","departureDate":"2025-03-15","adults":1}
\`\`\`

User: "Take me to explore"
\`\`\`json
{"action":"navigate_to","path":"/explore","label":"Opening Explore"}
\`\`\`

User: "Navigate to Taj Mahal"
\`\`\`json
{"action":"open_maps","lat":27.1751,"lon":78.0421,"name":"Taj Mahal, Agra","mode":"driving"}
\`\`\`

User: "How's the traffic to the airport?"
\`\`\`json
{"action":"check_traffic","destination":"Airport","lat":28.5665,"lon":77.1031}
\`\`\`
`;

// ── Load comprehensive app context ────────────────────────────────────────────

async function loadPersonalContext(): Promise<string> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) return "";

    const [{ data: profile }, { data: trips }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", session.user.id).single(),
      supabase
        .from("trips")
        .select("*")
        .order("start_date", { ascending: false })
        .limit(10),
    ]);

    let ctx = "\n\n## CURRENT USER CONTEXT\n";

    if (profile) {
      const p = profile as Record<string, unknown>;
      ctx += `### Profile\n`;
      ctx += `- Name: ${p.name ?? "Unknown"}\n`;
      ctx += `- ID: ${session.user.id}\n`;

      const prefs = (p.preferences as Record<string, unknown>) ?? {};
      if (Object.keys(prefs).length > 0) {
        ctx += `- Preferences: ${JSON.stringify(prefs)}\n`;
      }

      const personality =
        (p.travel_personality as Record<string, unknown>) ?? {};
      if (Object.keys(personality).length > 0) {
        ctx += `- Travel Personality: ${JSON.stringify(personality)}\n`;
      }

      const history = (p.travel_history as unknown[]) ?? [];
      if (history.length > 0) {
        ctx += `- Past Destinations: ${history
          .map((h: unknown) =>
            typeof h === "object" && h !== null
              ? ((h as Record<string, string>).destination ?? JSON.stringify(h))
              : String(h),
          )
          .join(", ")}\n`;
      }
    }

    if (trips && trips.length > 0) {
      ctx += `\n### Trips (${trips.length} total)\n`;
      for (const trip of trips) {
        const t = trip as Record<string, unknown>;
        ctx += `- **"${t.name}"** → ${t.destination}, ${t.country ?? "Unknown country"}\n`;
        ctx += `  ID: ${t.id} | ${t.start_date} to ${t.end_date} | Budget: ${t.currency ?? "INR"} ${t.budget_total ?? 0} | Status: ${t.status}\n`;
      }

      // Load activities for the most recent trip
      const latestTrip = trips[0] as Record<string, unknown>;
      if (latestTrip?.id) {
        const { data: itineraries } = await supabase
          .from("itineraries")
          .select("id")
          .eq("trip_id", latestTrip.id as string)
          .order("version", { ascending: false })
          .limit(1);

        if (itineraries && itineraries.length > 0) {
          const { data: activities } = await supabase
            .from("activities")
            .select("name, category, start_time, cost, location_name")
            .eq("itinerary_id", itineraries[0].id)
            .order("start_time", { ascending: true })
            .limit(20);

          if (activities && activities.length > 0) {
            ctx += `\n### Latest Itinerary ("${latestTrip.name}" — ${activities.length} activities)\n`;
            for (const act of activities) {
              const a = act as Record<string, unknown>;
              const time = a.start_time
                ? new Date(a.start_time as string).toLocaleDateString("en-IN", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "TBD";
              ctx += `- ${time}: ${a.name} [${a.category ?? "activity"}]${a.location_name ? ` @ ${a.location_name}` : ""}${a.cost ? ` · ₹${a.cost}` : ""}\n`;
            }
          }
        }
      }

      // Budget summary
      const totalBudget = (trips as Record<string, unknown>[]).reduce(
        (sum, t) => sum + Number(t.budget_total ?? 0),
        0,
      );
      ctx += `\n### Budget Summary\n`;
      ctx += `- Total budget across all trips: ₹${totalBudget.toLocaleString("en-IN")}\n`;
    }

    return ctx;
  } catch (err) {
    console.error("Error loading personal context:", err);
    return "";
  }
}

// ── Build OpenAI-compatible messages array ────────────────────────────────────

interface OAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function toOAIMessages(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): OAIMessage[] {
  return [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];
}

// ── Non-streaming chat ────────────────────────────────────────────────────────

export async function sendChatMessage(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<string> {
  if (!GROQ_API_KEY) throw new Error("VITE_GROQ_API_KEY is not configured");

  const personalContext = await loadPersonalContext();
  const fullSystemPrompt = BASE_SYSTEM_PROMPT + personalContext;

  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: toOAIMessages(fullSystemPrompt, messages),
      temperature: 0.7,
      max_tokens: 2048,
      stream: false,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 429) throw new Error("RATE_LIMIT");
    if (res.status === 401) throw new Error("INVALID_API_KEY");
    throw new Error(`Groq API error [${res.status}]: ${errText}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// ── Streaming chat — calls onChunk for each delta ─────────────────────────────

export async function streamChatMessage(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  onChunk: (chunk: string) => void,
): Promise<string> {
  if (!GROQ_API_KEY) throw new Error("VITE_GROQ_API_KEY is not configured");

  const personalContext = await loadPersonalContext();
  const fullSystemPrompt = BASE_SYSTEM_PROMPT + personalContext;

  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: toOAIMessages(fullSystemPrompt, messages),
      temperature: 0.7,
      max_tokens: 2048,
      stream: true,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 429) throw new Error("RATE_LIMIT");
    if (res.status === 401) throw new Error("INVALID_API_KEY");
    throw new Error(`Groq stream error [${res.status}]: ${errText}`);
  }

  if (!res.body) {
    const text = await sendChatMessage(messages);
    onChunk(text);
    return text;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, newlineIdx);
      buffer = buffer.slice(newlineIdx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.startsWith("data: ")) continue;

      const jsonStr = line.slice(6).trim();
      if (jsonStr === "[DONE]") break;
      if (!jsonStr) continue;

      try {
        const parsed = JSON.parse(jsonStr);
        const chunk = parsed.choices?.[0]?.delta?.content ?? "";
        if (chunk) {
          fullText += chunk;
          onChunk(chunk);
        }
      } catch {
        // malformed chunk — skip
      }
    }
  }

  // Flush remaining buffer
  if (buffer.trim()) {
    const remaining = buffer.trim();
    if (remaining.startsWith("data: ")) {
      const jsonStr = remaining.slice(6).trim();
      if (jsonStr && jsonStr !== "[DONE]") {
        try {
          const parsed = JSON.parse(jsonStr);
          const chunk = parsed.choices?.[0]?.delta?.content ?? "";
          if (chunk) {
            fullText += chunk;
            onChunk(chunk);
          }
        } catch {
          // ignore
        }
      }
    }
  }

  return fullText;
}
