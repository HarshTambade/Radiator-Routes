import { useState, useRef, useEffect, useCallback } from "react";
import {
  Loader2,
  Send,
  Mic,
  MicOff,
  Plane,
  Train,
  Bus,
  Ship,
  MapPin,
  Calendar,
  Wallet,
  Users,
  CheckCircle2,
  Utensils,
  Heart,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { extractIntent } from "@/services/aiPlanner";
import { nominatimSearch } from "@/services/nominatim";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { getCurrencySymbol } from "@/lib/currency";
import ReactMarkdown from "react-markdown";
import {
  startGroqRecording,
  transcribeWithGroq,
  type RecordingHandle,
} from "@/services/groqVoice";
import { getSavedLanguage } from "@/services/translate";

type Step =
  | "destination"
  | "dates"
  | "budget"
  | "travelers"
  | "transport"
  | "food"
  | "accommodation"
  | "pace"
  | "interests"
  | "confirm";
type Msg = { role: "bot" | "user"; content: string; options?: Option[] };
type Option = { label: string; value: string; icon?: any };

const TRANSPORT_OPTIONS: Option[] = [
  { label: "Flight ✈️", value: "flight", icon: Plane },
  { label: "Train 🚆", value: "train", icon: Train },
  { label: "Bus 🚌", value: "bus", icon: Bus },
  { label: "Ship 🚢", value: "ship", icon: Ship },
];

const TRIP_TYPE_OPTIONS: Option[] = [
  { label: "Solo", value: "solo" },
  { label: "Couple", value: "couple" },
  { label: "Friends", value: "friends" },
  { label: "Family", value: "family" },
];

const FOOD_OPTIONS: Option[] = [
  { label: "🥬 Vegetarian", value: "vegetarian" },
  { label: "🌱 Vegan", value: "vegan" },
  { label: "🍖 Non-Veg", value: "non-vegetarian" },
  { label: "🐟 Pescatarian", value: "pescatarian" },
  { label: "🍽️ No Preference", value: "any" },
];

const ACCOMMODATION_OPTIONS: Option[] = [
  { label: "🏨 Hotel", value: "hotel" },
  { label: "🏠 Hostel", value: "hostel" },
  { label: "🏡 Airbnb", value: "airbnb" },
  { label: "⛺ Camping", value: "camping" },
  { label: "🏰 Resort", value: "resort" },
];

const PACE_OPTIONS: Option[] = [
  { label: "🐢 Relaxed", value: "relaxed" },
  { label: "⚖️ Balanced", value: "balanced" },
  { label: "⚡ Packed", value: "packed" },
];

const INTEREST_OPTIONS: Option[] = [
  { label: "🏛️ Culture", value: "culture" },
  { label: "🍜 Food", value: "food" },
  { label: "🏖️ Beaches", value: "beaches" },
  { label: "🥾 Adventure", value: "adventure" },
  { label: "🛍️ Shopping", value: "shopping" },
  { label: "🌿 Nature", value: "nature" },
  { label: "🎭 Nightlife", value: "nightlife" },
  { label: "📸 Photography", value: "photography" },
];

function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(start: string, end: string): number {
  const s = parseLocalDate(start);
  const e = parseLocalDate(end);
  return Math.round((e.getTime() - s.getTime()) / 86400000);
}

interface Props {
  onClose: () => void;
  tripType: string;
}

export default function TripCreationChat({ onClose, tripType }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>("destination");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const recordingRef = useRef<RecordingHandle | null>(null);
  const isListeningRef = useRef(false);
  // Ref so the latest handleInput is always accessible in async callbacks
  const handleInputRef = useRef<(text: string) => void>(() => {});
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);

  const [tripData, setTripData] = useState({
    destination: "",
    country: "",
    start_date: "",
    end_date: "",
    budget: "",
    travelers: "1",
    transport: "",
    name: "",
    food_preference: "",
    accommodation: "",
    pace: "",
    interests: [] as string[],
  });

  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // ── Cleanup recording on unmount ──────────────────────────────────────
  useEffect(() => {
    return () => {
      isListeningRef.current = false;
      recordingRef.current?.abort();
      recordingRef.current = null;
    };
  }, []);

  useEffect(() => {
    const typeLabel =
      tripType === "solo"
        ? "solo"
        : tripType === "group"
          ? "group"
          : "random traveler";
    addBotMessage(
      `Hey! Let's plan your **${typeLabel} trip** step by step! 🗺️\n\n**Where do you want to go?** Tell me the city and country.`,
      [],
    );
  }, []); // eslint-disable-line

  const addBotMessage = (content: string, options?: Option[]) => {
    setMessages((prev) => [...prev, { role: "bot", content, options }]);
  };

  const addUserMessage = (content: string) => {
    setMessages((prev) => [...prev, { role: "user", content }]);
  };

  const handleInput = (text: string) => {
    if (!text.trim()) return;
    addUserMessage(text);
    setInput("");
    processStep(text.trim());
  };

  // Keep the ref pointing to the latest handleInput so the voice recognition
  // onend closure (created once at startVoice time) always dispatches to the
  // version that has the current step/tripData in scope.
  useEffect(() => {
    handleInputRef.current = handleInput;
  });

  const handleOptionClick = (option: Option) => {
    if (step === "interests") {
      // Multi-select for interests
      setSelectedInterests((prev) => {
        const updated = prev.includes(option.value)
          ? prev.filter((v) => v !== option.value)
          : [...prev, option.value];
        return updated;
      });
      return;
    }
    addUserMessage(option.label);
    processStep(option.value);
  };

  const confirmInterests = () => {
    if (selectedInterests.length === 0) {
      addBotMessage("Please select at least one interest!");
      return;
    }
    const labels = selectedInterests
      .map((v) => INTEREST_OPTIONS.find((o) => o.value === v)?.label || v)
      .join(", ");
    addUserMessage(labels);
    setTripData((prev) => ({ ...prev, interests: selectedInterests }));

    // Build summary
    const days = daysBetween(tripData.start_date, tripData.end_date);
    const symbol = getCurrencySymbol(tripData.country);
    const startF = parseLocalDate(tripData.start_date).toLocaleDateString(
      "en-US",
      { month: "short", day: "numeric" },
    );
    const endF = parseLocalDate(tripData.end_date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const transportLabel =
      TRANSPORT_OPTIONS.find((t) => t.value === tripData.transport)?.label ||
      tripData.transport;
    const foodLabel =
      FOOD_OPTIONS.find((f) => f.value === tripData.food_preference)?.label ||
      tripData.food_preference;
    const accomLabel =
      ACCOMMODATION_OPTIONS.find((a) => a.value === tripData.accommodation)
        ?.label || tripData.accommodation;
    const paceLabel =
      PACE_OPTIONS.find((p) => p.value === tripData.pace)?.label ||
      tripData.pace;

    addBotMessage(
      `Here's your trip summary:\n\n` +
        `📍 **${tripData.destination}${tripData.country ? `, ${tripData.country}` : ""}**\n` +
        `📅 **${startF} → ${endF}** (${days} days)\n` +
        `💰 **${symbol}${Number(tripData.budget).toLocaleString()}** budget\n` +
        `👥 **${tripData.travelers} traveler${Number(tripData.travelers) > 1 ? "s" : ""}**\n` +
        `🚀 **${transportLabel}**\n` +
        `🍽️ **${foodLabel}**\n` +
        `🏨 **${accomLabel}**\n` +
        `⚡ **${paceLabel}** pace\n` +
        `🎯 **${labels}**\n\n` +
        `Ready to create this trip?`,
      [
        { label: "✅ Create Trip", value: "confirm" },
        { label: "❌ Cancel", value: "cancel" },
      ],
    );
    setStep("confirm");
  };

  const processStep = async (value: string) => {
    switch (step) {
      case "destination": {
        const parts = value.split(",").map((s) => s.trim());
        const dest = parts[0] || value;
        // Country provided explicitly by the user
        let country = parts[1] || "";

        setAiLoading(true);
        try {
          // Auto-detect country via Nominatim geocoding if not provided
          if (!country) {
            try {
              const geoResults = await nominatimSearch(dest, 1);
              if (geoResults && geoResults.length > 0) {
                const geo = geoResults[0] as any;
                // address.country is the full country name
                country =
                  geo.address?.country ||
                  geo.display_name?.split(",").pop()?.trim() ||
                  "";
              }
            } catch {
              // Geocoding failed — proceed without country
            }
          }

          setTripData((prev) => ({ ...prev, destination: dest, country }));

          const suggestion = (await extractIntent({
            transcript: `Best time to visit ${dest} ${country}, typical budget per day`,
          })) as any;
          const budgetHint = suggestion?.budget_range?.max
            ? `Average daily budget: ~${getCurrencySymbol(country)}${Math.round(suggestion.budget_range.max / (suggestion.duration_days || 5)).toLocaleString()}`
            : "";
          addBotMessage(
            `Great choice! **${dest}${country ? `, ${country}` : ""}** 🎉\n\n${country ? `🌍 Country auto-detected: **${country}** — currency set automatically.\n\n` : ""}${budgetHint ? `💡 ${budgetHint}\n\n` : ""}**When do you want to travel?** Enter dates (e.g., "2025-03-15 to 2025-03-20") or say "5 days from March 15".`,
          );
        } catch {
          setTripData((prev) => ({ ...prev, destination: dest, country }));
          addBotMessage(
            `**${dest}${country ? `, ${country}` : ""}** sounds amazing! 🎉\n\n**When do you want to travel?** Enter dates like "2025-03-15 to 2025-03-20".`,
          );
        } finally {
          setAiLoading(false);
        }
        setStep("dates");
        break;
      }

      case "dates": {
        let startDate = "",
          endDate = "";
        const rangeMatch = value.match(
          /(\d{4}-\d{2}-\d{2})\s*(?:to|[-–])\s*(\d{4}-\d{2}-\d{2})/,
        );
        if (rangeMatch) {
          startDate = rangeMatch[1];
          endDate = rangeMatch[2];
        } else {
          const daysMatch = value.match(/(\d+)\s*days?/i);
          const fromMatch = value.match(/from\s*(\d{4}-\d{2}-\d{2})/i);
          if (daysMatch) {
            const numDays = parseInt(daysMatch[1]);
            const start = fromMatch ? parseLocalDate(fromMatch[1]) : new Date();
            if (start < new Date()) {
              const t = new Date();
              t.setDate(t.getDate() + 1);
              startDate = formatLocalDate(t);
            } else startDate = formatLocalDate(start);
            const end = parseLocalDate(startDate);
            end.setDate(end.getDate() + numDays);
            endDate = formatLocalDate(end);
          } else {
            const singleDate = value.match(/(\d{4}-\d{2}-\d{2})/);
            if (singleDate) {
              startDate = singleDate[1];
              const end = parseLocalDate(startDate);
              end.setDate(end.getDate() + 3);
              endDate = formatLocalDate(end);
            }
          }
        }
        if (!startDate || !endDate) {
          addBotMessage(
            "I couldn't parse those dates. Try: `2025-03-15 to 2025-03-20` or `5 days from 2025-03-15`",
          );
          return;
        }
        const days = daysBetween(startDate, endDate);
        if (days <= 0) {
          addBotMessage("End date must be after start date. Please try again.");
          return;
        }
        setTripData((prev) => ({
          ...prev,
          start_date: startDate,
          end_date: endDate,
        }));
        const startF = parseLocalDate(startDate).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
        const endF = parseLocalDate(endDate).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
        addBotMessage(
          `📅 **${startF} → ${endF}** (${days} day${days > 1 ? "s" : ""})\n\n**What's your total budget?** Enter an amount (e.g., "50000" or "2000 USD").`,
        );
        setStep("budget");
        break;
      }

      case "budget": {
        const numMatch = value.match(/[\d,]+/);
        const budget = numMatch ? numMatch[0].replace(/,/g, "") : "0";
        setTripData((prev) => ({ ...prev, budget }));
        const symbol = getCurrencySymbol(tripData.country);
        const days = daysBetween(tripData.start_date, tripData.end_date);
        const perDay = Math.round(Number(budget) / days);
        addBotMessage(
          `💰 Budget: **${symbol}${Number(budget).toLocaleString()}** (${symbol}${perDay.toLocaleString()}/day)\n\n**How many travelers?**`,
          TRIP_TYPE_OPTIONS,
        );
        setStep("travelers");
        break;
      }

      case "travelers": {
        const tMatch = value.match(/\d+/);
        const travelers = tMatch
          ? tMatch[0]
          : value === "solo"
            ? "1"
            : value === "couple"
              ? "2"
              : "1";
        setTripData((prev) => ({ ...prev, travelers }));
        addBotMessage(
          `👥 **${travelers} traveler${Number(travelers) > 1 ? "s" : ""}**\n\n**How do you want to get there?**`,
          TRANSPORT_OPTIONS,
        );
        setStep("transport");
        break;
      }

      case "transport": {
        setTripData((prev) => ({ ...prev, transport: value }));
        const label =
          TRANSPORT_OPTIONS.find((t) => t.value === value)?.label || value;
        addBotMessage(
          `🚀 **${label}**\n\n**What are your food preferences?**`,
          FOOD_OPTIONS,
        );
        setStep("food");
        break;
      }

      case "food": {
        setTripData((prev) => ({ ...prev, food_preference: value }));
        const label =
          FOOD_OPTIONS.find((f) => f.value === value)?.label || value;
        addBotMessage(
          `🍽️ **${label}**\n\n**What type of accommodation do you prefer?**`,
          ACCOMMODATION_OPTIONS,
        );
        setStep("accommodation");
        break;
      }

      case "accommodation": {
        setTripData((prev) => ({ ...prev, accommodation: value }));
        const label =
          ACCOMMODATION_OPTIONS.find((a) => a.value === value)?.label || value;
        addBotMessage(
          `🏨 **${label}**\n\n**What's your travel pace?**`,
          PACE_OPTIONS,
        );
        setStep("pace");
        break;
      }

      case "pace": {
        setTripData((prev) => ({ ...prev, pace: value }));
        const label =
          PACE_OPTIONS.find((p) => p.value === value)?.label || value;
        addBotMessage(
          `⚡ **${label}** pace\n\n**What interests you most?** Select all that apply, then press **Done**.`,
          INTEREST_OPTIONS,
        );
        setStep("interests");
        break;
      }

      case "interests": {
        // handled by confirmInterests
        break;
      }

      case "confirm": {
        if (
          value === "cancel" ||
          value.toLowerCase().includes("cancel") ||
          value.toLowerCase().includes("no")
        ) {
          onClose();
          return;
        }
        setCreating(true);
        try {
          const name = `${tripType === "solo" ? "Solo" : tripType === "group" ? "Group" : "Random"} trip to ${tripData.destination}`;
          const { error } = await supabase.from("trips").insert({
            name,
            destination: tripData.destination,
            country: tripData.country || null,
            start_date: tripData.start_date,
            end_date: tripData.end_date,
            budget_total: Number(tripData.budget) || 0,
            organizer_id: user!.id,
          });
          if (error) throw error;

          // Update profile preferences
          await supabase
            .from("profiles")
            .update({
              preferences: {
                food_preference: tripData.food_preference,
                accommodation: tripData.accommodation,
                pace: tripData.pace,
                interests: tripData.interests,
              },
            })
            .eq("id", user!.id);

          addBotMessage(
            "🎉 **Trip created successfully!** Redirecting to your itinerary...",
          );
          queryClient.invalidateQueries({ queryKey: ["trips"] });
          toast({
            title: "Trip created!",
            description: `${tripData.destination} trip is ready.`,
          });

          const { data: newTrips } = await supabase
            .from("trips")
            .select("id")
            .eq("organizer_id", user!.id)
            .order("created_at", { ascending: false })
            .limit(1);
          setTimeout(() => {
            if (newTrips?.[0]) navigate(`/itinerary/${newTrips[0].id}`);
            onClose();
          }, 1500);
        } catch (error: any) {
          addBotMessage(`❌ Error: ${error.message}. Please try again.`);
          toast({
            title: "Error",
            description: error.message,
            variant: "destructive",
          });
        } finally {
          setCreating(false);
        }
        break;
      }
    }
  };

  // ── Voice input ──────────────────────────────────────────────────────────
  const stopVoice = useCallback(async () => {
    if (!isListeningRef.current) return;
    isListeningRef.current = false;
    setIsListening(false);

    const handle = recordingRef.current;
    recordingRef.current = null;

    if (!handle) {
      setInput("");
      return;
    }

    setIsTranscribing(true);
    setInput("🎙️ Transcribing…");

    try {
      const audioBlob = await handle.stop();
      const userLang = getSavedLanguage();
      const transcript = await transcribeWithGroq(audioBlob, userLang);
      if (transcript) {
        setInput(transcript);
        handleInputRef.current(transcript);
      } else {
        setInput("");
        toast({
          title: "No speech detected",
          description: "Please try again.",
        });
      }
    } catch (err: any) {
      setInput("");
      const msg = err?.message ?? "";
      if (msg === "EMPTY_AUDIO") {
        toast({
          title: "No speech detected",
          description: "Please try again.",
        });
      } else if (msg === "RATE_LIMIT") {
        toast({
          title: "Rate limited",
          description: "Please wait a moment.",
          variant: "destructive",
        });
      } else if (msg === "INVALID_API_KEY") {
        toast({
          title: "API key error",
          description: "Groq API key is invalid.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Transcription failed",
          description: "Could not understand audio. Please type instead.",
          variant: "destructive",
        });
      }
    } finally {
      setIsTranscribing(false);
    }
  }, [toast]);

  const startVoice = useCallback(async () => {
    if (!navigator.mediaDevices) {
      toast({
        title: "Voice not supported",
        description: "Audio recording isn't available in this browser.",
        variant: "destructive",
      });
      return;
    }

    // Toggle off if already listening
    if (isListeningRef.current) {
      await stopVoice();
      return;
    }

    try {
      const handle = await startGroqRecording();
      recordingRef.current = handle;
      isListeningRef.current = true;
      setIsListening(true);
      setInput("🎙️ Listening…");
    } catch (err: any) {
      isListeningRef.current = false;
      setIsListening(false);
      recordingRef.current = null;
      const msg = (err?.message ?? "").toLowerCase();
      if (
        msg.includes("not-allowed") ||
        msg.includes("permission") ||
        msg.includes("denied")
      ) {
        toast({
          title: "Mic blocked",
          description:
            "Please allow microphone access in your browser settings.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Microphone error",
          description: "Could not start microphone. Please try again.",
          variant: "destructive",
        });
      }
    }
  }, [stopVoice, toast]);

  const stepIcons: Record<Step, any> = {
    destination: MapPin,
    dates: Calendar,
    budget: Wallet,
    travelers: Users,
    transport: Plane,
    food: Utensils,
    accommodation: Heart,
    pace: Zap,
    interests: CheckCircle2,
    confirm: CheckCircle2,
  };

  const steps: Step[] = [
    "destination",
    "dates",
    "budget",
    "travelers",
    "transport",
    "food",
    "accommodation",
    "pace",
    "interests",
    "confirm",
  ];
  const currentIdx = steps.indexOf(step);

  return (
    <div className="bg-card rounded-2xl shadow-card overflow-hidden animate-fade-in border border-border">
      {/* Progress bar */}
      <div className="px-5 pt-4 pb-2">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-card-foreground text-sm">
            Plan Your Trip
          </h3>
          <button
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
        <div className="flex items-center gap-0.5">
          {steps.map((s, i) => {
            const Icon = stepIcons[s];
            // ── Determine mic button label / state ───────────────────────────────────
            const micBusy = isTranscribing;

            return (
              <div key={s} className="flex items-center gap-0.5 flex-1">
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
                    i <= currentIdx
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="w-2.5 h-2.5" />
                </div>
                {i < steps.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 rounded transition-colors ${i < currentIdx ? "bg-primary" : "bg-muted"}`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Chat messages */}
      <div
        ref={scrollRef}
        className="h-[320px] overflow-y-auto px-4 py-3 space-y-3"
      >
        {messages.map((m, i) => (
          <div key={i}>
            <div
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] px-3 py-2 rounded-xl text-sm ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-secondary text-secondary-foreground rounded-bl-sm"
                }`}
              >
                {m.role === "bot" ? (
                  <div className="prose prose-sm max-w-none [&_p]:m-0 [&_ul]:my-1 [&_li]:my-0 text-secondary-foreground">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  m.content
                )}
              </div>
            </div>
            {/* Options */}
            {m.role === "bot" &&
              m.options &&
              m.options.length > 0 &&
              i === messages.length - 1 && (
                <div className="flex flex-wrap gap-2 mt-2 ml-1">
                  {m.options.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleOptionClick(opt)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                        step === "interests" &&
                        selectedInterests.includes(opt.value)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-primary/10 text-primary border-primary/20 hover:bg-primary/20"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                  {step === "interests" && (
                    <button
                      onClick={confirmInterests}
                      className="px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold"
                    >
                      Done ✓
                    </button>
                  )}
                </div>
              )}
          </div>
        ))}
        {(aiLoading || creating) && (
          <div className="flex justify-start">
            <div className="bg-secondary px-3 py-2 rounded-xl rounded-bl-sm flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">
                {creating ? "Creating trip..." : "Getting suggestions..."}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border">
        <div className="flex items-center gap-2">
          <button
            onClick={isListening ? stopVoice : startVoice}
            disabled={isTranscribing}
            title={
              isTranscribing
                ? "Transcribing…"
                : isListening
                  ? "Stop recording & send"
                  : "Start voice input (Groq Whisper)"
            }
            className={`p-2 rounded-lg transition-colors ${
              isTranscribing
                ? "opacity-40 cursor-not-allowed text-muted-foreground"
                : isListening
                  ? "bg-destructive text-destructive-foreground animate-pulse"
                  : "hover:bg-secondary text-muted-foreground"
            }`}
          >
            {isTranscribing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isListening ? (
              <MicOff className="w-4 h-4" />
            ) : (
              <Mic className="w-4 h-4" />
            )}
          </button>
          {(isListening || isTranscribing) && (
            <div className="flex items-center gap-1 px-2">
              <span
                className={`w-2 h-2 rounded-full animate-pulse ${isTranscribing ? "bg-warning" : "bg-destructive"}`}
              />
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                {isTranscribing ? "Transcribing…" : "Recording…"}
              </span>
            </div>
          )}
          <input
            type="text"
            value={input}
            onChange={(e) => {
              if (!isListening && !isTranscribing) setInput(e.target.value);
            }}
            readOnly={isListening || isTranscribing}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isListening && !isTranscribing) {
                handleInput(input);
              }
            }}
            placeholder={
              isTranscribing
                ? "Transcribing with Groq Whisper…"
                : isListening
                  ? "Recording… tap mic to stop"
                  : step === "interests"
                    ? "Or type your interests..."
                    : "Type your answer..."
            }
            className="flex-1 px-3 py-2 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <button
            onClick={() => {
              if (!isListening && !isTranscribing) handleInput(input);
            }}
            disabled={!input.trim() || isListening || isTranscribing}
            className="p-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
