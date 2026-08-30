import { useState, useRef, useEffect, useCallback } from "react";
import { getSavedLanguage } from "@/services/translate";
import { errorMessage } from "@/lib/errors";
import {
  startGroqRecording,
  transcribeWithGroq,
  speakText,
  stopSpeaking,
  preloadVoices,
  isBrowserSTTSupported,
  isGroqTranscriptionAvailable,
  isMediaRecorderSupported,
  type RecordingHandle,
} from "@/services/groqVoice";
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
  Users,
  Compass,
  BookOpen,
  LayoutDashboard,
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
import { formatLocalDate } from "@/lib/date";
import {
  getWeatherContext,
  getClimateAwareRoute,
  geocodeDestination,
  getActivityWeatherSuitability,
} from "@/services/climate";

type Msg = { role: "user" | "assistant"; content: string };

const PROXY_CAPABILITIES = [
  { icon: LayoutDashboard, label: "Dashboard", prompt: "Show me my trips and travel stats." },
  { icon: Plane, label: "Flights", prompt: "Search flights for my next trip." },
  { icon: CloudSun, label: "Weather", prompt: "Check the weather for my upcoming trip destination." },
  { icon: Car, label: "Traffic", prompt: "Check live traffic conditions for my trip." },
  { icon: Navigation, label: "Navigate", prompt: "Help me navigate to my next activity." },
  { icon: Brain, label: "Plan Trip", prompt: "Create a new trip for me based on my preferences." },
  { icon: Users, label: "Friends", prompt: "Open my friends and travel companions." },
  { icon: Compass, label: "Explore", prompt: "Show me places to explore near my destination." },
  { icon: BookOpen, label: "Guide", prompt: "Generate a travel guide for my destination." },
  { icon: Wallet, label: "Budget", prompt: "Analyze my spending and suggest ways to save money." },
  { icon: Shield, label: "Safety", prompt: "Check safety ratings and alerts for my destination." },
  { icon: Hotel, label: "Hotels", prompt: "Find hotels for my upcoming trip." },
];

// ── Small module-level TTS language holder ──────────────────────────────────
let _ttsLang = "en";
function speakJinny(text: string) {
  speakText(text, _ttsLang);
}

// ── Voice engine capability probe ───────────────────────────────────────────
function detectVoiceEngine(): "web-speech" | "groq-whisper" | "none" {
  if (isBrowserSTTSupported()) return "web-speech";
  if (isMediaRecorderSupported() && isGroqTranscriptionAvailable()) return "groq-whisper";
  return "none";
}

export default function AIAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [wakeListening, setWakeListening] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [interimTranscript, setInterimTranscript] = useState("");

  const voiceEngine = detectVoiceEngine();
  const voiceSupported = voiceEngine !== "none";

  const scrollRef = useRef<HTMLDivElement>(null);
  const recordingRef = useRef<RecordingHandle | null>(null);
  const wakeRecognitionRef = useRef<any>(null);

  // Refs so async closures always read the latest values
  const isListeningRef = useRef(false);
  const wakeActiveRef = useRef(false);
  const isLoadingRef = useRef(false);
  const ttsEnabledRef = useRef(true);
  const messagesRef = useRef<Msg[]>([]);
  // Set by the voice handle so the web-speech path can hand transcript back
  const pendingTranscriptRef = useRef<string>("");

  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const userLang = getSavedLanguage();

  useEffect(() => {
    _ttsLang = userLang;
  }, [userLang]);

  const userName =
    user?.user_metadata?.name || user?.email?.split("@")[0] || "Traveler";

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);
  useEffect(() => { ttsEnabledRef.current = ttsEnabled; }, [ttsEnabled]);

  useEffect(() => { preloadVoices(); }, []);

  // ── Wake-word listener ("hey jinny") ────────────────────────────────────
  useEffect(() => {
    if (open) {
      wakeActiveRef.current = false;
      try { wakeRecognitionRef.current?.stop(); } catch { /* ignore */ }
      setWakeListening(false);
      return;
    }

    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) return;

    wakeActiveRef.current = true;

    const WAKE_PATTERNS = [
      "hey jinny", "hey jenny", "hey ginny", "hey genie",
      "hi jinny", "hello jinny", "ok jinny", "okay jinny",
      "oi jinny", "yo jinny", "jinny wake", "jinny open",
      "jinny activate", "wake up jinny",
    ];
    const containsWakePhrase = (text: string): boolean => {
      const t = text.toLowerCase().trim();
      return WAKE_PATTERNS.some((p) => t.includes(p));
    };

    const start = () => {
      if (!wakeActiveRef.current) return;

      const recognition = new SR();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = "en-US";
      recognition.maxAlternatives = 3;
      wakeRecognitionRef.current = recognition;

      recognition.onstart = () => setWakeListening(true);
      recognition.onend = () => {
        setWakeListening(false);
        if (wakeActiveRef.current) {
          window.setTimeout(() => {
            try { start(); } catch { /* ignore */ }
          }, 500);
        }
      };
      recognition.onerror = (e: any) => {
        setWakeListening(false);
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          wakeActiveRef.current = false;
        }
      };
      recognition.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (!event.results[i].isFinal) continue;
          let detected = false;
          for (let a = 0; a < event.results[i].length; a++) {
            const alt = event.results[i][a];
            if ((alt.confidence ?? 1) < 0.25) continue;
            if (containsWakePhrase(alt.transcript)) { detected = true; break; }
          }
          if (!detected) continue;

          wakeActiveRef.current = false;
          try { recognition.stop(); } catch { /* ignore */ }
          setOpen(true);
          if (ttsEnabledRef.current) speakJinny("At your service. Tap the mic to speak, or just type.");
          toast({
            title: "🧡 Jinny activated!",
            description: "Tap the mic to speak, or type your request.",
          });
          window.setTimeout(() => {
            if (!isListeningRef.current) {
              window.dispatchEvent(new CustomEvent("jinny-start-voice"));
            }
          }, 900);
          break;
        }
      };

      try { recognition.start(); } catch { /* ignore */ }
    };

    start();

    return () => {
      wakeActiveRef.current = false;
      try { wakeRecognitionRef.current?.stop(); } catch { /* ignore */ }
      setWakeListening(false);
    };
  }, [open, toast]);

  // ── Cleanup when the panel closes ───────────────────────────────────────
  useEffect(() => {
    if (!open) {
      if (isListeningRef.current) {
        isListeningRef.current = false;
        recordingRef.current?.abort();
        recordingRef.current = null;
        setIsListening(false);
        setIsTranscribing(false);
        setInput("");
        setInterimTranscript("");
      }
      stopSpeaking();
    }
  }, [open]);

  // ── Unmount cleanup ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      wakeActiveRef.current = false;
      isListeningRef.current = false;
      try { wakeRecognitionRef.current?.stop(); } catch { /* ignore */ }
      recordingRef.current?.abort();
      recordingRef.current = null;
      stopSpeaking();
    };
  }, []);

  // ── Initial greeting ────────────────────────────────────────────────────
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

  // ── Auto-scroll on new message ──────────────────────────────────────────
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // ── Helper: inject tool-result message ──────────────────────────────────
  const injectToolResult = useCallback((content: string) => {
    setMessages((prev) => [...prev, { role: "assistant" as const, content }]);
    if (ttsEnabledRef.current) speakJinny(content);
  }, []);

  // ── Handle AI-requested actions ─────────────────────────────────────────
  const handleAction = useCallback(
    async (content: string) => {
      const jsonMatches = [...content.matchAll(/```json\s*([\s\S]*?)```/g)];
      if (!jsonMatches.length) return;

      for (const match of jsonMatches) {
        try {
          const action = JSON.parse(match[1]);
          const act: string = action.action ?? "";

          if (act === "navigate_to" && action.path) {
            toast({ title: `🗺️ ${action.label || `Opening ${action.path}`}` });
            navigate(action.path);
            continue;
          }

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

          if (act === "generate_itinerary" && action.trip_id) {
            toast({
              title: "🧠 Generating itinerary…",
              description: "Navigating to your trip.",
            });
            navigate(`/itinerary/${action.trip_id}`);
            continue;
          }

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

          if (act === "search_flights") {
            injectToolResult("✈️ Searching flights…");
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
                injectToolResult("✈️ No flights found. Try different dates or airports.");
              } else {
                const first = offers[0];
                let result = `✈️ **Top flights** (${action.origin} → ${action.destination})\n\n`;
                for (const offer of offers.slice(0, 5)) {
                  const price = offer.price?.grandTotal ?? "N/A";
                  const currency = offer.price?.currency ?? "INR";
                  const seg = offer.itineraries?.[0]?.segments ?? [];
                  const dep = seg[0]?.departure?.at
                    ? new Date(seg[0].departure.at).toLocaleString("en-IN", {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                      })
                    : "–";
                  const arr = seg[seg.length - 1]?.arrival?.at
                    ? new Date(seg[seg.length - 1].arrival.at).toLocaleString("en-IN", {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                      })
                    : "–";
                  const stops = seg.length - 1;
                  const duration = offer.itineraries?.[0]?.duration?.replace("PT", "").toLowerCase() ?? "–";
                  result += `**~${currency} ${Number(price).toLocaleString()}** · ${dep} → ${arr} · ${stops === 0 ? "Direct" : `${stops} stop${stops > 1 ? "s" : ""}`} · ⏱️ ${duration}\n`;
                }
                result += `\n_Estimated fares. Book on:_\n`;
                if (first?.bookingLinks) {
                  result += `• [Google Flights](${first.bookingLinks.google})\n`;
                  result += `• [Kiwi](${first.bookingLinks.kiwi})\n`;
                  result += `• [Skyscanner](${first.bookingLinks.skyscanner})\n`;
                }
                injectToolResult(result);
              }
            } catch (e: unknown) {
              injectToolResult(`✈️ Flight search error: ${errorMessage(e)}`);
            }
            continue;
          }

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
                  const rating = h.rating ? `⭐ ${h.rating}` : "";
                  const dist = h.distance?.value != null ? `📍 ${h.distance.value} ${h.distance.unit}` : "";
                  result += `• **${h.name}** ${rating} ${dist}\n`;
                }
                if (hotels[0]?.bookingLinks) {
                  result += `\n_Live availability & prices:_\n`;
                  result += `• [Booking.com](${hotels[0].bookingLinks.booking})\n`;
                  result += `• [Agoda](${hotels[0].bookingLinks.agoda})\n`;
                  result += `• [Hostelworld](${hotels[0].bookingLinks.hostelworld})\n`;
                }
                injectToolResult(result);
              }
            } catch (e: unknown) {
              injectToolResult(`🏨 Hotel search error: ${errorMessage(e)}`);
            }
            continue;
          }

          if (act === "check_weather") {
            const dest = action.destination ?? "your destination";
            injectToolResult(`🌤️ Fetching weather for **${dest}**…`);
            try {
              const weatherText = await getWeatherContext(dest);
              injectToolResult(weatherText);
            } catch (e: unknown) {
              injectToolResult(`🌤️ Weather fetch failed: ${errorMessage(e)}`);
            }
            continue;
          }

          if (act === "check_traffic") {
            const dest = action.destination ?? "your location";
            injectToolResult(`🚦 Checking traffic near **${dest}**…`);
            try {
              let lat = action.lat as number | undefined;
              let lon = action.lon as number | undefined;
              if ((!lat || !lon) && action.destination) {
                const coords = await geocodeDestination(action.destination);
                if (coords) { lat = coords.lat; lon = coords.lon; }
              }
              if (!lat || !lon) {
                injectToolResult("🚦 Could not determine coordinates for traffic check.");
                continue;
              }
              const flow: any = await trafficFlow({ lat, lon });
              const f = flow?.flowSegmentData;
              let result = `🚦 **Traffic near ${dest}**\n\n`;
              if (f) {
                result += `- **Current Speed:** ${f.currentSpeed} km/h (free-flow: ${f.freeFlowSpeed} km/h)\n`;
                result += `- **Congestion:** ${f.emoji} ${f.congestion}\n`;
                result += `- **Confidence:** ${((f.confidence ?? 0) * 100).toFixed(0)}%\n`;
                if (f.estimated) {
                  result += `\n_Estimate based on time-of-day patterns — live traffic requires a paid feed._\n`;
                }
              }
              try {
                const incidents: any = await trafficIncidents({
                  minLat: lat - 0.1, minLon: lon - 0.1,
                  maxLat: lat + 0.1, maxLon: lon + 0.1,
                });
                if (incidents?.incidents?.length > 0) {
                  result += `\n⚠️ **${incidents.incidents.length} incident(s) nearby**\n`;
                } else {
                  result += `\n✅ No incident data available.`;
                }
              } catch { /* incidents optional */ }
              injectToolResult(result);
            } catch (e: unknown) {
              injectToolResult(`🚦 Traffic check error: ${errorMessage(e)}`);
            }
            continue;
          }

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
                result += `\n📍 **Directions:**\n`;
                for (const step of route.steps.slice(0, 8)) {
                  result += `• ${step.instruction}${step.distanceM > 0 ? ` (${step.distanceM > 1000 ? `${(step.distanceM / 1000).toFixed(1)} km` : `${step.distanceM} m`})` : ""}\n`;
                }
                if (route.steps.length > 8) result += `_…and ${route.steps.length - 8} more_\n`;
              }
              const travelmode = (action.profile ?? "driving-car").includes("foot")
                ? "walking"
                : (action.profile ?? "").includes("cycling") ? "bicycling" : "driving";
              result += `\n[📱 Open in OpenStreetMap](https://www.openstreetmap.org/directions?from=${action.originLat},${action.originLon}&to=${action.destLat},${action.destLon})`;
              result += ` · [📱 Google Maps](https://www.google.com/maps/dir/?api=1&destination=${action.destLat},${action.destLon}&travelmode=${travelmode})`;
              injectToolResult(result);
            } catch (e: unknown) {
              injectToolResult(`🗺️ Route calculation failed: ${errorMessage(e)}`);
            }
            continue;
          }

          if (act === "open_maps") {
            const mode = action.mode ?? "driving";
            const name = action.name ?? "destination";
            let mapsUrl: string;
            if (action.lat && action.lon) {
              mapsUrl = `https://www.openstreetmap.org/?mlat=${action.lat}&mlon=${action.lon}#map=17/${action.lat}/${action.lon}`;
            } else if (action.name) {
              mapsUrl = `https://www.openstreetmap.org/search?query=${encodeURIComponent(action.name)}`;
            } else {
              injectToolResult("🗺️ I need coordinates or a place name to open maps.");
              continue;
            }
            window.open(mapsUrl, "_blank", "noopener,noreferrer");
            injectToolResult(
              `🗺️ Opening OpenStreetMap for **${name}** (${mode} mode). If it didn't open, [click here](${mapsUrl}).`,
            );
            continue;
          }

          if (act === "explore_search") {
            toast({ title: "🔍 Opening Explore", description: action.query ?? "" });
            navigate("/explore");
            continue;
          }

          if (act === "guide_search") {
            toast({ title: "📖 Opening Travel Guide", description: action.destination ?? "" });
            navigate("/guide");
            continue;
          }

          if (act === "assess_activities_weather") {
            injectToolResult(`🌤️ Assessing weather suitability for your activities…`);
            try {
              const coords =
                action.lat && action.lon
                  ? { lat: action.lat as number, lon: action.lon as number }
                  : await geocodeDestination(action.destination ?? "");
              if (!coords) {
                injectToolResult("Could not find coordinates for weather assessment.");
                continue;
              }
              const results = await getActivityWeatherSuitability({
                lat: coords.lat, lon: coords.lon,
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
            } catch (e: unknown) {
              injectToolResult(`Weather assessment error: ${errorMessage(e)}`);
            }
            continue;
          }
        } catch (e: unknown) {
          console.error("Action parse error:", e);
        }
      }
    },
    [user, navigate, queryClient, toast, injectToolResult],
  );

  // ── Send a message (streaming) ─────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoadingRef.current) return;

      const userMsg: Msg = { role: "user", content: text };
      const allMessages = [...messagesRef.current, userMsg];

      setMessages(allMessages);
      setInput("");
      setIsLoading(true);

      let assistantSoFar = "";

      try {
        await streamChatMessage(
          allMessages,
          (chunk: string) => {
            assistantSoFar += chunk;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant" && prev.length > allMessages.length) {
                return prev.map((m, i) =>
                  i === prev.length - 1 ? { ...m, content: assistantSoFar } : m,
                );
              }
              return [
                ...prev.slice(0, allMessages.length),
                { role: "assistant", content: assistantSoFar },
              ];
            });
          },
          userLang,
        );

        if (ttsEnabledRef.current && assistantSoFar) {
          speakText(assistantSoFar, _ttsLang);
        }

        handleAction(assistantSoFar);
      } catch (e: unknown) {
        const msg: string = errorMessage(e) ?? "";
        if (msg === "RATE_LIMIT") {
          toast({ title: "Rate limited", description: "Too many requests. Please wait a moment.", variant: "destructive" });
        } else if (msg === "INVALID_API_KEY") {
          toast({ title: "API key error", description: "AI API key is invalid or expired.", variant: "destructive" });
        } else if (msg === "NO_API_KEY") {
          toast({ title: "AI unavailable", description: "Set VITE_GROQ_API_KEY to enable the assistant.", variant: "destructive" });
        }
        if (!assistantSoFar) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: msg === "NO_API_KEY"
                ? "I'm running in offline mode. Voice, maps, weather and safety alerts still work. To enable natural-language answers, add a free `VITE_GROQ_API_KEY` to your `.env` (grab one at https://console.groq.com)."
                : "Sorry, I encountered an error. Please try again.",
            },
          ]);
        }
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    },
    [handleAction, toast, userLang],
  );

  // ── Stop voice recording ───────────────────────────────────────────────
  const stopVoice = useCallback(async () => {
    if (!isListeningRef.current) return;
    isListeningRef.current = false;
    setIsListening(false);

    const handle = recordingRef.current;
    recordingRef.current = null;

    if (!handle) {
      setInput("");
      setInterimTranscript("");
      return;
    }

    // Web-speech engine: transcript comes via callback
    if (handle.engine === "web-speech") {
      try {
        await handle.stop();
      } catch { /* ignore */ }
      const transcript = pendingTranscriptRef.current.trim();
      pendingTranscriptRef.current = "";
      setInterimTranscript("");
      if (transcript) {
        setInput(transcript);
        sendMessage(transcript);
      } else {
        setInput("");
      }
      return;
    }

    // Media-recorder engine → Groq Whisper
    setIsTranscribing(true);
    setInput("🎙️ Transcribing…");

    try {
      const audioBlob = await handle.stop();
      const transcript = await transcribeWithGroq(audioBlob, userLang);
      if (transcript) {
        setInput(transcript);
        sendMessage(transcript);
      } else {
        setInput("");
        toast({ title: "No speech detected", description: "Please try again." });
      }
    } catch (err: unknown) {
      setInput("");
      const msg = errorMessage(err) ?? "";
      if (msg === "EMPTY_AUDIO") {
        toast({ title: "No speech detected", description: "Please try again." });
      } else if (msg === "RATE_LIMIT") {
        toast({ title: "Rate limited", description: "Please wait a moment.", variant: "destructive" });
      } else if (msg === "INVALID_API_KEY") {
        toast({ title: "API key error", description: "Groq API key is invalid.", variant: "destructive" });
      } else {
        toast({ title: "Transcription failed", description: "Could not understand audio. Please type instead.", variant: "destructive" });
      }
    } finally {
      setIsTranscribing(false);
      setInterimTranscript("");
    }
  }, [sendMessage, toast, userLang]);

  // ── Start voice input ──────────────────────────────────────────────────
  const startVoice = useCallback(async () => {
    if (!voiceSupported) {
      toast({
        title: "Voice not supported",
        description:
          "Please use Chrome, Edge, or Safari. Firefox needs VITE_GROQ_API_KEY for voice.",
        variant: "destructive",
      });
      return;
    }

    if (isListeningRef.current) { await stopVoice(); return; }

    stopSpeaking(); // avoid mic feedback from Jinny's voice
    pendingTranscriptRef.current = "";
    setInterimTranscript("");

    try {
      const handle = await startGroqRecording({
        language: userLang,
        onInterim: (text) => setInterimTranscript(text),
        onTranscript: (text) => { pendingTranscriptRef.current = text; },
        onError: (err) => {
          isListeningRef.current = false;
          setIsListening(false);
          recordingRef.current = null;
          setInput("");
          setInterimTranscript("");
          if (err === "PERMISSION_DENIED") {
            toast({
              title: "Microphone blocked",
              description: "Please allow microphone access in your browser settings.",
              variant: "destructive",
            });
          } else if (err !== "EMPTY_AUDIO") {
            toast({
              title: "Voice error",
              description: `Recognition error: ${err}. Please try again.`,
              variant: "destructive",
            });
          }
        },
      });
      recordingRef.current = handle;
      isListeningRef.current = true;
      setIsListening(true);
      setInput("");
    } catch (err: unknown) {
      isListeningRef.current = false;
      setIsListening(false);
      recordingRef.current = null;
      const msg = (errorMessage(err) ?? "").toLowerCase();
      if (
        msg.includes("not-allowed") ||
        msg.includes("permission") ||
        msg.includes("denied")
      ) {
        toast({ title: "Microphone blocked", description: "Please allow microphone access.", variant: "destructive" });
      } else if (msg.includes("speech_unsupported")) {
        toast({ title: "Voice not supported", description: errorMessage(err), variant: "destructive" });
      } else {
        toast({ title: "Microphone error", description: errorMessage(err) ?? "Please try again.", variant: "destructive" });
      }
    }
  }, [stopVoice, toast, voiceSupported, userLang]);

  // ── Auto-start voice when wake word fires ─────────────────────────────
  useEffect(() => {
    const handler = () => {
      if (open && !isListeningRef.current) startVoice();
    };
    window.addEventListener("jinny-start-voice", handler);
    return () => window.removeEventListener("jinny-start-voice", handler);
  }, [open, startVoice]);

  // ── Jinny open event ──────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => {
      setOpen(true);
      if (ttsEnabledRef.current) speakJinny("At your service. How can I help?");
    };
    window.addEventListener("jinny-open", handler);
    return () => window.removeEventListener("jinny-open", handler);
  }, []);

  // ── Quick-action pills ────────────────────────────────────────────────
  const handleQuickAction = useCallback(
    (prompt: string) => sendMessage(prompt),
    [sendMessage],
  );
  const [showAllCaps, setShowAllCaps] = useState(false);

  // ── Draggable floating bot button (desktop) ───────────────────────────
  const [pos, setPos] = useState({
    x: typeof window !== "undefined" ? window.innerWidth - 110 : 200,
    y: typeof window !== "undefined" ? window.innerHeight - 180 : 200,
  });
  const dragRef = useRef<{
    startX: number; startY: number;
    startPosX: number; startPosY: number;
    dragging: boolean; pointerDown: boolean;
  }>({ startX: 0, startY: 0, startPosX: 0, startPosY: 0, dragging: false, pointerDown: false });

  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = {
      startX: e.clientX, startY: e.clientY,
      startPosX: pos.x, startPosY: pos.y,
      dragging: false, pointerDown: true,
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

  // ── Placeholder text for the input ────────────────────────────────────
  const inputPlaceholder = isTranscribing
    ? "Transcribing…"
    : isListening
      ? interimTranscript
        ? interimTranscript
        : "Listening… tap mic to stop"
      : "Ask Jinny anything…";

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <>
      {!open && (
        <div
          className="hidden md:block fixed z-50"
          style={{ left: pos.x, top: pos.y }}
        >
          <img
            src={orangeBot}
            alt="Jinny - Your Travel Companion"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="w-20 h-20 cursor-grab active:cursor-grabbing select-none hover:scale-110 transition-transform drop-shadow-lg animate-fade-in touch-none"
            draggable={false}
          />
          <div
            className={`absolute -bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-0.5 rounded-full border shadow-sm transition-all ${
              wakeListening
                ? "bg-card/95 backdrop-blur-sm border-green-500/40"
                : "bg-card/70 backdrop-blur-sm border-border/60"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${wakeListening ? "bg-green-500 animate-pulse" : "bg-muted-foreground/40"}`}
            />
            <span className="text-[9px] text-muted-foreground font-medium whitespace-nowrap">
              {wakeListening ? 'Listening… say "Hey Jinny"' : 'Say "Hey Jinny"'}
            </span>
          </div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 md:inset-auto md:bottom-6 md:right-6 z-[60] w-full h-full md:w-[400px] md:h-[600px] bg-card border-0 md:border border-border md:rounded-2xl shadow-elevated flex flex-col animate-fade-in overflow-hidden">
          <div
            className="flex items-center justify-between px-4 py-3 border-b border-border bg-primary/5"
            style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
          >
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center">
                <img src={orangeBot} alt="Jinny" className="w-8 h-8 object-cover" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-card-foreground">Jinny</h3>
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-success inline-block" />
                  Your AI Travel Agent • {userName}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setTtsEnabled((v) => {
                    if (v) window.speechSynthesis?.cancel();
                    return !v;
                  });
                }}
                title={ttsEnabled ? "Mute Jinny's voice" : "Unmute Jinny's voice"}
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
                  {showAllCaps ? "Less ▲" : `+${PROXY_CAPABILITIES.length - 6} more ▼`}
                </button>
              </div>
            </div>
          )}

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && (
                  <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 mr-2 mt-0.5">
                    <img src={orangeBot} alt="Jinny" className="w-6 h-6 object-cover" />
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
                        {m.content.replace(/```json[\s\S]*?```/g, "✅ *Action executed*")}
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
                  <img src={orangeBot} alt="Jinny" className="w-6 h-6 object-cover" />
                </div>
                <div className="bg-secondary px-3 py-2 rounded-xl rounded-bl-sm flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  <span className="text-[11px] text-muted-foreground">Jinny is thinking…</span>
                </div>
              </div>
            )}
          </div>

          <div
            className="p-3 border-t border-border"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
          >
            {(isListening || isTranscribing) && (
              <div className="flex items-center gap-1.5 mb-2 px-1">
                <span
                  className={`w-2 h-2 rounded-full animate-pulse ${isTranscribing ? "bg-warning" : "bg-destructive"}`}
                />
                <span className="text-[10px] text-muted-foreground">
                  {isTranscribing
                    ? "Transcribing…"
                    : voiceEngine === "web-speech"
                      ? interimTranscript || "Listening… tap mic to send"
                      : "Recording… tap mic to send"}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={isListening ? stopVoice : startVoice}
                disabled={!voiceSupported || isTranscribing}
                title={
                  !voiceSupported
                    ? "Voice not available in this browser"
                    : isTranscribing
                      ? "Transcribing…"
                      : isListening
                        ? "Stop recording & send"
                        : 'Start voice input (or say "Hey Jinny")'
                }
                className={`p-2 rounded-lg transition-colors ${
                  !voiceSupported || isTranscribing
                    ? "opacity-40 cursor-not-allowed text-muted-foreground"
                    : isListening
                      ? "bg-destructive text-destructive-foreground animate-pulse"
                      : "hover:bg-secondary text-muted-foreground"
                }`}
                aria-label={isListening ? "Stop recording" : "Start voice input"}
              >
                {isTranscribing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isListening ? (
                  <MicOff className="w-4 h-4" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </button>
              <input
                type="text"
                placeholder={inputPlaceholder}
                value={input}
                onChange={(e) => {
                  if (!isListening && !isTranscribing) setInput(e.target.value);
                }}
                readOnly={isListening || isTranscribing}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (isListening) stopVoice();
                    else if (!isTranscribing) sendMessage(input);
                  }
                }}
                className="flex-1 px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <button
                onClick={() => {
                  if (isListening) stopVoice();
                  else if (!isTranscribing) sendMessage(input);
                }}
                disabled={(!input.trim() && !isListening) || isLoading || isTranscribing}
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


