// ─────────────────────────────────────────────────────────────────────────────
// WebLLM — on-device LLM inference via WebGPU
// ─────────────────────────────────────────────────────────────────────────────
// A drop-in alternative to the hosted Groq backend. Once the model weights are
// cached, this needs no API key and no network: prompts never leave the device,
// and it keeps working fully offline.
//
// Cost of entry: a one-time 0.7–4.3 GB weight download and a WebGPU-capable
// browser. Both are surfaced to the user before anything is fetched — the
// engine is only ever created from an explicit user action.
//
// @mlc-ai/web-llm is loaded through a dynamic import so it stays out of the
// initial bundle. Inference itself runs in a worker (see webllmWorker.ts) to
// keep the main thread responsive during generation.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ChatCompletionMessageParam,
  InitProgressReport,
  MLCEngineInterface,
} from "@mlc-ai/web-llm";
import { detectWebGPU, getWebLLMModel } from "@/lib/aiProvider";

export interface LoadProgress {
  /** 0 → 1. */
  progress: number;
  /** Human-readable status straight from the library. */
  text: string;
  secondsElapsed: number;
}

export type LoadProgressCallback = (progress: LoadProgress) => void;

/** Thrown states callers already branch on, kept aligned with gemini.ts. */
export const WEBLLM_ERRORS = {
  NO_WEBGPU: "NO_WEBGPU",
  LOAD_FAILED: "WEBLLM_LOAD_FAILED",
  NOT_READY: "WEBLLM_NOT_READY",
} as const;

// ── Engine lifecycle ────────────────────────────────────────────────────────

interface EngineState {
  engine: MLCEngineInterface;
  modelId: string;
  worker: Worker | null;
}

let state: EngineState | null = null;
/** In-flight load, so concurrent callers share one download. */
let loading: Promise<EngineState> | null = null;

const progressListeners = new Set<LoadProgressCallback>();

/** Subscribe to load progress. Returns an unsubscribe function. */
export function onLoadProgress(cb: LoadProgressCallback): () => void {
  progressListeners.add(cb);
  return () => progressListeners.delete(cb);
}

function emitProgress(report: InitProgressReport) {
  const payload: LoadProgress = {
    progress: report.progress,
    text: report.text,
    secondsElapsed: report.timeElapsed,
  };
  for (const listener of progressListeners) {
    try {
      listener(payload);
    } catch {
      /* a broken listener must not abort the load */
    }
  }
}

/** True when a model is loaded and ready to generate. */
export function isEngineReady(): boolean {
  return state !== null;
}

/** Model id currently resident in the engine, if any. */
export function loadedModelId(): string | null {
  return state?.modelId ?? null;
}

async function createEngine(modelId: string): Promise<EngineState> {
  const gpu = await detectWebGPU();
  if (!gpu.supported) {
    const err = new Error(WEBLLM_ERRORS.NO_WEBGPU);
    err.cause = gpu.reason;
    throw err;
  }

  const webllm = await import("@mlc-ai/web-llm");

  // Prefer the worker engine. If worker construction fails (CSP, unusual
  // bundling), fall back to the main thread rather than losing the feature.
  try {
    const worker = new Worker(new URL("./webllmWorker.ts", import.meta.url), {
      type: "module",
    });
    const engine = await webllm.CreateWebWorkerMLCEngine(worker, modelId, {
      initProgressCallback: emitProgress,
    });
    return { engine, modelId, worker };
  } catch (workerErr) {
    console.warn(
      "[webllm] Worker engine unavailable, falling back to main thread:",
      workerErr,
    );
    const engine = await webllm.CreateMLCEngine(modelId, {
      initProgressCallback: emitProgress,
    });
    return { engine, modelId, worker: null };
  }
}

/**
 * Loads `modelId` (default: the user's selection) and resolves once it can
 * generate. Downloads weights on first use for a given model — call only from
 * an explicit user action.
 *
 * Concurrent calls share a single load. Switching models unloads the previous
 * engine first so two sets of weights are never resident at once.
 */
export async function ensureEngine(modelId?: string): Promise<void> {
  const target = modelId ?? getWebLLMModel();

  if (state?.modelId === target) return;
  if (loading) {
    const pending = await loading;
    if (pending.modelId === target) return;
  }

  // Different model requested — release the current one before loading.
  if (state) await unloadEngine();

  loading = createEngine(target);
  try {
    state = await loading;
  } catch (err) {
    state = null;
    if (err instanceof Error && err.message === WEBLLM_ERRORS.NO_WEBGPU) throw err;
    const wrapped = new Error(WEBLLM_ERRORS.LOAD_FAILED);
    wrapped.cause = err;
    throw wrapped;
  } finally {
    loading = null;
  }
}

/** Frees GPU memory. Cached weights on disk are untouched. */
export async function unloadEngine(): Promise<void> {
  if (!state) return;
  const previous = state;
  state = null;
  try {
    await previous.engine.unload();
  } catch {
    /* best-effort */
  }
  previous.worker?.terminate();
}

function requireEngine(): MLCEngineInterface {
  if (!state) throw new Error(WEBLLM_ERRORS.NOT_READY);
  return state.engine;
}

// ── Cache management ────────────────────────────────────────────────────────

/** Whether a model's weights are already on disk (no download needed). */
export async function isModelCached(modelId: string): Promise<boolean> {
  try {
    const webllm = await import("@mlc-ai/web-llm");
    return await webllm.hasModelInCache(modelId);
  } catch {
    return false;
  }
}

/** Deletes a model's cached weights, reclaiming disk space. */
export async function deleteCachedModel(modelId: string): Promise<void> {
  if (state?.modelId === modelId) await unloadEngine();
  const webllm = await import("@mlc-ai/web-llm");
  await webllm.deleteModelAllInfoInCache(modelId);
}

// ── Generation ──────────────────────────────────────────────────────────────

type ChatRole = "user" | "model";

function toWebLLMMessages(
  systemInstruction: string,
  messages: Array<{ role: ChatRole; content: string }>,
): ChatCompletionMessageParam[] {
  return [
    { role: "system", content: systemInstruction },
    ...messages.map((m) => ({
      role: m.role === "model" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    })),
  ];
}

/**
 * Single-turn completion. Mirrors `callGemini` so callers are interchangeable.
 *
 * On-device models are far smaller than LLaMA 70B, so `jsonMode` matters more
 * here than it does with Groq — it constrains decoding to valid JSON via
 * grammar rather than merely asking politely.
 */
export async function webllmComplete(
  systemInstruction: string,
  userPrompt: string,
  temperature = 0.7,
  maxTokens = 2048,
  jsonMode = false,
): Promise<string> {
  await ensureEngine();
  const engine = requireEngine();

  const reply = await engine.chat.completions.create({
    messages: toWebLLMMessages(systemInstruction, [
      { role: "user", content: userPrompt },
    ]),
    temperature,
    max_tokens: maxTokens,
    stream: false,
    ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
  });

  return reply.choices[0]?.message?.content ?? "";
}

/** Multi-turn, non-streaming. Mirrors `callGeminiChat`. */
export async function webllmChat(
  systemInstruction: string,
  messages: Array<{ role: ChatRole; content: string }>,
  temperature = 0.7,
  maxTokens = 2048,
  jsonMode = false,
): Promise<string> {
  await ensureEngine();
  const engine = requireEngine();

  const reply = await engine.chat.completions.create({
    messages: toWebLLMMessages(systemInstruction, messages),
    temperature,
    max_tokens: maxTokens,
    stream: false,
    ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
  });

  return reply.choices[0]?.message?.content ?? "";
}

/** Streaming multi-turn. Mirrors `streamGemini`. */
export async function webllmStream(
  systemInstruction: string,
  messages: Array<{ role: ChatRole; content: string }>,
  onChunk: (chunk: string) => void,
  temperature = 0.7,
  maxTokens = 2048,
): Promise<string> {
  await ensureEngine();
  const engine = requireEngine();

  const chunks = await engine.chat.completions.create({
    messages: toWebLLMMessages(systemInstruction, messages),
    temperature,
    max_tokens: maxTokens,
    stream: true,
  });

  let full = "";
  for await (const chunk of chunks) {
    const delta = chunk.choices[0]?.delta?.content ?? "";
    if (delta) {
      full += delta;
      onChunk(delta);
    }
  }
  return full;
}

/** Cancels the in-flight generation, if any. */
export async function interruptGeneration(): Promise<void> {
  try {
    await state?.engine.interruptGenerate();
  } catch {
    /* nothing in flight */
  }
}
