// ─────────────────────────────────────────────────────────────────────────────
// Radiator Routes — Voice service (free, browser-native)
// ─────────────────────────────────────────────────────────────────────────────
// • Speech-to-Text  → Web Speech API (SpeechRecognition), no API key needed.
//                     Falls back to Groq Whisper only when a valid key is set
//                     AND the browser does not support SpeechRecognition.
// • Text-to-Speech  → Browser SpeechSynthesis (language-aware).
//
// Keeps the previous public surface (startGroqRecording, transcribeWithGroq,
// speakText, stopSpeaking, preloadVoices, type RecordingHandle) so all callers
// (AIAssistant.tsx, TripCreationChat.tsx, AccessibilityPanel.tsx) work
// unchanged.
// ─────────────────────────────────────────────────────────────────────────────

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY as string | undefined;
const GROQ_BASE = "https://api.groq.com/openai/v1";
const WHISPER_MODEL = "whisper-large-v3-turbo";

// ─────────────────────────────────────────────────────────────────────────────
// Web Speech API types (portable — the DOM lib doesn't include them yet)
// ─────────────────────────────────────────────────────────────────────────────

interface SpeechRecognitionResultAlt {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionResultAlt;
}
interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEventLike {
  error: string;
  message?: string;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  lang: string;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

// ─────────────────────────────────────────────────────────────────────────────
// Feature detection
// ─────────────────────────────────────────────────────────────────────────────

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isBrowserSTTSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

export function isMediaRecorderSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof MediaRecorder !== "undefined"
  );
}

export function isGroqTranscriptionAvailable(): boolean {
  return !!GROQ_API_KEY && GROQ_API_KEY.length > 10;
}

// ─────────────────────────────────────────────────────────────────────────────
// Recording handle — abstract over both engines
// ─────────────────────────────────────────────────────────────────────────────

export interface RecordingHandle {
  /**
   * Stop recording and produce either:
   *  - a Blob (for the Groq/MediaRecorder path) — pass it to transcribeWithGroq
   *  - a null value (for the Web-Speech path) — the transcript is delivered
   *    via the `onTranscript` callback of startGroqRecording
   */
  stop: () => Promise<Blob | null>;
  /** Cancel without producing anything. */
  abort: () => void;
  /** Which underlying engine is being used. */
  engine: "web-speech" | "media-recorder";
}

// ─────────────────────────────────────────────────────────────────────────────
// Web Speech recording — the primary, key-free path
// ─────────────────────────────────────────────────────────────────────────────

interface StartOptions {
  /** BCP-47 language for recognition (default en-US). */
  language?: string;
  /** Called with the final transcript when Web Speech is used. */
  onTranscript?: (text: string) => void;
  /** Called with interim (in-progress) transcripts. */
  onInterim?: (text: string) => void;
  /** Called with an error string (any engine). */
  onError?: (err: string) => void;
}

function langToBCP47(code: string): string {
  const c = (code ?? "en").trim().toLowerCase();
  const map: Record<string, string> = {
    en: "en-US", hi: "hi-IN", bn: "bn-IN", te: "te-IN", mr: "mr-IN",
    ta: "ta-IN", gu: "gu-IN", kn: "kn-IN", ml: "ml-IN", pa: "pa-IN",
    ur: "ur-PK", or: "or-IN",
    fr: "fr-FR", es: "es-ES", de: "de-DE", pt: "pt-PT", ar: "ar-SA",
    ja: "ja-JP", zh: "zh-CN", ko: "ko-KR", ru: "ru-RU", it: "it-IT",
    tr: "tr-TR", th: "th-TH", vi: "vi-VN", id: "id-ID", nl: "nl-NL",
    pl: "pl-PL", sv: "sv-SE",
  };
  return map[c] ?? (c.includes("-") ? code : `${c}-${c.toUpperCase()}`);
}

function startWebSpeech(options: StartOptions): RecordingHandle {
  const SR = getSpeechRecognitionCtor()!;
  const recognition = new SR();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 3;
  recognition.lang = langToBCP47(options.language ?? "en");

  let finalTranscript = "";
  let stopped = false;
  let manuallyStopped = false;

  recognition.onresult = (event: SpeechRecognitionEventLike) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const alt = result[0];
      if (result.isFinal) {
        finalTranscript += alt.transcript + " ";
      } else {
        interim += alt.transcript;
      }
    }
    if (interim && options.onInterim) options.onInterim(interim.trim());
  };

  recognition.onerror = (e: SpeechRecognitionErrorEventLike) => {
    if (manuallyStopped) return;
    if (e.error === "aborted") return;
    if (e.error === "no-speech") {
      options.onError?.("EMPTY_AUDIO");
      return;
    }
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      options.onError?.("PERMISSION_DENIED");
      return;
    }
    options.onError?.(e.error ?? "UNKNOWN_ERROR");
  };

  recognition.onend = () => {
    stopped = true;
    if (finalTranscript.trim() && options.onTranscript) {
      options.onTranscript(finalTranscript.trim());
    }
  };

  try {
    recognition.start();
  } catch (err) {
    options.onError?.((err as Error).message ?? "START_FAILED");
    throw err;
  }

  return {
    engine: "web-speech",
    stop: () =>
      new Promise<Blob | null>((resolve) => {
        if (stopped) {
          resolve(null);
          return;
        }
        manuallyStopped = false;
        const finish = () => {
          window.setTimeout(() => resolve(null), 100);
        };
        recognition.onend = () => {
          stopped = true;
          if (finalTranscript.trim() && options.onTranscript)
            options.onTranscript(finalTranscript.trim());
          finish();
        };
        try {
          recognition.stop();
        } catch {
          finish();
        }
      }),
    abort: () => {
      manuallyStopped = true;
      stopped = true;
      try {
        recognition.abort();
      } catch {
        /* ignore */
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MediaRecorder path — used only as a Groq Whisper fallback
// ─────────────────────────────────────────────────────────────────────────────

function bestMimeType(): string {
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

async function startMediaRecorder(): Promise<RecordingHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
  });

  const mimeType = bestMimeType();
  const recorder = new MediaRecorder(
    stream,
    mimeType ? { mimeType } : undefined,
  );
  const chunks: Blob[] = [];
  let stopped = false;

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  recorder.start(100);

  const cleanupStream = () => stream.getTracks().forEach((t) => t.stop());

  return {
    engine: "media-recorder",
    stop: () =>
      new Promise<Blob>((resolve, reject) => {
        if (stopped) {
          reject(new Error("Recording already stopped"));
          return;
        }
        stopped = true;
        recorder.onstop = () => {
          cleanupStream();
          resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
        };
        try {
          recorder.stop();
        } catch (err) {
          cleanupStream();
          reject(err);
        }
      }),
    abort: () => {
      if (stopped) return;
      stopped = true;
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
      cleanupStream();
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: start recording (transparently picks the best engine)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Begin speech capture. Prefers the free browser SpeechRecognition; when the
 * browser doesn't support it (Firefox, some mobile) AND a Groq key is set,
 * falls back to MediaRecorder → Groq Whisper.
 */
export async function startGroqRecording(
  options: StartOptions = {},
): Promise<RecordingHandle> {
  // Primary — browser SpeechRecognition (no key needed)
  if (isBrowserSTTSupported()) {
    return startWebSpeech(options);
  }

  // Fallback — MediaRecorder + Groq Whisper (needs a key)
  if (!isMediaRecorderSupported()) {
    throw new Error(
      "SPEECH_UNSUPPORTED: This browser cannot capture voice. Please use Chrome, Edge, or Safari.",
    );
  }
  if (!isGroqTranscriptionAvailable()) {
    throw new Error(
      "SPEECH_UNSUPPORTED: Voice recognition is not supported in this browser. Set VITE_GROQ_API_KEY to enable the fallback transcription engine.",
    );
  }
  return startMediaRecorder();
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: transcribe a MediaRecorder blob via Groq Whisper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transcribe an audio blob using Groq Whisper. When the Web-Speech engine
 * is being used, the caller should skip this — the transcript already arrived
 * via the onTranscript callback.
 */
export async function transcribeWithGroq(
  audioBlob: Blob | null,
  language = "en",
): Promise<string> {
  if (!audioBlob) return ""; // Web-Speech path — transcript came via callback
  if (audioBlob.size < 100) throw new Error("EMPTY_AUDIO");

  if (!isGroqTranscriptionAvailable()) {
    throw new Error(
      "TRANSCRIPTION_UNAVAILABLE: Set VITE_GROQ_API_KEY to enable audio transcription in this browser.",
    );
  }

  const ext = audioBlob.type.includes("ogg")
    ? "ogg"
    : audioBlob.type.includes("mp4")
      ? "mp4"
      : "webm";

  const formData = new FormData();
  formData.append("file", audioBlob, `recording.${ext}`);
  formData.append("model", WHISPER_MODEL);
  formData.append("response_format", "text");

  const langCode = (language ?? "en").split("-")[0];
  if (langCode && langCode !== "en") formData.append("language", langCode);

  const res = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("RATE_LIMIT");
    if (res.status === 401) throw new Error("INVALID_API_KEY");
    throw new Error(`Whisper [${res.status}]: ${errText.slice(0, 200)}`);
  }

  return (await res.text()).trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Text-to-Speech (language-aware SpeechSynthesis)
// ─────────────────────────────────────────────────────────────────────────────

const LANG_TO_BCP47: Record<string, string> = {
  en: "en-GB", hi: "hi-IN", bn: "bn-IN", te: "te-IN", mr: "mr-IN",
  ta: "ta-IN", gu: "gu-IN", kn: "kn-IN", ml: "ml-IN", pa: "pa-IN",
  ur: "ur-PK", or: "or-IN",
  fr: "fr-FR", es: "es-ES", de: "de-DE", pt: "pt-PT", ar: "ar-SA",
  ja: "ja-JP", zh: "zh-CN", ko: "ko-KR", ru: "ru-RU", it: "it-IT",
  tr: "tr-TR", th: "th-TH", vi: "vi-VN", id: "id-ID", nl: "nl-NL",
  pl: "pl-PL", sv: "sv-SE",
};

/** Speak text aloud with the browser's SpeechSynthesis API. */
export function speakText(text: string, lang = "en"): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;

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
      voices.find(
        (v) =>
          v.lang === bcp47 &&
          (v.name.includes("Google") ||
            v.name.includes("Microsoft") ||
            v.name.includes("Siri")),
      ) ||
      voices.find((v) => v.lang === bcp47) ||
      voices.find((v) => v.lang.startsWith(langPrefix)) ||
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
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null;
      pickVoice();
    };
  }
}

/** Stop any ongoing speech synthesis. */
export function stopSpeaking(): void {
  if (typeof window !== "undefined" && window.speechSynthesis)
    window.speechSynthesis.cancel();
}

/** Pre-warm the voice list (call once on app load). */
export function preloadVoices(): void {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () =>
      window.speechSynthesis.getVoices();
  }
}
