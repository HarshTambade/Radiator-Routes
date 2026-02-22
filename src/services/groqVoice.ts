// ─────────────────────────────────────────────────────────────────────────────
// Groq Voice Service
// • Speech-to-Text  → Groq Whisper API (whisper-large-v3-turbo)
// • Text-to-Speech  → Browser SpeechSynthesis (language-aware)
// ─────────────────────────────────────────────────────────────────────────────

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY as string;
const GROQ_BASE = "https://api.groq.com/openai/v1";
const WHISPER_MODEL = "whisper-large-v3-turbo";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RecordingHandle {
  /** Stop recording and return the audio Blob */
  stop: () => Promise<Blob>;
  /** Abort without returning audio */
  abort: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Pick the best MediaRecorder MIME type supported by this browser */
function getBestMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
    "",
  ];
  return candidates.find((t) => !t || MediaRecorder.isTypeSupported(t)) ?? "";
}

/** Map MIME type → file extension Groq accepts */
function mimeToExt(mimeType: string): string {
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mp4")) return "mp4";
  return "webm";
}

// ─────────────────────────────────────────────────────────────────────────────
// Recording
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Start recording from the microphone.
 * Returns a handle with `stop()` and `abort()` methods.
 *
 * @throws if the user denies microphone permission
 */
export async function startGroqRecording(): Promise<RecordingHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
  });

  const mimeType = getBestMimeType();
  const mediaRecorder = new MediaRecorder(
    stream,
    mimeType ? { mimeType } : undefined,
  );
  const chunks: Blob[] = [];
  let stopped = false;

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  // Collect in 100 ms time-slices for lower latency
  mediaRecorder.start(100);

  const cleanupStream = () => stream.getTracks().forEach((t) => t.stop());

  return {
    stop: () =>
      new Promise<Blob>((resolve, reject) => {
        if (stopped) {
          reject(new Error("Recording already stopped"));
          return;
        }
        stopped = true;
        mediaRecorder.onstop = () => {
          cleanupStream();
          const blob = new Blob(chunks, {
            type: mediaRecorder.mimeType || "audio/webm",
          });
          resolve(blob);
        };
        try {
          mediaRecorder.stop();
        } catch (err) {
          cleanupStream();
          reject(err);
        }
      }),

    abort: () => {
      if (stopped) return;
      stopped = true;
      try {
        mediaRecorder.stop();
      } catch {
        /* ignore */
      }
      cleanupStream();
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Transcription (Groq Whisper)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transcribe an audio Blob using Groq's Whisper API.
 *
 * @param audioBlob  – Blob from MediaRecorder
 * @param language   – BCP-47 / ISO 639-1 language code (e.g. "hi", "en", "ta")
 */
export async function transcribeWithGroq(
  audioBlob: Blob,
  language = "en",
): Promise<string> {
  if (!GROQ_API_KEY) {
    throw new Error("VITE_GROQ_API_KEY is not configured");
  }

  if (audioBlob.size < 100) {
    throw new Error("EMPTY_AUDIO");
  }

  const ext = mimeToExt(audioBlob.type);
  const formData = new FormData();
  formData.append("file", audioBlob, `recording.${ext}`);
  formData.append("model", WHISPER_MODEL);
  formData.append("response_format", "text");

  // Pass language hint for faster + more accurate transcription.
  // Strip region subtag (e.g. "hi-IN" → "hi") — Whisper uses ISO 639-1.
  const langCode = language.split("-")[0];
  if (langCode && langCode !== "en") {
    formData.append("language", langCode);
  }

  const res = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("RATE_LIMIT");
    if (res.status === 401) throw new Error("INVALID_API_KEY");
    throw new Error(`Whisper [${res.status}]: ${errText.slice(0, 200)}`);
  }

  const text = await res.text();
  return text.trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Text-to-Speech (language-aware browser SpeechSynthesis)
// ─────────────────────────────────────────────────────────────────────────────

// Map app language codes → BCP-47 for SpeechSynthesis
const LANG_TO_BCP47: Record<string, string> = {
  en: "en-GB",
  hi: "hi-IN",
  bn: "bn-IN",
  te: "te-IN",
  mr: "mr-IN",
  ta: "ta-IN",
  gu: "gu-IN",
  kn: "kn-IN",
  ml: "ml-IN",
  pa: "pa-IN",
  ur: "ur-PK",
  or: "or-IN",
  fr: "fr-FR",
  es: "es-ES",
  de: "de-DE",
  pt: "pt-PT",
  ar: "ar-SA",
  ja: "ja-JP",
  zh: "zh-CN",
  ko: "ko-KR",
  ru: "ru-RU",
  it: "it-IT",
  tr: "tr-TR",
  th: "th-TH",
  vi: "vi-VN",
  id: "id-ID",
  nl: "nl-NL",
  pl: "pl-PL",
  sv: "sv-SE",
};

/**
 * Speak text aloud using the browser's SpeechSynthesis API.
 * Respects the app's selected language for voice selection.
 *
 * @param text  – Text to speak (markdown is stripped automatically)
 * @param lang  – App language code (e.g. "hi", "en")
 */
export function speakText(text: string, lang = "en"): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;

  // Strip markdown / JSON for clean speech
  const plain = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/#{1,6}\s/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .trim()
    .slice(0, 500);

  if (!plain) return;

  window.speechSynthesis.cancel();

  const bcp47 = LANG_TO_BCP47[lang] ?? "en-GB";
  const utter = new SpeechSynthesisUtterance(plain);
  utter.lang = bcp47;
  utter.rate = 1.0;
  utter.pitch = 0.95;
  utter.volume = 1;

  const pickVoice = () => {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return;

    const langPrefix = bcp47.split("-")[0];

    const preferred =
      // Exact BCP-47 match with quality name
      voices.find(
        (v) =>
          v.lang === bcp47 &&
          (v.name.includes("Google") ||
            v.name.includes("Microsoft") ||
            v.name.includes("Siri")),
      ) ||
      // Any exact BCP-47 match
      voices.find((v) => v.lang === bcp47) ||
      // Partial language prefix match
      voices.find((v) => v.lang.startsWith(langPrefix)) ||
      // English fallback — avoid robotic "Zira"
      voices.find(
        (v) =>
          v.lang.startsWith("en") &&
          !v.name.toLowerCase().includes("zira") &&
          !v.name.toLowerCase().includes("hazel"),
      );

    if (preferred) utter.voice = preferred;
    window.speechSynthesis.speak(utter);
  };

  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    pickVoice();
  } else {
    // Chrome loads voices asynchronously — wait for the event
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null;
      pickVoice();
    };
  }
}

/**
 * Stop any ongoing speech synthesis immediately.
 */
export function stopSpeaking(): void {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Pre-warm the voice list (call once on app load / component mount).
 */
export function preloadVoices(): void {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () =>
      window.speechSynthesis.getVoices();
  }
}
