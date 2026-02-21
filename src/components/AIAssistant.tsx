import { useState, useRef, useEffect, useCallback } from "react";
import {
  X,
  Send,
  Mic,
  MicOff,
  Loader2,
  Shield,
  Brain,
  Wallet,
  Navigation,
  Plane,
  Hotel,
  CloudSun,
  Car,
  Map,
  Users,
  Compass,
  BookOpen,
  LayoutDashboard,
  MapPin,
  Route,
  ExternalLink,
} from "lucide-react";
import orangeBot from "@/assets/orange-bot.png";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { streamChatMessage } from "@/services/aiChat";
import { amadeusFlightOffers, amadeusHotelList } from "@/services/amadeus";
import { trafficFlow, trafficIncidents } from "@/services/traffic";
import {
  getWeatherContext,
  getClimateAwareRoute,
  geocodeDestination,
} from "@/services/climate";
import { formatCurrency } from "@/lib/currency";

type Msg = { role: "user" | "assistant"; content: string };

const PROXY_CAPABILITIES = [
  {
    icon: LayoutDashboard,
    label: "Dashboard",
    prompt: "Show me my trips and travel stats.",
  },
  { icon: Plane, label: "Flights", prompt: "Search flights for my next trip." },
  {
    icon: CloudSun,
    label: "Weather",
    prompt: "Check the weather for my upcoming trip destination.",
  },
  {
    icon: Car,
    label: "Traffic",
    prompt: "Check live traffic conditions for my trip.",
  },
  {
    icon: Navigation,
    label: "Navigate",
    prompt: "Help me navigate to my next activity.",
  },
  {
    icon: Brain,
    label: "Plan Trip",
    prompt: "Create a new trip for me based on my preferences.",
  },
  {
    icon: Users,
    label: "Friends",
    prompt: "Open my friends and travel companions.",
  },
  {
    icon: Compass,
    label: "Explore",
    prompt: "Show me places to explore near my destination.",
  },
  {
    icon: BookOpen,
    label: "Guide",
    prompt: "Generate a travel guide for my destination.",
  },
  {
    icon: Wallet,
    label: "Budget",
    prompt: "Analyze my spending and suggest ways to save money.",
  },
  {
    icon: Shield,
    label: "Safety",
    prompt: "Check safety ratings and alerts for my destination.",
  },
  { icon: Hotel, label: "Hotels", prompt: "Find hotels for my upcoming trip." },
];

// ── Text-to-Speech helper ─────────────────────────────────────────────────────
function speakJinny(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  // Strip markdown / JSON blocks for clean speech
  const plain = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/#{1,6}\s/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .trim()
    .slice(0, 400);
  if (!plain) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(plain);
  utter.rate = 1.0;
  utter.pitch = 0.95;
  utter.volume = 1;
  // Prefer a natural English voice
  const voices = window.speechSynthesis.getVoices();
  const preferred =
    voices.find((v) => v.name.includes("Daniel") && v.lang === "en-GB") ||
    voices.find((v) => v.name.includes("Google UK English")) ||
    voices.find((v) => v.lang === "en-GB") ||
    voices.find(
      (v) =>
        v.lang.startsWith("en-") &&
        !v.name.includes("zira") &&
        !v.name.includes("Zira"),
    );
  if (preferred) utter.voice = preferred;
  window.speechSynthesis.speak(utter);
}

export default function AIAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [wakeListening, setWakeListening] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [voiceSupported, setVoiceSupported] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const wakeRecognitionRef = useRef<any>(null);

  // Refs so closures (recognition callbacks) always see the latest value
  const isListeningRef = useRef(false);
  const wakeActiveRef = useRef(false);
  const isLoadingRef = useRef(false);
  const ttsEnabledRef = useRef(true);
  // Keeps a mirror of the messages state so stale closures can read current history
  const messagesRef = useRef<Msg[]>([]);

  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const userName =
    user?.user_metadata?.name || user?.email?.split("@")[0] || "Traveler";

  // Keep messagesRef in sync with state
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Keep isLoadingRef in sync with state
  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  // Keep ttsEnabledRef in sync
  useEffect(() => {
    ttsEnabledRef.current = ttsEnabled;
  }, [ttsEnabled]);

  // Check voice support on mount + pre-load voices
  useEffect(() => {
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    setVoiceSupported(!!SR);
    // Pre-load TTS voices (Chrome requires this)
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () =>
        window.speechSynthesis.getVoices();
    }
  }, []);

  // ── Wake-word listener ("hey jinny") ─────────────────────────────────────
  useEffect(() => {
    if (open) {
      // Stop wake listener while chat panel is open
      wakeActiveRef.current = false;
      try {
        wakeRecognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
      setWakeListening(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    wakeActiveRef.current = true;

    const startWakeListener = () => {
      if (!wakeActiveRef.current) return;

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      wakeRecognitionRef.current = recognition;

      recognition.onstart = () => setWakeListening(true);

      recognition.onend = () => {
        setWakeListening(false);
        if (wakeActiveRef.current) {
          setTimeout(() => {
            try {
              startWakeListener();
            } catch {
              /* ignore */
            }
          }, 300);
        }
      };

      recognition.onerror = (e: any) => {
        setWakeListening(false);
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          wakeActiveRef.current = false;
          return;
        }
        // Recoverable errors (no-speech, network, audio-capture) – onend will restart
      };

      recognition.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
            .toLowerCase()
            .trim();
          if (
            transcript.includes("hey jinny") ||
            transcript.includes("hey jenny") ||
            transcript.includes("hey ginny") ||
            transcript.includes("hey jini") ||
            transcript.includes("a jinny") ||
            transcript.includes("ok jinny") ||
            transcript.includes("okay jinny")
          ) {
            wakeActiveRef.current = false;
            try {
              recognition.stop();
            } catch {
              /* ignore */
            }
            setOpen(true);
            speakJinny("At your service. I'm listening.");
            toast({
              title: "🧡 Jinny activated!",
              description: "At your service — I'm listening.",
            });
            // Auto-start voice after a short delay so the panel can open
            setTimeout(() => {
              if (!isListeningRef.current) {
                // Trigger startVoice via a custom event so we don't have circular deps
                window.dispatchEvent(new CustomEvent("jinny-start-voice"));
              }
            }, 800);
            break;
          }
        }
      };

      try {
        recognition.start();
      } catch {
        /* ignore */
      }
    };

    startWakeListener();

    return () => {
      wakeActiveRef.current = false;
      try {
        wakeRecognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
      setWakeListening(false);
    };
  }, [open, toast]);

  // ── Stop main voice when the panel closes ───────────────────────────────
  useEffect(() => {
    if (!open && isListeningRef.current) {
      isListeningRef.current = false;
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
      setIsListening(false);
      setInput("");
    }
  }, [open]);

  // ── Cleanup recognition on unmount ──────────────────────────────────────
  useEffect(() => {
    return () => {
      wakeActiveRef.current = false;
      isListeningRef.current = false;
      try {
        wakeRecognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
    };
  }, []);

  // ── Initial greeting ─────────────────────────────────────────────────────
  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([
        {
          role: "assistant",
          content: `Hey ${userName}! 👋 I'm **Jinny** — your travel companion! 🧡\n\nI can:\n- 🧠 Give personalized suggestions based on your travel history\n- 🤝 Negotiate itineraries in group trips for you\n- 🛡️ Monitor disruptions and alert you proactively\n- 💰 Optimize your budget and track spending\n\nWhat would you like to do?`,
        },
      ]);
    }
  }, [open, messages.length, userName]);

  // ── Auto-scroll ──────────────────────────────────────────────────────────
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // ── Inject a tool-result message into the chat ───────────────────────────
  const injectToolResult = useCallback((content: string) => {
    setMessages((prev) => [...prev, { role: "assistant" as const, content }]);
    if (ttsEnabledRef.current) speakJinny(content);
  }, []);

  // ── Handle AI-requested actions (full app control) ───────────────────────
  const handleAction = useCallback(
    async (content: string) => {
      // Extract ALL json blocks (Jinny may chain multiple actions)
      const jsonMatches = [...content.matchAll(/```json\s*([\s\S]*?)```/g)];
      if (!jsonMatches.length) return;

      for (const match of jsonMatches) {
        try {
          const action = JSON.parse(match[1]);
          const act: string = action.action ?? "";

          // ── Navigate to any app page ──────────────────────────────────
          if (act === "navigate_to" && action.path) {
            const label = action.label || `Opening ${action.path}`;
            toast({ title: `🗺️ ${label}` });
            navigate(action.path);
            continue;
          }

          // ── Create Trip ───────────────────────────────────────────────
          if (act === "create_trip" && user) {
            const today = new Date();
            const startStr = formatLocalDate(today);
            const endDate = new Date(today);
            endDate.setDate(endDate.getDate() + (action.days || 3));
            const endStr = formatLocalDate(endDate);

            const { error: insertError } = await supabase.from("trips").insert({
              name: action.name || `Trip to ${action.destination}`,
              destination: action.destination,
              country: action.country || "",
              start_date: startStr,
              end_date: endStr,
              budget_total: action.budget || 0,
              organizer_id: user.id,
            });
            if (insertError) throw insertError;

            queryClient.invalidateQueries({ queryKey: ["trips"] });
            toast({
              title: "Trip created! 🎉",
              description: `${action.destination} trip is ready.`,
            });

            const { data: newTrips } = await supabase
              .from("trips")
              .select("id")
              .eq("organizer_id", user.id)
              .order("created_at", { ascending: false })
              .limit(1);
            if (newTrips && newTrips.length > 0) {
              navigate(`/itinerary/${newTrips[0].id}`);
            }
            continue;
          }

          // ── Generate Itinerary ────────────────────────────────────────
          if (act === "generate_itinerary" && action.trip_id) {
            toast({
              title: "🧠 Generating itinerary…",
              description: "Navigating to your trip.",
            });
            navigate(`/itinerary/${action.trip_id}`);
            continue;
          }

          // ── Budget Alert ──────────────────────────────────────────────
          if (act === "budget_alert") {
            toast({
              title: "💰 Budget Alert",
              description:
                action.message ||
                `Spent: ₹${action.spent?.toLocaleString("en-IN")} | Remaining: ₹${action.remaining?.toLocaleString("en-IN")}`,
            });
            if (action.suggestions?.length) {
              injectToolResult(
                `💡 **Budget Tips:**\n${(action.suggestions as string[]).map((s: string) => `• ${s}`).join("\n")}`,
              );
            }
            continue;
          }

          // ── Search Flights (Amadeus) ──────────────────────────────────
          if (act === "search_flights") {
            injectToolResult("✈️ Searching flights via Amadeus…");
            try {
              const data: any = await amadeusFlightOffers({
                origin: action.origin,
                destination: action.destination,
                departureDate: action.departureDate,
                adults: action.adults ?? 1,
                returnDate: action.returnDate,
                max: 5,
              });
              const offers = data?.data ?? [];
              if (!offers.length) {
                injectToolResult(
                  "✈️ No flights found for those dates. Try different dates or airports.",
                );
              } else {
                let result = `✈️ **Top ${Math.min(offers.length, 5)} Flights** (${action.origin} → ${action.destination})\n\n`;
                for (const offer of offers.slice(0, 5)) {
                  const price = offer.price?.grandTotal ?? "N/A";
                  const currency = offer.price?.currency ?? "INR";
                  const itinerary = offer.itineraries?.[0];
                  const segments = itinerary?.segments ?? [];
                  const dep = segments[0]?.departure?.at
                    ? new Date(segments[0].departure.at).toLocaleString(
                        "en-IN",
                        {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        },
                      )
                    : "–";
                  const arr = segments[segments.length - 1]?.arrival?.at
                    ? new Date(
                        segments[segments.length - 1].arrival.at,
                      ).toLocaleString("en-IN", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "–";
                  const stops = segments.length - 1;
                  const duration =
                    itinerary?.duration?.replace("PT", "").toLowerCase() ?? "–";
                  result += `**${currency} ${Number(price).toLocaleString()}** · ${dep} → ${arr} · ${stops === 0 ? "Direct" : `${stops} stop${stops > 1 ? "s" : ""}`} · ⏱️ ${duration}\n`;
                }
                result += `\n_Prices are indicative. Book on the airline's website._`;
                injectToolResult(result);
              }
            } catch (e: any) {
              injectToolResult(
                `✈️ Flight search error: ${e.message}. Check that VITE_AMADEUS_API_KEY and VITE_AMADEUS_API_SECRET are set.`,
              );
            }
            continue;
          }

          // ── Search Hotels (Amadeus) ───────────────────────────────────
          if (act === "search_hotels") {
            injectToolResult(
              `🏨 Searching hotels in ${action.cityCode ?? action.destination}…`,
            );
            try {
              const data: any = await amadeusHotelList({
                cityCode: action.cityCode ?? action.destination,
                radius: 5,
              });
              const hotels = data?.data ?? [];
              if (!hotels.length) {
                injectToolResult("🏨 No hotels found for that location.");
              } else {
                let result = `🏨 **Hotels in ${action.cityCode ?? action.destination}** (${hotels.length} found)\n\n`;
                for (const h of hotels.slice(0, 8)) {
                  result += `• **${h.name}** — ${h.address?.cityName ?? ""} ${h.rating ? `⭐ ${h.rating}` : ""}\n`;
                }
                result += `\n_Check availability and exact pricing on booking platforms._`;
                injectToolResult(result);
              }
            } catch (e: any) {
              injectToolResult(
                `🏨 Hotel search error: ${e.message}. Check Amadeus API keys.`,
              );
            }
            continue;
          }

          // ── Check Weather / Climate ───────────────────────────────────
          if (act === "check_weather") {
            const dest = action.destination ?? "your destination";
            injectToolResult(`🌤️ Fetching weather for **${dest}**…`);
            try {
              const weatherText = await getWeatherContext(dest);
              injectToolResult(weatherText);
            } catch (e: any) {
              injectToolResult(`🌤️ Weather fetch failed: ${e.message}`);
            }
            continue;
          }

          // ── Check Traffic (TomTom) ────────────────────────────────────
          if (act === "check_traffic") {
            const dest = action.destination ?? "your location";
            injectToolResult(`🚦 Checking live traffic near **${dest}**…`);
            try {
              let lat = action.lat as number | undefined;
              let lon = action.lon as number | undefined;
              if ((!lat || !lon) && action.destination) {
                const coords = await geocodeDestination(action.destination);
                if (coords) {
                  lat = coords.lat;
                  lon = coords.lon;
                }
              }
              if (!lat || !lon) {
                injectToolResult(
                  "🚦 Could not determine coordinates for traffic check.",
                );
                continue;
              }
              const flow: any = await trafficFlow({ lat, lon });
              const flowData = flow?.flowSegmentData;
              let result = `🚦 **Traffic near ${dest}**\n\n`;
              if (flowData) {
                const speed = flowData.currentSpeed ?? 0;
                const freeFlow = flowData.freeFlowSpeed ?? 0;
                const ratio = freeFlow > 0 ? speed / freeFlow : 1;
                const congestion =
                  ratio < 0.3
                    ? "🔴 Heavy"
                    : ratio < 0.6
                      ? "🟡 Moderate"
                      : ratio < 0.85
                        ? "🟠 Light"
                        : "🟢 Free flow";
                result += `- **Current Speed:** ${speed} km/h (free-flow: ${freeFlow} km/h)\n`;
                result += `- **Congestion:** ${congestion}\n`;
                result += `- **Confidence:** ${((flowData.confidence ?? 0) * 100).toFixed(0)}%\n`;
              }
              // Also check incidents in ~10km bbox
              try {
                const incidents: any = await trafficIncidents({
                  minLat: lat - 0.1,
                  minLon: lon - 0.1,
                  maxLat: lat + 0.1,
                  maxLon: lon + 0.1,
                });
                const inc = incidents?.incidents ?? [];
                if (inc.length > 0) {
                  result += `\n⚠️ **${inc.length} incident${inc.length > 1 ? "s" : ""} nearby:**\n`;
                  for (const i of inc.slice(0, 5)) {
                    const desc =
                      i.properties?.events?.[0]?.description ?? "Incident";
                    result += `• ${desc}\n`;
                  }
                } else {
                  result += `\n✅ No incidents reported nearby.`;
                }
              } catch {
                /* incidents optional */
              }
              injectToolResult(result);
            } catch (e: any) {
              injectToolResult(
                `🚦 Traffic check error: ${e.message}. Check VITE_TRAFFIC_API_KEY.`,
              );
            }
            continue;
          }

          // ── Get ORS Route ─────────────────────────────────────────────
          if (act === "get_route") {
            const destName = action.destName ?? "destination";
            injectToolResult(`🗺️ Calculating route to **${destName}**…`);
            try {
              const route = await getClimateAwareRoute({
                originLat: action.originLat,
                originLon: action.originLon,
                destLat: action.destLat,
                destLon: action.destLon,
                profile: action.profile ?? "driving-car",
                date: action.date,
              });
              let result = `🗺️ **Route to ${destName}**\n\n`;
              result += `- 📏 Distance: **${route.distanceKm} km**\n`;
              result += `- ⏱️ Duration: **${route.durationMin} min**\n`;
              result += `- ⛰️ Elevation gain: **${route.elevationGain} m**\n`;
              result += `- ${route.weatherAlongRoute}\n`;
              if (route.avoidanceReasons.length > 0) {
                result += `\n⚠️ **Heads up:**\n${route.avoidanceReasons.map((r) => `• ${r}`).join("\n")}\n`;
              }
              if (route.steps.length > 0) {
                result += `\n📍 **Turn-by-turn directions:**\n`;
                for (const step of route.steps.slice(0, 8)) {
                  result += `• ${step.instruction}${step.distanceM > 0 ? ` (${step.distanceM > 1000 ? `${(step.distanceM / 1000).toFixed(1)} km` : `${step.distanceM} m`})` : ""}\n`;
                }
                if (route.steps.length > 8)
                  result += `_…and ${route.steps.length - 8} more steps_\n`;
              }
              result += `\n[📱 Open in Google Maps](https://www.google.com/maps/dir/?api=1&destination=${action.destLat},${action.destLon}&travelmode=${(action.profile ?? "driving-car").includes("foot") ? "walking" : (action.profile ?? "").includes("cycling") ? "bicycling" : "driving"})`;
              injectToolResult(result);
            } catch (e: any) {
              injectToolResult(
                `🗺️ Route calculation failed: ${e.message}. Check VITE_ORS_API_KEY.`,
              );
            }
            continue;
          }

          // ── Open Google Maps Navigation ───────────────────────────────
          if (act === "open_maps") {
            const mode = action.mode ?? "driving";
            const name = action.name ?? "destination";
            let mapsUrl: string;
            if (action.lat && action.lon) {
              mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${action.lat},${action.lon}&travelmode=${mode}`;
            } else if (action.name) {
              mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(action.name)}&travelmode=${mode}`;
            } else {
              injectToolResult(
                "🗺️ I need coordinates or a place name to open maps navigation.",
              );
              continue;
            }
            window.open(mapsUrl, "_blank");
            injectToolResult(
              `🗺️ Opening Google Maps navigation to **${name}** (${mode} mode). If the page didn't open, [click here](${mapsUrl}).`,
            );
            continue;
          }

          // ── Explore Search ────────────────────────────────────────────
          if (act === "explore_search") {
            toast({
              title: "🔍 Opening Explore",
              description: action.query ?? "",
            });
            navigate("/explore");
            continue;
          }

          // ── Guide Search ──────────────────────────────────────────────
          if (act === "guide_search") {
            toast({
              title: "📖 Opening Travel Guide",
              description: action.destination ?? "",
            });
            navigate("/guide");
            continue;
          }

          // ── Assess Activities Weather ─────────────────────────────────
          if (act === "assess_activities_weather") {
            injectToolResult(
              `🌤️ Assessing weather suitability for your activities…`,
            );
            try {
              const coords =
                action.lat && action.lon
                  ? { lat: action.lat as number, lon: action.lon as number }
                  : await geocodeDestination(action.destination ?? "");
              if (!coords) {
                injectToolResult(
                  "Could not find coordinates for weather assessment.",
                );
                continue;
              }
              const { getActivityWeatherSuitability } =
                await import("@/services/climate");
              const results = await getActivityWeatherSuitability({
                lat: coords.lat,
                lon: coords.lon,
                activities: action.activities ?? [],
              });
              let result = `🌤️ **Activity Weather Assessment — ${action.destination ?? ""}**\n\n`;
              for (const r of results) {
                const bar =
                  "█".repeat(Math.round(r.score / 10)) +
                  "░".repeat(10 - Math.round(r.score / 10));
                result += `**${r.activityName}** (${r.date})\n`;
                result += `Score: ${bar} ${r.score}/100 — ${r.recommendation}\n`;
                result += `Best time: ⏰ ${r.bestTimeWindow}\n`;
                if (r.warnings.length > 0)
                  result += r.warnings.map((w) => `⚠️ ${w}`).join("\n") + "\n";
                result += "\n";
              }
              injectToolResult(result);
            } catch (e: any) {
              injectToolResult(`Weather assessment error: ${e.message}`);
            }
            continue;
          }
        } catch (e: any) {
          console.error("Action parse error:", e);
        }
      }
    },
    [user, navigate, queryClient, toast, injectToolResult],
  );

  // ── Send a message (SSE streaming) ──────────────────────────────────────
  // FIX 1: reads messagesRef.current (always latest) instead of stale state
  // FIX 2: uses the user's JWT access_token, not the anon publishable key
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoadingRef.current) return;

      const userMsg: Msg = { role: "user", content: text };
      // messagesRef.current is always up-to-date even from inside recognition callbacks
      const allMessages = [...messagesRef.current, userMsg];

      setMessages(allMessages);
      setInput("");
      setIsLoading(true);

      let assistantSoFar = "";

      try {
        await streamChatMessage(allMessages, (chunk: string) => {
          assistantSoFar += chunk;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (
              last?.role === "assistant" &&
              prev.length > allMessages.length
            ) {
              return prev.map((m, i) =>
                i === prev.length - 1 ? { ...m, content: assistantSoFar } : m,
              );
            }
            return [
              ...prev.slice(0, allMessages.length),
              { role: "assistant", content: assistantSoFar },
            ];
          });
        });

        // Speak Jinny's response via TTS (strip JSON blocks first)
        if (ttsEnabledRef.current && assistantSoFar) {
          speakJinny(assistantSoFar);
        }

        handleAction(assistantSoFar);
      } catch (e: any) {
        const msg: string = e?.message ?? "";
        if (msg === "RATE_LIMIT") {
          toast({
            title: "Rate limited",
            description: "Too many requests. Please wait a moment.",
            variant: "destructive",
          });
        } else if (msg === "INVALID_API_KEY") {
          toast({
            title: "API key error",
            description: "Gemini API key is invalid or expired.",
            variant: "destructive",
          });
        }
        if (!assistantSoFar) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "Sorry, I encountered an error. Please try again.",
            },
          ]);
        }
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    },
    [handleAction, toast],
  );

  // ── Stop voice recording ─────────────────────────────────────────────────
  const stopVoice = useCallback(() => {
    isListeningRef.current = false;
    try {
      recognitionRef.current?.abort();
    } catch {
      /* ignore */
    }
    setIsListening(false);
    setInput("");
  }, []);

  // ── Start continuous voice input ─────────────────────────────────────────
  // FIX 3: uses event.resultIndex so we only append NEW speech results
  // FIX 4: handles "aborted" error so onend doesn't restart after manual stop
  // FIX 5: cleanup effect (see above) stops recognition when panel closes
  const startVoice = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast({
        title: "Voice not supported",
        description:
          "Speech recognition requires Chrome or Edge. Please type your message instead.",
        variant: "destructive",
      });
      setVoiceSupported(false);
      return;
    }

    // Toggle off if already running
    if (isListeningRef.current) {
      stopVoice();
      return;
    }

    // Stop TTS while user is speaking
    window.speechSynthesis?.cancel();

    const recognition = new SpeechRecognition();
    recognition.continuous = false; // single utterance → more reliable on mobile
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    // Save reference so stopVoice() and the close-effect can cancel it
    recognitionRef.current = recognition;
    isListeningRef.current = true;

    // Accumulates confirmed (final) words across multiple result events
    let finalTranscript = "";
    let autoSubmitTimer: ReturnType<typeof setTimeout> | null = null;

    recognition.onstart = () => {
      setIsListening(true);
      setInput("");
      finalTranscript = "";
    };

    recognition.onend = () => {
      setIsListening(false);
      isListeningRef.current = false;
      const text = finalTranscript.trim();
      if (text) {
        sendMessage(text);
      }
      setInput("");
    };

    recognition.onerror = (e: any) => {
      const { error } = e;
      isListeningRef.current = false;
      setIsListening(false);

      if (error === "not-allowed" || error === "service-not-allowed") {
        toast({
          title: "Microphone blocked",
          description:
            "Please allow microphone access in your browser settings, then try again.",
          variant: "destructive",
        });
        setVoiceSupported(false);
        return;
      }
      if (error === "aborted") return;
      if (error === "no-speech") {
        toast({
          title: "No speech detected",
          description: "Tap the mic and speak clearly.",
        });
        return;
      }
      if (error === "network") {
        toast({
          title: "Network error",
          description: "Check your internet connection and try again.",
          variant: "destructive",
        });
      }
    };

    recognition.onresult = (event: any) => {
      // Clear pending auto-submit timer
      if (autoSubmitTimer) clearTimeout(autoSubmitTimer);

      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + " ";
        }
      }

      // Build live interim preview
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        if (!event.results[i].isFinal) {
          interim += event.results[i][0].transcript;
        }
      }
      setInput((finalTranscript + interim).trim());

      // Auto-submit after 1.5s of silence if we have final text
      if (finalTranscript.trim()) {
        autoSubmitTimer = setTimeout(() => {
          if (isListeningRef.current) {
            try {
              recognition.stop();
            } catch {
              /* ignore */
            }
          }
        }, 1500);
      }
    };

    try {
      recognition.start();
    } catch (err) {
      console.error("Recognition start failed:", err);
      isListeningRef.current = false;
      setIsListening(false);
      toast({
        title: "Microphone error",
        description: "Could not start microphone. Please try again.",
        variant: "destructive",
      });
    }
  }, [sendMessage, stopVoice, toast]);

  // ── Listen for auto-start voice event (from wake word) ───────────────────
  useEffect(() => {
    const handler = () => {
      if (open && !isListeningRef.current) {
        startVoice();
      }
    };
    window.addEventListener("jinny-start-voice", handler);
    return () => window.removeEventListener("jinny-start-voice", handler);
  }, [open, startVoice]);

  // ── Quick-action capability pills ───────────────────────────────────────
  const handleQuickAction = useCallback(
    (prompt: string) => sendMessage(prompt),
    [sendMessage],
  );

  // ── Show more capabilities toggle ───────────────────────────────────────
  const [showAllCaps, setShowAllCaps] = useState(false);

  // ── Stop TTS when panel closes ────────────────────────────────────────────
  useEffect(() => {
    if (!open) window.speechSynthesis?.cancel();
  }, [open]);

  // ── Draggable floating bot button ───────────────────────────────────────
  const [pos, setPos] = useState({
    x: window.innerWidth - 100,
    y: window.innerHeight - 100,
  });
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startPosX: number;
    startPosY: number;
    dragging: boolean;
    pointerDown: boolean;
  }>({
    startX: 0,
    startY: 0,
    startPosX: 0,
    startPosY: 0,
    dragging: false,
    pointerDown: false,
  });

  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: pos.x,
      startPosY: pos.y,
      dragging: false,
      pointerDown: true,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d.pointerDown) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) d.dragging = true;
    if (d.dragging) {
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 80, d.startPosX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 80, d.startPosY + dy)),
      });
    }
  };

  const onPointerUp = () => {
    if (!dragRef.current.dragging) setOpen(true);
    dragRef.current.pointerDown = false;
    dragRef.current.dragging = false;
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      {/* Floating draggable bot – always visible when panel is closed */}
      {!open && (
        <div className="fixed z-50" style={{ left: pos.x, top: pos.y }}>
          <img
            src={orangeBot}
            alt="Jinny - Your Travel Companion"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="w-20 h-20 cursor-grab active:cursor-grabbing select-none hover:scale-110 transition-transform drop-shadow-lg animate-fade-in touch-none"
            draggable={false}
          />
          {wakeListening && (
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-card/90 backdrop-blur-sm px-2 py-0.5 rounded-full border border-border shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              <span className="text-[9px] text-muted-foreground font-medium whitespace-nowrap">
                Say "Hey Jinny"
              </span>
            </div>
          )}
        </div>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[400px] h-[600px] bg-card border border-border rounded-2xl shadow-elevated flex flex-col animate-fade-in overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-primary/5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center">
                <img
                  src={orangeBot}
                  alt="Jinny"
                  className="w-8 h-8 object-cover"
                />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-card-foreground">
                  Jinny
                </h3>
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-success inline-block" />
                  Your AI Travel Agent • {userName}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {/* TTS toggle */}
              <button
                onClick={() => {
                  setTtsEnabled((v) => {
                    if (v) window.speechSynthesis?.cancel();
                    return !v;
                  });
                }}
                title={
                  ttsEnabled ? "Mute Jinny's voice" : "Unmute Jinny's voice"
                }
                className={`p-1.5 rounded-lg transition-colors text-xs font-bold ${
                  ttsEnabled
                    ? "text-primary hover:bg-primary/10"
                    : "text-muted-foreground hover:bg-secondary line-through"
                }`}
              >
                {ttsEnabled ? "🔊" : "🔇"}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                aria-label="Close chat"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Capability pills – shown while conversation is still short */}
          {messages.length <= 1 && (
            <div className="border-b border-border bg-background/50">
              <div className="flex gap-1.5 px-3 py-2 overflow-x-auto flex-wrap">
                {(showAllCaps
                  ? PROXY_CAPABILITIES
                  : PROXY_CAPABILITIES.slice(0, 6)
                ).map((cap) => {
                  const Icon = cap.icon;
                  return (
                    <button
                      key={cap.label}
                      onClick={() => handleQuickAction(cap.prompt)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary text-secondary-foreground text-[11px] font-medium hover:bg-primary/10 hover:text-primary transition-colors whitespace-nowrap shrink-0"
                    >
                      <Icon className="w-3 h-3" />
                      {cap.label}
                    </button>
                  );
                })}
                <button
                  onClick={() => setShowAllCaps((v) => !v)}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium hover:bg-primary/20 transition-colors whitespace-nowrap shrink-0"
                >
                  {showAllCaps
                    ? "Less ▲"
                    : `+${PROXY_CAPABILITIES.length - 6} more ▼`}
                </button>
              </div>
            </div>
          )}

          {/* Message list */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {m.role === "assistant" && (
                  <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 mr-2 mt-0.5">
                    <img
                      src={orangeBot}
                      alt="Jinny"
                      className="w-6 h-6 object-cover"
                    />
                  </div>
                )}
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-xl text-sm ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-secondary text-secondary-foreground rounded-bl-sm"
                  }`}
                >
                  {m.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none dark:prose-invert [&_p]:m-0 [&_ul]:my-1 [&_li]:my-0 [&_strong]:font-semibold [&_a]:text-primary [&_a]:underline">
                      <ReactMarkdown>
                        {m.content.replace(
                          /```json[\s\S]*?```/g,
                          "✅ *Action executed*",
                        )}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role === "user" && (
              <div className="flex justify-start items-center gap-2">
                <div className="w-6 h-6 rounded-full overflow-hidden shrink-0">
                  <img
                    src={orangeBot}
                    alt="Jinny"
                    className="w-6 h-6 object-cover"
                  />
                </div>
                <div className="bg-secondary px-3 py-2 rounded-xl rounded-bl-sm flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground">
                    Jinny is thinking…
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Input bar */}
          <div className="p-3 border-t border-border">
            {isListening && (
              <div className="flex items-center gap-1.5 mb-2 px-1">
                <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                <span className="text-[10px] text-muted-foreground">
                  Listening… tap mic or press Enter to send
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={isListening ? stopVoice : startVoice}
                disabled={!voiceSupported}
                title={
                  !voiceSupported
                    ? "Voice not supported in this browser"
                    : isListening
                      ? "Stop recording (or press Enter)"
                      : 'Start voice input (or say "Hey Jinny")'
                }
                className={`p-2 rounded-lg transition-colors ${
                  !voiceSupported
                    ? "opacity-30 cursor-not-allowed text-muted-foreground"
                    : isListening
                      ? "bg-destructive text-destructive-foreground animate-pulse"
                      : "hover:bg-secondary text-muted-foreground"
                }`}
                aria-label={
                  isListening ? "Stop recording" : "Start voice input"
                }
              >
                {isListening ? (
                  <MicOff className="w-4 h-4" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </button>
              <input
                type="text"
                placeholder={
                  isListening ? "Speak now…" : "Ask Jinny anything..."
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (isListening) {
                      // Pressing Enter while recording stops mic and submits
                      stopVoice();
                    } else {
                      sendMessage(input);
                    }
                  }
                }}
                className="flex-1 px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <button
                onClick={() => {
                  if (isListening) {
                    stopVoice(); // stop mic → onend will submit finalTranscript
                  } else {
                    sendMessage(input);
                  }
                }}
                disabled={(!input.trim() && !isListening) || isLoading}
                className="p-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-colors"
                aria-label="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Format a Date as a local YYYY-MM-DD string (avoids UTC timezone shift). */
function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
