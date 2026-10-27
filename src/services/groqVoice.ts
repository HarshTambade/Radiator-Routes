// ─────────────────────────────────────────────────────────────────────────────
// Radiator Routes — Voice service (free, browser-native)
// ─────────────────────────────────────────────────────────────────────────────
// • Speech-to-Text  → Web Speech API (SpeechRecognition), no provider key needed.
//                     Falls back to authenticated Groq Whisper when configured
//                     server-side and the browser speech path is unavailable.
// • Text-to-Speech  → Browser SpeechSynthesis (language-aware).
//
// Keeps the previous public surface (startGroqRecording, transcribeWithGroq,
// speakText, stopSpeaking, preloadVoices, type RecordingHandle) so all callers
// (AIAssistant.tsx, TripCreationChat.tsx, AccessibilityPanel.tsx) work
// unchanged.
// ─────────────────────────────────────────────────────────────────────────────

import { claimMic } from "@/lib/micCoordinator";
import { isSupabaseConfigured } from "@/integrations/supabase/client";
import { groqProxyFetch } from "@/services/groqProxy";

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
  return isSupabaseConfigured;
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
  // Held for the whole session so the wake-word listener stays off the mic.
  const releaseMic = claimMic();

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
    if (aborted) return;
    errored = true;
    if (e.error === "aborted") {
      // Not our abort() — the browser cancelled the session, usually because
      // something else started listening. This used to be swallowed, so the
      // mic switched itself off and nothing happened.
      options.onError?.("INTERRUPTED");
    } else if (e.error === "no-speech") {
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
    releaseMic();
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
  try {
    recognition.start();
  } catch (err) {
    ended = true;
    releaseMic();
    throw err;
  }

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
      releaseMic();
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
  const releaseMic = claimMic();
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
    });
  } catch (err) {
    releaseMic();
    throw err;
  }

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

  const cleanupStream = () => {
    stream.getTracks().forEach((t) => t.stop());
    releaseMic();
  };

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
 * proven unreachable, AND the server-side Groq proxy is configured, falls back
 * to MediaRecorder → Groq Whisper.
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

  // Fallback — MediaRecorder + Groq Whisper (needs a signed-in session)
  if (!isMediaRecorderSupported()) {
    throw new Error(
      "SPEECH_UNSUPPORTED: This browser cannot capture voice. Please use Chrome, Edge, or Safari.",
    );
  }
  if (!isGroqTranscriptionAvailable()) {
    throw new Error(
      "SPEECH_UNSUPPORTED: Voice recognition is not supported in this browser, and hosted transcription needs a signed-in account.",
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
      "TRANSCRIPTION_UNAVAILABLE: Hosted transcription needs a signed-in account and server configuration.",
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

  const res = await groqProxyFetch("audio/transcriptions", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("RATE_LIMIT");
    if (res.status === 401) throw new Error("AUTH_REQUIRED");
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
  // Neural voices ("Microsoft Sonia Online (Natural)", Apple "Premium") sound
  // like a person; the old flat OS voices are what make TTS sound robotic.
  const score = (v: SpeechSynthesisVoice) =>
    /natural|neural|online|premium|enhanced/i.test(v.name) ? 3
      : /google|siri/i.test(v.name) ? 2
        : /microsoft/i.test(v.name) ? 1
          : 0;
  const best = (list: SpeechSynthesisVoice[]) =>
    list.reduce<SpeechSynthesisVoice | undefined>(
      (top, v) => (!top || score(v) > score(top) ? v : top),
      undefined,
    );
  const exact = voices.filter((v) => norm(v.lang) === target);
  return (
    (exact.some((v) => score(v) > 0) ? best(exact) : undefined) ||
    exact[0] ||
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

function resolveBcp47(lang: string): string {
  return LANG_TO_BCP47[lang] ?? (lang.includes("-") ? lang : "en-GB");
}

/** Generous upper bound on how long a chunk takes to say, for watchdogs. */
function speechBudgetMs(text: string): number {
  return 2500 + text.length * 95;
}

function configureUtterance(utter: SpeechSynthesisUtterance, voice: SpeechSynthesisVoice | undefined, bcp47: string) {
  utter.lang = voice?.lang ?? bcp47;
  if (voice) utter.voice = voice;
  utter.rate = 1.03;
  utter.pitch = 1;
  utter.volume = 1;
}

/**
 * Speak text aloud with the browser's SpeechSynthesis API. `onEnd` fires
 * once speaking is over — when the text finishes, when there was nothing to
 * say, or when the browser refuses or drops it — but not when a newer call or
 * stopSpeaking() interrupts it.
 *
 * Callers chain the next step (opening the mic after the "Hey Jinny"
 * greeting) on `onEnd`. Chrome rejects speech that is not preceded by a user
 * gesture, which a wake word is not; that error used to swallow `onEnd`, so the
 * assistant opened and then never listened.
 */
export function speakText(text: string, lang = "en", onEnd?: () => void): void {
  const token = ++speakToken;
  let finished = false;
  let watchdog: number | undefined;
  const finish = () => {
    if (finished || token !== speakToken) return;
    finished = true;
    window.clearTimeout(watchdog);
    heldUtterances.length = 0;
    onEnd?.();
  };

  if (typeof window === "undefined" || !window.speechSynthesis) {
    if (onEnd) setTimeout(onEnd, 0);
    return;
  }
  const synth = window.speechSynthesis;
  cancelActiveStream();

  const plain = toSpeakableText(text).slice(0, MAX_SPOKEN_CHARS);
  if (!plain) {
    window.setTimeout(finish, 0);
    return;
  }

  const wasBusy = synth.speaking || synth.pending;
  synth.cancel();
  heldUtterances.length = 0;

  const bcp47 = resolveBcp47(lang);

  void loadVoices().then((voices) => {
    if (token !== speakToken) return; // superseded by a newer call / stop
    const voice = pickVoice(voices, bcp47);
    const chunks = chunkForSpeech(plain);

    const utterances = chunks.map((chunk, i) => {
      const utter = new SpeechSynthesisUtterance(chunk);
      configureUtterance(utter, voice, bcp47);
      if (i === chunks.length - 1) utter.onend = finish;
      // "interrupted"/"canceled" mean someone stopped us on purpose; anything
      // else ("not-allowed", "synthesis-failed") means nothing will be said.
      utter.onerror = (event: SpeechSynthesisErrorEvent) => {
        if (event?.error === "interrupted" || event?.error === "canceled") return;
        finish();
      };
      return utter;
    });
    heldUtterances.splice(0, heldUtterances.length, ...utterances);
    // Some engines never fire onend at all — don't leave the caller waiting.
    watchdog = window.setTimeout(finish, speechBudgetMs(plain));

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

// ─────────────────────────────────────────────────────────────────────────────
// Streaming speech — talk while the reply is still being written
// ─────────────────────────────────────────────────────────────────────────────
// Waiting for a whole reply before saying anything leaves several seconds of
// dead air per turn, which is what makes a voice assistant feel like a form
// rather than a conversation. A speech stream is fed the model's tokens as
// they arrive and speaks each sentence as soon as it is complete. JSON action
// blocks are never spoken, including while they are still half-written.

export interface SpeechStream {
  /** Append newly streamed text. */
  push: (delta: string) => void;
  /** No more text is coming; speak whatever is left. */
  end: () => void;
  /** Stop speaking now and drop anything queued. */
  cancel: () => void;
  /** Resolves once everything has been spoken, or on cancel. */
  readonly finished: Promise<void>;
  /** True once anything has actually been handed to the speech engine. */
  readonly spoke: boolean;
}

let activeStream: SpeechStream | null = null;

function cancelActiveStream() {
  const stream = activeStream;
  activeStream = null;
  stream?.cancel();
}

/** Text with complete ```fences``` removed and cut at an unclosed one. */
function speakablePrefix(raw: string): string {
  const withoutBlocks = raw.replace(/```[\s\S]*?```/g, " ");
  const open = withoutBlocks.indexOf("```");
  // A lone trailing "`" or "``" may be the start of a fence still arriving.
  const cut = open >= 0 ? withoutBlocks.slice(0, open) : withoutBlocks.replace(/`{1,2}$/, "");
  return cut;
}

/** Index just past the last sentence end in `text`, or 0 when there is none. */
function lastSentenceBoundary(text: string): number {
  let boundary = 0;
  const re = /[.!?…。！？](?=\s)|\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) boundary = m.index + m[0].length;
  return boundary;
}

export function createSpeechStream(
  lang = "en",
  hooks: { onSpeak?: (sentence: string) => void } = {},
): SpeechStream {
  stopSpeaking();
  const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
  const bcp47 = resolveBcp47(lang);
  const voiceReady = synth ? loadVoices().then((voices) => pickVoice(voices, bcp47)) : Promise.resolve(undefined);

  let raw = "";
  let consumed = 0;
  let ended = false;
  let cancelled = false;
  let outstanding = 0;
  let spoke = false;
  let resolveFinished: () => void = () => {};
  const finished = new Promise<void>((resolve) => { resolveFinished = resolve; });
  const held: SpeechSynthesisUtterance[] = [];
  const timers = new Set<number>();

  const settle = () => {
    if (cancelled || (ended && outstanding === 0)) {
      timers.forEach((t) => window.clearTimeout(t));
      timers.clear();
      if (activeStream === stream) activeStream = null;
      resolveFinished();
    }
  };

  const say = (text: string) => {
    const plain = toSpeakableText(text);
    if (!plain || !synth) return;
    for (const chunk of chunkForSpeech(plain)) {
      outstanding++;
      let done = false;
      const complete = () => {
        if (done) return;
        done = true;
        outstanding = Math.max(0, outstanding - 1);
        settle();
      };
      void voiceReady.then((voice) => {
        if (cancelled) { complete(); return; }
        const utter = new SpeechSynthesisUtterance(chunk);
        configureUtterance(utter, voice, bcp47);
        utter.onstart = () => hooks.onSpeak?.(chunk);
        utter.onend = complete;
        utter.onerror = complete;
        held.push(utter);
        if (synth.paused) synth.resume();
        synth.speak(utter);
        spoke = true;
        // Covers engines that drop onend; queued time is included because
        // utterances wait behind each other.
        const timer = window.setTimeout(complete, speechBudgetMs(chunk) * Math.max(1, outstanding));
        timers.add(timer);
      });
    }
  };

  const drain = (final: boolean) => {
    if (cancelled) return;
    const clean = speakablePrefix(raw);
    const rest = clean.slice(consumed);
    const cut = final ? rest.length : lastSentenceBoundary(rest);
    if (cut <= 0) return;
    consumed += cut;
    say(rest.slice(0, cut));
  };

  const stream: SpeechStream = {
    push(delta) {
      if (cancelled || ended || !delta) return;
      raw += delta;
      drain(false);
    },
    end() {
      if (cancelled || ended) return;
      drain(true);
      ended = true;
      settle();
    },
    cancel() {
      if (cancelled) return;
      cancelled = true;
      held.length = 0;
      synth?.cancel();
      settle();
    },
    finished,
    get spoke() { return spoke; },
  };
  activeStream = stream;
  return stream;
}

/** Stop any ongoing speech synthesis. */
export function stopSpeaking(): void {
  speakToken++;
  heldUtterances.length = 0;
  cancelActiveStream();
  if (typeof window !== "undefined" && window.speechSynthesis)
    window.speechSynthesis.cancel();
}

/** Pre-warm the voice list (call once on app load). */
export function preloadVoices(): void {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    void loadVoices();
  }
}
