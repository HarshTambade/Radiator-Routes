import { useState, useEffect, useRef, useCallback } from "react";
import {
  Mic,
  Volume2,
  Camera,
  Loader2,
  ScanLine,
  Eye,
  Sparkles,
  Navigation,
  BookOpen,
  Settings2,
  Play,
  Square,
  CheckCircle2,
  AlertTriangle,
  Home,
  Map,
  Users,
  UserCircle,
  Compass,
  RefreshCw,
  Keyboard,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useLocation } from "react-router-dom";
import { callGemini } from "@/services/gemini";

// ─────────────────────────────────────────────────────────────────────────────
// Types & constants
// ─────────────────────────────────────────────────────────────────────────────

interface A11ySettings {
  ttsRate: number;
  ttsPitch: number;
  ttsVolume: number;
  highContrast: boolean;
  largeText: boolean;
  blindMode: boolean;
  autoAnnounce: boolean;
}

const DEFAULTS: A11ySettings = {
  ttsRate: 0.88,
  ttsPitch: 1.0,
  ttsVolume: 1.0,
  highContrast: false,
  largeText: false,
  blindMode: false,
  autoAnnounce: true,
};

const SK = "rr_a11y_settings";
const LAST_SPEECH_KEY = "rr_a11y_last_speech";

const PAGE_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard — your trips overview",
  "/itinerary": "Itinerary — plan your trip",
  "/explore": "Explore — discover places",
  "/friends": "Friends — your travel companions",
  "/profile": "Profile — your account",
  "/guide": "Travel Guide",
  "/community": "Community",
};

// ─────────────────────────────────────────────────────────────────────────────
// Utility: load / save settings
// ─────────────────────────────────────────────────────────────────────────────

function loadSettings(): A11ySettings {
  try {
    const raw = localStorage.getItem(SK);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

function saveSettings(s: A11ySettings) {
  try {
    localStorage.setItem(SK, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TTS helpers
// ─────────────────────────────────────────────────────────────────────────────

export function speak(
  text: string,
  rate = 0.88,
  pitch = 1.0,
  volume = 1.0,
  onEnd?: () => void,
) {
  if (!("speechSynthesis" in window) || !text.trim()) return;
  window.speechSynthesis.cancel();
  try {
    localStorage.setItem(LAST_SPEECH_KEY, text);
  } catch {
    /* ignore */
  }
  const u = new SpeechSynthesisUtterance(text);
  u.rate = rate;
  u.pitch = pitch;
  u.volume = volume;
  // Prefer a clear, local English voice
  const voices = window.speechSynthesis.getVoices();
  const pref =
    voices.find((v) => v.name.includes("Google UK English Female")) ||
    voices.find((v) => v.name.includes("Samantha")) ||
    voices.find((v) => v.lang === "en-GB" && v.localService) ||
    voices.find((v) => v.lang.startsWith("en") && v.localService) ||
    voices.find((v) => v.lang.startsWith("en"));
  if (pref) u.voice = pref;
  if (onEnd) u.onend = onEnd;
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

// ─────────────────────────────────────────────────────────────────────────────
// DOM content reader — reads meaningful text from the current page
// ─────────────────────────────────────────────────────────────────────────────

function readPageContent(): string {
  const parts: string[] = [];

  // Page heading
  const h1 = document.querySelector("h1");
  if (h1?.textContent) parts.push(`Page: ${h1.textContent.trim()}.`);

  // Section headings
  document.querySelectorAll("h2, h3").forEach((el) => {
    const t = el.textContent?.trim();
    if (t && t.length > 2 && t.length < 120) parts.push(`Section: ${t}.`);
  });

  // Cards / key text blocks
  document
    .querySelectorAll(
      ".bg-card p, .bg-card h3, .bg-card h4, [class*='font-semibold'], [class*='font-bold']",
    )
    .forEach((el) => {
      const t = el.textContent?.trim();
      if (t && t.length > 3 && t.length < 200 && !parts.includes(t)) {
        parts.push(t);
      }
    });

  // Buttons
  const btns: string[] = [];
  document.querySelectorAll("button, a[role='button']").forEach((el) => {
    const t = el.textContent?.trim();
    if (t && t.length > 1 && t.length < 60) btns.push(t);
  });
  if (btns.length > 0)
    parts.push(`Available actions: ${btns.slice(0, 8).join(", ")}.`);

  if (parts.length === 0) return "Page loaded. No readable content detected.";
  return parts.slice(0, 14).join(" ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Vision / object identification (Groq vision)
// ─────────────────────────────────────────────────────────────────────────────

async function identifyFromVideo(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): Promise<string> {
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(video, 0, 0);
  const base64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];

  const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY as string | undefined;
  if (!GROQ_API_KEY) {
    // Fallback to Gemini text description
    return callGemini(
      "You are an accessibility assistant for a visually impaired traveller. Describe what might be in front of them based on a travel context. Keep it brief and practical.",
      "Describe a typical travel scene clearly for a blind person in 3 sentences.",
      0.5,
      300,
      false,
    );
  }

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
              text: "You are an accessibility assistant for a blind traveller. Describe this image clearly and practically: list all visible objects, text, people, hazards, signs, and distances. Use simple, direct language. Mention anything relevant for safe navigation or travel.",
            },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${base64}` },
            },
          ],
        },
      ],
      temperature: 0.2,
      max_tokens: 450,
    }),
  });
  if (!res.ok) throw new Error(`Vision API error: ${res.status}`);
  const data = await res.json();
  return (
    data.choices?.[0]?.message?.content ?? "Could not identify scene content."
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Speech recognition factory
// ─────────────────────────────────────────────────────────────────────────────

function createSR(lang = "en-IN") {
  const SR =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;
  if (!SR) return null;
  const rec = new SR();
  rec.continuous = false;
  rec.interimResults = false;
  rec.lang = lang;
  return rec;
}

// ─────────────────────────────────────────────────────────────────────────────
// Voice command processor
// ─────────────────────────────────────────────────────────────────────────────

type CmdResult =
  | { type: "navigate"; path: string; label: string }
  | { type: "read_page" }
  | { type: "read_headings" }
  | { type: "read_buttons" }
  | { type: "repeat" }
  | { type: "stop" }
  | { type: "time" }
  | { type: "date" }
  | { type: "sos" }
  | { type: "open_jinny" }
  | { type: "open_camera" }
  | { type: "help" }
  | { type: "emergency_numbers" }
  | { type: "battery" }
  | { type: "unknown"; raw: string };

// ─── Normalise common speech-to-text quirks ───────────────────────────────
function normaliseSpeech(raw: string): string {
  return (
    raw
      .toLowerCase()
      .trim()
      // numbers as words
      .replace(/\bone\b/g, "1")
      .replace(/\btwo\b/g, "2")
      .replace(/\bthree\b/g, "3")
      // common mis-hearings
      .replace(/\bjinney\b/g, "jinny")
      .replace(/\bjenny\b/g, "jinny")
      .replace(/\bginny\b/g, "jinny")
      .replace(/\bgenie\b/g, "jinny")
      .replace(/\bexplore\b/g, "explore")
      // punctuation noise
      .replace(/[.,!?;:'"]/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}

function parseCommand(raw: string): CmdResult {
  const t = normaliseSpeech(raw);

  // ── Stop / mute ───────────────────────────────────────────────────────────
  if (
    /(^|\s)(stop|quiet|silence|shut\s*up|mute|cancel|pause|enough|be\s*quiet|stop\s*talking|stop\s*speaking)(\s|$)/.test(
      t,
    )
  )
    return { type: "stop" };

  // ── SOS / emergency — check BEFORE other patterns ────────────────────────
  if (
    /(^|\s)(sos|emergency|mayday|help\s*me|i\s*(need|am)\s*(help|in\s*danger|hurt|injured|lost|stranded)|call\s*(for\s*)?help|danger|unsafe|in\s*trouble|accident|ambulance\s*now|police\s*now|save\s*me)(\s|$)/.test(
      t,
    )
  )
    return { type: "sos" };

  // ── Emergency numbers ─────────────────────────────────────────────────────
  if (
    /(emergency\s*(number|contact|helpline)|helpline|what.*emergency\s*number|call\s*(police|ambulance|fire))/.test(
      t,
    )
  )
    return { type: "emergency_numbers" };

  // ── Repeat ────────────────────────────────────────────────────────────────
  if (
    /(repeat|say\s*again|again|what\s*did\s*you\s*say|say\s*that\s*again|once\s*more|replay)/.test(
      t,
    )
  )
    return { type: "repeat" };

  // ── Time ──────────────────────────────────────────────────────────────────
  if (
    /(what(\s*is|\s*'?s)?\s*the\s*time|current\s*time|time\s*now|tell\s*me\s*the\s*time|what\s*time\s*is\s*it|clock)/.test(
      t,
    )
  )
    return { type: "time" };

  // ── Date ──────────────────────────────────────────────────────────────────
  if (
    /(what(\s*is|\s*'?s)?\s*(the\s*)?(date|day)|today'?s?\s*(date|day)|what\s*day\s*is\s*(it|today)|current\s*date|day\s*of\s*(the\s*)?week)/.test(
      t,
    )
  )
    return { type: "date" };

  // ── Open Jinny AI ─────────────────────────────────────────────────────────
  if (
    /(open\s*(jinny|assistant|ai|bot|chat)|launch\s*(jinny|ai|assistant)|jinny\s*(open|start|wake|activate)|talk\s*to\s*jinny|hey\s*jinny|start\s*jinny)/.test(
      t,
    )
  )
    return { type: "open_jinny" };

  // ── Camera / Object ID ────────────────────────────────────────────────────
  if (
    /(camera|open\s*camera|start\s*camera|identify|what\s*(is\s*)?(in\s*front|around|here|this)|scan|look\s*(around|at\s*this)|describe\s*(scene|surroundings|what|this)|what\s*do\s*you\s*see|see\s*for\s*me|object\s*id)/.test(
      t,
    )
  )
    return { type: "open_camera" };

  // ── Read page ─────────────────────────────────────────────────────────────
  if (
    /(read\s*(page|screen|content|aloud|out|everything)|what('?s|\s*is)\s*(on\s*)?(the\s*)?(screen|page)|describe\s*(page|screen)|read\s*it\s*out|tell\s*me\s*what'?s\s*(here|on\s*screen))/.test(
      t,
    )
  )
    return { type: "read_page" };

  // ── Read headings ─────────────────────────────────────────────────────────
  if (
    /(read\s*(head(ing|er)s?|title|section)|list\s*(head(ing|er)s?|section))/.test(
      t,
    )
  )
    return { type: "read_headings" };

  // ── Read buttons ──────────────────────────────────────────────────────────
  if (
    /(read\s*(button|action|link)s?|list\s*(button|action|link)s?|what\s*(button|action)s?\s*(are|can|do))/.test(
      t,
    )
  )
    return { type: "read_buttons" };

  // ── Help ──────────────────────────────────────────────────────────────────
  if (
    /(help|what\s*can\s*(you|i)\s*(do|say)|commands?|how\s*to\s*(use|voice)|tutorial|voice\s*commands?)/.test(
      t,
    )
  )
    return { type: "help" };

  // ── Battery ───────────────────────────────────────────────────────────────
  if (/(battery|charge|power\s*level|how\s*much\s*(charge|battery))/.test(t))
    return { type: "battery" };

  // ─── Navigation ───────────────────────────────────────────────────────────
  if (
    /(go\s*to\s*(dashboard|home)|open\s*(dashboard|home)|dashboard|main\s*(page|screen)|home\s*page|go\s*home)/.test(
      t,
    )
  )
    return { type: "navigate", path: "/dashboard", label: "Dashboard" };

  if (
    /(go\s*to\s*(itinerary|trips?|plan)|open\s*(itinerary|trips?)|itinerary|my\s*trips?|trip\s*plan(ner)?|schedule|planner)/.test(
      t,
    )
  )
    return { type: "navigate", path: "/itinerary", label: "Itinerary" };

  if (
    /(go\s*to\s*explore|open\s*explore|explore|discover|find\s*places?|search\s*places?|places?\s*near)/.test(
      t,
    )
  )
    return { type: "navigate", path: "/explore", label: "Explore" };

  if (
    /(go\s*to\s*friends?|open\s*friends?|friends?|companion|travel\s*buddy|travel\s*group|people)/.test(
      t,
    )
  )
    return { type: "navigate", path: "/friends", label: "Friends" };

  if (
    /(go\s*to\s*(profile|account|settings)|open\s*(profile|account|settings)|profile|my\s*account|account\s*settings?)/.test(
      t,
    )
  )
    return { type: "navigate", path: "/profile", label: "Profile" };

  if (
    /(go\s*to\s*(guide|travel\s*guide)|open\s*(guide|travel\s*guide)|travel\s*guide|destination\s*guide|guide)/.test(
      t,
    )
  )
    return { type: "navigate", path: "/guide", label: "Travel Guide" };

  if (
    /(go\s*to\s*community|open\s*community|community|social\s*tab|forum)/.test(
      t,
    )
  )
    return { type: "navigate", path: "/community", label: "Community" };

  return { type: "unknown", raw };
}

// ─────────────────────────────────────────────────────────────────────────────
// Mini sub-components
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Tabs
// ─────────────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "navigate", label: "Navigate", emoji: "🧭" },
  { id: "camera", label: "Camera", emoji: "📷" },
  { id: "reader", label: "Reader", emoji: "📖" },
  { id: "ask", label: "Ask AI", emoji: "🤖" },
  { id: "settings", label: "Settings", emoji: "⚙️" },
] as const;
type TabId = (typeof TABS)[number]["id"];

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function AccessibilityPanel() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [settings, setSettings] = useState<A11ySettings>(loadSettings);
  const [tab, setTab] = useState<TabId>("navigate");

  // Voice state
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [cmdFeedback, setCmdFeedback] = useState("");
  const recRef = useRef<any>(null);

  // TTS state
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [customText, setCustomText] = useState("");

  // Camera / object ID
  const [cameraActive, setCameraActive] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const [identified, setIdentified] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // AI ask
  const [query, setQuery] = useState("");
  const [aiReply, setAiReply] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const s = settings;

  // ── Persist settings + apply global classes ────────────────────────────────
  useEffect(() => {
    saveSettings(settings);
    const root = document.documentElement;
    root.classList.toggle("high-contrast", settings.highContrast);
    root.style.fontSize = settings.largeText ? "18px" : "";
  }, [settings]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopCamera();
      stopSpeaking();
      recRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-announce on route change (blind mode) ─────────────────────────────
  useEffect(() => {
    if (!settings.blindMode || !settings.autoAnnounce) return;
    const path = location.pathname;
    let label =
      PAGE_LABELS[path] ||
      (path.startsWith("/itinerary/")
        ? "Itinerary detail page. Your trip plan is loading."
        : `Page: ${path.replace("/", "").replace(/-/g, " ")}.`);
    // Short delay so the page actually renders
    const t = setTimeout(() => {
      speak(label, s.ttsRate, s.ttsPitch, s.ttsVolume);
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, settings.blindMode]);

  // ── Keyboard shortcut: Alt+A focuses accessibility, Alt+R reads page ────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "r") {
        e.preventDefault();
        handleReadPage();
      }
      if (e.altKey && e.key === "s") {
        e.preventDefault();
        stopSpeaking();
        setIsSpeaking(false);
      }
      if (e.altKey && e.key === "v") {
        e.preventDefault();
        startVoiceCommand();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const ttsSpeak = useCallback(
    (text: string, onEnd?: () => void) =>
      speak(text, s.ttsRate, s.ttsPitch, s.ttsVolume, onEnd),
    [s.ttsRate, s.ttsPitch, s.ttsVolume],
  );

  const vibrate = (ms = 60) => {
    try {
      if (navigator.vibrate) navigator.vibrate(ms);
    } catch {
      /* ignore */
    }
  };

  // ── Read current page ──────────────────────────────────────────────────────

  const handleReadPage = useCallback(() => {
    setIsSpeaking(true);
    const content = readPageContent();
    ttsSpeak(content, () => setIsSpeaking(false));
    toast({ title: "📖 Reading page…", description: "Alt+S to stop." });
  }, [ttsSpeak, toast]);

  // ── Execute voice command ──────────────────────────────────────────────────

  const executeCommand = useCallback(
    (raw: string) => {
      const cmd = parseCommand(raw);
      vibrate(40);

      switch (cmd.type) {
        // ── Stop TTS ─────────────────────────────────────────────────────────
        case "stop":
          stopSpeaking();
          setIsSpeaking(false);
          setCmdFeedback("Stopped.");
          break;

        // ── Repeat last ──────────────────────────────────────────────────────
        case "repeat": {
          let last = "";
          try {
            last = localStorage.getItem(LAST_SPEECH_KEY) || "";
          } catch {
            /* ignore */
          }
          if (last) {
            ttsSpeak(last);
            setCmdFeedback("Repeating last speech.");
          } else {
            ttsSpeak("Nothing to repeat yet.");
            setCmdFeedback("Nothing to repeat.");
          }
          break;
        }

        // ── Current time ─────────────────────────────────────────────────────
        case "time": {
          const t = new Date().toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          });
          ttsSpeak(`The current time is ${t}.`);
          setCmdFeedback(`Time: ${t}`);
          break;
        }

        // ── Current date ─────────────────────────────────────────────────────
        case "date": {
          const d = new Date().toLocaleDateString("en-IN", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          });
          ttsSpeak(`Today is ${d}.`);
          setCmdFeedback(`Date: ${d}`);
          break;
        }

        // ── Read full page ────────────────────────────────────────────────────
        case "read_page":
          handleReadPage();
          setCmdFeedback("Reading page content…");
          break;

        // ── Read only headings ────────────────────────────────────────────────
        case "read_headings": {
          const hs = Array.from(document.querySelectorAll("h1,h2,h3"))
            .map((e) => e.textContent?.trim())
            .filter(Boolean)
            .join(". ");
          const msg = hs || "No headings found on this page.";
          ttsSpeak(msg);
          setCmdFeedback("Reading page headings.");
          break;
        }

        // ── Read all buttons / links ──────────────────────────────────────────
        case "read_buttons": {
          const bs = Array.from(document.querySelectorAll("button,a"))
            .map((e) => e.textContent?.trim())
            .filter((t) => t && t.length > 1 && t.length < 60)
            .slice(0, 12)
            .join(", ");
          const msg = bs
            ? `Available actions: ${bs}.`
            : "No buttons found on this page.";
          ttsSpeak(msg);
          setCmdFeedback("Reading buttons and links.");
          break;
        }

        // ── Navigate ──────────────────────────────────────────────────────────
        case "navigate":
          ttsSpeak(`Navigating to ${cmd.label}.`, () => navigate(cmd.path));
          setCmdFeedback(`Going to ${cmd.label}…`);
          break;

        // ── SOS ───────────────────────────────────────────────────────────────
        case "sos":
          ttsSpeak(
            "Activating SOS emergency panel. Stay calm. Police 100. Ambulance 108.",
          );
          vibrate(200);
          window.dispatchEvent(new CustomEvent("open-sos"));
          setCmdFeedback("SOS panel opening…");
          break;

        // ── Emergency numbers ─────────────────────────────────────────────────
        case "emergency_numbers":
          ttsSpeak(
            "Emergency numbers in India. Police: 100. Ambulance: 108. Women helpline: 1091. Fire brigade: 101. National disaster: 1078. Child helpline: 1098.",
          );
          setCmdFeedback("Emergency numbers spoken.");
          break;

        // ── Open Jinny ────────────────────────────────────────────────────────
        case "open_jinny":
          ttsSpeak("Opening Jinny, your AI travel assistant.");
          window.dispatchEvent(new CustomEvent("jinny-open"));
          setCmdFeedback("Opening Jinny AI…");
          break;

        // ── Open camera ───────────────────────────────────────────────────────
        case "open_camera":
          ttsSpeak(
            "Opening camera for object identification. Press Identify to describe what the camera sees.",
          );
          setTab("camera");
          setCmdFeedback("Opening camera…");
          break;

        // ── Battery ───────────────────────────────────────────────────────────
        case "battery": {
          const nav = navigator as any;
          if (nav.getBattery) {
            nav.getBattery().then((bat: any) => {
              const pct = Math.round(bat.level * 100);
              const charging = bat.charging ? " and charging" : "";
              ttsSpeak(`Battery is at ${pct} percent${charging}.`);
              setCmdFeedback(`Battery: ${pct}%${charging}`);
            });
          } else {
            ttsSpeak("Battery information is not available in this browser.");
            setCmdFeedback("Battery info unavailable.");
          }
          break;
        }

        // ── Help ──────────────────────────────────────────────────────────────
        case "help":
          ttsSpeak(
            "Available voice commands: " +
              "go to dashboard. " +
              "go to trips. " +
              "go to friends. " +
              "go to explore. " +
              "go to profile. " +
              "go to guide. " +
              "read page. " +
              "read headings. " +
              "read buttons. " +
              "what time is it. " +
              "what day is it. " +
              "open camera. " +
              "open Jinny. " +
              "emergency numbers. " +
              "SOS or emergency. " +
              "battery level. " +
              "stop. " +
              "repeat.",
          );
          setCmdFeedback("Help spoken aloud.");
          break;

        // ── Unknown ───────────────────────────────────────────────────────────
        default:
          ttsSpeak(
            `Sorry, I didn't understand: "${cmd.raw}". Say help to hear all available commands.`,
          );
          setCmdFeedback(`Unknown command: "${cmd.raw}"`);
      }
    },
    [ttsSpeak, navigate, handleReadPage],
  );

  // ── Voice command listener ─────────────────────────────────────────────────

  const startVoiceCommand = useCallback(() => {
    const rec = createSR("en-IN");
    if (!rec) {
      toast({
        title: "Voice not supported",
        description: "Use Chrome or Edge for voice commands.",
        variant: "destructive",
      });
      return;
    }

    // Stop any existing recognition
    try {
      recRef.current?.abort();
    } catch {
      /* ignore */
    }

    // ── CRITICAL: Stop TTS FIRST so the mic doesn't pick up our own voice ──
    // This is the main cause of "stops without command" — TTS plays "Listening"
    // which the mic captures, triggering an immediate (wrong) recognition result.
    stopSpeaking();

    recRef.current = rec;
    setTranscript("");
    setCmdFeedback("Tap to speak a command…");
    setIsListening(true);
    vibrate(60);

    let finalText = "";
    let started = false;

    const doStart = () => {
      try {
        rec.start();
        started = true;
      } catch {
        setIsListening(false);
        toast({
          title: "Could not start microphone",
          description: "Please try again.",
          variant: "destructive",
        });
      }
    };

    rec.onresult = (e: any) => {
      finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          // Pick the highest-confidence alternative
          let best = e.results[i][0].transcript;
          let bestConf = e.results[i][0].confidence ?? 0;
          for (let a = 1; a < e.results[i].length; a++) {
            if ((e.results[i][a].confidence ?? 0) > bestConf) {
              bestConf = e.results[i][a].confidence;
              best = e.results[i][a].transcript;
            }
          }
          finalText += best + " ";
        }
      }
      if (finalText.trim()) {
        setTranscript(finalText.trim());
        executeCommand(finalText.trim());
      }
    };

    rec.onerror = (e: any) => {
      setIsListening(false);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        toast({
          title: "Microphone blocked",
          description: "Allow microphone access in browser settings.",
          variant: "destructive",
        });
        return;
      }
      if (e.error === "no-speech") {
        // Don't speak "no speech" — that creates another feedback loop!
        setCmdFeedback("No speech detected. Tap the mic and speak clearly.");
        return;
      }
      if (e.error === "aborted") return;
      toast({
        title: "Voice error",
        description: `Recognition error: ${e.error}. Please try again.`,
        variant: "destructive",
      });
    };

    rec.onend = () => {
      setIsListening(false);
      if (!finalText.trim() && started) {
        setCmdFeedback("Nothing heard — tap mic and speak clearly.");
      }
    };

    // ── Delay start by 600ms so any TTS audio fully clears before mic opens ──
    // Without this delay the microphone captures the tail of "Listening" TTS
    // and immediately fires an onresult with garbage, causing auto-stop.
    setTimeout(doStart, 600);
  }, [executeCommand, toast]);

  const stopVoiceCommand = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    setIsListening(false);
  }, []);

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
      ttsSpeak(
        "Camera is ready. Press Identify to describe what I see. I will read the description aloud.",
      );
    } catch {
      toast({
        title: "Camera denied",
        description: "Allow camera access to use object identification.",
        variant: "destructive",
      });
      ttsSpeak(
        "Camera permission denied. Please allow camera access in your browser settings.",
      );
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraActive(false);
    setIdentified("");
  };

  const handleIdentify = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setIdentifying(true);
    ttsSpeak("Analysing the scene. Please hold the camera steady.");
    try {
      const desc = await identifyFromVideo(videoRef.current, canvasRef.current);
      setIdentified(desc);
      ttsSpeak(desc);
      vibrate(200);
    } catch (err: any) {
      const msg = "Could not identify the scene. Please try again.";
      ttsSpeak(msg);
      toast({
        title: "Identification failed",
        description: err?.message,
        variant: "destructive",
      });
    } finally {
      setIdentifying(false);
    }
  };

  // ── AI ask ─────────────────────────────────────────────────────────────────

  const askAI = useCallback(
    async (q: string) => {
      if (!q.trim()) return;
      setAiLoading(true);
      setAiReply("");
      ttsSpeak("Thinking. One moment.");
      try {
        const systemPrompt =
          "You are a helpful travel assistant for visually impaired users. " +
          "The app is called Radiator Routes — a travel planning app with features: " +
          "Dashboard (trip overview), Itinerary (AI trip planner), Explore (discover places), " +
          "Friends (travel companions), Guide (destination guide), SOS (emergency), " +
          "Jinny AI (conversational assistant), UPI Payment (split bills), Safety Warnings, " +
          "Weather, Maps, Collaborative Planning. " +
          "Answer concisely in plain, clear spoken language. No markdown. No bullet points. " +
          "Speak naturally as if talking to a blind traveller.";
        const reply = await callGemini(systemPrompt, q, 0.65, 400, false);
        setAiReply(reply);
        ttsSpeak(reply);
      } catch {
        const fallback =
          "Sorry, I could not process your request right now. Please try again.";
        setAiReply(fallback);
        ttsSpeak(fallback);
      } finally {
        setAiLoading(false);
      }
    },
    [ttsSpeak],
  );

  const askByVoice = useCallback(() => {
    const rec = createSR();
    if (!rec) return;
    ttsSpeak("What would you like to know?", () => {
      setIsListening(true);
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
      try {
        rec.start();
      } catch {
        setIsListening(false);
      }
    });
  }, [ttsSpeak, askAI]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const hasTTS = "speechSynthesis" in window;
  const hasSR = !!(
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  );

  const updateSettings = (patch: Partial<A11ySettings>) =>
    setSettings((p) => ({ ...p, ...patch }));

  // ── Quick navigation items ─────────────────────────────────────────────────

  const NAV_ITEMS = [
    {
      label: "Dashboard",
      path: "/dashboard",
      icon: <Home className="w-4 h-4" />,
      desc: "View all your trips and travel stats",
    },
    {
      label: "My Trips",
      path: "/itinerary",
      icon: <Map className="w-4 h-4" />,
      desc: "View and plan your itinerary",
    },
    {
      label: "Explore",
      path: "/explore",
      icon: <Compass className="w-4 h-4" />,
      desc: "Discover new destinations",
    },
    {
      label: "Friends",
      path: "/friends",
      icon: <Users className="w-4 h-4" />,
      desc: "Manage travel companions",
    },
    {
      label: "Guide",
      path: "/guide",
      icon: <BookOpen className="w-4 h-4" />,
      desc: "Travel guide and tips",
    },
    {
      label: "Profile",
      path: "/profile",
      icon: <UserCircle className="w-4 h-4" />,
      desc: "Your account and settings",
    },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="bg-card flex flex-col" style={{ minHeight: "60vh" }}>
      {/* ── Blind Mode Banner ── */}
      {settings.blindMode && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white text-xs font-semibold shrink-0">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          Blind Mode ON — Alt+V to speak a command · Alt+R to read page · Alt+S
          to stop
        </div>
      )}

      {/* ── Tab Strip ── */}
      <div className="flex gap-1 p-3 border-b border-border bg-secondary/30 overflow-x-auto shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              if (settings.blindMode) ttsSpeak(`${t.label} tab.`);
            }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex-shrink-0 ${
              tab === t.id
                ? "bg-purple-600 text-white shadow-sm"
                : "bg-card text-muted-foreground hover:bg-secondary hover:text-card-foreground border border-border"
            }`}
            aria-label={`${t.label} tab`}
            aria-pressed={tab === t.id}
          >
            <span>{t.emoji}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ══ NAVIGATE TAB ══ */}
        {tab === "navigate" && (
          <div className="space-y-4">
            {/* Voice Command Button */}
            <Card>
              <SectionTitle
                icon={<Mic className="w-3.5 h-3.5" />}
                label="Voice Commands"
              />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Say a command to navigate, read content, check time, open SOS,
                or control the app hands-free.
              </p>

              {!hasSR ? (
                <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 text-xs text-orange-600">
                  ⚠️ Voice recognition requires Chrome or Edge browser.
                </div>
              ) : (
                <button
                  onClick={isListening ? stopVoiceCommand : startVoiceCommand}
                  className={`w-full py-5 rounded-2xl font-bold text-base flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-lg ${
                    isListening
                      ? "bg-red-500 text-white shadow-red-500/30 scale-[1.01]"
                      : "bg-purple-600 text-white hover:bg-purple-700 shadow-purple-500/25"
                  }`}
                  aria-label={
                    isListening ? "Stop listening" : "Speak a voice command"
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
                      <Mic className="w-5 h-5" />
                      Speak a Command
                    </>
                  )}
                </button>
              )}

              {transcript && (
                <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/20 space-y-1">
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">
                    Heard:
                  </p>
                  <p className="text-sm text-card-foreground italic">
                    "{transcript}"
                  </p>
                </div>
              )}
              {cmdFeedback && (
                <div className="p-3 rounded-xl bg-green-500/5 border border-green-500/20 space-y-1">
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">
                    Action:
                  </p>
                  <p className="text-sm text-card-foreground font-medium">
                    {cmdFeedback}
                  </p>
                </div>
              )}
            </Card>

            {/* Read Page */}
            <Card>
              <SectionTitle
                icon={<BookOpen className="w-3.5 h-3.5" />}
                label="Read Current Page"
              />
              <p className="text-xs text-muted-foreground">
                Reads all visible headings, sections, and interactive elements
                on screen.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleReadPage}
                  disabled={!hasTTS || isSpeaking}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-40 transition-all active:scale-[0.98]"
                >
                  {isSpeaking ? (
                    <>
                      <Square className="w-4 h-4" /> Reading…
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" /> Read Page
                    </>
                  )}
                </button>
                {isSpeaking && (
                  <button
                    onClick={() => {
                      stopSpeaking();
                      setIsSpeaking(false);
                    }}
                    className="px-4 py-3 rounded-xl bg-secondary border border-border text-sm font-semibold text-muted-foreground hover:bg-secondary/80"
                  >
                    Stop
                  </button>
                )}
              </div>
            </Card>

            {/* Quick Navigation Grid */}
            <Card>
              <SectionTitle
                icon={<Navigation className="w-3.5 h-3.5" />}
                label="Quick Navigation"
              />
              <div className="grid grid-cols-2 gap-2">
                {NAV_ITEMS.map((item) => (
                  <button
                    key={item.path}
                    onClick={() => {
                      ttsSpeak(`Navigating to ${item.label}.`, () =>
                        navigate(item.path),
                      );
                    }}
                    className="flex items-center gap-2.5 px-3 py-3 rounded-xl bg-background border border-border hover:bg-purple-500/8 hover:border-purple-500/30 transition-all text-left active:scale-[0.98] group"
                    aria-label={`Go to ${item.label}: ${item.desc}`}
                  >
                    <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-600 shrink-0 group-hover:bg-purple-500/20">
                      {item.icon}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-card-foreground truncate">
                        {item.label}
                      </p>
                      <p className="text-[10px] text-muted-foreground leading-tight truncate">
                        {item.desc}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </Card>

            {/* Quick Actions */}
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
                      ttsSpeak(`The current time is ${t}.`);
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
                      ttsSpeak(`Today is ${d}.`);
                    },
                  },
                  {
                    label: "🆘 Open SOS",
                    fn: () => {
                      ttsSpeak("Opening SOS emergency panel.");
                      window.dispatchEvent(new CustomEvent("open-sos"));
                    },
                  },
                  {
                    label: "🤖 Open Jinny",
                    fn: () => {
                      ttsSpeak("Opening Jinny your AI travel assistant.");
                      window.dispatchEvent(new CustomEvent("jinny-open"));
                    },
                  },
                  {
                    label: "🆘 Emergency Numbers",
                    fn: () =>
                      ttsSpeak(
                        "Emergency numbers in India: Police 100. Ambulance 108. Women Helpline 1091. Fire 101. Disaster 1078. Child Helpline 1098.",
                      ),
                  },
                  {
                    label: "🔁 Repeat Last",
                    fn: () => {
                      try {
                        const last =
                          localStorage.getItem(LAST_SPEECH_KEY) || "";
                        if (last) ttsSpeak(last);
                        else ttsSpeak("Nothing to repeat.");
                      } catch {
                        ttsSpeak("Nothing to repeat.");
                      }
                    },
                  },
                ].map(({ label, fn }) => (
                  <button
                    key={label}
                    onClick={fn}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-background border border-border text-xs font-medium text-card-foreground hover:bg-purple-500/8 hover:border-purple-500/30 transition-all text-left active:scale-[0.98]"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Card>

            {/* Voice command reference */}
            <Card>
              <SectionTitle
                icon={<Keyboard className="w-3.5 h-3.5" />}
                label="Voice Command Reference"
              />
              <div className="space-y-1.5">
                {[
                  { cmd: "go to dashboard / home", desc: "Opens dashboard" },
                  {
                    cmd: "go to trips / itinerary",
                    desc: "Opens trip planner",
                  },
                  { cmd: "go to friends", desc: "Opens friends page" },
                  { cmd: "go to explore", desc: "Opens explore page" },
                  { cmd: "go to profile", desc: "Opens your profile" },
                  { cmd: "read page", desc: "Reads all screen content" },
                  { cmd: "what time is it", desc: "Speaks current time" },
                  { cmd: "what day is it", desc: "Speaks today's date" },
                  { cmd: "open camera", desc: "Object identification" },
                  { cmd: "open Jinny", desc: "Opens AI assistant" },
                  { cmd: "SOS / emergency", desc: "Opens SOS panel" },
                  { cmd: "stop / silence", desc: "Stops speaking" },
                  { cmd: "repeat", desc: "Repeats last speech" },
                  { cmd: "help", desc: "Lists all commands" },
                ].map(({ cmd, desc }) => (
                  <div
                    key={cmd}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-background border border-border"
                  >
                    <span className="text-xs font-mono text-purple-600 font-semibold">
                      "{cmd}"
                    </span>
                    <span className="text-[10px] text-muted-foreground text-right">
                      {desc}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Keyboard:{" "}
                <kbd className="px-1 py-0.5 rounded bg-secondary border border-border text-[10px]">
                  Alt+V
                </kbd>{" "}
                voice command ·
                <kbd className="px-1 py-0.5 rounded bg-secondary border border-border text-[10px] ml-1">
                  Alt+R
                </kbd>{" "}
                read page ·
                <kbd className="px-1 py-0.5 rounded bg-secondary border border-border text-[10px] ml-1">
                  Alt+S
                </kbd>{" "}
                stop
              </p>
            </Card>

            {/* Text to Speech input */}
            <Card>
              <SectionTitle
                icon={<Volume2 className="w-3.5 h-3.5" />}
                label="Speak Any Text"
              />
              <textarea
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="Type or paste any text here to hear it spoken aloud…"
                rows={3}
                className="w-full px-3 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30 resize-none placeholder:text-muted-foreground/60"
                aria-label="Text to speak aloud"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setIsSpeaking(true);
                    ttsSpeak(customText, () => setIsSpeaking(false));
                  }}
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
                    className="px-4 py-2.5 rounded-xl bg-secondary border border-border text-sm font-semibold text-muted-foreground hover:bg-secondary/80"
                  >
                    Stop
                  </button>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* ══ CAMERA TAB ══ */}
        {tab === "camera" && (
          <div className="space-y-4">
            <Card>
              <SectionTitle
                icon={<ScanLine className="w-3.5 h-3.5" />}
                label="AI Scene Identification"
              />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Point your camera at any object, sign, scene, or text. AI will
                describe exactly what it sees — designed for visually impaired
                travellers.
              </p>
              {!cameraActive ? (
                <button
                  onClick={startCamera}
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 transition-all active:scale-[0.98] shadow-lg shadow-purple-500/20"
                >
                  <Camera className="w-5 h-5" /> Activate Camera
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
                        <div className="w-14 h-14 rounded-full bg-purple-600/20 flex items-center justify-center">
                          <Loader2 className="w-7 h-7 text-purple-400 animate-spin" />
                        </div>
                        <p className="text-white text-sm font-semibold">
                          Analysing scene…
                        </p>
                        <p className="text-white/60 text-xs">
                          Hold camera steady
                        </p>
                      </div>
                    )}
                    {!identifying && (
                      <div className="absolute inset-0 border-2 border-purple-400/30 rounded-2xl pointer-events-none">
                        <div className="absolute top-3 left-3 w-7 h-7 border-t-2 border-l-2 border-purple-400 rounded-tl-lg" />
                        <div className="absolute top-3 right-3 w-7 h-7 border-t-2 border-r-2 border-purple-400 rounded-tr-lg" />
                        <div className="absolute bottom-3 left-3 w-7 h-7 border-b-2 border-l-2 border-purple-400 rounded-bl-lg" />
                        <div className="absolute bottom-3 right-3 w-7 h-7 border-b-2 border-r-2 border-purple-400 rounded-br-lg" />
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
                      {identifying ? "Analysing…" : "Identify Scene"}
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
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => ttsSpeak(identified)}
                    className="flex items-center gap-1.5 text-xs text-purple-600 hover:underline font-medium"
                  >
                    <Volume2 className="w-3.5 h-3.5" /> Read aloud
                  </button>
                  <button
                    onClick={() => {
                      setIdentified("");
                    }}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:underline font-medium ml-auto"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Clear
                  </button>
                </div>
              </Card>
            )}

            <Card>
              <SectionTitle
                icon={<Sparkles className="w-3.5 h-3.5" />}
                label="Camera Tips for Blind Travellers"
              />
              <div className="space-y-2 text-xs text-muted-foreground">
                {[
                  "Point at signs, menus, or notice boards to read text",
                  "Aim at intersections or entrances to understand surroundings",
                  "Use to identify transport vehicles, buses, or trains",
                  "Point at food items to identify dishes while travelling",
                  "Aim at maps or directions boards for navigation help",
                ].map((tip) => (
                  <div
                    key={tip}
                    className="flex items-start gap-2 p-2 rounded-lg bg-background border border-border"
                  >
                    <span className="text-purple-500 font-bold mt-0.5">•</span>
                    <span>{tip}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* ══ READER TAB ══ */}
        {tab === "reader" && (
          <div className="space-y-4">
            <Card>
              <SectionTitle
                icon={<BookOpen className="w-3.5 h-3.5" />}
                label="Page Reader"
              />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Reads the entire current page content aloud including headings,
                sections, trip details, activities, and available buttons.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleReadPage}
                  disabled={!hasTTS || isSpeaking}
                  className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-40 transition-all active:scale-[0.98] shadow-lg shadow-purple-500/20"
                >
                  {isSpeaking ? (
                    <>
                      <Square className="w-5 h-5" /> Reading page…
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5" /> Read Current Page
                    </>
                  )}
                </button>
                {isSpeaking && (
                  <button
                    onClick={() => {
                      stopSpeaking();
                      setIsSpeaking(false);
                    }}
                    className="px-4 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors"
                  >
                    Stop
                  </button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground text-center">
                Keyboard shortcut:{" "}
                <kbd className="px-1.5 py-0.5 rounded bg-secondary border border-border text-[10px] font-mono">
                  Alt + R
                </kbd>
              </p>
            </Card>

            {/* Blind Mode toggle */}
            <Card>
              <SectionTitle
                icon={<Eye className="w-3.5 h-3.5" />}
                label="Blind Mode"
              />
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                When enabled, the app automatically announces the page name
                every time you navigate. Ideal for screen-reader users.
              </p>
              <label className="flex items-center justify-between gap-3 cursor-pointer p-3 rounded-xl bg-background border-2 border-purple-500/30 hover:bg-secondary/40 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">♿</span>
                  <div>
                    <p className="text-sm font-semibold text-card-foreground">
                      Blind Mode
                    </p>
                    <p className="text-[10px] text-muted-foreground leading-tight">
                      Auto-announce pages + keyboard shortcuts active
                    </p>
                  </div>
                </div>
                <div
                  className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${settings.blindMode ? "bg-purple-600" : "bg-border"}`}
                  onClick={() => {
                    const next = !settings.blindMode;
                    updateSettings({ blindMode: next });
                    ttsSpeak(
                      next
                        ? "Blind mode enabled. I will announce every page you visit. Press Alt V for voice commands, Alt R to read the page, Alt S to stop."
                        : "Blind mode disabled.",
                    );
                  }}
                >
                  <div
                    className={`absolute top-1.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${settings.blindMode ? "translate-x-7" : "translate-x-1"}`}
                  />
                </div>
              </label>

              <label className="flex items-center justify-between gap-3 cursor-pointer p-3 rounded-xl bg-background border border-border hover:bg-secondary/40 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-xl">📢</span>
                  <div>
                    <p className="text-sm font-medium text-card-foreground">
                      Auto-Announce Navigation
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Speaks page name on every route change
                    </p>
                  </div>
                </div>
                <div
                  className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${settings.autoAnnounce ? "bg-purple-600" : "bg-border"}`}
                  onClick={() =>
                    updateSettings({ autoAnnounce: !settings.autoAnnounce })
                  }
                >
                  <div
                    className={`absolute top-1.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${settings.autoAnnounce ? "translate-x-7" : "translate-x-1"}`}
                  />
                </div>
              </label>
            </Card>

            {/* Trip content reader */}
            <Card>
              <SectionTitle
                icon={<Navigation className="w-3.5 h-3.5" />}
                label="App Content Shortcuts"
              />
              <div className="space-y-2">
                {[
                  {
                    label: "Read page headings only",
                    fn: () => {
                      const hs = Array.from(
                        document.querySelectorAll("h1,h2,h3"),
                      )
                        .map((e) => e.textContent?.trim())
                        .filter(Boolean)
                        .join(". ");
                      ttsSpeak(hs || "No headings found on this page.");
                    },
                  },
                  {
                    label: "Read all buttons & links",
                    fn: () => {
                      const bs = Array.from(
                        document.querySelectorAll("button,a"),
                      )
                        .map((e) => e.textContent?.trim())
                        .filter((t) => t && t.length > 1 && t.length < 60)
                        .slice(0, 12)
                        .join(", ");
                      ttsSpeak(
                        bs ? `Available actions: ${bs}.` : "No buttons found.",
                      );
                    },
                  },
                  {
                    label: "Read page title",
                    fn: () =>
                      ttsSpeak(
                        `You are on: ${document.title || "Radiator Routes"}.`,
                      ),
                  },
                  {
                    label: "Describe current page",
                    fn: () => ttsSpeak(readPageContent()),
                  },
                ].map(({ label, fn }) => (
                  <button
                    key={label}
                    onClick={fn}
                    className="w-full flex items-center gap-2 px-4 py-3 rounded-xl bg-background border border-border hover:bg-purple-500/8 hover:border-purple-500/30 text-xs font-medium text-card-foreground transition-all text-left active:scale-[0.98]"
                  >
                    <Play className="w-3 h-3 text-purple-500 shrink-0" />
                    {label}
                  </button>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* ══ ASK AI TAB ══ */}
        {tab === "ask" && (
          <div className="space-y-4">
            <Card>
              <SectionTitle
                icon={<Sparkles className="w-3.5 h-3.5" />}
                label="Ask AI (Accessibility Assistant)"
              />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Ask anything about your trip, the app, destinations, or travel
                safety. Answer is spoken aloud automatically.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && askAI(query)}
                  placeholder="e.g. How do I use the SOS feature?"
                  className="flex-1 px-3 py-2.5 rounded-xl bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30"
                  aria-label="Ask the AI assistant"
                />
                <button
                  onClick={askByVoice}
                  disabled={isListening || aiLoading}
                  className="p-2.5 rounded-xl bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 transition-colors"
                  aria-label="Ask by voice"
                  title="Speak your question"
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
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700 disabled:opacity-40 transition-all active:scale-[0.98]"
              >
                {aiLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Thinking…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" /> Ask AI
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
                  onClick={() => ttsSpeak(aiReply)}
                  className="flex items-center gap-1.5 text-xs text-purple-600 hover:underline mt-2 font-medium"
                >
                  <Volume2 className="w-3.5 h-3.5" /> Read aloud again
                </button>
              </Card>
            )}

            <Card>
              <p className="text-xs font-semibold text-muted-foreground mb-2">
                Suggested questions:
              </p>
              <div className="space-y-1.5">
                {[
                  "How do I use the SOS emergency feature?",
                  "What are the top safety tips for blind solo travellers?",
                  "How do I plan a trip using this app?",
                  "How do I split expenses with my travel group?",
                  "How does the camera object identification work?",
                  "What voice commands can I use in this app?",
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => {
                      setQuery(q);
                      askAI(q);
                    }}
                    className="w-full text-left flex items-center gap-2 px-3 py-2.5 rounded-lg bg-background border border-border hover:bg-purple-500/8 hover:border-purple-500/25 text-xs text-muted-foreground hover:text-card-foreground transition-all"
                  >
                    <span className="text-purple-500 shrink-0">›</span>
                    {q}
                  </button>
                ))}
              </div>
            </Card>
          </div>
        )}

        {/* ══ SETTINGS TAB ══ */}
        {tab === "settings" && (
          <div className="space-y-4">
            <Card>
              <SectionTitle
                icon={<Settings2 className="w-3.5 h-3.5" />}
                label="Voice Settings"
              />
              <div className="space-y-4">
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
                      updateSettings({ ttsRate: Number(e.target.value) })
                    }
                    className="w-full accent-purple-600 h-2"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Slow (0.5x)</span>
                    <span>Fast (2x)</span>
                  </div>
                </div>

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
                      updateSettings({ ttsPitch: Number(e.target.value) })
                    }
                    className="w-full accent-purple-600 h-2"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Low</span>
                    <span>High</span>
                  </div>
                </div>

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
                      updateSettings({ ttsVolume: Number(e.target.value) })
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
                  ttsSpeak(
                    "This is a test of the Radiator Routes accessibility text to speech system. If you can hear this clearly, the voice settings are working correctly.",
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
                    desc: "Increases text and UI contrast for low vision users",
                    emoji: "🔲",
                  },
                  {
                    key: "largeText" as const,
                    label: "Large Text",
                    desc: "Increases base font size across the entire app",
                    emoji: "🔤",
                  },
                ].map(({ key, label, desc, emoji }) => (
                  <label
                    key={key}
                    className="flex items-center justify-between gap-3 cursor-pointer p-3 rounded-xl bg-background border border-border hover:bg-secondary/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{emoji}</span>
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
                      className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${settings[key] ? "bg-purple-600" : "bg-border"}`}
                      onClick={() => updateSettings({ [key]: !settings[key] })}
                    >
                      <div
                        className={`absolute top-1.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${settings[key] ? "translate-x-7" : "translate-x-1"}`}
                      />
                    </div>
                  </label>
                ))}
              </div>
            </Card>

            <Card>
              <SectionTitle
                icon={<AlertTriangle className="w-3.5 h-3.5" />}
                label="Emergency Access"
              />
              <div className="space-y-2">
                <button
                  onClick={() => {
                    ttsSpeak("Opening SOS emergency panel.");
                    window.dispatchEvent(new CustomEvent("open-sos"));
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-all active:scale-[0.98]"
                >
                  <AlertTriangle className="w-4 h-4" /> Open SOS Panel
                </button>
                <button
                  onClick={() =>
                    ttsSpeak(
                      "Emergency numbers in India: Police 100. Ambulance 108. Women helpline 1091. Fire brigade 101. National disaster 1078. Child helpline 1098.",
                    )
                  }
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-orange-500/10 text-orange-600 text-sm font-semibold border border-orange-500/20 hover:bg-orange-500/20 transition-all active:scale-[0.98]"
                >
                  📞 Speak Emergency Numbers
                </button>
              </div>
            </Card>

            <Card>
              <SectionTitle
                icon={<Sparkles className="w-3.5 h-3.5" />}
                label="About Accessibility"
              />
              <div className="space-y-2 text-xs text-muted-foreground leading-relaxed">
                <p>
                  Radiator Routes is built for every traveller, including those
                  who are visually impaired. Features include:
                </p>
                <ul className="space-y-1.5 mt-2">
                  {[
                    "🧭 Real voice-command navigation across the whole app",
                    "📖 Page reader — reads all screen content aloud",
                    "♿ Blind Mode — auto-announces every page you visit",
                    "📷 AI camera — describes scenes, signs & surroundings",
                    "🤖 Voice-activated AI assistant (Jinny)",
                    "🔲 High contrast & large text modes",
                    "⌨️ Keyboard shortcuts: Alt+V, Alt+R, Alt+S",
                    "🆘 One-tap SOS with emergency numbers",
                    "📳 Haptic feedback on actions (mobile)",
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
