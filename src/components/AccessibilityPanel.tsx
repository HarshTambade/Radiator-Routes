import { useState, useEffect, useRef, useCallback } from "react";
import {
  Eye,
  EyeOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Camera,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
  Accessibility,
  ScanLine,
  MessageSquare,
  Settings,
  Play,
  Square,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { callGemini } from "@/services/gemini";

// ── Types ────────────────────────────────────────────────────────────────────

interface AccessibilitySettings {
  ttsEnabled: boolean;
  ttsRate: number;
  ttsPitch: number;
  ttsVolume: number;
  highContrast: boolean;
  largeText: boolean;
  voiceCommandsEnabled: boolean;
}

const DEFAULT_SETTINGS: AccessibilitySettings = {
  ttsEnabled: true,
  ttsRate: 0.9,
  ttsPitch: 1.0,
  ttsVolume: 1.0,
  highContrast: false,
  largeText: false,
  voiceCommandsEnabled: false,
};

const STORAGE_KEY = "radiator_accessibility_settings";

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadSettings(): AccessibilitySettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(s: AccessibilitySettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

// ── TTS Engine ───────────────────────────────────────────────────────────────

let currentUtterance: SpeechSynthesisUtterance | null = null;

export function speak(
  text: string,
  settings?: Partial<AccessibilitySettings>,
  onEnd?: () => void,
) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();

  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = settings?.ttsRate ?? 0.9;
  utter.pitch = settings?.ttsPitch ?? 1.0;
  utter.volume = settings?.ttsVolume ?? 1.0;

  // Prefer an English voice
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(
    (v) => v.lang.startsWith("en") && v.localService,
  );
  if (preferred) utter.voice = preferred;

  if (onEnd) utter.onend = onEnd;
  currentUtterance = utter;
  window.speechSynthesis.speak(utter);
}

export function stopSpeaking() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

// ── Speech Recognition setup ─────────────────────────────────────────────────

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionEvent = {
  results: SpeechRecognitionResultList;
  resultIndex: number;
};

type SpeechRecognitionResultList = {
  length: number;
  [index: number]: SpeechRecognitionResult;
};

type SpeechRecognitionResult = {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
};

type SpeechRecognitionAlternative = {
  transcript: string;
  confidence: number;
};

function createRecognition(): SpeechRecognitionInstance | null {
  const SRConstructor =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;
  if (!SRConstructor) return null;
  const rec = new SRConstructor() as SpeechRecognitionInstance;
  rec.continuous = false;
  rec.interimResults = false;
  rec.lang = "en-IN";
  return rec;
}

// ── Object Identification via Camera + AI ────────────────────────────────────

async function captureAndIdentify(
  videoEl: HTMLVideoElement,
  canvasEl: HTMLCanvasElement,
): Promise<string> {
  canvasEl.width = videoEl.videoWidth;
  canvasEl.height = videoEl.videoHeight;
  const ctx = canvasEl.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");
  ctx.drawImage(videoEl, 0, 0);
  const dataUrl = canvasEl.toDataURL("image/jpeg", 0.7);
  const base64 = dataUrl.split(",")[1];

  // Use Groq vision (llama-3.2-11b-vision-preview) if available,
  // else describe the image via a placeholder message for Groq text model.
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
              text: "You are an accessibility assistant for visually impaired users. Describe this image in detail, including: what objects are visible, people (if any), text visible, colors, potential hazards or important information the user should know. Be concise but thorough. Speak as if talking directly to a blind person.",
            },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${base64}` },
            },
          ],
        },
      ],
      temperature: 0.3,
      max_tokens: 512,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vision API error: ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "Could not identify objects.";
}

// ── Voice Command Processor ───────────────────────────────────────────────────

const VOICE_COMMANDS: Record<string, () => void> = {};

export function registerVoiceCommand(phrase: string, action: () => void) {
  VOICE_COMMANDS[phrase.toLowerCase()] = action;
}

function matchCommand(transcript: string): boolean {
  const lower = transcript.toLowerCase().trim();
  for (const [phrase, action] of Object.entries(VOICE_COMMANDS)) {
    if (lower.includes(phrase)) {
      action();
      return true;
    }
  }
  return false;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AccessibilityPanel() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<AccessibilitySettings>(loadSettings);
  const [collapsed, setCollapsed] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [voiceResult, setVoiceResult] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const [identifiedText, setIdentifiedText] = useState("");
  const [customText, setCustomText] = useState("");
  const [aiChatQuery, setAiChatQuery] = useState("");
  const [aiChatResponse, setAiChatResponse] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  // Persist settings
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // Apply global accessibility classes
  useEffect(() => {
    const root = document.documentElement;
    if (settings.highContrast) {
      root.classList.add("high-contrast");
    } else {
      root.classList.remove("high-contrast");
    }
    if (settings.largeText) {
      root.style.fontSize = "18px";
    } else {
      root.style.fontSize = "";
    }
  }, [settings.highContrast, settings.largeText]);

  // Greet on panel open
  useEffect(() => {
    if (!collapsed && settings.ttsEnabled) {
      speak(
        "Accessibility panel opened. Options available: Text to Speech, Voice Commands, and Object Identification using camera.",
        settings,
      );
    }
  }, [collapsed]);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
      stopSpeaking();
      if (recognitionRef.current) recognitionRef.current.abort();
    };
  }, []);

  const updateSetting = <K extends keyof AccessibilitySettings>(
    key: K,
    value: AccessibilitySettings[K],
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  // ── TTS ──────────────────────────────────────────────────────────────────

  const handleSpeak = (text: string) => {
    if (!text.trim()) return;
    setIsSpeaking(true);
    speak(text, settings, () => setIsSpeaking(false));
  };

  const handleStop = () => {
    stopSpeaking();
    setIsSpeaking(false);
  };

  // ── Voice Commands ────────────────────────────────────────────────────────

  const startListening = useCallback(() => {
    const rec = createRecognition();
    if (!rec) {
      toast({
        title: "Speech recognition not supported",
        description: "Please use Chrome or Edge for voice commands.",
        variant: "destructive",
      });
      return;
    }

    recognitionRef.current = rec;
    setIsListening(true);
    setTranscript("");
    setVoiceResult("");

    rec.onresult = (e: SpeechRecognitionEvent) => {
      const results = e.results;
      let finalTranscript = "";
      for (let i = e.resultIndex; i < results.length; i++) {
        if (results[i].isFinal) {
          finalTranscript += results[i][0].transcript;
        }
      }
      setTranscript(finalTranscript);

      if (finalTranscript) {
        const matched = matchCommand(finalTranscript);
        if (matched) {
          setVoiceResult("Command executed!");
          if (settings.ttsEnabled) speak("Command executed", settings);
        } else {
          setVoiceResult(`Heard: "${finalTranscript}"`);
          if (settings.ttsEnabled)
            speak(`I heard: ${finalTranscript}`, settings);
        }
      }
    };

    rec.onerror = () => {
      setIsListening(false);
      toast({ title: "Voice recognition error", variant: "destructive" });
    };

    rec.onend = () => {
      setIsListening(false);
    };

    rec.start();
    if (settings.ttsEnabled) speak("Listening. Speak your command.", settings);
  }, [settings, toast]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsListening(false);
  }, []);

  // ── Camera / Object ID ─────────────────────────────────────────────────────

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      if (settings.ttsEnabled)
        speak(
          "Camera activated. Press Identify Objects to describe what the camera sees.",
          settings,
        );
    } catch {
      toast({
        title: "Camera access denied",
        description:
          "Please allow camera permission to use object identification.",
        variant: "destructive",
      });
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const identifyObjects = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setIdentifying(true);
    setIdentifiedText("");
    if (settings.ttsEnabled) speak("Analyzing image, please wait.", settings);

    try {
      const description = await captureAndIdentify(
        videoRef.current,
        canvasRef.current,
      );
      setIdentifiedText(description);
      if (settings.ttsEnabled) speak(description, settings);
    } catch (err: any) {
      const msg = "Could not identify objects. " + (err?.message ?? "");
      setIdentifiedText(msg);
      toast({
        title: "Object ID failed",
        description: err?.message,
        variant: "destructive",
      });
    } finally {
      setIdentifying(false);
    }
  };

  // ── AI Voice Chat ─────────────────────────────────────────────────────────

  const askAI = async () => {
    if (!aiChatQuery.trim()) return;
    setAiLoading(true);
    setAiChatResponse("");
    if (settings.ttsEnabled) speak("Let me find that for you.", settings);
    try {
      const response = await callGemini(
        "You are a helpful travel assistant for visually impaired users. Answer concisely and clearly. Use simple language. Avoid using markdown formatting.",
        aiChatQuery,
        0.7,
        512,
        false,
      );
      setAiChatResponse(response);
      if (settings.ttsEnabled) speak(response, settings);
    } catch {
      const errMsg = "Sorry, I could not process your request right now.";
      setAiChatResponse(errMsg);
      if (settings.ttsEnabled) speak(errMsg, settings);
    } finally {
      setAiLoading(false);
    }
  };

  const askByVoice = () => {
    const rec = createRecognition();
    if (!rec) return;

    setIsListening(true);
    speak("What would you like to know?", settings, () => {
      rec.onresult = (e: SpeechRecognitionEvent) => {
        const results = e.results;
        let finalTranscript = "";
        for (let i = e.resultIndex; i < results.length; i++) {
          if (results[i].isFinal) {
            finalTranscript += results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setAiChatQuery(finalTranscript);
          setIsListening(false);
          // auto-submit after capture
          setTimeout(async () => {
            setAiLoading(true);
            speak("Let me find that for you.", settings);
            try {
              const response = await callGemini(
                "You are a helpful travel assistant for visually impaired users. Answer concisely and clearly. Use simple language.",
                finalTranscript,
                0.7,
                512,
                false,
              );
              setAiChatResponse(response);
              speak(response, settings);
            } catch {
              speak("Sorry, I could not process your request.", settings);
            } finally {
              setAiLoading(false);
            }
          }, 300);
        }
      };
      rec.onerror = () => setIsListening(false);
      rec.onend = () => setIsListening(false);
      rec.start();
    });
  };

  const hasTTS = "speechSynthesis" in window;
  const hasSR = !!(
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="bg-card rounded-2xl shadow-card overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4 border-b border-border cursor-pointer"
        onClick={() => setCollapsed((v) => !v)}
        role="button"
        aria-expanded={!collapsed}
        aria-label="Accessibility Panel"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-purple-500/10">
            <Accessibility className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="font-semibold text-card-foreground text-sm flex items-center gap-2">
              Accessibility
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-600 font-bold border border-purple-500/20">
                A11y
              </span>
            </h3>
            <p className="text-[11px] text-muted-foreground">
              TTS · Voice commands · Object ID
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowSettings((v) => !v);
            }}
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
            aria-label="Settings"
          >
            <Settings className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          {collapsed ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="p-4 space-y-4">
          {/* Settings Panel */}
          {showSettings && (
            <div className="p-3 rounded-xl bg-secondary/40 border border-border space-y-3 animate-fade-in">
              <p className="text-xs font-semibold text-card-foreground flex items-center gap-1.5">
                <Settings className="w-3.5 h-3.5" /> Voice Settings
              </p>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.ttsEnabled}
                    onChange={(e) =>
                      updateSetting("ttsEnabled", e.target.checked)
                    }
                    className="w-3.5 h-3.5 rounded"
                  />
                  <span className="text-xs text-card-foreground">
                    Auto-speak
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.highContrast}
                    onChange={(e) =>
                      updateSetting("highContrast", e.target.checked)
                    }
                    className="w-3.5 h-3.5 rounded"
                  />
                  <span className="text-xs text-card-foreground">
                    High Contrast
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.largeText}
                    onChange={(e) =>
                      updateSetting("largeText", e.target.checked)
                    }
                    className="w-3.5 h-3.5 rounded"
                  />
                  <span className="text-xs text-card-foreground">
                    Large Text
                  </span>
                </label>
              </div>

              <div className="space-y-2">
                <div>
                  <label className="text-[10px] text-muted-foreground flex items-center justify-between mb-1">
                    <span>Speech Rate</span>
                    <span className="font-medium text-card-foreground">
                      {settings.ttsRate}x
                    </span>
                  </label>
                  <input
                    type="range"
                    min={0.5}
                    max={2}
                    step={0.1}
                    value={settings.ttsRate}
                    onChange={(e) =>
                      updateSetting("ttsRate", Number(e.target.value))
                    }
                    className="w-full accent-purple-600"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground flex items-center justify-between mb-1">
                    <span>Pitch</span>
                    <span className="font-medium text-card-foreground">
                      {settings.ttsPitch}
                    </span>
                  </label>
                  <input
                    type="range"
                    min={0.5}
                    max={2}
                    step={0.1}
                    value={settings.ttsPitch}
                    onChange={(e) =>
                      updateSetting("ttsPitch", Number(e.target.value))
                    }
                    className="w-full accent-purple-600"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground flex items-center justify-between mb-1">
                    <span>Volume</span>
                    <span className="font-medium text-card-foreground">
                      {Math.round(settings.ttsVolume * 100)}%
                    </span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={settings.ttsVolume}
                    onChange={(e) =>
                      updateSetting("ttsVolume", Number(e.target.value))
                    }
                    className="w-full accent-purple-600"
                  />
                </div>
              </div>

              <button
                onClick={() => {
                  speak(
                    "This is a test of the text to speech system.",
                    settings,
                  );
                }}
                className="w-full py-1.5 rounded-lg bg-purple-500/10 text-purple-600 text-xs font-semibold hover:bg-purple-500/20 transition-colors"
              >
                Test Voice
              </button>
            </div>
          )}

          {/* ── Section 1: Text to Speech ── */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5" /> Text to Speech
            </p>

            {!hasTTS && (
              <p className="text-xs text-orange-500 bg-orange-500/10 px-3 py-2 rounded-lg">
                ⚠️ TTS not supported in this browser.
              </p>
            )}

            <textarea
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Type or paste any text here to hear it spoken aloud..."
              rows={3}
              className="w-full px-3 py-2 rounded-xl bg-background border border-border text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/20 resize-none"
              aria-label="Text to speak"
            />

            <div className="flex gap-2">
              <button
                onClick={() => handleSpeak(customText)}
                disabled={!hasTTS || !customText.trim() || isSpeaking}
                className="flex-1 py-2 rounded-xl bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors"
                aria-label="Speak text"
              >
                {isSpeaking ? (
                  <>
                    <Square className="w-3.5 h-3.5" /> Speaking...
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" /> Speak Text
                  </>
                )}
              </button>
              {isSpeaking && (
                <button
                  onClick={handleStop}
                  className="px-3 py-2 rounded-xl bg-secondary text-muted-foreground text-xs font-semibold hover:bg-secondary/80 flex items-center gap-1.5 transition-colors"
                  aria-label="Stop speaking"
                >
                  <Square className="w-3.5 h-3.5" />
                  Stop
                </button>
              )}
            </div>

            {/* Quick phrases */}
            <div className="flex flex-wrap gap-1.5">
              {[
                "Read page content",
                "Current time",
                "Help",
                "Navigate to dashboard",
              ].map((phrase) => (
                <button
                  key={phrase}
                  onClick={() => {
                    if (phrase === "Current time") {
                      const t = new Date().toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                      });
                      handleSpeak(`The current time is ${t}`);
                    } else if (phrase === "Help") {
                      handleSpeak(
                        "You can use this panel to hear text spoken, give voice commands, and identify objects using your camera. Hold the SOS button for emergencies.",
                      );
                    } else {
                      handleSpeak(phrase);
                    }
                  }}
                  className="px-2 py-1 rounded-lg bg-secondary text-[10px] font-medium text-muted-foreground hover:bg-purple-500/10 hover:text-purple-600 transition-colors"
                >
                  {phrase}
                </button>
              ))}
            </div>
          </div>

          {/* ── Section 2: Voice Commands ── */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Mic className="w-3.5 h-3.5" /> Voice Commands
            </p>

            {!hasSR ? (
              <p className="text-xs text-orange-500 bg-orange-500/10 px-3 py-2 rounded-lg">
                ⚠️ Speech recognition requires Chrome or Edge.
              </p>
            ) : (
              <>
                <button
                  onClick={isListening ? stopListening : startListening}
                  className={`w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                    isListening
                      ? "bg-red-500 text-white shadow-lg scale-[1.02] animate-pulse"
                      : "bg-purple-600 text-white hover:bg-purple-700"
                  }`}
                  aria-label={
                    isListening ? "Stop listening" : "Start voice recognition"
                  }
                >
                  {isListening ? (
                    <>
                      <div className="flex gap-1 items-center">
                        <span
                          className="w-1.5 h-4 bg-white rounded-full animate-bounce"
                          style={{ animationDelay: "0ms" }}
                        />
                        <span
                          className="w-1.5 h-6 bg-white rounded-full animate-bounce"
                          style={{ animationDelay: "100ms" }}
                        />
                        <span
                          className="w-1.5 h-4 bg-white rounded-full animate-bounce"
                          style={{ animationDelay: "200ms" }}
                        />
                      </div>
                      Listening... (tap to stop)
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4" />
                      Start Listening
                    </>
                  )}
                </button>

                {transcript && (
                  <div className="px-3 py-2 rounded-xl bg-purple-500/5 border border-purple-500/20 space-y-1">
                    <p className="text-[10px] text-muted-foreground">
                      Transcript:
                    </p>
                    <p className="text-xs text-card-foreground italic">
                      "{transcript}"
                    </p>
                    {voiceResult && (
                      <p className="text-[10px] text-purple-600 font-medium">
                        {voiceResult}
                      </p>
                    )}
                  </div>
                )}

                {/* Available commands hint */}
                <div className="px-3 py-2 rounded-xl bg-secondary/40 space-y-1">
                  <p className="text-[10px] font-semibold text-muted-foreground">
                    Example commands:
                  </p>
                  {[
                    "Go to dashboard",
                    "Open itinerary",
                    "Check safety",
                    "What time is it",
                    "Help me navigate",
                  ].map((cmd) => (
                    <p
                      key={cmd}
                      className="text-[10px] text-muted-foreground flex items-center gap-1"
                    >
                      <span className="text-purple-500">›</span> "{cmd}"
                    </p>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* ── Section 3: AI Voice Chat ── */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" /> Ask AI (Voice or Text)
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                value={aiChatQuery}
                onChange={(e) => setAiChatQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && askAI()}
                placeholder="Ask anything about your trip..."
                className="flex-1 px-3 py-2 rounded-xl bg-background border border-border text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                aria-label="Ask AI assistant"
              />
              <button
                onClick={askByVoice}
                disabled={isListening || aiLoading}
                className="p-2 rounded-xl bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
                aria-label="Ask by voice"
                title="Ask by voice"
              >
                {isListening ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={askAI}
                disabled={aiLoading || !aiChatQuery.trim()}
                className="p-2 rounded-xl bg-secondary text-muted-foreground hover:bg-secondary/80 disabled:opacity-50 transition-colors"
                aria-label="Submit question"
              >
                {aiLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <MessageSquare className="w-4 h-4" />
                )}
              </button>
            </div>

            {aiChatResponse && (
              <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/20 space-y-2">
                <p className="text-[10px] text-muted-foreground font-semibold">
                  AI Response:
                </p>
                <p className="text-xs text-card-foreground leading-relaxed">
                  {aiChatResponse}
                </p>
                <button
                  onClick={() => speak(aiChatResponse, settings)}
                  className="text-[10px] text-purple-600 hover:underline flex items-center gap-1"
                >
                  <Volume2 className="w-3 h-3" /> Speak response
                </button>
              </div>
            )}
          </div>

          {/* ── Section 4: Object Identification ── */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <ScanLine className="w-3.5 h-3.5" /> Object Identification
            </p>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Point your camera at an object, sign, or scene and let AI describe
              what it sees — designed for visually impaired travelers.
            </p>

            {!cameraActive ? (
              <button
                onClick={startCamera}
                className="w-full py-2.5 rounded-xl bg-secondary border border-border text-xs font-semibold text-card-foreground hover:bg-secondary/80 flex items-center justify-center gap-2 transition-colors"
                aria-label="Start camera"
              >
                <Camera className="w-4 h-4 text-purple-600" />
                Activate Camera
              </button>
            ) : (
              <div className="space-y-2">
                <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                    aria-label="Camera feed"
                  />
                  {identifying && (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2">
                      <Loader2 className="w-8 h-8 text-white animate-spin" />
                      <p className="text-white text-xs font-semibold">
                        Identifying...
                      </p>
                    </div>
                  )}
                </div>

                {/* Hidden canvas for capture */}
                <canvas ref={canvasRef} className="hidden" />

                <div className="flex gap-2">
                  <button
                    onClick={identifyObjects}
                    disabled={identifying}
                    className="flex-1 py-2.5 rounded-xl bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                    aria-label="Identify objects in camera view"
                  >
                    {identifying ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ScanLine className="w-3.5 h-3.5" />
                    )}
                    {identifying ? "Analyzing..." : "Identify Objects"}
                  </button>
                  <button
                    onClick={stopCamera}
                    className="px-3 py-2.5 rounded-xl bg-secondary text-muted-foreground text-xs font-semibold hover:bg-secondary/80 flex items-center gap-1.5 transition-colors"
                    aria-label="Stop camera"
                  >
                    <X className="w-3.5 h-3.5" />
                    Stop
                  </button>
                </div>
              </div>
            )}

            {identifiedText && (
              <div className="p-3 rounded-xl bg-green-500/5 border border-green-500/20 space-y-2">
                <p className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1">
                  <Eye className="w-3 h-3 text-green-600" /> What I see:
                </p>
                <p className="text-xs text-card-foreground leading-relaxed">
                  {identifiedText}
                </p>
                <button
                  onClick={() => speak(identifiedText, settings)}
                  className="text-[10px] text-purple-600 hover:underline flex items-center gap-1"
                  aria-label="Speak the identified objects description"
                >
                  <Volume2 className="w-3 h-3" /> Speak description
                </button>
              </div>
            )}
          </div>

          {/* ── Quick Access Bar ── */}
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border">
            <button
              onClick={() => {
                const time = new Date().toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                });
                const date = new Date().toLocaleDateString("en-IN", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                });
                speak(`Today is ${date}. The time is ${time}.`, settings);
              }}
              className="py-2 rounded-xl bg-secondary text-[11px] font-medium text-muted-foreground hover:bg-purple-500/10 hover:text-purple-600 transition-colors flex items-center justify-center gap-1.5"
              aria-label="Speak current date and time"
            >
              🕐 Date &amp; Time
            </button>
            <button
              onClick={() => {
                speak(
                  "Emergency tip: In India, call 100 for Police, 108 for Ambulance, 1091 for Women Helpline, and 101 for Fire. Hold the red SOS button in the app for emergency alerts.",
                  settings,
                );
              }}
              className="py-2 rounded-xl bg-secondary text-[11px] font-medium text-muted-foreground hover:bg-red-500/10 hover:text-red-600 transition-colors flex items-center justify-center gap-1.5"
              aria-label="Speak emergency numbers"
            >
              🆘 Emergency Numbers
            </button>
            <button
              onClick={() => {
                speak(
                  "Navigation tip: You can ask the AI assistant any question about your trip, or use voice commands by tapping the microphone button.",
                  settings,
                );
              }}
              className="py-2 rounded-xl bg-secondary text-[11px] font-medium text-muted-foreground hover:bg-purple-500/10 hover:text-purple-600 transition-colors flex items-center justify-center gap-1.5"
              aria-label="Speak navigation help"
            >
              🗺️ Navigation Help
            </button>
            <button
              onClick={() => {
                speak(
                  "Accessibility features: Text to Speech reads content aloud. Voice Commands let you speak to navigate. Object Identification uses your camera to describe what you see.",
                  settings,
                );
              }}
              className="py-2 rounded-xl bg-secondary text-[11px] font-medium text-muted-foreground hover:bg-purple-500/10 hover:text-purple-600 transition-colors flex items-center justify-center gap-1.5"
              aria-label="Explain accessibility features"
            >
              ♿ A11y Guide
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
