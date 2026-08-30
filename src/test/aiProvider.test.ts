import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// detectWebGPU / hasWebGPUAPI are intentionally not imported here: they memoise
// per module instance, so those tests use freshModule() to get a clean one.
import {
  DEFAULT_WEBLLM_MODEL,
  WEBLLM_MODELS,
  getAIProvider,
  getWebLLMModel,
  getWebLLMModelInfo,
  onAIProviderChange,
  setAIProvider,
  setWebLLMModel,
} from "@/lib/aiProvider";

/**
 * `detectWebGPU` memoises its result for the page lifetime, so each test that
 * cares about it needs a fresh module instance.
 */
async function freshModule() {
  vi.resetModules();
  return import("@/lib/aiProvider");
}

describe("aiProvider — provider selection", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to groq when nothing is stored", () => {
    expect(getAIProvider()).toBe("groq");
  });

  it("round-trips a provider choice through localStorage", () => {
    setAIProvider("webllm");
    expect(getAIProvider()).toBe("webllm");
    setAIProvider("groq");
    expect(getAIProvider()).toBe("groq");
  });

  it("treats any unrecognised stored value as groq", () => {
    localStorage.setItem("rr_ai_provider", "definitely-not-a-provider");
    expect(getAIProvider()).toBe("groq");
  });

  it("notifies subscribers on change and stops after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = onAIProviderChange(listener);

    setAIProvider("webllm");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    setAIProvider("groq");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("aiProvider — model selection", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to the recommended model", () => {
    expect(getWebLLMModel()).toBe(DEFAULT_WEBLLM_MODEL);
  });

  it("round-trips a valid model id", () => {
    const target = WEBLLM_MODELS[0].id;
    setWebLLMModel(target);
    expect(getWebLLMModel()).toBe(target);
  });

  it("rejects an unknown model id rather than storing it", () => {
    setWebLLMModel("Nonexistent-42B-q4f16_1-MLC");
    expect(getWebLLMModel()).toBe(DEFAULT_WEBLLM_MODEL);
  });

  it("falls back to the default when storage holds a stale id", () => {
    // Simulates a model removed in a later build, or a hand-edited value.
    localStorage.setItem("rr_webllm_model", "Retired-Model-q4f16_1-MLC");
    expect(getWebLLMModel()).toBe(DEFAULT_WEBLLM_MODEL);
  });

  it("exposes the recommended default in the curated list", () => {
    expect(getWebLLMModelInfo(DEFAULT_WEBLLM_MODEL)).toBeDefined();
  });

  it("lists models in ascending size order so the picker reads sensibly", () => {
    const sizes = WEBLLM_MODELS.map((m) => m.vramMB);
    expect([...sizes].sort((a, b) => a - b)).toEqual(sizes);
  });

  it("describes every model with a label, size and download estimate", () => {
    for (const model of WEBLLM_MODELS) {
      expect(model.label).not.toBe("");
      expect(model.note).not.toBe("");
      expect(model.downloadLabel).toMatch(/GB/);
      expect(model.vramMB).toBeGreaterThan(0);
    }
  });
});

describe("aiProvider — WebGPU detection", () => {
  const originalNavigator = globalThis.navigator;

  afterEach(() => {
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  });

  function stubNavigator(gpu: unknown) {
    Object.defineProperty(globalThis, "navigator", {
      value: gpu === undefined ? {} : { gpu },
      configurable: true,
      writable: true,
    });
  }

  it("reports unsupported when navigator.gpu is absent", async () => {
    stubNavigator(undefined);
    const mod = await freshModule();
    const status = await mod.detectWebGPU();

    expect(status.supported).toBe(false);
    expect(status.reason).toMatch(/WebGPU/i);
  });

  it("reports unsupported when no adapter is handed out", async () => {
    // A browser can expose the API and still refuse an adapter — blocklisted
    // driver, hardware acceleration off, headless.
    stubNavigator({ requestAdapter: async () => null });
    const mod = await freshModule();
    const status = await mod.detectWebGPU();

    expect(status.supported).toBe(false);
    expect(status.reason).toMatch(/adapter/i);
  });

  it("reports supported and surfaces adapter info when an adapter exists", async () => {
    stubNavigator({
      requestAdapter: async () => ({
        info: { vendor: "apple", architecture: "metal-3" },
      }),
    });
    const mod = await freshModule();
    const status = await mod.detectWebGPU();

    expect(status.supported).toBe(true);
    expect(status.adapterInfo).toBe("apple metal-3");
  });

  it("still reports supported when adapter info is unavailable", async () => {
    stubNavigator({ requestAdapter: async () => ({}) });
    const mod = await freshModule();
    const status = await mod.detectWebGPU();

    expect(status.supported).toBe(true);
    expect(status.adapterInfo).toBeTruthy();
  });

  it("treats a throwing requestAdapter as unsupported instead of propagating", async () => {
    stubNavigator({
      requestAdapter: async () => {
        throw new Error("GPU process crashed");
      },
    });
    const mod = await freshModule();
    const status = await mod.detectWebGPU();

    expect(status.supported).toBe(false);
    expect(status.reason).toContain("GPU process crashed");
  });

  it("memoises the probe so repeat calls do not re-request an adapter", async () => {
    const requestAdapter = vi.fn(async () => ({}));
    stubNavigator({ requestAdapter });
    const mod = await freshModule();

    await mod.detectWebGPU();
    await mod.detectWebGPU();

    expect(requestAdapter).toHaveBeenCalledTimes(1);
  });

  it("hasWebGPUAPI is a cheap synchronous mirror of navigator.gpu", async () => {
    stubNavigator(undefined);
    let mod = await freshModule();
    expect(mod.hasWebGPUAPI()).toBe(false);

    stubNavigator({ requestAdapter: async () => ({}) });
    mod = await freshModule();
    expect(mod.hasWebGPUAPI()).toBe(true);
  });
});

describe("aiProvider — degraded storage", () => {
  it("falls back to defaults when localStorage throws", async () => {
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("SecurityError: storage disabled");
      });
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("SecurityError: storage disabled");
      });

    // Private-browsing modes can throw on both read and write. Neither should
    // take down the AI surfaces.
    expect(() => getAIProvider()).not.toThrow();
    expect(getAIProvider()).toBe("groq");
    expect(() => setAIProvider("webllm")).not.toThrow();
    expect(getWebLLMModel()).toBe(DEFAULT_WEBLLM_MODEL);

    getItem.mockRestore();
    setItem.mockRestore();
  });
});
