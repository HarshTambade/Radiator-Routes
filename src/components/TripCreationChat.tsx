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
import { nominatimSearch } from "@/services/nominatim";
import { extractDestinationName } from "@/services/destinationImage";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { formatMoney, getCurrencyForCountry, parseBudgetInput } from "@/lib/currency";
import { formatLocalDate, parseLocalDate, tripDayCount } from "@/lib/date";
import ReactMarkdown from "react-markdown";
import { errorMessage } from "@/lib/errors";
import { mergeTripStyle } from "@/lib/travelPreferences";
import {
  startGroqRecording,
  transcribeWithGroq,
  isBrowserSTTSupported,
  isMediaRecorderSupported,
  isGroqTranscriptionAvailable,
  type RecordingHandle,
} from "@/services/groqVoice";
import { getSavedLanguage } from "@/services/translate";

// Track the transcript emitted by the web-speech engine
const pendingTranscriptSlot = { current: "" };

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
    /** ISO code the budget is in; saved to `trips.currency`. */
    currency: "",
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
    const days = tripDayCount(tripData.start_date, tripData.end_date);
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
        `💰 **${formatMoney(Number(tripData.budget), tripData.currency)}** budget\n` +
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
        const dest = extractDestinationName(parts[0] || value);
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

          const currency = getCurrencyForCountry(country).code;
          setTripData((prev) => ({ ...prev, destination: dest, country, currency }));

          // An "average daily budget" hint used to appear here. It came from
          // the intent extractor run on a sentence that states no budget, so
          // the figure was invented by the model. It has been removed.
          addBotMessage(
            `Great choice! **${dest}${country ? `, ${country}` : ""}** 🎉\n\n${country ? `🌍 Country detected: **${country}** — budget will default to **${currency}**.\n\n` : ""}**When do you want to travel?** Enter dates (e.g., "2025-03-15 to 2025-03-20") or say "5 days from March 15".`,
          );
        } catch {
          setTripData((prev) => ({
            ...prev,
            destination: dest,
            country,
            currency: getCurrencyForCountry(country).code,
          }));
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
            // "5 days" means five calendar days, so the last day is start + 4.
            const end = parseLocalDate(startDate);
            end.setDate(end.getDate() + Math.max(1, numDays) - 1);
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
        if (endDate < startDate) {
          addBotMessage("End date can't be before the start date. Please try again.");
          return;
        }
        const days = tripDayCount(startDate, endDate);
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
          `📅 **${startF} → ${endF}** (${days} day${days > 1 ? "s" : ""})\n\n**What's your total budget for the whole group?** Amounts are in **${tripData.currency || "INR"}** — add a currency to change it, e.g. "50000", "1.5 lakh", "50000 INR" or "$2000".`,
        );
        setStep("budget");
        break;
      }

      case "budget": {
        // The old parser kept the first run of digits: "50k" became 50,
        // "1.5 lakh" became 1, and "2000 USD" was saved as rupees.
        const parsed = parseBudgetInput(value);
        if (!parsed.amount) {
          addBotMessage(
            'I couldn\'t read an amount there. Try "50000", "50k", "1.5 lakh" or "2000 USD".',
          );
          return;
        }
        const currency = parsed.currency ?? (tripData.currency || "INR");
        const budget = String(parsed.amount);
        setTripData((prev) => ({ ...prev, budget, currency }));
        const days = tripDayCount(tripData.start_date, tripData.end_date);
        const perDay = Math.round((parsed.amount / days) * 100) / 100;
        addBotMessage(
          `💰 Budget: **${formatMoney(parsed.amount, currency)}** (${formatMoney(perDay, currency)}/day over ${days} day${days === 1 ? "" : "s"})\n\n**How many travelers?**`,
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
            currency: tripData.currency || "INR",
            organizer_id: user!.id,
          });
          if (error) throw error;

          // Merge trip-style answers into the existing preferences blob.
          // This previously wrote a fresh four-key object, replacing the column
          // outright and destroying the category weights, pace and budget cap
          // collected by the preferences form — the inputs the fairness score
          // reads. `mergeTripStyle` also normalises the chat's "balanced" to
          // "moderate", the only legal pace value, which the old write left in a
          // state the scorer silently discarded.
          const { data: existingProfile } = await supabase
            .from("profiles")
            .select("preferences")
            .eq("id", user!.id)
            .single();

          await supabase
            .from("profiles")
            .update({
              preferences: mergeTripStyle(
                (existingProfile as { preferences?: unknown } | null)
                  ?.preferences ?? null,
                {
                  food_preference: tripData.food_preference,
                  accommodation: tripData.accommodation,
                  pace: tripData.pace,
                  interests: tripData.interests,
                },
              ) as never,
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
        } catch (error: unknown) {
          addBotMessage(`❌ Error: ${errorMessage(error)}. Please try again.`);
          toast({
            title: "Error",
            description: errorMessage(error),
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

    // Only the Whisper path has a real transcription wait
    if (handle.engine === "media-recorder") {
      setIsTranscribing(true);
      setInput("🎙️ Transcribing…");
    }

    try {
      const audioBlob = await handle.stop();
      // Web-speech engine emits transcript via the onTranscript callback
      let transcript = pendingTranscriptSlot.current.trim();
      pendingTranscriptSlot.current = "";

      // Media-recorder engine returns a Blob → Groq Whisper transcription
      if (!transcript && audioBlob) {
        const userLang = getSavedLanguage();
        transcript = (await transcribeWithGroq(audioBlob, userLang)).trim();
      }

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
    } catch (err: unknown) {
      setInput("");
      const msg = errorMessage(err) ?? "";
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

  // Lets the recognition engine's onEnd reach the latest stopVoice
  const stopVoiceRef = useRef(stopVoice);
  useEffect(() => { stopVoiceRef.current = stopVoice; }, [stopVoice]);

  const handleVoiceError = useCallback((err: string) => {
    isListeningRef.current = false;
    setIsListening(false);
    recordingRef.current = null;
    pendingTranscriptSlot.current = "";
    setInput("");
    if (err === "EMPTY_AUDIO") {
      toast({ title: "No speech detected", description: "Tap the mic and try again." });
    } else if (err === "PERMISSION_DENIED") {
      toast({
        title: "Mic blocked",
        description: "Please allow microphone access in your browser settings.",
        variant: "destructive",
      });
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
          : "This browser can't reach its speech service (common in Brave or offline). Please type instead.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Voice error",
        description: `Recognition error: ${err}. Please try again.`,
        variant: "destructive",
      });
    }
  }, [toast]);

  const startVoice = useCallback(async () => {
    // Toggle off if already listening
    if (isListeningRef.current) {
      await stopVoice();
      return;
    }

    if (
      !isBrowserSTTSupported() &&
      !(isMediaRecorderSupported() && isGroqTranscriptionAvailable())
    ) {
      toast({
        title: "Voice not supported",
        description: "Please use Chrome, Edge, or Safari, or type your answer.",
        variant: "destructive",
      });
      return;
    }

    try {
      pendingTranscriptSlot.current = "";
      const handle = await startGroqRecording({
        language: getSavedLanguage(),
        onInterim: (text) => setInput(text),
        onTranscript: (text) => { pendingTranscriptSlot.current = text; },
        // Recognition ends by itself after a pause — submit what was heard
        onEnd: () => { void stopVoiceRef.current(); },
        onError: handleVoiceError,
      });
      recordingRef.current = handle;
      isListeningRef.current = true;
      setIsListening(true);
      setInput("🎙️ Listening…");
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
        toast({
          title: "Mic blocked",
          description:
            "Please allow microphone access in your browser settings.",
          variant: "destructive",
        });
      } else if (msg.includes("speech_unsupported")) {
        toast({
          title: "Voice not supported",
          description: errorMessage(err),
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
  }, [handleVoiceError, stopVoice, toast]);

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
                  : "Start voice input"
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
                ? "Transcribing…"
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
