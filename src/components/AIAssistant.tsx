import { useState, useRef, useEffect, useCallback } from "react";
import { getSavedLanguage } from "@/services/translate";
import { errorMessage } from "@/lib/errors";
import {
  startGroqRecording,
  transcribeWithGroq,
  speakText,
  stopSpeaking,
  preloadVoices,
  createSpeechStream,
  type SpeechStream,
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
  Phone,
  PhoneOff,
} from "lucide-react";
import orangeBot from "@/assets/orange-bot.png";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import {
  extractBudget,
  extractDate,
  extractDays,
  extractDestination,
  invalidatePersonalContext,
  streamChatMessage,
} from "@/services/aiChat";
import { handleGeminiError } from "@/services/gemini";
import { amadeusFlightOffers, amadeusHotelList } from "@/services/amadeus";
import { trafficFlow, trafficIncidents } from "@/services/traffic";
import { formatLocalDate, parseLocalDate } from "@/lib/date";
import { toAmount } from "@/lib/budget";
import { isMicClaimed, onMicClaimChange } from "@/lib/micCoordinator";
import { isHangUpPhrase, matchWakePhrase } from "@/lib/wakeWord";
import { formatMoney, normalizeCurrencyCode } from "@/lib/currency";
import { loadTripBudgets } from "@/services/tripBudget";
import {
  getWeatherContext,
  getClimateAwareRoute,
  geocodeDestination,
  getActivityWeatherSuitability,
} from "@/services/climate";
import { fetchSafetyAlerts } from "@/services/gnews";

type Msg = { role: "user" | "assistant"; content: string; kind?: "tool" };

function toConversationMessages(messages: Msg[]) {
  return messages.map((message) => ({
    role: message.kind === "tool" ? ("user" as const) : message.role,
    content:
      message.kind === "tool"
        ? `[Tool result]\n${message.content}`
        : message.content,
  }));
}

function validIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return formatLocalDate(parseLocalDate(value)) === value;
}

function autoGenerationRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function stripActionBlocks(content: string): string {
  return content
    .replace(/```json\s*([\s\S]*?)```/g, (block, payload: string) => {
      try {
        return typeof JSON.parse(payload)?.action === "string" ? "" : block;
      } catch {
        return block;
      }
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function assistantDisplayContent(content: string): string {
  const withoutActions = stripActionBlocks(content);
  const unfinishedAction = withoutActions.indexOf("```json");
  return unfinishedAction >= 0
    ? withoutActions.slice(0, unfinishedAction).trim()
    : withoutActions;
}

function containsActionBlock(content: string): boolean {
  return /```json\s*\{[\s\S]*?"action"\s*:/i.test(content);
}

const PROXY_CAPABILITIES = [
  { icon: LayoutDashboard, label: "Dashboard", prompt: "Show me my trips and travel stats." },
  { icon: Plane, label: "Flights", prompt: "Search flights for my next trip." },
  { icon: CloudSun, label: "Weather", prompt: "Check the weather for my upcoming trip destination." },
  { icon: Car, label: "Traffic", prompt: "Check traffic conditions near my trip and tell me whether the data is live or estimated." },
  { icon: Navigation, label: "Navigate", prompt: "Help me navigate to my next activity." },
  { icon: Brain, label: "Plan Trip", prompt: "Create a new trip for me based on my preferences." },
  { icon: Users, label: "Friends", prompt: "Open my friends and travel companions." },
  { icon: Compass, label: "Explore", prompt: "Show me places to explore near my destination." },
  { icon: BookOpen, label: "Guide", prompt: "Generate a travel guide for my destination." },
  { icon: Wallet, label: "Budget", prompt: "Analyze my spending and suggest ways to save money." },
  { icon: Shield, label: "Safety", prompt: "Show curated safety guidance for my destination." },
  { icon: Hotel, label: "Hotels", prompt: "Find hotels for my upcoming trip." },
];

// ── Small module-level TTS language holder ──────────────────────────────────
let _ttsLang = "en";
function speakJinny(text: string) {
  speakText(text, _ttsLang);
}

// ── Voice call ──────────────────────────────────────────────────────────────
type CallPhase = "connecting" | "listening" | "thinking" | "speaking" | "muted";

const CALL_PHASE_LABEL: Record<CallPhase, string> = {
  connecting: "Connecting…",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking · tap Jinny to interrupt",
  muted: "Mic muted",
};

/** Short, varied openers — the same line every time is what sounds robotic. */
function callGreeting(firstName: string | null): string {
  const name = firstName ? `, ${firstName}` : "";
  const lines = [
    `Hey${name}! What's up?`,
    `Hi${name}, I'm here. What do you need?`,
    `Yes${name}? I'm listening.`,
    `Hey${name}, what can I do for you?`,
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

function formatCallTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
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

  // Hands-free voice call: listen → think → speak → listen, with no taps.
  const [callActive, setCallActive] = useState(false);
  const [callPhase, setCallPhase] = useState<CallPhase>("connecting");
  const [callMuted, setCallMuted] = useState(false);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [callCaption, setCallCaption] = useState("");
  const [callClock, setCallClock] = useState(Date.now());
  const callActiveRef = useRef(false);
  const callMutedRef = useRef(false);
  const callListenStartingRef = useRef(false);
  const silentTurnsRef = useRef(0);
  const speechStreamRef = useRef<SpeechStream | null>(null);
  // Late-bound so the wake listener and speech callbacks reach current logic.
  const beginCallRef = useRef<(opts?: { firstUtterance?: string }) => void>(() => {});
  const endCallRef = useRef<(farewell?: string) => void>(() => {});
  const listenTurnRef = useRef<() => void>(() => {});

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
  const actionResultsRef = useRef<string[]>([]);
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
  // Spoken greetings use a real first name only; an email prefix read aloud
  // ("hi, a-k-dot-ninety-one") sounds broken.
  const firstName =
    (user?.user_metadata?.name as string | undefined)?.trim().split(/\s+/)[0] || null;

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);
  useEffect(() => { ttsEnabledRef.current = ttsEnabled; }, [ttsEnabled]);

  useEffect(() => { preloadVoices(); }, []);

  // ── Wake-word listener ("Hey Jinny") ────────────────────────────────────
  // Runs in the background while the panel is closed. The wake phrase starts a
  // hands-free call, and anything said straight after it ("Hey Jinny, what's
  // the weather in Goa?") becomes the first request instead of being dropped.
  //
  // Why it used to stay silent: results under 0.25 confidence were skipped,
  // but Android Chrome reports 0 for every final result; the phrase had to
  // match one exact spelling ("hey, Jenny" or "Hey Jeannie" never did); and the
  // mic only opened after a spoken greeting whose completion never fired when
  // the browser blocked speech. See lib/wakeWord.ts and speakText().
  useEffect(() => {
    if (open) {
      wakeActiveRef.current = false;
      try { wakeRecognitionRef.current?.abort(); } catch { /* ignore */ }
      setWakeListening(false);
      return;
    }

    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) return;

    wakeActiveRef.current = true;
    // Indian-English recognition hears "Jinny" far more reliably than en-US.
    // Other English locales (en-GB, en-AU, …) are left as the browser has them.
    const browserLang = navigator.language || "";
    const wakeLang = /^en-/i.test(browserLang) && !/^en-US$/i.test(browserLang) ? browserLang : "en-IN";

    // The wake listener is a background listener: it must never compete with a
    // mic the user started (Chrome aborts the older of two sessions). It stands
    // down while any mic is claimed and resumes after release. See
    // lib/micCoordinator.ts.
    let running = false;
    let fired = false;
    let blocked = false;
    let failures = 0;
    let restartTimer: number | undefined;
    let wakeTimer: number | undefined;

    const scheduleStart = (delay: number) => {
      window.clearTimeout(restartTimer);
      restartTimer = window.setTimeout(() => {
        try { start(); } catch { /* ignore */ }
      }, delay);
    };

    const fire = (transcript: string) => {
      if (fired) return;
      const match = matchWakePhrase(transcript);
      if (!match) return;
      fired = true;
      window.clearTimeout(wakeTimer);
      wakeActiveRef.current = false;
      try { wakeRecognitionRef.current?.abort(); } catch { /* ignore */ }
      setWakeListening(false);
      beginCallRef.current({ firstUtterance: match.remainder || undefined });
    };

    // After a refused permission (or a browser that wants a gesture first),
    // retry on the next tap or key press rather than giving up for good —
    // unless the mic is denied outright, where retrying would only re-prompt.
    const onGesture = () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      if (!wakeActiveRef.current) return;
      blocked = false;
      failures = 0;
      scheduleStart(0);
    };
    const armOnGesture = () => {
      const listen = () => {
        window.addEventListener("pointerdown", onGesture, { once: true });
        window.addEventListener("keydown", onGesture, { once: true });
      };
      const permissions = (navigator as any).permissions;
      if (!permissions?.query) { listen(); return; }
      Promise.resolve(permissions.query({ name: "microphone" }))
        .then((status: { state?: string }) => { if (status?.state !== "denied") listen(); })
        .catch(listen);
    };

    const start = () => {
      if (!wakeActiveRef.current || running || blocked || fired) return;
      if (isMicClaimed() || document.hidden) return;

      const recognition = new SR();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = wakeLang;
      recognition.maxAlternatives = 3;
      wakeRecognitionRef.current = recognition;

      recognition.onstart = () => setWakeListening(true);
      recognition.onresult = (event: any) => {
        failures = 0;
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          let heard: string | null = null;
          for (let a = 0; a < result.length; a++) {
            const transcript = result[a]?.transcript ?? "";
            if (matchWakePhrase(transcript)) { heard = transcript; break; }
          }
          if (!heard) continue;
          if (result.isFinal) { fire(heard); return; }
          // Still an interim result: give the user a moment to finish the
          // sentence (Chrome finalises after a short pause), but don't depend
          // on it — Safari can leave continuous results interim indefinitely.
          const latest = heard;
          window.clearTimeout(wakeTimer);
          wakeTimer = window.setTimeout(() => fire(latest), 1400);
        }
      };
      recognition.onerror = (e: any) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture") {
          blocked = true;
        } else if (e.error === "network") {
          failures += 1;
        }
      };
      recognition.onend = () => {
        running = false;
        setWakeListening(false);
        if (fired || !wakeActiveRef.current) return;
        if (blocked) { armOnGesture(); return; }
        if (isMicClaimed()) return; // resumes on release
        // Chrome ends continuous sessions every so often — restart quickly.
        // Back off when sessions keep failing (offline, a blocked speech
        // service) instead of retrying twice a second forever.
        scheduleStart(failures > 0 ? Math.min(30_000, 1000 * 2 ** failures) : 300);
      };

      try {
        recognition.start();
        running = true;
      } catch {
        failures += 1;
        scheduleStart(Math.min(30_000, 1000 * 2 ** failures));
      }
    };

    const unsubscribe = onMicClaimChange((claimed) => {
      if (claimed) {
        window.clearTimeout(restartTimer);
        // abort(), not stop(): free the mic now rather than after Chrome
        // finishes processing whatever it last heard.
        try { wakeRecognitionRef.current?.abort(); } catch { /* ignore */ }
      } else if (wakeActiveRef.current) {
        // Give Chrome a moment to fully release the previous session.
        scheduleStart(800);
      }
    });

    // Don't hold the mic for a background tab; pick up again when it's back.
    const onVisibility = () => {
      if (document.hidden) {
        window.clearTimeout(restartTimer);
        try { wakeRecognitionRef.current?.abort(); } catch { /* ignore */ }
      } else {
        scheduleStart(300);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    start();

    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      window.clearTimeout(restartTimer);
      window.clearTimeout(wakeTimer);
      wakeActiveRef.current = false;
      try { wakeRecognitionRef.current?.abort(); } catch { /* ignore */ }
      setWakeListening(false);
    };
  }, [open]);

  // ── Cleanup when the panel closes ───────────────────────────────────────
  useEffect(() => {
    if (!open) {
      endCallRef.current();
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
          content: `Hey ${userName}! 👋 I'm **Jinny** — your travel assistant! 🧡\n\nI can:\n- 🧠 Personalize suggestions using your saved travel preferences\n- 🗺️ Create trips and generate itineraries\n- 🌦️ Check forecasts and routes when you ask\n- 💰 Summarize your trip budget and logged expenses\n\nWhat would you like to do?`,
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
    actionResultsRef.current.push(content);
    setMessages((prev) => [
      ...prev,
      { role: "assistant" as const, content, kind: "tool" as const },
    ]);
  }, []);

  // ── Handle AI-requested actions ─────────────────────────────────────────
  const handleAction = useCallback(
    async (content: string, sourceUserText: string): Promise<string[]> => {
      actionResultsRef.current = [];
      const jsonMatches = [...content.matchAll(/```json\s*([\s\S]*?)```/g)];
      if (!jsonMatches.length) return [];

      for (const match of jsonMatches) {
        try {
          const action = JSON.parse(match[1]);
          const act: string = action.action ?? "";

          if (act === "navigate_to" && action.path) {
            toast({ title: `🗺️ ${action.label || `Opening ${action.path}`}` });
            navigate(action.path);
            injectToolResult(`Opened ${action.path}.`);
            continue;
          }

          if (act === "create_trip" && user) {
            const destination =
              (typeof action.destination === "string" && action.destination.trim()) ||
              extractDestination(sourceUserText) ||
              "";
            if (!destination) {
              injectToolResult("I need a destination before I can create the trip.");
              continue;
            }

            const requestedDate = validIsoDate(action.start_date)
              ? action.start_date
              : extractDate(sourceUserText);
            const startDate = validIsoDate(requestedDate)
              ? requestedDate
              : formatLocalDate(new Date());
            const actionDays = Number(action.days);
            const requestedDays = Number.isInteger(actionDays) && actionDays > 0
              ? actionDays
              : extractDays(sourceUserText);
            const days = Math.min(30, Math.max(1, requestedDays || 3));
            const parsedBudget = extractBudget(sourceUserText);
            const budget = action.budget ?? parsedBudget?.amount;
            const budgetAmount = toAmount(budget);
            const currency = action.currency ?? parsedBudget?.currency ?? "INR";
            const endDate = parseLocalDate(startDate);
            // Trip end dates are inclusive calendar dates.
            endDate.setDate(endDate.getDate() + days - 1);
            const endStr = formatLocalDate(endDate);

            const { data: createdTrip, error: insertError } = await supabase
              .from("trips")
              .insert({
                name: action.name || `Trip to ${destination}`,
                destination,
                country: action.country || "",
                start_date: startDate,
                end_date: endStr,
                budget_total: budgetAmount,
                currency: normalizeCurrencyCode(currency),
                organizer_id: user.id,
              })
              .select("id")
              .single();
            if (insertError) throw insertError;

            queryClient.invalidateQueries({ queryKey: ["trips"] });
            toast({
              title: "Trip created! 🎉",
              description: budgetAmount > 0
                ? `${destination} trip created. Starting the itinerary now.`
                : `${destination} trip created. Add a budget to generate its itinerary.`,
            });
            if (createdTrip?.id) {
              navigate(`/itinerary/${createdTrip.id}`, {
                state: budgetAmount > 0
                  ? {
                      autoGenerateItinerary: true,
                      onlyIfEmpty: true,
                      autoGenerateRequestId: autoGenerationRequestId(),
                    }
                  : null,
              });
            }
            injectToolResult(
              budgetAmount > 0
                ? `Created a ${days}-day trip to **${destination}** from ${startDate} to ${endStr}. The itinerary is starting to generate.`
                : `Created a ${days}-day trip to **${destination}** from ${startDate} to ${endStr}. Add a trip budget before generating its itinerary.`,
            );
            continue;
          }

          if (act === "create_trip" && !user) {
            injectToolResult("Sign in before creating a trip.");
            continue;
          }

          if (act === "generate_itinerary" && action.trip_id) {
            if (!user) {
              injectToolResult("Sign in before generating an itinerary.");
              continue;
            }
            const { data: targetTrip, error: tripLookupError } = await supabase
              .from("trips")
              .select("id, budget_total")
              .eq("id", action.trip_id)
              .maybeSingle();
            if (tripLookupError) throw tripLookupError;
            if (!targetTrip) {
              injectToolResult("I couldn't find that trip or you don't have access to it.");
              continue;
            }
            if (Number(targetTrip.budget_total) <= 0) {
              navigate(`/itinerary/${targetTrip.id}`);
              injectToolResult("Opened the trip planner. Set a positive budget before generating its itinerary.");
              continue;
            }
            toast({
              title: "🧠 Starting itinerary generation…",
              description: "Opening your trip planner.",
            });
            navigate(`/itinerary/${targetTrip.id}`, {
              state: {
                autoGenerateItinerary: true,
                autoGenerateRequestId: autoGenerationRequestId(),
              },
            });
            injectToolResult("Opened the trip planner and requested itinerary generation. The plan is still generating; use the planner status to confirm when it finishes.");
            continue;
          }

          if (act === "budget_alert") {
            // Figures come from the database via lib/budget.ts. The model's
            // own "spent"/"remaining" are ignored: it never saw the expenses,
            // and used to echo the example numbers from its prompt.
            const { data: userTrips } = await supabase
              .from("trips")
              .select("id, name, budget_total, currency, start_date, end_date")
              .order("start_date", { ascending: false })
              .limit(8);
            const trip =
              userTrips?.find((t) => t.id === action.trip_id) ?? userTrips?.[0];
            if (!trip) {
              injectToolResult("💰 You don't have any trips yet, so there's no budget to check.");
            } else {
              const b = (await loadTripBudgets([trip])).get(trip.id);
              if (!b) {
                injectToolResult(`💰 Couldn't load spending for **${trip.name}** right now.`);
              } else {
                const money = (n: number) => formatMoney(n, b.currency);
                const s = b.summary;
                const headline =
                  s.budget > 0
                    ? `${money(s.spent)} spent of ${money(s.budget)} · ${
                        s.remaining >= 0 ? `${money(s.remaining)} left` : `${money(-s.remaining)} over`
                      }`
                    : `No budget set · ${money(s.spent)} spent`;
                toast({ title: `💰 ${trip.name}`, description: headline });
                injectToolResult(
                  `💰 **${trip.name}**\n` +
                    (s.budget > 0 ? `- Budget: ${money(s.budget)}\n` : "- Budget: not set\n") +
                    `- Planned (itinerary): ${money(s.planned)}\n` +
                    `- Spent (logged expenses): ${money(s.spent)}\n` +
                    (s.budget > 0
                      ? `- ${s.remaining >= 0 ? "Remaining" : "Over budget by"}: ${money(Math.abs(s.remaining))}\n`
                      : ""),
                );
              }
            }
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
              const data = await amadeusHotelList({
                cityCode: action.cityCode ?? "",
                cityName: action.destination,
                radius: 5,
                checkInDate: action.checkInDate,
                checkOutDate: action.checkOutDate,
                adults: action.adults,
              });
              const hotels = data.data;
              const place = data.data[0]?.address.cityName ?? action.destination ?? action.cityCode;
              if (!hotels.length) {
                injectToolResult("🏨 OpenStreetMap lists no places to stay within 5 km of that location.");
              } else {
                let result = `🏨 **Places to stay in ${place}** (${hotels.length} found, from OpenStreetMap)\n\n`;
                for (const h of hotels.slice(0, 8)) {
                  const dist = h.distance?.value != null ? ` · 📍 ${h.distance.value} km from centre` : "";
                  result += `• **${h.name}**${dist} — [prices on Booking.com](${h.bookingLinks.booking})\n`;
                }
                result += `\n_Ratings, prices and availability come from the booking site._\n`;
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
                if (f.localTime) {
                  result += `- **Local time:** ${f.localTime}${f.timezone ? ` (${f.timezone})` : ""}\n`;
                }
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
            injectToolResult("Opened Explore. Use the search field to look up those places.");
            continue;
          }

          if (act === "guide_search") {
            toast({ title: "📖 Opening Travel Guide", description: action.destination ?? "" });
            navigate("/guide");
            injectToolResult("Opened the travel guide.");
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

          if (act === "check_safety") {
            let destination =
              typeof action.destination === "string" ? action.destination.trim() : "";
            if (!destination && user) {
              const { data: recentTrip } = await supabase
                .from("trips")
                .select("destination")
                .order("start_date", { ascending: false })
                .limit(1)
                .maybeSingle();
              destination = recentTrip?.destination ?? "";
            }
            if (!destination) {
              injectToolResult("Tell me a destination so I can show its curated safety guidance.");
              continue;
            }

            const alerts = await fetchSafetyAlerts(destination);
            const guidance = alerts.length
              ? alerts.map((alert) => `- **${alert.title}** (${alert.severity}): ${alert.description}\n  [Reference guidance](${alert.url})`).join("\n")
              : "No curated guidance matched this destination.";
            injectToolResult(
              `**Curated safety guidance for ${destination}**\n\n${guidance}\n\nThis is static general guidance, not live incident reporting or an official destination risk rating. Check current local and government advisories before travel.`,
            );
            continue;
          }
        } catch (e: unknown) {
          console.error("Action parse error:", e);
          injectToolResult(`I couldn't complete that action: ${errorMessage(e)}`);
        }
      }
      return actionResultsRef.current;
    },
    [user, navigate, queryClient, toast, injectToolResult],
  );

  // ── Send a message (streaming) ─────────────────────────────────────────
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoadingRef.current) return;

      const userMsg: Msg = { role: "user", content: text };
      const visibleHistory = messagesRef.current;
      const allMessages = [...toConversationMessages(visibleHistory), userMsg];

      setMessages([...visibleHistory, userMsg]);
      setInput("");
      // Set the ref now, not after the next render: the call loop checks it the
      // moment speech finishes, which can be before React re-renders.
      isLoadingRef.current = true;
      setIsLoading(true);

      // On a call, speak each sentence as soon as it streams in rather than
      // reading the whole reply out after it finishes.
      const inCall = callActiveRef.current;
      const speech = inCall
        ? createSpeechStream(_ttsLang, {
            onSpeak: (sentence) => {
              setCallPhase("speaking");
              setCallCaption(sentence);
            },
          })
        : null;
      speechStreamRef.current = speech;
      if (inCall) setCallPhase("thinking");

      let assistantSoFar = "";

      try {
        await streamChatMessage(
          allMessages,
          (chunk: string) => {
            assistantSoFar += chunk;
            speech?.push(chunk);
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              const assistantIndex = allMessages.length;
              const visibleContent = assistantDisplayContent(assistantSoFar);
              if (last?.role === "assistant" && !last.kind && prev.length > assistantIndex) {
                return prev.map((m, i) => i === prev.length - 1
                  ? { ...m, content: visibleContent }
                  : m);
              }
              return [...prev, { role: "assistant", content: visibleContent }];
            });
          },
          userLang,
          undefined,
          { voice: inCall },
        );

        const actionResults = await handleAction(assistantSoFar, text);
        if (actionResults.length > 0) {
          // Trips, budgets or itineraries may have just changed.
          invalidatePersonalContext();
          const visibleActionText = "Working on that now…";
          setMessages((prev) => prev.map((message, index) =>
            index === allMessages.length ? { ...message, content: visibleActionText } : message,
          ));

          const followUpMessages = [
            ...allMessages,
            { role: "assistant" as const, content: assistantSoFar },
            {
              role: "user" as const,
              content:
                `[Tool results]\n${actionResults.join("\n\n")}\n\n` +
                "Use these results to answer the user's original request. Summarize what succeeded or failed. Do not emit or repeat action blocks." +
                (inCall ? " You are speaking on the call: answer in one or two short spoken sentences." : ""),
            },
          ];
          let finalResponse = "";
          try {
            await streamChatMessage(
              followUpMessages,
              (chunk) => {
                finalResponse += chunk;
                speech?.push(chunk);
                setMessages((prev) => {
                  const last = prev[prev.length - 1];
                  if (last?.role === "assistant" && !last.kind) {
                    return prev.map((message, index) => index === prev.length - 1
                      ? { ...message, content: finalResponse }
                      : message);
                  }
                  return [...prev, { role: "assistant", content: finalResponse }];
                });
              },
              userLang,
              "GENERAL_CHAT",
              { voice: inCall },
            );
          } catch (followUpError) {
            console.error("Tool-result summary failed:", followUpError);
          }

          const finalText = stripActionBlocks(finalResponse) ||
            "The action result is shown above.";
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && !last.kind) {
              return prev.map((message, index) => index === prev.length - 1
                ? { ...message, content: finalText }
                : message);
            }
            return [...prev, { role: "assistant", content: finalText }];
          });
          if (speech) {
            if (!finalResponse.trim()) speech.push(" The details are on screen.");
          } else if (ttsEnabledRef.current) {
            speakText(finalText, _ttsLang);
          }
        } else if (containsActionBlock(assistantSoFar)) {
          const fallbackText = "I couldn't run the requested action. Please try again.";
          setMessages((prev) => prev.map((message, index) =>
            index === allMessages.length ? { ...message, content: fallbackText } : message,
          ));
          if (speech) speech.push(" Hmm, I couldn't do that one. Want to try again?");
          else if (ttsEnabledRef.current) speakText(fallbackText, _ttsLang);
        } else if (!speech && ttsEnabledRef.current && assistantSoFar) {
          speakText(assistantSoFar, _ttsLang);
        }
      } catch (e: unknown) {
        const msg: string = errorMessage(e) ?? "";
        if (msg === "RATE_LIMIT") {
          toast({ title: "Rate limited", description: "Too many requests. Please wait a moment.", variant: "destructive" });
        } else if (msg === "AUTH_REQUIRED" || msg === "INVALID_API_KEY") {
          toast({ title: "Sign in again", description: "Your hosted AI session expired. Sign in and retry.", variant: "destructive" });
        } else if (msg === "NO_API_KEY") {
          toast({ title: "AI unavailable", description: "Sign in to use hosted AI, or switch to on-device AI in Settings.", variant: "destructive" });
        } else if (msg === "NO_SESSION" || msg === "BACKEND_UNAVAILABLE") {
          toast({ title: "Hosted AI unavailable", description: handleGeminiError(e), variant: "destructive" });
        } else if (msg === "MODEL_UNAVAILABLE") {
          toast({ title: "AI model retired", description: handleGeminiError(e), variant: "destructive" });
        }
        if (!assistantSoFar) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: ["NO_API_KEY", "NO_SESSION", "BACKEND_UNAVAILABLE"].includes(msg)
                ? `${handleGeminiError(e)} Weather, maps and curated safety guidance need network access.`
                : "Sorry, I encountered an error. Please try again.",
            },
          ]);
        }
        console.error(e);
        if (speech) {
          speech.push(
            msg === "RATE_LIMIT"
              ? " Sorry, I'm getting too many requests right now. Give me a few seconds and ask again."
              : " Sorry, something went wrong on my end. Could you say that again?",
          );
        }
      } finally {
        isLoadingRef.current = false;
        setIsLoading(false);
        if (speech) {
          speech.end();
          // Jinny has finished talking (or was interrupted): the user's turn.
          void speech.finished.then(() => {
            if (speechStreamRef.current === speech) speechStreamRef.current = null;
            if (callActiveRef.current) window.setTimeout(() => listenTurnRef.current(), 250);
          });
        }
      }
    },
    [handleAction, toast, userLang],
  );

  // ── What to do with something the user said ─────────────────────────────
  // On a call, a short "bye" / "that's all" hangs up like it would with a
  // person, and silence gets a gentle check-in instead of an error toast.
  const handleHeard = useCallback((transcript: string) => {
    if (callActiveRef.current) {
      silentTurnsRef.current = 0;
      if (isHangUpPhrase(transcript)) {
        const farewell = "Okay, talk soon! Have a great trip.";
        setMessages((prev) => [
          ...prev,
          { role: "user", content: transcript },
          { role: "assistant", content: farewell },
        ]);
        setInput("");
        endCallRef.current(farewell);
        return;
      }
    }
    setInput(transcript);
    void sendMessage(transcript);
  }, [sendMessage]);

  const onCallSilence = useCallback(() => {
    if (!callActiveRef.current) return;
    silentTurnsRef.current += 1;
    if (silentTurnsRef.current >= 3) {
      const farewell = "I'll let you go for now. Just say Hey Jinny whenever you need me.";
      setMessages((prev) => [...prev, { role: "assistant", content: farewell }]);
      endCallRef.current(farewell);
    } else if (silentTurnsRef.current === 2) {
      setCallPhase("speaking");
      setCallCaption("Still there?");
      speakText("Still there?", _ttsLang, () => listenTurnRef.current());
    } else {
      window.setTimeout(() => listenTurnRef.current(), 250);
    }
  }, []);

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
        handleHeard(transcript);
      } else {
        setInput("");
        onCallSilence();
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
        handleHeard(transcript);
      } else {
        setInput("");
        if (callActiveRef.current) onCallSilence();
        else toast({ title: "No speech detected", description: "Please try again." });
      }
    } catch (err: unknown) {
      setInput("");
      const msg = errorMessage(err) ?? "";
      if (msg === "EMPTY_AUDIO" && callActiveRef.current) {
        onCallSilence();
      } else if (msg === "EMPTY_AUDIO") {
        toast({ title: "No speech detected", description: "Please try again." });
      } else if (msg === "RATE_LIMIT") {
        toast({ title: "Rate limited", description: "Please wait a moment.", variant: "destructive" });
      } else if (msg === "AUTH_REQUIRED" || msg === "INVALID_API_KEY") {
        toast({ title: "Sign in again", description: "Your hosted AI session expired. Sign in and retry.", variant: "destructive" });
      } else {
        toast({ title: "Transcription failed", description: "Could not understand audio. Please type instead.", variant: "destructive" });
      }
      if (callActiveRef.current && msg !== "EMPTY_AUDIO") endCallRef.current();
    } finally {
      setIsTranscribing(false);
      setInterimTranscript("");
    }
  }, [handleHeard, onCallSilence, toast, userLang]);

  // Lets the recognition engine's onEnd reach the latest stopVoice
  const stopVoiceRef = useRef(stopVoice);
  useEffect(() => { stopVoiceRef.current = stopVoice; }, [stopVoice]);

  // ── Start voice input ──────────────────────────────────────────────────
  const startVoice = useCallback(async () => {
    if (!voiceSupported) {
      toast({
        title: "Voice not supported",
        description:
          "Please use Chrome, Edge, or Safari. Voice transcription requires a signed-in account and hosted AI configuration.",
        variant: "destructive",
      });
      return;
    }

    if (isListeningRef.current) { await stopVoice(); return; }
    if (isLoadingRef.current) {
      // A reply is still streaming; say so rather than ignoring the tap.
      toast({ title: "Jinny is still replying", description: "Tap the mic again once the answer finishes." });
      return;
    }

    stopSpeaking(); // avoid mic feedback from Jinny's voice
    pendingTranscriptRef.current = "";
    setInterimTranscript("");

    try {
      const handle = await startGroqRecording({
        language: userLang,
        onInterim: (text) => setInterimTranscript(text),
        onTranscript: (text) => { pendingTranscriptRef.current = text; },
        // Recognition ends by itself after a pause — send what was heard
        onEnd: () => { void stopVoiceRef.current(); },
        onError: (err) => {
          isListeningRef.current = false;
          setIsListening(false);
          recordingRef.current = null;
          pendingTranscriptRef.current = "";
          setInput("");
          setInterimTranscript("");
          // On a call, silence or a brief interruption is just a quiet turn.
          if (callActiveRef.current && (err === "EMPTY_AUDIO" || err === "INTERRUPTED")) {
            onCallSilence();
            return;
          }
          // Anything else means the mic can't work right now; hang up cleanly
          // rather than leaving a call that can't hear.
          if (callActiveRef.current) endCallRef.current();
          if (err === "PERMISSION_DENIED") {
            toast({
              title: "Microphone blocked",
              description: "Please allow microphone access in your browser settings.",
              variant: "destructive",
            });
          } else if (err === "EMPTY_AUDIO") {
            toast({ title: "No speech detected", description: "Tap the mic and try again." });
          } else if (err === "INTERRUPTED") {
            toast({ title: "Voice input was interrupted", description: "Another app or tab may be using the microphone. Tap the mic and try again." });
          } else if (err === "NO_MICROPHONE") {
            toast({
              title: "No microphone found",
              description: "Connect a microphone and try again.",
              variant: "destructive",
            });
          } else if (err === "SPEECH_SERVICE_UNAVAILABLE") {
            toast({
              title: "Speech service unreachable",
              description: isGroqTranscriptionAvailable()
                ? "Switching to backup transcription — tap the mic again."
                : "This browser can't reach its speech service (common in Brave or offline). Try Chrome, Edge or Safari, or type instead.",
              variant: "destructive",
            });
          } else {
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
      if (callActiveRef.current) endCallRef.current();
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
  }, [stopVoice, onCallSilence, toast, voiceSupported, userLang]);

  // ── Voice call ───────────────────────────────────────────────────────
  const startVoiceRef = useRef(startVoice);
  useEffect(() => { startVoiceRef.current = startVoice; }, [startVoice]);

  /** The user's turn: open the mic, unless muted or Jinny is mid-reply. */
  const listenTurn = useCallback(() => {
    if (!callActiveRef.current) return;
    if (callMutedRef.current) { setCallPhase("muted"); return; }
    if (isListeningRef.current || isLoadingRef.current || callListenStartingRef.current) return;
    callListenStartingRef.current = true;
    setCallPhase("listening");
    setCallCaption("");
    void startVoiceRef.current().finally(() => {
      callListenStartingRef.current = false;
    });
  }, []);

  const endCall = useCallback((farewell?: string) => {
    if (!callActiveRef.current) return;
    callActiveRef.current = false;
    setCallActive(false);
    setCallStartedAt(null);
    setCallCaption("");
    speechStreamRef.current?.cancel();
    speechStreamRef.current = null;
    if (isListeningRef.current) {
      isListeningRef.current = false;
      recordingRef.current?.abort();
      recordingRef.current = null;
      setIsListening(false);
      setInterimTranscript("");
      setInput("");
    }
    if (farewell) speakText(farewell, _ttsLang);
    else stopSpeaking();
  }, []);

  const beginCall = useCallback((opts: { firstUtterance?: string } = {}) => {
    if (callActiveRef.current) return;
    setOpen(true);
    if (!voiceSupported) {
      toast({
        title: "Voice calls aren't available here",
        description: "This browser can't capture speech. Try Chrome, Edge or Safari, or type to Jinny.",
        variant: "destructive",
      });
      return;
    }
    callActiveRef.current = true;
    callMutedRef.current = false;
    silentTurnsRef.current = 0;
    setCallActive(true);
    setCallMuted(false);
    setCallStartedAt(Date.now());
    setCallCaption("");

    // "Hey Jinny, what's the weather in Goa?" — answer it straight away.
    if (opts.firstUtterance) {
      handleHeard(opts.firstUtterance);
      return;
    }
    const greeting = callGreeting(firstName);
    setCallPhase("speaking");
    setCallCaption(greeting);
    // speakText reports completion even when the browser refuses to speak,
    // so the mic always opens after the greeting.
    speakText(greeting, _ttsLang, () => listenTurnRef.current());
  }, [firstName, handleHeard, toast, voiceSupported]);

  /** Cut Jinny off mid-sentence, like talking over someone on a call. */
  const interruptJinny = useCallback(() => {
    if (!callActiveRef.current) return;
    speechStreamRef.current?.cancel();
    stopSpeaking();
    // If a reply is still being generated, the turn passes back once it ends.
    if (!isLoadingRef.current) listenTurnRef.current();
  }, []);

  const toggleCallMute = useCallback(() => {
    const muted = !callMutedRef.current;
    callMutedRef.current = muted;
    setCallMuted(muted);
    if (muted) {
      if (isListeningRef.current) {
        isListeningRef.current = false;
        recordingRef.current?.abort();
        recordingRef.current = null;
        setIsListening(false);
        setInterimTranscript("");
        setInput("");
      }
      setCallPhase("muted");
    } else {
      listenTurnRef.current();
    }
  }, []);

  useEffect(() => { beginCallRef.current = beginCall; }, [beginCall]);
  useEffect(() => { endCallRef.current = endCall; }, [endCall]);
  useEffect(() => { listenTurnRef.current = listenTurn; }, [listenTurn]);

  // Call timer
  useEffect(() => {
    if (!callActive) return;
    const timer = window.setInterval(() => setCallClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [callActive]);

  // ── Jinny open event ──────────────────────────────────────────────────
  // `{ detail: { call: true } }` comes from voice commands ("open Jinny"),
  // which should continue hands-free rather than wait for a tap.
  useEffect(() => {
    const handler = (event: Event) => {
      if ((event as CustomEvent<{ call?: boolean }>).detail?.call) {
        beginCallRef.current();
        return;
      }
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
                  Your AI Travel Assistant • {userName}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {voiceSupported && (
                <button
                  onClick={() => (callActive ? endCall() : beginCall())}
                  title={callActive ? "End voice call" : "Start a hands-free voice call"}
                  aria-label={callActive ? "End voice call" : "Start voice call"}
                  className={`p-1.5 rounded-lg transition-colors ${
                    callActive
                      ? "text-destructive hover:bg-destructive/10"
                      : "text-primary hover:bg-primary/10"
                  }`}
                >
                  {callActive ? <PhoneOff className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
                </button>
              )}
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

          {callActive ? (
            <div
              className="px-4 pt-3 border-t border-border bg-primary/5 flex flex-col items-center gap-2"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
              aria-live="polite"
            >
              <button
                type="button"
                onClick={interruptJinny}
                disabled={callPhase !== "speaking"}
                aria-label={callPhase === "speaking" ? "Interrupt Jinny" : "Jinny"}
                className="relative w-16 h-16 rounded-full disabled:cursor-default"
              >
                <span
                  className={`absolute -inset-1.5 rounded-full ${
                    callPhase === "listening"
                      ? "bg-green-500/30 animate-ping"
                      : callPhase === "speaking"
                        ? "bg-primary/30 animate-pulse"
                        : callPhase === "thinking" || callPhase === "connecting"
                          ? "border-2 border-dashed border-primary/60 animate-spin"
                          : "bg-muted"
                  }`}
                />
                <img src={orangeBot} alt="" className="relative w-16 h-16 rounded-full object-cover" />
              </button>
              <div className="text-center min-h-[2.75rem] max-w-full">
                <p className="text-xs font-semibold text-card-foreground">
                  {CALL_PHASE_LABEL[callPhase]}
                  {callStartedAt !== null && (
                    <span className="ml-1.5 font-normal text-muted-foreground tabular-nums">
                      {formatCallTime(callClock - callStartedAt)}
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground line-clamp-2 px-2">
                  {callPhase === "listening"
                    ? interimTranscript || "Go ahead, I'm listening. Say “bye” to hang up."
                    : callPhase === "muted"
                      ? "Unmute to keep talking."
                      : callCaption}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={toggleCallMute}
                  aria-pressed={callMuted}
                  aria-label={callMuted ? "Unmute microphone" : "Mute microphone"}
                  className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                    callMuted ? "bg-destructive/10 text-destructive" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
                >
                  {callMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
                <button
                  type="button"
                  onClick={() => endCall()}
                  aria-label="End call"
                  className="h-11 px-5 rounded-full bg-destructive text-destructive-foreground flex items-center gap-2 text-sm font-semibold hover:opacity-90"
                >
                  <PhoneOff className="w-4 h-4" />
                  End
                </button>
              </div>
            </div>
          ) : (
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
                        : 'Speak one message (or tap the phone for a hands-free call)'
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
          )}
        </div>
      )}
    </>
  );
}


