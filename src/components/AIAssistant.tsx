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
} from "lucide-react";
import orangeBot from "@/assets/orange-bot.png";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";

type Msg = { role: "user" | "assistant"; content: string };

const NEW_SUPABASE_URL = "https://dfvyuqxyjlkoovxmtikq.supabase.co";
const OLD_SUPABASE_URL = "https://zsamypacycdvrhegcqvk.supabase.co";
const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_BASE_URL =
  !envUrl || envUrl === OLD_SUPABASE_URL ? NEW_SUPABASE_URL : envUrl;
const CHAT_URL = `${SUPABASE_BASE_URL}/functions/v1/ai-chat`;

const PROXY_CAPABILITIES = [
  { icon: Brain, label: "Concierge", desc: "Personalized suggestions" },
  { icon: Navigation, label: "Negotiate", desc: "Group trip planning" },
  { icon: Shield, label: "Monitor", desc: "Real-time alerts" },
  { icon: Wallet, label: "Budget", desc: "Spending optimizer" },
];

export default function AIAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [wakeListening, setWakeListening] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const wakeRecognitionRef = useRef<any>(null);

  // Refs so closures (recognition callbacks) always see the latest value
  const isListeningRef = useRef(false);
  const wakeActiveRef = useRef(false);
  const isLoadingRef = useRef(false);
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
            transcript.includes("hey ginny")
          ) {
            wakeActiveRef.current = false;
            try {
              recognition.stop();
            } catch {
              /* ignore */
            }
            setOpen(true);
            toast({
              title: "🧡 Jinny activated!",
              description: "Hey! How can I help you?",
            });
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

  // ── Handle AI-requested actions (create trip, budget alert) ─────────────
  const handleAction = useCallback(
    async (content: string) => {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)```/);
      if (!jsonMatch) return;
      try {
        const action = JSON.parse(jsonMatch[1]);

        if (action.action === "create_trip" && user) {
          const today = new Date();
          const startStr = formatLocalDate(today);
          const endDate = new Date(today);
          endDate.setDate(endDate.getDate() + (action.days || 3));
          const endStr = formatLocalDate(endDate);

          const { error: insertError } = await supabase.from("trips").insert({
            name: action.name || `Trip to ${action.destination}`,
            destination: action.destination,
            country: action.country || "India",
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
        }

        if (action.action === "budget_alert") {
          toast({
            title: "💰 Budget Alert",
            description:
              action.message ||
              `Spent: ₹${action.spent?.toLocaleString("en-IN")} | Remaining: ₹${action.remaining?.toLocaleString("en-IN")}`,
          });
        }
      } catch (e: any) {
        console.error("Action error:", e);
      }
    },
    [user, navigate, queryClient, toast],
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
        // ── Use the authenticated user's JWT, not the anon key ──────────
        // With the anon key the edge-function's createClient cannot call
        // getUser() successfully, so personalization context was always empty.
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const authToken =
          session?.access_token ??
          import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
          import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
          "sb_publishable_Y3N5QRELKbHRYqWNZbx3EA_MVvHDzwF";

        const resp = await fetch(CHAT_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            messages: allMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        });

        if (resp.status === 429) {
          toast({
            title: "Rate limited",
            description: "Too many requests. Please wait a moment.",
            variant: "destructive",
          });
          throw new Error("Rate limited");
        }
        if (resp.status === 402) {
          toast({
            title: "Credits exhausted",
            description: "Please add funds to continue using AI.",
            variant: "destructive",
          });
          throw new Error("Credits exhausted");
        }
        if (!resp.ok || !resp.body)
          throw new Error("Failed to connect to assistant");

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let textBuffer = "";

        let streamDone = false;
        while (!streamDone) {
          const { done, value } = await reader.read();
          if (done) break;
          textBuffer += decoder.decode(value, { stream: true });

          let newlineIndex: number;
          while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
            let line = textBuffer.slice(0, newlineIndex);
            textBuffer = textBuffer.slice(newlineIndex + 1);
            if (line.endsWith("\r")) line = line.slice(0, -1);
            if (line.startsWith(":") || line.trim() === "") continue;
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") {
              streamDone = true;
              break;
            }
            try {
              const parsed = JSON.parse(jsonStr);
              const chunk = parsed.choices?.[0]?.delta?.content;
              if (chunk) {
                assistantSoFar += chunk;
                setMessages((prev) => {
                  const last = prev[prev.length - 1];
                  if (
                    last?.role === "assistant" &&
                    prev.length > allMessages.length
                  ) {
                    return prev.map((m, i) =>
                      i === prev.length - 1
                        ? { ...m, content: assistantSoFar }
                        : m,
                    );
                  }
                  return [
                    ...prev.slice(0, allMessages.length),
                    { role: "assistant", content: assistantSoFar },
                  ];
                });
              }
            } catch {
              // Malformed JSON fragment – put the line back and retry
              textBuffer = line + "\n" + textBuffer;
              break;
            }
          }
        }

        handleAction(assistantSoFar);
      } catch (e: any) {
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
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    setIsListening(false);
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
        title: "Not supported",
        description: "Speech recognition isn't available in this browser.",
        variant: "destructive",
      });
      return;
    }

    // Toggle off if already running
    if (isListeningRef.current) {
      stopVoice();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    // Save reference so stopVoice() and the close-effect can cancel it
    recognitionRef.current = recognition;
    isListeningRef.current = true;

    // Accumulates confirmed (final) words across multiple result events
    let finalTranscript = "";

    recognition.onstart = () => {
      setIsListening(true);
      setInput("");
      finalTranscript = "";
    };

    recognition.onend = () => {
      if (isListeningRef.current) {
        // Still in listening mode – restart to keep recording
        try {
          recognition.start();
        } catch {
          /* ignore */
        }
      } else {
        // User pressed stop (or panel closed) – submit what was heard
        setIsListening(false);
        const text = finalTranscript.trim();
        if (text) {
          finalTranscript = "";
          sendMessage(text);
        }
        setInput("");
      }
    };

    recognition.onerror = (e: any) => {
      const { error } = e;

      if (error === "not-allowed" || error === "service-not-allowed") {
        // Microphone permission denied – stop entirely
        isListeningRef.current = false;
        setIsListening(false);
        toast({
          title: "Mic blocked",
          description:
            "Please allow microphone access in your browser settings.",
          variant: "destructive",
        });
        return;
      }

      if (error === "aborted") {
        // We called recognition.stop() / recognition.abort() ourselves.
        // Don't touch isListeningRef here – onend will handle the state.
        return;
      }

      // no-speech, network, audio-capture, etc. → onend will auto-restart
    };

    recognition.onresult = (event: any) => {
      // Process only NEW results (from event.resultIndex onward) to avoid
      // double-counting segments that were already finalized in prior events.
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }

      // Build the current interim (in-progress) text from all non-final results
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        if (!event.results[i].isFinal) {
          interim += event.results[i][0].transcript;
        }
      }

      // Show live preview: confirmed words + whatever is still in-flight
      setInput(finalTranscript + interim);
    };

    try {
      recognition.start();
    } catch (err) {
      console.error("Recognition start failed:", err);
      isListeningRef.current = false;
      setIsListening(false);
    }
  }, [sendMessage, stopVoice, toast]);

  // ── Quick-action capability pills ───────────────────────────────────────
  const handleQuickAction = useCallback(
    (prompt: string) => sendMessage(prompt),
    [sendMessage],
  );

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
                  Your travel companion • {userName}
                </p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
              aria-label="Close chat"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Capability pills – shown while conversation is still short */}
          {messages.length <= 1 && (
            <div className="flex gap-2 px-4 py-2 overflow-x-auto border-b border-border bg-background/50">
              {PROXY_CAPABILITIES.map((cap) => {
                const Icon = cap.icon;
                return (
                  <button
                    key={cap.label}
                    onClick={() =>
                      handleQuickAction(
                        cap.label === "Concierge"
                          ? "Based on my travel history and preferences, suggest my next perfect trip."
                          : cap.label === "Negotiate"
                            ? "Help me negotiate the itinerary for my upcoming group trip. Balance everyone's preferences."
                            : cap.label === "Monitor"
                              ? "Check for any disruptions, weather alerts, or changes affecting my upcoming trips."
                              : "Analyze my spending across all trips and suggest where I can save money.",
                      )
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary text-secondary-foreground text-[11px] font-medium hover:bg-secondary/80 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Icon className="w-3 h-3" />
                    {cap.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Message list */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-xl text-sm ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-secondary text-secondary-foreground rounded-bl-sm"
                  }`}
                >
                  {m.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none [&_p]:m-0 [&_ul]:my-1 [&_li]:my-0">
                      <ReactMarkdown>
                        {m.content.replace(
                          /```json[\s\S]*?```/g,
                          "✅ *Action processed*",
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
              <div className="flex justify-start">
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
                className={`p-2 rounded-lg transition-colors ${
                  isListening
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
