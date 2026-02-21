import { useState, useEffect, useRef, useCallback } from "react";
import {
  Mic,
  Volume2,
  Camera,
  Loader2,
  ScanLine,
  MessageSquare,
  Play,
  Square,
  Settings2,
  CheckCircle2,
  Eye,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { callGemini } from "@/services/gemini";

// ── Types ─────────────────────────────────────────────────────────────────────

interface A11ySettings {
  ttsRate: number;
  ttsPitch: number;
  ttsVolume: number;
  highContrast: boolean;
  largeText: boolean;
}

const DEFAULTS: A11ySettings = {
  ttsRate: 0.9,
  ttsPitch: 1.0,
  ttsVolume: 1.0,
  highContrast: false,
  largeText: false,
};

const SK = "rr_a11y_settings";

function loadSettings(): A11ySettings {
  try {
    const raw = localStorage.getItem(SK);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

// ── Global TTS ────────────────────────────────────────────────────────────────

export function speak(
  text: string,
  rate = 0.9,
  pitch = 1.0,
  volume = 1.0,
  onEnd?: () => void,
) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = rate;
  u.pitch = pitch;
  u.volume = volume;
  const voices = window.speechSynthesis.getVoices();
  const pref = voices.find((v) => v.lang.startsWith("en") && v.localService);
  if (pref) u.voice = pref;
  if (onEnd) u.onend = onEnd;
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

// ── Speech Recognition ────────────────────────────────────────────────────────

function createRecognition() {
  const SR =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;
  if (!SR) return null;
  const rec = new SR();
  rec.continuous = false;
  rec.interimResults = false;
  rec.lang = "en-IN";
  return rec;
}

// ── Vision capture ────────────────────────────────────────────────────────────

async function identifyFromVideo(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): Promise<string> {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(video, 0, 0);
  const base64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];
  const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY as string;
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.2-11b-vision-preview",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "You are an accessibility assistant for visually impaired users. Describe this image in clear, simple language: list all objects, people, text, colours, and any hazards visible. Speak directly to a blind person.",
            },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${base64}` },
            },
          ],
        },
      ],
      temperature: 0.3,
      max_tokens: 500,
    }),
  });
  if (!res.ok) throw new Error(`Vision API: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "Could not identify objects.";
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-secondary/40 rounded-2xl border border-border p-4 space-y-3 ${className}`}
    >
      {children}
    </div>
  );
}

function SectionTitle({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-600">
        {icon}
      </div>
      <p className="text-xs font-bold text-card-foreground uppercase tracking-wide">
        {label}
      </p>
    </div>
  );
}

// ── Tab system ────────────────────────────────────────────────────────────────

const TABS = [
  { id: "speak", label: "Speak", emoji: "🔊" },
  { id: "listen", label: "Listen", emoji: "🎙️" },
  { id: "camera", label: "Camera", emoji: "📷" },
  { id: "ask", label: "Ask AI", emoji: "🤖" },
  { id: "settings", label: "Settings", emoji: "⚙️" },
] as const;

type TabId = (typeof TABS)[number]["id"];

// ── Main Component ────────────────────────────────────────────────────────────

export default function AccessibilityPanel() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<A11ySettings>(loadSettings);
  const [tab, setTab] = useState<TabId>("speak");

  // TTS
  const [customText, setCustomText] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Voice recognition
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recRef = useRef<any>(null);

  // Camera / object ID
  const [cameraActive, setCameraActive] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const [identified, setIdentified] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // AI chat
  const [query, setQuery] = useState("");
  const [aiReply, setAiReply] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  // Persist settings + apply global classes
  useEffect(() => {
    localStorage.setItem(SK, JSON.stringify(settings));
    const root = document.documentElement;
    root.classList.toggle("high-contrast", settings.highContrast);
    root.style.fontSize = settings.largeText ? "18px" : "";
  }, [settings]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
      stopSpeaking();
      recRef.current?.abort();
    };
  }, []);

  const s = settings;

  // ── TTS ────────────────────────────────────────────────────────────────────

  const handleSpeak = (text: string) => {
    if (!text.trim()) return;
    setIsSpeaking(true);
    speak(text, s.ttsRate, s.ttsPitch, s.ttsVolume, () => setIsSpeaking(false));
  };

  // ── Voice Recognition ──────────────────────────────────────────────────────

  const startListening = useCallback(() => {
    const rec = createRecognition();
    if (!rec) {
      toast({
        title: "Not supported",
        description: "Use Chrome or Edge for voice recognition.",
        variant: "destructive",
      });
      return;
    }
    recRef.current = rec;
    setTranscript("");
    setIsListening(true);
    rec.onresult = (e: any) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) text += e.results[i][0].transcript;
      }
      setTranscript(text);
      if (text && settings.ttsRate)
        speak(`I heard: ${text}`, s.ttsRate, s.ttsPitch, s.ttsVolume);
    };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);
    rec.start();
    speak("Listening, speak your command.", s.ttsRate, s.ttsPitch, s.ttsVolume);
  }, [s, settings.ttsRate, toast]);

  const stopListening = () => {
    recRef.current?.stop();
    setIsListening(false);
  };

  // ── Camera ─────────────────────────────────────────────────────────────────

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      speak(
        "Camera ready. Press Identify to describe what I see.",
        s.ttsRate,
        s.ttsPitch,
        s.ttsVolume,
      );
    } catch {
      toast({
        title: "Camera denied",
        description: "Allow camera access to use object identification.",
        variant: "destructive",
      });
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  };

  const handleIdentify = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setIdentifying(true);
    speak("Analysing image, please wait.", s.ttsRate, s.ttsPitch, s.ttsVolume);
    try {
      const desc = await identifyFromVideo(videoRef.current, canvasRef.current);
      setIdentified(desc);
      speak(desc, s.ttsRate, s.ttsPitch, s.ttsVolume);
    } catch (err: any) {
      toast({
        title: "Identification failed",
        description: err?.message,
        variant: "destructive",
      });
    } finally {
      setIdentifying(false);
    }
  };

  // ── AI Ask ─────────────────────────────────────────────────────────────────

  const askAI = async (q: string) => {
    if (!q.trim()) return;
    setAiLoading(true);
    setAiReply("");
    speak("Let me find that for you.", s.ttsRate, s.ttsPitch, s.ttsVolume);
    try {
      const reply = await callGemini(
        "You are a helpful travel assistant for visually impaired users. Answer concisely in plain language. No markdown.",
        q,
        0.7,
        512,
        false,
      );
      setAiReply(reply);
      speak(reply, s.ttsRate, s.ttsPitch, s.ttsVolume);
    } catch {
      const fallback = "Sorry, I couldn't process your request.";
      setAiReply(fallback);
      speak(fallback, s.ttsRate, s.ttsPitch, s.ttsVolume);
    } finally {
      setAiLoading(false);
    }
  };

  const askByVoice = () => {
    const rec = createRecognition();
    if (!rec) return;
    setIsListening(true);
    speak(
      "What would you like to know?",
      s.ttsRate,
      s.ttsPitch,
      s.ttsVolume,
      () => {
        rec.onresult = (e: any) => {
          let text = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) text += e.results[i][0].transcript;
          }
          if (text) {
            setQuery(text);
            setIsListening(false);
            askAI(text);
          }
        };
        rec.onerror = () => setIsListening(false);
        rec.onend = () => setIsListening(false);
        rec.start();
      },
    );
  };

  const hasTTS = "speechSynthesis" in window;
  const hasSR = !!(
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="bg-card flex flex-col h-full">
      {/* ── Tab Strip ── */}
      <div className="flex gap-1 p-3 border-b border-border bg-secondary/30 overflow-x-auto shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
              tab === t.id
                ? "bg-purple-600 text-white shadow-sm"
                : "bg-card text-muted-foreground hover:bg-secondary hover:text-card-foreground border border-border"
            }`}
          >
            <span>{t.emoji}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ── SPEAK TAB ── */}
        {tab === "speak" && (
          <div className="space-y-4">
            {!hasTTS && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 text-xs text-orange-600">
                ⚠️ Text-to-speech is not supported in this browser.
              </div>
            )}

            <Card>
              <SectionTitle
                icon={<Volume2 className="w-3.5 h-3.5" />}
                label="Text to Speech"
              />
              <textarea
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="Type or paste any text here to hear it spoken aloud..."
                rows={4}
                className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30 resize-none placeholder:text-muted-foreground/60"
                aria-label="Text to speak aloud"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => handleSpeak(customText)}
                  disabled={!hasTTS || !customText.trim() || isSpeaking}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-40 transition-all active:scale-[0.98]"
                >
                  {isSpeaking ? (
                    <>
                      <Square className="w-3.5 h-3.5" /> Speaking…
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5" /> Speak Text
                    </>
                  )}
                </button>
                {isSpeaking && (
                  <button
                    onClick={() => {
                      stopSpeaking();
                      setIsSpeaking(false);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-secondary text-sm font-semibold text-muted-foreground hover:bg-secondary/80 transition-colors border border-border"
                  >
                    Stop
                  </button>
                )}
              </div>
            </Card>

            {/* Quick-speak pills */}
            <Card>
              <SectionTitle
                icon={<Sparkles className="w-3.5 h-3.5" />}
                label="Quick Actions"
              />
              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    label: "🕐 Current Time",
                    fn: () => {
                      const t = new Date().toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                      });
                      handleSpeak(`The current time is ${t}`);
                    },
                  },
                  {
                    label: "📅 Today's Date",
                    fn: () => {
                      const d = new Date().toLocaleDateString("en-IN", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      });
                      handleSpeak(`Today is ${d}`);
                    },
                  },
                  {
                    label: "🆘 Emergency Numbers",
                    fn: () =>
                      handleSpeak(
                        "Emergency numbers in India: Police 100, Ambulance 108, Women Helpline 1091, Fire 101, Disaster 1078, Child Helpline 1098.",
                      ),
                  },
                  {
                    label: "♿ How to Use",
                    fn: () =>
                      handleSpeak(
                        "This accessibility panel lets you hear text spoken aloud, give voice commands, identify objects using your camera, and ask the AI assistant any question.",
                      ),
                  },
                ].map(({ label, fn }) => (
                  <button
                    key={label}
                    onClick={fn}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-background border border-border text-xs font-medium text-card-foreground hover:bg-purple-500/8 hover:border-purple-500/30 transition-all text-left active:scale-[0.98]"
                  >
                    <ChevronRight className="w-3 h-3 text-purple-500 shrink-0" />
                    {label}
                  </button>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* ── LISTEN (Voice Commands) TAB ── */}
        {tab === "listen" && (
          <div className="space-y-4">
            {!hasSR ? (
              <div className="flex items-start gap-2 p-4 rounded-xl bg-orange-500/10 border border-orange-500/20 text-sm text-orange-600">
                ⚠️ Speech recognition requires Chrome or Edge browser.
              </div>
            ) : (
              <>
                <Card>
                  <SectionTitle
                    icon={<Mic className="w-3.5 h-3.5" />}
                    label="Voice Recognition"
                  />
                  <button
                    onClick={isListening ? stopListening : startListening}
                    className={`w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-3 transition-all active:scale-[0.98] ${
                      isListening
                        ? "bg-red-500 text-white shadow-lg shadow-red-500/25 scale-[1.01]"
                        : "bg-purple-600 text-white hover:bg-purple-700 shadow-lg shadow-purple-500/20"
                    }`}
                    aria-label={
                      isListening ? "Stop listening" : "Start listening"
                    }
                  >
                    {isListening ? (
                      <>
                        <div className="flex gap-1 items-center h-5">
                          {[0, 100, 200].map((delay) => (
                            <span
                              key={delay}
                              className="w-1.5 rounded-full bg-white animate-bounce"
                              style={{
                                height: delay === 100 ? "20px" : "14px",
                                animationDelay: `${delay}ms`,
                              }}
                            />
                          ))}
                        </div>
                        Listening… tap to stop
                      </>
                    ) : (
                      <>
                        <Mic className="w-5 h-5" /> Start Listening
                      </>
                    )}
                  </button>

                  {transcript && (
                    <div className="p-3 rounded-xl bg-purple-500/8 border border-purple-500/20">
                      <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">
                        Heard:
                      </p>
                      <p className="text-sm text-card-foreground italic">
                        "{transcript}"
                      </p>
                    </div>
                  )}
                </Card>

                <Card>
                  <SectionTitle
                    icon={<Sparkles className="w-3.5 h-3.5" />}
                    label="Example Commands"
                  />
                  <div className="space-y-1.5">
                    {[
                      "Go to dashboard",
                      "Open itinerary",
                      "Check safety warnings",
                      "What time is it",
                      "Help me navigate",
                      "Read page content",
                    ].map((cmd) => (
                      <div
                        key={cmd}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background border border-border"
                      >
                        <span className="text-purple-500 font-bold text-xs">
                          ›
                        </span>
                        <span className="text-xs text-muted-foreground">
                          "{cmd}"
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              </>
            )}
          </div>
        )}

        {/* ── CAMERA TAB ── */}
        {tab === "camera" && (
          <div className="space-y-4">
            <Card>
              <SectionTitle
                icon={<ScanLine className="w-3.5 h-3.5" />}
                label="Object Identification"
              />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Point your camera at any object, sign, or scene. AI will
                describe what it sees — designed for visually impaired
                travellers.
              </p>

              {!cameraActive ? (
                <button
                  onClick={startCamera}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 transition-all active:scale-[0.98]"
                >
                  <Camera className="w-4 h-4" /> Activate Camera
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="relative rounded-2xl overflow-hidden bg-black aspect-video">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                    {identifying && (
                      <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-purple-600/20 flex items-center justify-center">
                          <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
                        </div>
                        <p className="text-white text-sm font-semibold">
                          Analysing scene…
                        </p>
                      </div>
                    )}
                    {/* Scan lines overlay */}
                    {!identifying && (
                      <div className="absolute inset-0 border-2 border-purple-400/30 rounded-2xl pointer-events-none">
                        <div className="absolute top-3 left-3 w-6 h-6 border-t-2 border-l-2 border-purple-400 rounded-tl-lg" />
                        <div className="absolute top-3 right-3 w-6 h-6 border-t-2 border-r-2 border-purple-400 rounded-tr-lg" />
                        <div className="absolute bottom-3 left-3 w-6 h-6 border-b-2 border-l-2 border-purple-400 rounded-bl-lg" />
                        <div className="absolute bottom-3 right-3 w-6 h-6 border-b-2 border-r-2 border-purple-400 rounded-br-lg" />
                      </div>
                    )}
                  </div>
                  <canvas ref={canvasRef} className="hidden" />
                  <div className="flex gap-2">
                    <button
                      onClick={handleIdentify}
                      disabled={identifying}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 transition-all active:scale-[0.98]"
                    >
                      {identifying ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                      {identifying ? "Analysing…" : "Identify Objects"}
                    </button>
                    <button
                      onClick={stopCamera}
                      className="px-4 py-3 rounded-xl bg-secondary border border-border text-sm font-semibold text-muted-foreground hover:bg-secondary/80 transition-colors"
                    >
                      Stop
                    </button>
                  </div>
                </div>
              )}
            </Card>

            {identified && (
              <Card className="border-green-500/25 bg-green-500/5">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                  <p className="text-xs font-bold text-green-700 uppercase tracking-wide">
                    Scene Description
                  </p>
                </div>
                <p className="text-sm text-card-foreground leading-relaxed">
                  {identified}
                </p>
                <button
                  onClick={() =>
                    speak(identified, s.ttsRate, s.ttsPitch, s.ttsVolume)
                  }
                  className="flex items-center gap-1.5 text-xs text-purple-600 hover:underline mt-1 font-medium"
                >
                  <Volume2 className="w-3.5 h-3.5" /> Read aloud
                </button>
              </Card>
            )}
          </div>
        )}

        {/* ── ASK AI TAB ── */}
        {tab === "ask" && (
          <div className="space-y-4">
            <Card>
              <SectionTitle
                icon={<MessageSquare className="w-3.5 h-3.5" />}
                label="Ask AI Assistant"
              />
              <p className="text-xs text-muted-foreground">
                Type or speak any question about your trip, destination, or the
                app.
              </p>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && askAI(query)}
                  placeholder="e.g. What are the best places to visit in Goa?"
                  className="flex-1 px-3 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30 placeholder:text-muted-foreground/60"
                  aria-label="Ask the AI assistant"
                />
                <button
                  onClick={askByVoice}
                  disabled={isListening || aiLoading}
                  className="p-2.5 rounded-xl bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
                  aria-label="Ask by voice"
                  title="Speak question"
                >
                  {isListening ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Mic className="w-4 h-4" />
                  )}
                </button>
              </div>

              <button
                onClick={() => askAI(query)}
                disabled={aiLoading || !query.trim()}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-40 transition-all active:scale-[0.98]"
              >
                {aiLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Thinking…
                  </>
                ) : (
                  <>
                    <MessageSquare className="w-4 h-4" /> Ask AI
                  </>
                )}
              </button>
            </Card>

            {aiReply && (
              <Card className="border-purple-500/20 bg-purple-500/5">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  <p className="text-xs font-bold text-purple-700 uppercase tracking-wide">
                    AI Response
                  </p>
                </div>
                <p className="text-sm text-card-foreground leading-relaxed">
                  {aiReply}
                </p>
                <button
                  onClick={() =>
                    speak(aiReply, s.ttsRate, s.ttsPitch, s.ttsVolume)
                  }
                  className="flex items-center gap-1.5 text-xs text-purple-600 hover:underline mt-1 font-medium"
                >
                  <Volume2 className="w-3.5 h-3.5" /> Read aloud
                </button>
              </Card>
            )}

            {/* Suggested questions */}
            <Card>
              <p className="text-xs font-semibold text-muted-foreground mb-2">
                Suggested questions:
              </p>
              <div className="space-y-1.5">
                {[
                  "What are the top safety tips for solo travellers?",
                  "How do I use the SOS feature?",
                  "What does the itinerary page show?",
                  "How do I split expenses with my group?",
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => {
                      setQuery(q);
                      askAI(q);
                    }}
                    className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg bg-background border border-border hover:bg-purple-500/8 hover:border-purple-500/25 text-xs text-muted-foreground hover:text-card-foreground transition-all"
                  >
                    <ChevronRight className="w-3 h-3 text-purple-500 shrink-0" />
                    {q}
                  </button>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {tab === "settings" && (
          <div className="space-y-4">
            <Card>
              <SectionTitle
                icon={<Settings2 className="w-3.5 h-3.5" />}
                label="Voice Settings"
              />

              <div className="space-y-4">
                {/* Speech rate */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-card-foreground">
                      Speech Rate
                    </label>
                    <span className="text-xs font-bold text-purple-600 bg-purple-500/10 px-2 py-0.5 rounded-lg">
                      {settings.ttsRate}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={2}
                    step={0.1}
                    value={settings.ttsRate}
                    onChange={(e) =>
                      setSettings((p) => ({
                        ...p,
                        ttsRate: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-purple-600 h-2"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Slow (0.5x)</span>
                    <span>Fast (2x)</span>
                  </div>
                </div>

                {/* Pitch */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-card-foreground">
                      Pitch
                    </label>
                    <span className="text-xs font-bold text-purple-600 bg-purple-500/10 px-2 py-0.5 rounded-lg">
                      {settings.ttsPitch}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={2}
                    step={0.1}
                    value={settings.ttsPitch}
                    onChange={(e) =>
                      setSettings((p) => ({
                        ...p,
                        ttsPitch: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-purple-600 h-2"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Low</span>
                    <span>High</span>
                  </div>
                </div>

                {/* Volume */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-card-foreground">
                      Volume
                    </label>
                    <span className="text-xs font-bold text-purple-600 bg-purple-500/10 px-2 py-0.5 rounded-lg">
                      {Math.round(settings.ttsVolume * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={settings.ttsVolume}
                    onChange={(e) =>
                      setSettings((p) => ({
                        ...p,
                        ttsVolume: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-purple-600 h-2"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Mute</span>
                    <span>Full</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() =>
                  speak(
                    "This is a test of the Radiator Routes text to speech system.",
                    settings.ttsRate,
                    settings.ttsPitch,
                    settings.ttsVolume,
                  )
                }
                className="w-full py-2.5 rounded-xl bg-purple-500/10 text-purple-600 text-sm font-semibold hover:bg-purple-500/20 transition-colors border border-purple-500/20"
              >
                🔊 Test Voice
              </button>
            </Card>

            <Card>
              <SectionTitle
                icon={<Eye className="w-3.5 h-3.5" />}
                label="Visual Settings"
              />
              <div className="space-y-3">
                {[
                  {
                    key: "highContrast" as const,
                    label: "High Contrast Mode",
                    desc: "Increases text and UI contrast for better visibility",
                    emoji: "🔲",
                  },
                  {
                    key: "largeText" as const,
                    label: "Large Text",
                    desc: "Increases base font size across the app",
                    emoji: "🔤",
                  },
                ].map(({ key, label, desc, emoji }) => (
                  <label
                    key={key}
                    className="flex items-center justify-between gap-3 cursor-pointer p-3 rounded-xl bg-background border border-border hover:bg-secondary/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{emoji}</span>
                      <div>
                        <p className="text-sm font-medium text-card-foreground">
                          {label}
                        </p>
                        <p className="text-[10px] text-muted-foreground leading-tight">
                          {desc}
                        </p>
                      </div>
                    </div>
                    <div
                      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${settings[key] ? "bg-purple-600" : "bg-border"}`}
                      onClick={() =>
                        setSettings((p) => ({ ...p, [key]: !p[key] }))
                      }
                    >
                      <div
                        className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${settings[key] ? "translate-x-6" : "translate-x-1"}`}
                      />
                    </div>
                  </label>
                ))}
              </div>
            </Card>

            <Card>
              <SectionTitle
                icon={<Sparkles className="w-3.5 h-3.5" />}
                label="About Accessibility"
              />
              <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
                <p>
                  Radiator Routes is designed to be fully usable by visually
                  impaired travellers. Features include:
                </p>
                <ul className="space-y-1.5 mt-2">
                  {[
                    "🔊 Text-to-Speech for all content",
                    "🎙️ Voice command navigation",
                    "📷 AI-powered object identification",
                    "🤖 Voice-activated AI assistant",
                    "🔲 High contrast & large text modes",
                    "🆘 One-tap SOS with live location",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
