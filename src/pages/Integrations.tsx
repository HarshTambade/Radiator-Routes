import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  Clock3,
  Code2,
  Copy,
  FileJson2,
  KeyRound,
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import {
  createPlatformApiKey,
  checkPlatformApiHealth,
  listPlatformApiKeys,
  PLATFORM_API_SCOPES,
  platformApiUrls,
  revokePlatformApiKey,
  supabasePublishableKey,
  type CreatedPlatformApiKey,
  type PlatformApiKey,
  type PlatformApiScope,
} from "@/services/platformApi";
import { useAuth } from "@/hooks/useAuth";

type PanelTab = "overview" | "keys" | "mcp" | "rest";

const DEFAULT_SCOPES: PlatformApiScope[] = ["trips:read", "budget:read"];

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await copyText(value);
      setCopied(true);
      toast.success(`${label} copied`);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Could not access the clipboard. Select and copy the text instead.");
    }
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-card-foreground hover:bg-secondary transition-colors"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : label}
    </button>
  );
}

function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-slate-950 text-slate-100">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
        <span className="text-xs font-medium text-slate-300">{label ?? "Example"}</span>
        <CopyButton value={code} label="Copy" />
      </div>
      <pre className="overflow-x-auto p-4 text-xs leading-6"><code>{code}</code></pre>
    </div>
  );
}

function StatusPill({ revoked, expired }: { revoked: boolean; expired: boolean }) {
  if (revoked) return <span className="rounded-full bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-600">Revoked</span>;
  if (expired) return <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-700">Expired</span>;
  return <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Active</span>;
}

export default function Integrations() {
  const { user } = useAuth();
  const [tab, setTab] = useState<PanelTab>("overview");
  const [keys, setKeys] = useState<PlatformApiKey[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [apiReady, setApiReady] = useState<boolean | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [keyName, setKeyName] = useState("");
  const [scopes, setScopes] = useState<PlatformApiScope[]>(DEFAULT_SCOPES);
  const [expiry, setExpiry] = useState("90");
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<CreatedPlatformApiKey | null>(null);

  const urls = useMemo(() => {
    try {
      return platformApiUrls();
    } catch {
      return null;
    }
  }, []);

  const loadKeys = useCallback(async (initial = false) => {
    if (initial) setKeysLoading(true);
    else setRefreshing(true);
    setPageError(null);
    try {
      setKeys(await listPlatformApiKeys());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load API keys.";
      setPageError(message);
    } finally {
      setKeysLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (user) void loadKeys(true);
  }, [loadKeys, user]);

  useEffect(() => {
    let current = true;
    void checkPlatformApiHealth().then((ready) => {
      if (current) setApiReady(ready);
    });
    return () => { current = false; };
  }, []);

  const activeKeys = keys.filter((key) => !key.revoked_at && (!key.expires_at || Date.parse(key.expires_at) > Date.now()));

  const downloadOpenApi = async () => {
    if (!urls) return;
    try {
      const response = await fetch(urls.openApi, {
        headers: { apikey: supabasePublishableKey() },
        cache: "no-store",
      });
      if (!response.ok) throw new Error("OpenAPI document is not available. Deploy the platform-api function first.");
      const document = await response.json();
      const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(document, null, 2)], { type: "application/json" }));
      const link = window.document.createElement("a");
      link.href = blobUrl;
      link.download = "atlas-ai-openapi.json";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      toast.success("OpenAPI document downloaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not download the OpenAPI document.");
    }
  };

  const toggleScope = (scope: PlatformApiScope) => {
    setScopes((current) => current.includes(scope)
      ? current.filter((value) => value !== scope)
      : [...current, scope]);
  };

  const handleCreateKey = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!keyName.trim() || !scopes.length) return;
    setCreating(true);
    setCreatedKey(null);
    setPageError(null);
    try {
      const created = await createPlatformApiKey({
        name: keyName.trim(),
        scopes,
        expiresInDays: expiry === "never" ? null : Number(expiry),
      });
      setCreatedKey(created);
      setKeyName("");
      await loadKeys();
      setTab("keys");
      toast.success("API key created. Copy it now; it will not be shown again.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not create API key.";
      setPageError(message);
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (key: PlatformApiKey) => {
    if (key.revoked_at || !window.confirm(`Revoke “${key.name}”? Connected applications will stop working immediately.`)) return;
    setRevokingId(key.id);
    setPageError(null);
    try {
      await revokePlatformApiKey(key.id);
      setKeys((current) => current.map((item) => item.id === key.id ? { ...item, revoked_at: new Date().toISOString() } : item));
      if (createdKey?.key.id === key.id) setCreatedKey(null);
      toast.success("API key revoked");
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Could not revoke API key.");
    } finally {
      setRevokingId(null);
    }
  };

  const mcpConfig = JSON.stringify({
    mcpServers: {
      "atlas-ai": {
        type: "http",
        url: urls?.mcp ?? "https://YOUR_PROJECT.supabase.co/functions/v1/platform-api/mcp",
        headers: {
          "x-api-key": "YOUR_ATLAS_API_KEY",
          apikey: supabasePublishableKey(),
        },
      },
    },
  }, null, 2);

  const curlExample = `curl -X GET "${urls?.rest ?? "https://YOUR_PROJECT.supabase.co/functions/v1/platform-api/v1"}/trips" \\
  -H "x-api-key: $ATLAS_API_KEY" \\
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY"`;

  const tabs: Array<{ id: PanelTab; label: string; icon: typeof Workflow }> = [
    { id: "overview", label: "Overview", icon: Workflow },
    { id: "keys", label: "API keys", icon: KeyRound },
    { id: "mcp", label: "MCP server", icon: Code2 },
    { id: "rest", label: "REST API", icon: FileJson2 },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-orange-950 p-6 text-white shadow-card md:p-8">
        <div className="pointer-events-none absolute -right-14 -top-20 h-72 w-72 rounded-full bg-orange-400/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-orange-100">
              <Workflow className="h-3.5 w-3.5" /> Developer integrations
            </div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Connect Atlas AI to your stack</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300 md:text-base">
              Use scoped API keys with the REST API or connect an MCP-compatible AI client to plan trips, read budgets, and record booking requests.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs text-slate-200">
            <span className={`h-2 w-2 rounded-full ${apiReady === true ? "bg-emerald-400" : apiReady === false ? "bg-amber-400" : "bg-slate-400 animate-pulse"}`} />
            {apiReady === true ? "API service ready" : apiReady === false ? "API service unavailable" : "Checking API service…"}
          </div>
        </div>
      </header>

      <div className="flex gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-1.5 shadow-sm">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors md:px-4 ${tab === item.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
          >
            <item.icon className="h-4 w-4" /> {item.label}
          </button>
        ))}
      </div>

      {pageError && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{pageError}</span>
        </div>
      )}

      {createdKey && (
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 md:p-6" aria-live="polite">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 font-semibold text-emerald-900"><ShieldCheck className="h-5 w-5" /> Copy your new API key</h2>
              <p className="mt-1 text-sm text-emerald-800">This secret is shown once. Store it in the connected platform’s secret manager.</p>
            </div>
            <CopyButton value={createdKey.secret} label="Copy key" />
          </div>
          <code className="mt-4 block overflow-x-auto rounded-xl border border-emerald-500/20 bg-background px-4 py-3 text-sm text-foreground">{createdKey.secret}</code>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => setCreatedKey(null)} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800">I saved it</button>
          </div>
        </section>
      )}

      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { icon: KeyRound, title: "Scoped credentials", text: "Create separate keys per integration, limit their permissions, and revoke them at any time." },
              { icon: Workflow, title: "MCP tools", text: "Expose trip, budget, planning, and booking-request actions to compatible AI clients." },
              { icon: ShieldCheck, title: "Owner-scoped data", text: "Every call is checked against the account that issued the key and limited to 60 requests per minute." },
            ].map((feature) => (
              <article key={feature.title} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <feature.icon className="mb-4 h-5 w-5 text-primary" />
                <h2 className="font-semibold text-card-foreground">{feature.title}</h2>
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{feature.text}</p>
              </article>
            ))}
          </div>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold text-card-foreground">Ready to connect?</h2>
                <p className="mt-1 text-sm text-muted-foreground">Start with a read-only key, then grant write scopes only when you need them.</p>
              </div>
              <button type="button" onClick={() => setTab("keys")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
                <Plus className="h-4 w-4" /> Create an API key
              </button>
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="flex items-center gap-2 font-semibold"><Code2 className="h-4 w-4 text-primary" /> MCP server</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Remote Streamable HTTP endpoint with stateless discovery and compatibility for current and earlier MCP clients.</p>
              <code className="mt-4 block break-all rounded-xl bg-secondary p-3 text-xs">{urls?.mcp ?? "Configure VITE_SUPABASE_URL to show the server URL"}</code>
              <button type="button" onClick={() => setTab("mcp")} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">View MCP setup <ArrowUpRight className="h-4 w-4" /></button>
            </section>
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="flex items-center gap-2 font-semibold"><FileJson2 className="h-4 w-4 text-primary" /> REST API</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Versioned JSON endpoints, a machine-readable OpenAPI document, and idempotent booking-request writes.</p>
              {urls && <button type="button" onClick={() => void downloadOpenApi()} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">Download OpenAPI document <ArrowDownToLine className="h-4 w-4" /></button>}
              <button type="button" onClick={() => setTab("rest")} className="ml-4 mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">View REST docs <ArrowUpRight className="h-4 w-4" /></button>
            </section>
          </div>
        </div>
      )}

      {tab === "keys" && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="h-fit rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
            <div className="mb-5">
              <h2 className="font-semibold text-card-foreground">Create a key</h2>
              <p className="mt-1 text-sm text-muted-foreground">Keys belong to your account. They are stored as hashes and can’t be recovered later.</p>
            </div>
            <form onSubmit={handleCreateKey} className="space-y-5">
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-card-foreground">Key name</span>
                <input value={keyName} onChange={(event) => setKeyName(event.target.value)} maxLength={80} required placeholder="e.g. Claude travel assistant" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/25" />
              </label>
              <fieldset className="space-y-2">
                <legend className="mb-2 text-xs font-semibold text-card-foreground">Permissions</legend>
                {PLATFORM_API_SCOPES.map((scope) => (
                  <label key={scope.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 hover:bg-secondary/50">
                    <input type="checkbox" checked={scopes.includes(scope.id)} onChange={() => toggleScope(scope.id)} className="mt-1 accent-primary" />
                    <span>
                      <span className="block text-sm font-semibold text-card-foreground">{scope.label}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{scope.detail}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <label className="block space-y-1.5">
                <span className="text-xs font-semibold text-card-foreground">Expiration</span>
                <select value={expiry} onChange={(event) => setExpiry(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm">
                  <option value="30">30 days</option>
                  <option value="90">90 days</option>
                  <option value="180">180 days</option>
                  <option value="365">1 year</option>
                  <option value="never">Never expires</option>
                </select>
              </label>
              <button type="submit" disabled={creating || !keyName.trim() || !scopes.length} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
                {creating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {creating ? "Creating…" : "Create API key"}
              </button>
              <p className="text-center text-[11px] leading-5 text-muted-foreground">Up to 10 active keys per account · 60 requests per minute per key</p>
            </form>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-card-foreground">Your API keys</h2>
                <p className="mt-1 text-sm text-muted-foreground">{activeKeys.length} active</p>
              </div>
              <button type="button" onClick={() => void loadKeys()} disabled={refreshing} className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-secondary disabled:opacity-50" aria-label="Refresh API keys">
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              </button>
            </div>
            {keysLoading ? (
              <div className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading keys…</div>
            ) : keys.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center">
                <KeyRound className="mx-auto h-6 w-6 text-muted-foreground" />
                <p className="mt-3 text-sm font-semibold text-card-foreground">No keys yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Create a key for each app or agent you connect.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {keys.map((key) => {
                  const expired = !!key.expires_at && Date.parse(key.expires_at) <= Date.now();
                  const revoked = !!key.revoked_at;
                  return (
                    <article key={key.id} className="rounded-xl border border-border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-semibold text-card-foreground">{key.name}</h3><StatusPill revoked={revoked} expired={expired} /></div>
                          <code className="mt-1.5 block text-xs text-muted-foreground">{key.key_prefix}••••••••</code>
                        </div>
                        {!revoked && <button type="button" onClick={() => void handleRevoke(key)} disabled={revokingId === key.id} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-500/10 disabled:opacity-50">
                          {revokingId === key.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Revoke
                        </button>}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">{key.scopes.map((scope) => <span key={scope} className="rounded-md bg-secondary px-2 py-1 text-[10px] text-muted-foreground">{scope}</span>)}</div>
                      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" /> Last used: {formatDate(key.last_used_at)}</span>
                        <span>Expires: {key.expires_at ? formatDate(key.expires_at) : "Never"}</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "mcp" && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-card-foreground">Remote MCP server</h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Add this Streamable HTTP server to an MCP-compatible AI client. The server advertises its tools based on the API key’s scopes, and validates access again when each tool runs.</p>
              </div>
              {urls && <CopyButton value={urls.mcp} label="Copy endpoint" />}
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl bg-secondary/60 p-4"><span className="text-[11px] uppercase tracking-wide text-muted-foreground">Transport</span><p className="mt-1 text-sm font-semibold">Streamable HTTP</p></div>
              <div className="rounded-xl bg-secondary/60 p-4"><span className="text-[11px] uppercase tracking-wide text-muted-foreground">Protocol</span><p className="mt-1 text-sm font-semibold">2026-07-28 + legacy clients</p></div>
              <div className="rounded-xl bg-secondary/60 p-4"><span className="text-[11px] uppercase tracking-wide text-muted-foreground">Authentication</span><p className="mt-1 text-sm font-semibold">Scoped key in x-api-key</p></div>
            </div>
          </section>

          <CodeBlock code={mcpConfig} label="Generic remote MCP configuration" />

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
            <h3 className="font-semibold text-card-foreground">Available tools</h3>
            <p className="mt-1 text-sm text-muted-foreground">The server only lists tools allowed by the key’s scopes.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {[
                ["list_trips", "Read trips available to your account."],
                ["get_trip", "Read a trip and its dates and budget."],
                ["create_trip", "Create a trip for your account."],
                ["get_trip_budget", "Summarize tracked spend by currency."],
                ["generate_trip_plan", "Generate and save an AI itinerary."],
                ["create_booking_request", "Record a booking request for later fulfillment."],
                ["list_booking_requests", "Read your booking request records."],
              ].map(([name, detail]) => (
                <div key={name} className="flex gap-3 rounded-xl border border-border p-3.5">
                  <Code2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div><code className="text-xs font-semibold text-card-foreground">{name}</code><p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p></div>
                </div>
              ))}
            </div>
          </section>

          <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm leading-6 text-amber-900">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Use one key per connected client. Keep it in that client’s secret store, grant only the scopes it needs, and revoke it here if it is exposed. A tool can create a booking request record; it cannot purchase or confirm travel.</p>
          </div>
        </div>
      )}

      {tab === "rest" && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-card-foreground">Versioned REST API</h2>
                <p className="mt-1 text-sm text-muted-foreground">Base URL: <code className="break-all">{urls?.rest ?? "Configure VITE_SUPABASE_URL"}</code></p>
              </div>
              {urls && <button type="button" onClick={() => void downloadOpenApi()} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-secondary"><ArrowDownToLine className="h-3.5 w-3.5" /> OpenAPI JSON</button>}
            </div>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="px-3 py-2 font-medium">Method</th><th className="px-3 py-2 font-medium">Path</th><th className="px-3 py-2 font-medium">Scope</th><th className="px-3 py-2 font-medium">Purpose</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {[
                    ["GET", "/trips", "trips:read", "List trips"],
                    ["POST", "/trips", "trips:write", "Create a trip"],
                    ["GET", "/trips/{trip_id}", "trips:read", "Read trip details"],
                    ["GET", "/trips/{trip_id}/budget", "budget:read", "Budget and expenses"],
                    ["POST", "/trips/{trip_id}/plan", "plans:generate", "Generate and save itinerary"],
                    ["GET", "/orders", "orders:read", "List booking requests"],
                    ["POST", "/orders", "orders:write", "Record booking request"],
                    ["GET", "/orders/{order_id}", "orders:read", "Read booking request"],
                  ].map(([method, path, scope, purpose]) => (
                    <tr key={`${method}-${path}`}><td className="px-3 py-3"><span className={`rounded-md px-2 py-1 text-[10px] font-bold ${method === "GET" ? "bg-emerald-500/10 text-emerald-700" : "bg-blue-500/10 text-blue-700"}`}>{method}</span></td><td className="px-3 py-3 font-mono text-xs">{path}</td><td className="px-3 py-3 text-xs text-muted-foreground">{scope}</td><td className="px-3 py-3 text-xs">{purpose}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <CodeBlock code={curlExample} label="List trips with curl" />

          <CodeBlock code={`curl -X POST "${urls?.rest ?? "https://YOUR_PROJECT.supabase.co/functions/v1/platform-api/v1"}/trips/{trip_id}/plan" \\
  -H "x-api-key: $ATLAS_API_KEY" \\
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"travelers": 2, "interests": ["food", "architecture"], "trip_type": "friends"}'`} label="Generate a saved itinerary" />

          <CodeBlock code={`curl -X POST "${urls?.rest ?? "https://YOUR_PROJECT.supabase.co/functions/v1/platform-api/v1"}/orders" \\
  -H "x-api-key: $ATLAS_API_KEY" \\
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \\
  -H "Idempotency-Key: order-req-001" \\
  -H "Content-Type: application/json" \\
  -d '{"order_type":"hotel","item_name":"Two nights near the old town","trip_id":"YOUR_TRIP_ID","quoted_amount":8000,"currency":"INR","details":{"check_in":"2026-11-12","rooms":1}}'`} label="Record a booking request" />

          <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 text-sm leading-6 text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p>Send <code>x-api-key</code> (or a Bearer token) with the scoped Atlas key and Supabase’s publishable key in <code>apikey</code>. Never send a service-role key from a client. AI itinerary generation supports India trips with INR budgets and IST dates up to 14 days. Booking requests are records only; provider checkout, confirmation, and payment are not connected.</p>
          </div>
        </div>
      )}

      {!urls && <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-900">Set <code>VITE_SUPABASE_URL</code> to show integration endpoints.</p>}
    </div>
  );
}
