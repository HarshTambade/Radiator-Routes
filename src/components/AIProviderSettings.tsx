import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Cloud,
  Cpu,
  Download,
  Loader2,
  ShieldCheck,
  Trash2,
  WifiOff,
  Zap,
} from "lucide-react";
import {
  DEFAULT_WEBLLM_MODEL,
  WEBLLM_MODELS,
  detectWebGPU,
  getAIProvider,
  getWebLLMModel,
  setAIProvider,
  setWebLLMModel,
  type AIProvider,
  type WebGPUStatus,
} from "@/lib/aiProvider";
import { useToast } from "@/hooks/use-toast";

const GROQ_CONFIGURED =
  typeof import.meta.env.VITE_GROQ_API_KEY === "string" &&
  (import.meta.env.VITE_GROQ_API_KEY as string).length > 10;

type LoadState =
  | { phase: "idle" }
  | { phase: "loading"; progress: number; text: string }
  | { phase: "ready" }
  | { phase: "error"; message: string };

/**
 * Lets the user choose between hosted Groq inference and on-device WebLLM, and
 * manage downloaded model weights.
 *
 * Nothing is downloaded without an explicit click — model weights are
 * 0.7–4.3 GB, which is not something to start on a metered connection by
 * accident. `@mlc-ai/web-llm` itself is dynamically imported, so simply opening
 * this panel costs nothing beyond a WebGPU capability probe.
 */
export function AIProviderSettings() {
  const { toast } = useToast();
  const [provider, setProvider] = useState<AIProvider>(() => getAIProvider());
  const [modelId, setModelId] = useState<string>(() => getWebLLMModel());
  const [gpu, setGpu] = useState<WebGPUStatus | null>(null);
  const [cached, setCached] = useState<Record<string, boolean>>({});
  const [load, setLoad] = useState<LoadState>({ phase: "idle" });
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const selected = useMemo(
    () => WEBLLM_MODELS.find((m) => m.id === modelId) ?? WEBLLM_MODELS[2],
    [modelId],
  );

  // Probe WebGPU once on mount. Cheap, and cached inside detectWebGPU().
  useEffect(() => {
    let alive = true;
    detectWebGPU().then((status) => {
      if (alive) setGpu(status);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Which models are already on disk. Only worth checking if WebGPU works.
  const refreshCacheState = useCallback(async () => {
    if (!gpu?.supported) return;
    const { isModelCached } = await import("@/services/webllm");
    const entries = await Promise.all(
      WEBLLM_MODELS.map(async (m) => [m.id, await isModelCached(m.id)] as const),
    );
    setCached(Object.fromEntries(entries));
  }, [gpu?.supported]);

  useEffect(() => {
    refreshCacheState();
  }, [refreshCacheState]);

  useEffect(() => () => unsubscribeRef.current?.(), []);

  const chooseProvider = (next: AIProvider) => {
    setProvider(next);
    setAIProvider(next);
    toast({
      title: next === "webllm" ? "On-device AI selected" : "Groq selected",
      description:
        next === "webllm"
          ? "Prompts stay on this device. Download a model below if you haven't already."
          : "AI requests go to Groq's hosted API.",
    });
  };

  const chooseModel = (id: string) => {
    setModelId(id);
    setWebLLMModel(id);
    setLoad({ phase: "idle" });
  };

  const download = async () => {
    setLoad({ phase: "loading", progress: 0, text: "Preparing…" });
    try {
      const { ensureEngine, onLoadProgress } = await import("@/services/webllm");

      unsubscribeRef.current?.();
      unsubscribeRef.current = onLoadProgress(({ progress, text }) => {
        setLoad({ phase: "loading", progress, text });
      });

      await ensureEngine(modelId);
      setLoad({ phase: "ready" });
      await refreshCacheState();
      toast({
        title: `${selected.label} ready`,
        description: "AI now runs entirely on this device.",
      });
    } catch (err) {
      const { handleGeminiError } = await import("@/services/gemini");
      const message = handleGeminiError(err);
      setLoad({ phase: "error", message });
      toast({
        title: "Model failed to load",
        description: message,
        variant: "destructive",
      });
    } finally {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
    }
  };

  const remove = async (id: string) => {
    try {
      const { deleteCachedModel } = await import("@/services/webllm");
      await deleteCachedModel(id);
      await refreshCacheState();
      setLoad({ phase: "idle" });
      toast({ title: "Model deleted", description: "Disk space reclaimed." });
    } catch {
      toast({
        title: "Couldn't delete the model",
        description: "Try clearing site data from your browser settings.",
        variant: "destructive",
      });
    }
  };

  const percent = load.phase === "loading" ? Math.round(load.progress * 100) : 0;

  return (
    <section className="space-y-5 rounded-2xl border border-border bg-card p-5">
      <header className="space-y-1">
        <h3 className="flex items-center gap-2 text-base font-bold text-card-foreground">
          <Cpu className="h-4 w-4 text-primary" aria-hidden="true" />
          AI engine
        </h3>
        <p className="text-sm text-muted-foreground">
          Choose where AI runs. On-device keeps every prompt on this machine and works
          with no connection, at the cost of a one-time download and smaller models.
        </p>
      </header>

      {/* ── Provider choice ── */}
      <div
        className="grid gap-3 sm:grid-cols-2"
        role="radiogroup"
        aria-label="AI engine"
      >
        <ProviderCard
          selected={provider === "groq"}
          onSelect={() => chooseProvider("groq")}
          icon={Cloud}
          title="Groq (hosted)"
          subtitle="LLaMA 3.3 70B"
          bullets={[
            { icon: Zap, text: "Fastest, highest quality" },
            { icon: WifiOff, text: "Needs a connection" },
          ]}
          warning={
            GROQ_CONFIGURED ? null : "No VITE_GROQ_API_KEY configured — this option won't work."
          }
        />
        <ProviderCard
          selected={provider === "webllm"}
          onSelect={() => chooseProvider("webllm")}
          icon={Cpu}
          title="On-device (WebLLM)"
          subtitle={selected.label}
          bullets={[
            { icon: ShieldCheck, text: "Prompts never leave this device" },
            { icon: Check, text: "No API key, works offline" },
          ]}
          warning={
            gpu && !gpu.supported
              ? "WebGPU unavailable in this browser."
              : null
          }
          disabled={gpu ? !gpu.supported : false}
        />
      </div>

      {/* ── WebGPU diagnostics ── */}
      {gpu && !gpu.supported && (
        <p className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span>{gpu.reason}</span>
        </p>
      )}

      {/* ── Model management ── */}
      {provider === "webllm" && gpu?.supported && (
        <div className="space-y-4 border-t border-border pt-4">
          <div className="space-y-1">
            <label
              htmlFor="webllm-model"
              className="text-sm font-semibold text-card-foreground"
            >
              Model
            </label>
            <select
              id="webllm-model"
              value={modelId}
              onChange={(e) => chooseModel(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground"
            >
              {WEBLLM_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — {m.downloadLabel}
                  {m.id === DEFAULT_WEBLLM_MODEL ? " (recommended)" : ""}
                  {cached[m.id] ? " · downloaded" : ""}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">{selected.note}</p>
            <p className="text-xs text-muted-foreground">
              Needs roughly {(selected.vramMB / 1024).toFixed(1)} GB of free GPU memory.
              Detected adapter: {gpu.adapterInfo}.
            </p>
          </div>

          {load.phase === "loading" && (
            <div className="space-y-2" role="status" aria-live="polite">
              <div className="flex items-center justify-between text-xs font-medium text-card-foreground">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Loading {selected.label}
                </span>
                <span>{percent}%</span>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-secondary"
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="truncate text-xs text-muted-foreground">{load.text}</p>
            </div>
          )}

          {load.phase === "ready" && (
            <p className="flex items-center gap-2 rounded-xl bg-primary/10 p-3 text-xs font-medium text-primary">
              <Check className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              {selected.label} is loaded and serving requests on this device.
            </p>
          )}

          {load.phase === "error" && (
            <p className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <span>{load.message}</span>
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={download}
              disabled={load.phase === "loading"}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {cached[modelId]
                ? `Load ${selected.label}`
                : `Download ${selected.label} (${selected.downloadLabel})`}
            </button>
            {cached[modelId] && (
              <button
                type="button"
                onClick={() => remove(modelId)}
                disabled={load.phase === "loading"}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Delete
              </button>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Weights are cached by the browser, so the download happens once per model.
            Streaming responses are noticeably slower than Groq and quality is lower —
            on-device models are 1–8 B parameters against 70 B hosted.
          </p>
        </div>
      )}
    </section>
  );
}

// ── Provider card ───────────────────────────────────────────────────────────

interface ProviderCardProps {
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  icon: typeof Cloud;
  title: string;
  subtitle: string;
  bullets: Array<{ icon: typeof Cloud; text: string }>;
  warning: string | null;
}

function ProviderCard({
  selected,
  disabled = false,
  onSelect,
  icon: Icon,
  title,
  subtitle,
  bullets,
  warning,
}: ProviderCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={`space-y-2.5 rounded-xl border p-4 text-left transition-colors disabled:opacity-50 ${
        selected
          ? "border-primary bg-primary/5"
          : "border-border bg-background hover:border-primary/40"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
          <div>
            <p className="text-sm font-bold text-card-foreground">{title}</p>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        {selected && (
          <span className="rounded-full bg-primary p-1" aria-hidden="true">
            <Check className="h-3 w-3 text-primary-foreground" />
          </span>
        )}
      </div>

      <ul className="space-y-1">
        {bullets.map(({ icon: BulletIcon, text }) => (
          <li key={text} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <BulletIcon className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
            {text}
          </li>
        ))}
      </ul>

      {warning && (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" aria-hidden="true" />
          {warning}
        </p>
      )}
    </button>
  );
}

export default AIProviderSettings;
