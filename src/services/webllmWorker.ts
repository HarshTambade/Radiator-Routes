// ─────────────────────────────────────────────────────────────────────────────
// WebLLM inference worker
// ─────────────────────────────────────────────────────────────────────────────
// Token generation is a tight compute loop. Running it on the main thread makes
// the UI stutter for the whole generation, so the engine lives here instead and
// WebLLM handles the cross-thread messaging itself.
//
// Instantiated from services/webllm.ts via:
//   new Worker(new URL("./webllmWorker.ts", import.meta.url), { type: "module" })
// Vite compiles this into its own bundle; it is never part of the main chunk.
// ─────────────────────────────────────────────────────────────────────────────

import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

const handler = new WebWorkerMLCEngineHandler();

self.onmessage = (event: MessageEvent) => {
  handler.onmessage(event);
};
