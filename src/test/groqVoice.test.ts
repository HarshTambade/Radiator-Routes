import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isMicClaimed, onMicClaimChange, claimMic } from "@/lib/micCoordinator";
import {
  createSpeechStream,
  speakText,
  startGroqRecording,
  stopSpeaking,
  toSpeakableText,
} from "@/services/groqVoice";

/** Minimal controllable stand-in for the browser's SpeechRecognition. */
class FakeRecognition {
  static last: FakeRecognition | null = null;
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  lang = "";
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => setTimeout(() => this.onend?.(), 0));
  abort = vi.fn();
  constructor() {
    FakeRecognition.last = this;
  }
  emit(transcript: string, isFinal: boolean) {
    const result = Object.assign([{ transcript, confidence: 0.9 }], { isFinal });
    this.onresult?.({ resultIndex: 0, results: [result] });
  }
}

describe("web-speech recording", () => {
  beforeEach(() => {
    (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition =
      FakeRecognition;
  });
  afterEach(() => {
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  });

  it("delivers the transcript and calls onEnd when recognition ends by itself", async () => {
    const onTranscript = vi.fn();
    const onEnd = vi.fn();
    await startGroqRecording({ onTranscript, onEnd });
    const rec = FakeRecognition.last!;
    rec.emit("plan a trip to goa", true);
    rec.onend?.();
    expect(onTranscript).toHaveBeenCalledWith("plan a trip to goa");
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("falls back to the interim text when no result was marked final", async () => {
    const onTranscript = vi.fn();
    const onEnd = vi.fn();
    const handle = await startGroqRecording({ onTranscript, onEnd });
    FakeRecognition.last!.emit("weather in pune", false);
    await expect(handle.stop()).resolves.toBeNull();
    expect(onTranscript).toHaveBeenCalledWith("weather in pune");
    // stop() was requested, so the self-ended callback must not fire too
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("reports errors once and does not also deliver a transcript", async () => {
    const onTranscript = vi.fn();
    const onError = vi.fn();
    const onEnd = vi.fn();
    await startGroqRecording({ onTranscript, onError, onEnd });
    const rec = FakeRecognition.last!;
    rec.emit("half a sen", false);
    rec.onerror?.({ error: "network" });
    rec.onend?.();
    expect(onError).toHaveBeenCalledWith("SPEECH_SERVICE_UNAVAILABLE");
    expect(onTranscript).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it("stays silent after abort", async () => {
    const onTranscript = vi.fn();
    const onError = vi.fn();
    const handle = await startGroqRecording({ onTranscript, onError });
    const rec = FakeRecognition.last!;
    rec.emit("cancel me", true);
    handle.abort();
    rec.onerror?.({ error: "aborted" });
    rec.onend?.();
    expect(onTranscript).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});

describe("microphone coordination", () => {
  beforeEach(() => {
    (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition =
      FakeRecognition;
  });
  afterEach(() => {
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  });

  it("holds the mic for the whole session and releases it on end", async () => {
    const changes: boolean[] = [];
    const unsubscribe = onMicClaimChange((claimed) => changes.push(claimed));
    await startGroqRecording({});
    expect(isMicClaimed()).toBe(true);
    FakeRecognition.last!.onend?.();
    expect(isMicClaimed()).toBe(false);
    expect(changes).toEqual([true, false]);
    unsubscribe();
  });

  it("releases the mic on abort, even before the browser fires onend", async () => {
    const handle = await startGroqRecording({});
    handle.abort();
    expect(isMicClaimed()).toBe(false);
  });

  it("reports a browser-side abort instead of silently stopping", async () => {
    const onError = vi.fn();
    const onEnd = vi.fn();
    await startGroqRecording({ onError, onEnd });
    const rec = FakeRecognition.last!;
    rec.onerror?.({ error: "aborted" });
    rec.onend?.();
    expect(onError).toHaveBeenCalledWith("INTERRUPTED");
    expect(onEnd).not.toHaveBeenCalled();
    expect(isMicClaimed()).toBe(false);
  });

  it("counts overlapping claims and releases idempotently", () => {
    const a = claimMic();
    const b = claimMic();
    a();
    a();
    expect(isMicClaimed()).toBe(true);
    b();
    expect(isMicClaimed()).toBe(false);
  });
});

describe("toSpeakableText", () => {
  it("drops markdown, code fences, links and emoji", () => {
    const md =
      "Hey Asha! 👋 I'm **Jinny** 🧡\n\nI can:\n- 🧠 Suggest places\n- 💰 Track [budget](/budget)\n\n```json\n{\"action\":\"x\"}\n```";
    const out = toSpeakableText(md);
    expect(out).not.toMatch(/[*#`{}]|\p{Extended_Pictographic}/u);
    expect(out).toContain("I'm Jinny");
    expect(out).toContain("Suggest places");
    expect(out).toContain("Track budget");
    expect(out).not.toContain("action");
  });
});

describe("speakText", () => {
  let spoken: string[];
  beforeEach(() => {
    spoken = [];
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        text: string;
        lang = "";
        voice: unknown = null;
        rate = 1;
        pitch = 1;
        volume = 1;
        onend: (() => void) | null = null;
        constructor(text: string) {
          this.text = text;
        }
      },
    );
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        speaking: false,
        pending: false,
        paused: false,
        cancel: vi.fn(),
        resume: vi.fn(),
        getVoices: () => [{ name: "Google UK English", lang: "en-GB" }],
        speak: vi.fn((u: { text: string; onend: (() => void) | null }) => {
          spoken.push(u.text);
          u.onend?.();
        }),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("splits long replies into short utterances and reports completion once", async () => {
    const onEnd = vi.fn();
    const sentence = "This is a fairly ordinary sentence about a day in Jaipur. ";
    speakText(sentence.repeat(12), "en", onEnd);
    await Promise.resolve();
    await Promise.resolve();
    expect(spoken.length).toBeGreaterThan(1);
    expect(spoken.every((s) => s.length <= 180)).toBe(true);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("still reports completion when the browser refuses to speak", async () => {
    // Chrome rejects speech without a prior user gesture — exactly the case
    // after a "Hey Jinny" wake word. The mic must open anyway.
    const synth = window.speechSynthesis as unknown as { speak: ReturnType<typeof vi.fn> };
    synth.speak.mockImplementation((u: { onerror?: (e: { error: string }) => void }) => {
      u.onerror?.({ error: "not-allowed" });
    });
    const onEnd = vi.fn();
    speakText("At your service.", "en", onEnd);
    await Promise.resolve();
    await Promise.resolve();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("reports completion when there is nothing to say", async () => {
    vi.useFakeTimers();
    const onEnd = vi.fn();
    speakText("```json\n{}\n```", "en", onEnd);
    vi.runAllTimers();
    vi.useRealTimers();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("does not speak after stopSpeaking cancels a pending call", async () => {
    speakText("Hello there.", "en");
    stopSpeaking();
    await Promise.resolve();
    await Promise.resolve();
    expect(spoken).toEqual([]);
  });
});

describe("createSpeechStream", () => {
  let spoken: string[];
  beforeEach(() => {
    spoken = [];
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        text: string;
        lang = "";
        voice: unknown = null;
        rate = 1;
        pitch = 1;
        volume = 1;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        onstart: (() => void) | null = null;
        constructor(text: string) {
          this.text = text;
        }
      },
    );
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        speaking: false,
        pending: false,
        paused: false,
        cancel: vi.fn(),
        resume: vi.fn(),
        getVoices: () => [{ name: "Google UK English", lang: "en-GB" }],
        speak: vi.fn((u: { text: string; onstart: (() => void) | null; onend: (() => void) | null }) => {
          spoken.push(u.text);
          u.onstart?.();
          u.onend?.();
        }),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const flush = async () => {
    for (let i = 0; i < 4; i++) await Promise.resolve();
  };

  it("speaks each sentence as it completes and never reads action JSON", async () => {
    const onSpeak = vi.fn();
    const stream = createSpeechStream("en", { onSpeak });

    stream.push("Sure, let me check");
    await flush();
    expect(spoken).toEqual([]);

    stream.push(" the weather. ```json\n{\"action\":\"check_");
    await flush();
    expect(spoken).toEqual(["Sure, let me check the weather."]);

    stream.push("weather\"}\n``` It's sunny in Goa");
    stream.push(" today");
    await flush();
    expect(spoken).toHaveLength(1);

    stream.end();
    await flush();
    await stream.finished;
    expect(spoken).toEqual(["Sure, let me check the weather.", "It's sunny in Goa today"]);
    expect(spoken.join(" ")).not.toMatch(/action|[{}`]/);
    expect(onSpeak).toHaveBeenCalledTimes(2);
    expect(stream.spoke).toBe(true);
  });

  it("finishes immediately when cancelled and ignores later text", async () => {
    const stream = createSpeechStream("en");
    stream.cancel();
    stream.push("Too late. ");
    stream.end();
    await flush();
    await stream.finished;
    expect(spoken).toEqual([]);
  });

  it("finishes even when nothing speakable was streamed", async () => {
    const stream = createSpeechStream("en");
    stream.push('```json\n{"action":"navigate_to"}\n```');
    stream.end();
    await stream.finished;
    expect(spoken).toEqual([]);
  });
});
