import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
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

  it("does not speak after stopSpeaking cancels a pending call", async () => {
    speakText("Hello there.", "en");
    stopSpeaking();
    await Promise.resolve();
    await Promise.resolve();
    expect(spoken).toEqual([]);
  });
});
