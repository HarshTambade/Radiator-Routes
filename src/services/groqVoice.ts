// ─────────────────────────────────────────────────────────────────────────────
// Atlas AI — Voice service (free, browser-native)
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
  /**
   * Called when the Web-Speech engine ends by itself (the user stopped
   * talking) rather than through stop()/abort(). onTranscript has already
   * fired by then, so callers can finalise exactly as if stop() was pressed.
   */
  onEnd?: () => void;
}

// Set once Web Speech fails with a "network"-class error (Brave, Electron,
// offline, or Google's speech service blocked). Later sessions then go
// straight to the Groq Whisper fallback when one is configured.
let webSpeechUnavailable = false;

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
  // Safari (and Chrome when stopped mid-phrase) can end without ever marking
  // the last result final — keep the latest interim text as a fallback.
  let interimTranscript = "";
  let ended = false;
  let aborted = false;
  let errored = false;
  let resolveStop: (() => void) | null = null;

  recognition.onresult = (event: SpeechRecognitionEventLike) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const alt = result[0];
      if (!alt) continue;
      if (result.isFinal) {
        finalTranscript += alt.transcript + " ";
      } else {
        interim += alt.transcript;
      }
    }
    interimTranscript = interim.trim();
    const live = `${finalTranscript}${interim}`.trim();
    if (live && options.onInterim) options.onInterim(live);
  };

  recognition.onerror = (e: SpeechRecognitionErrorEventLike) => {
    if (aborted || e.error === "aborted") return;
    errored = true;
    if (e.error === "no-speech") {
      options.onError?.("EMPTY_AUDIO");
    } else if (e.error === "not-allowed") {
      options.onError?.("PERMISSION_DENIED");
    } else if (e.error === "audio-capture") {
      options.onError?.("NO_MICROPHONE");
    } else if (e.error === "network" || e.error === "service-not-allowed") {
      webSpeechUnavailable = true;
      options.onError?.("SPEECH_SERVICE_UNAVAILABLE");
    } else {
      options.onError?.(e.error ?? "UNKNOWN_ERROR");
    }
  };

  recognition.onend = () => {
    if (ended) return;
    ended = true;
    const transcript = (finalTranscript.trim() || interimTranscript).trim();
    if (!aborted && !errored && transcript) options.onTranscript?.(transcript);
    if (resolveStop) {
      resolveStop();
    } else if (!aborted && !errored) {
      options.onEnd?.();
    }
  };

  // start() throws synchronously (e.g. InvalidStateError) — let the caller
  // surface it once instead of also reporting it through onError.
  recognition.start();

  return {
    engine: "web-speech",
    stop: () =>
      new Promise<Blob | null>((resolve) => {
        if (ended) {
          resolve(null);
          return;
        }
        // Resolve once onend has delivered the transcript; the timeout guards
        // against engines that never fire onend after stop().
        const timer = window.setTimeout(() => recognition.onend?.(), 2000);
        resolveStop = () => {
          window.clearTimeout(timer);
          resolve(null);
        };
        try {
          recognition.stop();
        } catch {
          recognition.onend?.();
        }
      }),
    abort: () => {
      if (ended) return;
      aborted = true;
      ended = true;
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
 * browser doesn't support it (Firefox, some mobile) or its speech service has
 * proven unreachable, AND a Groq key is set, falls back to MediaRecorder →
 * Groq Whisper.
 */
export async function startGroqRecording(
  options: StartOptions = {},
): Promise<RecordingHandle> {
  const canUseWhisper =
    isMediaRecorderSupported() && isGroqTranscriptionAvailable();

  // Primary — browser SpeechRecognition (no key needed)
  if (isBrowserSTTSupported() && !(webSpeechUnavailable && canUseWhisper)) {
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

const MAX_SPOKEN_CHARS = 1200;
// Chrome silently stops any single utterance after ~15 s, so long replies
// are queued as sentence-sized chunks instead of one utterance.
const MAX_CHUNK_CHARS = 180;

// Utterances referenced only by the speech queue can be garbage-collected in
// Chrome before they finish, which drops their onend. Hold them here.
const heldUtterances: SpeechSynthesisUtterance[] = [];
let speakToken = 0;

/** Strip markdown, code, links and emoji so only readable prose is spoken. */
export function toSpeakableText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\*\*|__|[*_~]/g, "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*(?:[-+•]|\d+\.)\s+/gm, "")
    .replace(/\p{Extended_Pictographic}|\p{Regional_Indicator}|‍|️/gu, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, ". ")
    .replace(/\s*\.(\s*\.)+/g, ".")
    .replace(/([!?:;,])\./g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s.]+/, "")
    .trim();
}

function chunkForSpeech(text: string): string[] {
  const sentences = text.match(/[^.!?。！？]+[.!?。！？]*\s*/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  const push = (s: string) => {
    if (s.trim()) chunks.push(s.trim());
  };
  for (const sentence of sentences) {
    if ((current + sentence).length <= MAX_CHUNK_CHARS) {
      current += sentence;
      continue;
    }
    push(current);
    current = "";
    if (sentence.length <= MAX_CHUNK_CHARS) {
      current = sentence;
      continue;
    }
    // A single over-long sentence — split it on word boundaries.
    let part = "";
    for (const word of sentence.split(/\s+/)) {
      if ((part + " " + word).length > MAX_CHUNK_CHARS) {
        push(part);
        part = word;
      } else {
        part = part ? `${part} ${word}` : word;
      }
    }
    current = part + " ";
  }
  push(current);
  return chunks;
}

function pickVoice(
  voices: SpeechSynthesisVoice[],
  bcp47: string,
): SpeechSynthesisVoice | undefined {
  // Android reports "en_GB" rather than "en-GB"
  const norm = (l: string) => l.replace("_", "-").toLowerCase();
  const target = norm(bcp47);
  const langPrefix = target.split("-")[0];
  const quality = (v: SpeechSynthesisVoice) =>
    /google|microsoft|siri|natural|premium|enhanced/i.test(v.name);
  return (
    voices.find((v) => norm(v.lang) === target && quality(v)) ||
    voices.find((v) => norm(v.lang) === target) ||
    voices.find((v) => norm(v.lang).startsWith(langPrefix)) ||
    (langPrefix === "en"
      ? voices.find(
          (v) =>
            norm(v.lang).startsWith("en") &&
            !/zira|hazel/i.test(v.name),
        )
      : undefined)
  );
}

/** Resolve the voice list, waiting briefly for browsers that load it lazily. */
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const synth = window.speechSynthesis;
  const voices = synth.getVoices();
  if (voices.length) return Promise.resolve(voices);
  return new Promise((resolve) => {
    const done = () => {
      window.clearTimeout(timer);
      synth.removeEventListener?.("voiceschanged", done);
      resolve(synth.getVoices());
    };
    // Some engines never fire voiceschanged — speak with the default voice.
    const timer = window.setTimeout(done, 1500);
    synth.addEventListener?.("voiceschanged", done);
  });
}

/**
 * Speak text aloud with the browser's SpeechSynthesis API. `onEnd` fires
 * once the whole text has been spoken (not if it is interrupted).
 */
export function speakText(text: string, lang = "en", onEnd?: () => void): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const synth = window.speechSynthesis;

  const plain = toSpeakableText(text).slice(0, MAX_SPOKEN_CHARS);
  if (!plain) return;

  const token = ++speakToken;
  const wasBusy = synth.speaking || synth.pending;
  synth.cancel();
  heldUtterances.length = 0;

  const bcp47 = LANG_TO_BCP47[lang] ?? (lang.includes("-") ? lang : "en-GB");

  void loadVoices().then((voices) => {
    if (token !== speakToken) return; // superseded by a newer call / stop
    const voice = pickVoice(voices, bcp47);
    const chunks = chunkForSpeech(plain);

    const utterances = chunks.map((chunk, i) => {
      const utter = new SpeechSynthesisUtterance(chunk);
      utter.lang = voice?.lang ?? bcp47;
      if (voice) utter.voice = voice;
      utter.rate = 1.0;
      utter.pitch = 0.95;
      utter.volume = 1;
      if (i === chunks.length - 1) {
        utter.onend = () => {
          if (token !== speakToken) return;
          heldUtterances.length = 0;
          onEnd?.();
        };
      }
      return utter;
    });
    heldUtterances.splice(0, heldUtterances.length, ...utterances);

    const enqueue = () => {
      if (token !== speakToken) return;
      // Chrome can get stuck in a paused state after a tab switch
      if (synth.paused) synth.resume();
      utterances.forEach((u) => synth.speak(u));
    };
    // Chrome drops an utterance queued in the same tick as cancel()
    if (wasBusy) window.setTimeout(enqueue, 80);
    else enqueue();
  });
}

/** Stop any ongoing speech synthesis. */
export function stopSpeaking(): void {
  speakToken++;
  heldUtterances.length = 0;
  if (typeof window !== "undefined" && window.speechSynthesis)
    window.speechSynthesis.cancel();
}

/** Pre-warm the voice list (call once on app load). */
export function preloadVoices(): void {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    void loadVoices();
  }
}
