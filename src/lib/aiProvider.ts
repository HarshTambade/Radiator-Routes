// ─────────────────────────────────────────────────────────────────────────────
// AI provider selection
// ─────────────────────────────────────────────────────────────────────────────
// Two backends serve every AI surface in the app:
//
//   "groq"   — hosted Groq LLaMA 3.3 70B. Fast, high quality, needs a key and
//              a network connection. Prompts leave the device.
//   "webllm" — MLC WebLLM running in-browser on WebGPU. No key, no network
//              after the one-time model download, nothing leaves the device.
//              Slower and smaller models.
//
// The choice is the user's and persists in localStorage. Nothing here imports
// @mlc-ai/web-llm — that happens behind a dynamic import in services/webllm.ts
// so the ~2 MB library never lands in the initial bundle.
// ─────────────────────────────────────────────────────────────────────────────

export type AIProvider = "groq" | "webllm";

const PROVIDER_KEY = "rr_ai_provider";
const MODEL_KEY = "rr_webllm_model";
const CHANGE_EVENT = "rr:ai-provider-change";

// ── Curated model list ──────────────────────────────────────────────────────
// Every `id` below was verified to exist in `prebuiltAppConfig.model_list` for
// @mlc-ai/web-llm 0.2.84. `vramMB` is the library's own `vram_required_MB`.
// All are q4f16_1 quantised with a 4096-token context window.

export interface WebLLMModel {
  id: string;
  label: string;
  /** GPU memory the library reports as required. */
  vramMB: number;
  /** Approximate one-time download over the network. */
  downloadLabel: string;
  note: string;
}

export const WEBLLM_MODELS: readonly WebLLMModel[] = [
  {
    id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",
    label: "Llama 3.2 1B",
    vramMB: 879,
    downloadLabel: "~0.7 GB",
    note: "Fastest. Fine for chat and short answers; weak at long itinerary JSON.",
  },
  {
    id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    label: "Qwen 2.5 1.5B",
    vramMB: 1630,
    downloadLabel: "~1.2 GB",
    note: "Good multilingual coverage for its size — useful with the language switcher.",
  },
  {
    id: "Llama-3.2-3B-Instruct-q4f16_1-MLC",
    label: "Llama 3.2 3B",
    vramMB: 2264,
    downloadLabel: "~1.8 GB",
    note: "Recommended default. Best balance of quality and size for planning.",
  },
  {
    id: "Qwen2.5-3B-Instruct-q4f16_1-MLC",
    label: "Qwen 2.5 3B",
    vramMB: 2505,
    downloadLabel: "~2.0 GB",
    note: "Strongest multilingual option at a manageable size.",
  },
  {
    id: "Phi-3.5-mini-instruct-q4f16_1-MLC",
    label: "Phi 3.5 Mini",
    vramMB: 3672,
    downloadLabel: "~2.6 GB",
    note: "Strong reasoning for its size. Needs a mid-range discrete GPU.",
  },
  {
    id: "Llama-3.1-8B-Instruct-q4f16_1-MLC",
    label: "Llama 3.1 8B",
    vramMB: 5001,
    downloadLabel: "~4.3 GB",
    note: "Highest quality on-device. Needs roughly 6 GB of free VRAM.",
  },
] as const;

export const DEFAULT_WEBLLM_MODEL = "Llama-3.2-3B-Instruct-q4f16_1-MLC";

export function getWebLLMModelInfo(id: string): WebLLMModel | undefined {
  return WEBLLM_MODELS.find((m) => m.id === id);
}

// ── Persistence ─────────────────────────────────────────────────────────────

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // private mode / storage disabled
  }
}

function writeStorage(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* non-fatal: selection just won't persist across reloads */
  }
}

/** Currently selected provider. Defaults to "groq". */
export function getAIProvider(): AIProvider {
  return readStorage(PROVIDER_KEY) === "webllm" ? "webllm" : "groq";
}

export function setAIProvider(provider: AIProvider): void {
  writeStorage(PROVIDER_KEY, provider);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { provider } }));
}

export function getWebLLMModel(): string {
  const stored = readStorage(MODEL_KEY);
  // Guard against a stale id from an older build or a hand-edited value.
  return stored && getWebLLMModelInfo(stored) ? stored : DEFAULT_WEBLLM_MODEL;
}

export function setWebLLMModel(modelId: string): void {
  if (!getWebLLMModelInfo(modelId)) return;
  writeStorage(MODEL_KEY, modelId);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { modelId } }));
}

/** Subscribe to provider/model changes. Returns an unsubscribe function. */
export function onAIProviderChange(listener: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}

// ── Capability detection ────────────────────────────────────────────────────

/**
 * Deliberately a flat shape rather than a discriminated union: the project
 * compiles with `strictNullChecks: false`, which defeats narrowing on a boolean
 * literal discriminant.
 */
export interface WebGPUStatus {
  supported: boolean;
  /** Set when `supported` is true — display only. */
  adapterInfo?: string;
  /** Set when `supported` is false — shown to the user. */
  reason?: string;
}

let cachedStatus: WebGPUStatus | null = null;

/**
 * WebGPU needs both the API and a usable adapter — a browser can expose
 * `navigator.gpu` and still fail to hand out an adapter (headless, blocklisted
 * driver, software rendering disabled). Both are checked here.
 *
 * Result is cached; adapter availability does not change within a page load.
 */
export async function detectWebGPU(): Promise<WebGPUStatus> {
  if (cachedStatus) return cachedStatus;

  if (typeof navigator === "undefined" || !("gpu" in navigator)) {
    cachedStatus = {
      supported: false,
      reason:
        "This browser doesn't expose WebGPU. On-device AI needs Chrome or Edge 113+, Chrome for Android 121+, or Safari 26+.",
    };
    return cachedStatus;
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      cachedStatus = {
        supported: false,
        reason:
          "WebGPU is present but no GPU adapter is available. This usually means hardware acceleration is disabled or the GPU driver is blocklisted.",
      };
      return cachedStatus;
    }

    // `info` is the current spec surface; older Chrome exposed
    // requestAdapterInfo(). Treat both as optional — it is display-only.
    const info = (adapter as GPUAdapter & { info?: GPUAdapterInfo }).info;
    const descriptor = [info?.vendor, info?.architecture]
      .filter(Boolean)
      .join(" ");

    cachedStatus = {
      supported: true,
      adapterInfo: descriptor || "GPU adapter available",
    };
    return cachedStatus;
  } catch (err) {
    cachedStatus = {
      supported: false,
      reason: `WebGPU adapter request failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
    return cachedStatus;
  }
}

/** Synchronous, coarse check — true only if `navigator.gpu` exists at all. */
export function hasWebGPUAPI(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}
