import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  ArrowDownToLine,
  ArrowUpRight,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  Clock3,
  Code2,
  Copy,
  Database,
  ExternalLink,
  FileJson2,
  Globe2,
  KeyRound,
  LoaderCircle,
  Plus,
  RefreshCw,
  Server,
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

type PanelTab = "overview" | "keys" | "mcp" | "rest" | "guide";

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

function GuideSection({
  id,
  title,
  description,
  children,
  defaultOpen = false,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details id={id} open={defaultOpen} className="group scroll-mt-6 rounded-2xl border border-border bg-card shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 md:p-6 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block font-semibold text-card-foreground">{title}</span>
          <span className="mt-1 block text-sm leading-5 text-muted-foreground">{description}</span>
        </span>
        <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-5 border-t border-border p-5 md:p-6">{children}</div>
    </details>
  );
}

function GuideTable({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[620px] border-collapse text-left text-sm">
        <thead className="bg-secondary/60 text-xs text-muted-foreground">
          <tr>{columns.map((column) => <th key={column} className="px-3 py-2.5 font-semibold">{column}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, index) => (
            <tr key={`${row[0]}-${index}`} className="align-top">
              {row.map((cell, cellIndex) => (
                <td key={`${cellIndex}-${cell}`} className="px-3 py-3 leading-5 text-muted-foreground">
                  {cellIndex === 0 ? <code className="font-semibold text-card-foreground">{cell}</code> : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DiagramNode({ icon: Icon, title, detail }: { icon: typeof Server; title: string; detail: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-background p-4">
      <Icon className="mb-3 h-5 w-5 text-primary" />
      <p className="text-sm font-semibold text-card-foreground">{title}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

function PlatformApiGuide({ urls }: { urls: ReturnType<typeof platformApiUrls> | null }) {
  const functionUrl = urls?.rest.replace(/\/v1$/, "") ?? "https://YOUR_PROJECT.supabase.co/functions/v1/platform-api";
  const restBase = urls?.rest ?? "https://YOUR_PROJECT.supabase.co/functions/v1/platform-api/v1";
  const publishableKey = supabasePublishableKey();
  const mcpConfig = JSON.stringify({
    mcpServers: {
      "atlas-ai": {
        type: "http",
        url: urls?.mcp ?? `${functionUrl}/mcp`,
        headers: { "x-api-key": "YOUR_ATLAS_API_KEY", apikey: publishableKey },
      },
    },
  }, null, 2);
  const envSetup = `export SUPABASE_URL="${functionUrl.replace("/functions/v1/platform-api", "")}"\nexport SUPABASE_PUBLISHABLE_KEY="${publishableKey}"\nexport ATLAS_API_KEY="rr_live_<your-key>"\nexport ATLAS_FUNCTION_URL="${functionUrl}"\nexport ATLAS_API_BASE="${restBase}"`;
  const healthCheck = `curl -i "${functionUrl}/health" \\\n  -H "apikey: $SUPABASE_PUBLISHABLE_KEY"\n\ncurl -i "${functionUrl}/v1/openapi.json" \\\n  -H "apikey: $SUPABASE_PUBLISHABLE_KEY"`;
  const migrationCommands = `supabase migration list --linked\nsupabase db push --linked`;
  const listCalls = `curl "${restBase}/trips?limit=20&offset=0" -H "apikey: $SUPABASE_PUBLISHABLE_KEY" -H "x-api-key: $ATLAS_API_KEY"\n\ncurl "${restBase}/orders?limit=20&offset=0" -H "apikey: $SUPABASE_PUBLISHABLE_KEY" -H "x-api-key: $ATLAS_API_KEY"`;
  const authHeaders = `-H "apikey: $SUPABASE_PUBLISHABLE_KEY" \\\n-H "x-api-key: $ATLAS_API_KEY" \\\n-H "Content-Type: application/json"`;
  const createTrip = `curl -X POST "${restBase}/trips" \\\n  ${authHeaders} \\\n  -d '{"name":"Jaipur weekend","destination":"Jaipur","country":"India","start_date":"2026-11-12","end_date":"2026-11-14","budget_total":18000,"currency":"INR"}'`;
  const budgetCall = `curl "${restBase}/trips/$TRIP_ID/budget" \\\n  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \\\n  -H "x-api-key: $ATLAS_API_KEY"`;
  const planCall = `curl -X POST "${restBase}/trips/$TRIP_ID/plan" \\\n  ${authHeaders} \\\n  -d '{"travelers":2,"interests":["architecture","local food","markets"],"trip_type":"weekend cultural trip"}'`;
  const orderCall = `curl -X POST "${restBase}/orders" \\\n  ${authHeaders} \\\n  -H "Idempotency-Key: jaipur-hotel-2026-11-v1" \\\n  -d '{"order_type":"hotel","item_name":"Two nights near Hawa Mahal","trip_id":"<trip-uuid>","provider":"Example hotel partner","quoted_amount":6800,"currency":"INR","details":{"check_in":"2026-11-12","nights":2}}'`;
  const mcpDiscover = `curl -X POST "${functionUrl}/mcp" \\\n  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \\\n  -H "x-api-key: $ATLAS_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -H "MCP-Protocol-Version: 2026-07-28" \\\n  -H "Mcp-Method: server/discover" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28"}}}'`;
  const mcpToolCall = `curl -X POST "${functionUrl}/mcp" \\\n  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \\\n  -H "x-api-key: $ATLAS_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -H "MCP-Protocol-Version: 2026-07-28" \\\n  -H "Mcp-Method: tools/call" \\\n  -H "Mcp-Name: get_trip" \\\n  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_trip","arguments":{"trip_id":"<trip-uuid>"},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28"}}}'`;

  const sections = [
    ["guide-setup", "Setup and deployment"],
    ["guide-auth", "Keys and permissions"],
    ["guide-rest", "REST calls"],
    ["guide-mcp", "MCP connection"],
    ["guide-limits", "Limits and errors"],
    ["guide-testing", "Testing and troubleshooting"],
    ["guide-security", "Security and references"],
  ];

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"><BookOpen className="h-3.5 w-3.5" /> Atlas AI Platform API · v1.0.0</div>
            <h2 className="mt-3 text-xl font-bold text-card-foreground">API integration guide</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Connect a server, app, or MCP-compatible AI client to Atlas AI trip planning, budget summaries, itinerary generation, and booking-request records.</p>
          </div>
          <a href="#guide-setup" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Start setup <ArrowRight className="h-4 w-4" /></a>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["REST base", restBase],
            ["MCP server", urls?.mcp ?? `${functionUrl}/mcp`],
            ["OpenAPI document", urls?.openApi ?? `${functionUrl}/v1/openapi.json`],
            ["Rate limit", "60 requests/minute per key"],
          ].map(([label, value]) => <div key={label} className="min-w-0 rounded-xl bg-secondary/60 p-3"><span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span><code className="mt-1 block break-all text-xs text-card-foreground">{value}</code></div>)}
        </div>
        <nav aria-label="API guide sections" className="mt-5 flex flex-wrap gap-2">
          {sections.map(([id, label]) => <a key={id} href={`#${id}`} className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-primary">{label}</a>)}
        </nav>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm md:p-6">
        <h3 className="font-semibold text-card-foreground">How a request flows</h3>
        <p className="mt-1 text-sm text-muted-foreground">Both REST and MCP use the same API key checks, scopes, owner rules, and rate counter.</p>
        <div className="mt-5 grid items-stretch gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
          <DiagramNode icon={Globe2} title="REST or MCP client" detail="Sends project apikey and scoped rr_live key over HTTPS." />
          <ArrowRight className="mx-auto my-auto hidden h-5 w-5 text-primary md:block" />
          <DiagramNode icon={Server} title="Supabase gateway" detail="Routes the request to the deployed Edge Function." />
          <ArrowRight className="mx-auto my-auto hidden h-5 w-5 text-primary md:block" />
          <DiagramNode icon={ShieldCheck} title="platform-api" detail="Checks key, scope, ownership, inputs, and limits." />
          <ArrowRight className="mx-auto my-auto hidden h-5 w-5 text-primary md:block" />
          <DiagramNode icon={Database} title="Supabase data" detail="Reads or writes trips, expenses, keys, and request records." />
        </div>
        <div className="mt-3 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-primary">Optional itinerary-generation branch</p>
          <div className="grid gap-2 md:grid-cols-[1fr_auto_1fr] md:items-center">
            <DiagramNode icon={Bot} title="ai-planner" detail="Called by platform-api; requires HF_API_KEY." />
            <ArrowRight className="mx-auto h-5 w-5 rotate-90 text-primary md:rotate-0" />
            <DiagramNode icon={Globe2} title="Hugging Face" detail="Model provider used by ai-planner." />
          </div>
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">The service-role key is only used inside Edge Functions and is never sent to the integration client.</p>
      </section>

      <GuideSection id="guide-setup" title="Setup and deployment" description="Database prerequisites, Edge Function deployment, secrets, and health checks." defaultOpen>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border p-4">
            <h4 className="flex items-center gap-2 text-sm font-semibold"><Database className="h-4 w-4 text-primary" /> Database</h4>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">For an empty project, apply <code>supabase/master_schema.sql</code> once. For an existing Atlas database, apply <code>supabase/migrations/20261024000001_platform_api.sql</code>. It adds API keys, rate-limit storage/function, and booking request records; it expects the trip schema and <code>update_updated_at_column()</code> to exist.</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">The broader <code>supabase/master_schema_updates.sql</code> also includes other additive app tables. Do not apply the fresh-install schema to a populated database.</p>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <h4 className="text-sm font-semibold text-amber-900">If a migration says “profiles already exists”</h4>
            <p className="mt-2 text-sm leading-6 text-amber-900">The remote schema and migration history may be out of sync. Inspect the linked migration list and compare the live schema first. Migration repair only records status; it does not run SQL. Mark a migration applied only after verifying all of its changes already exist.</p>
          </div>
        </div>
        <CodeBlock label="Link and deploy" code={`supabase login\nsupabase link --project-ref dfvyuqxyjlkoovxmtikq\nsupabase functions deploy platform-api --project-ref dfvyuqxyjlkoovxmtikq\n\n# Needed for itinerary generation\nsupabase functions deploy ai-planner --project-ref dfvyuqxyjlkoovxmtikq\nsupabase secrets set HF_API_KEY="your-hugging-face-token" --project-ref dfvyuqxyjlkoovxmtikq`} />
        <CodeBlock label="Apply migrations to an existing project" code={migrationCommands} />
        <p className="text-xs leading-5 text-muted-foreground">If the remote schema already contains a table from a pending base migration, compare the live schema and migration history before proceeding. <code>supabase migration repair --linked --status applied &lt;version&gt;</code> only changes the migration ledger; use it only after confirming every statement from that migration is already applied.</p>
        <CodeBlock label="Check function and OpenAPI" code={healthCheck} />
        <div className="rounded-xl bg-secondary/60 p-4 text-sm leading-6 text-muted-foreground"><strong className="text-card-foreground">Expected health body:</strong> <code>{'{"status":"ok","version":"1.0.0"}'}</code>. A <code>503 not_ready</code> usually means the function cannot read <code>integration_api_keys</code>. The gateway `apikey` is required here; an Atlas key is not.</div>
        <p className="text-xs leading-5 text-muted-foreground">Supabase provides <code>SUPABASE_URL</code>, <code>SUPABASE_ANON_KEY</code>, and <code>SUPABASE_SERVICE_ROLE_KEY</code> inside the function. Only add <code>HF_API_KEY</code> as a secret when planning is enabled. The platform function uses <code>verify_jwt = false</code> because it authenticates external requests itself.</p>
        <CodeBlock label="Shell values for the examples" code={envSetup} />
      </GuideSection>

      <GuideSection id="guide-auth" title="Keys, scopes, and authentication" description="Create one credential per integration and only grant the permissions that client needs.">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h4 className="mb-2 text-sm font-semibold text-card-foreground">Required headers</h4>
            <GuideTable columns={["Header", "Value and purpose"]} rows={[
              ["apikey", "Supabase publishable/anon project key; gets through the Edge Function gateway."],
              ["x-api-key", "Atlas rr_live_… secret; identifies the account and grants selected scopes."],
              ["Authorization", "Optional alternative: Bearer rr_live_… instead of x-api-key."],
            ]} />
          </div>
          <div className="rounded-xl border border-border p-4">
            <h4 className="text-sm font-semibold">Credential lifecycle</h4>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">
              <li>Create keys in the API Keys tab; each account can have 10 active keys.</li>
              <li>The complete key is displayed once; only its SHA-256 hash is stored.</li>
              <li>Set expiry from 1–365 days, or choose no expiry.</li>
              <li>Revoke an exposed or retired key immediately, then rotate the consumer.</li>
            </ul>
          </div>
        </div>
        <GuideTable columns={["Scope", "Access"]} rows={[
          ["trips:read", "List trips and read accessible trip details."],
          ["trips:write", "Create a new planning trip owned by the key owner."],
          ["budget:read", "Read expense totals and remaining budget for an accessible trip."],
          ["plans:generate", "Generate and save an unpublished AI itinerary."],
          ["orders:read", "List and read the owner's booking request records."],
          ["orders:write", "Record a booking request; no purchase or payment occurs."],
        ]} />
        <p className="text-sm leading-6 text-muted-foreground">Every data request also counts toward 60 requests per fixed one-minute window per key. Supabase's publishable/anon key is a public gateway identifier; never expose the service-role key.</p>
      </GuideSection>

      <GuideSection id="guide-rest" title="REST API calls" description="Versioned JSON endpoints for trips, budgets, AI plans, and booking requests.">
        <p className="text-sm leading-6 text-muted-foreground">Base URL: <code className="break-all">{restBase}</code>. The live OpenAPI 3.1 document is at <code className="break-all">{urls?.openApi ?? `${functionUrl}/v1/openapi.json`}</code>. List endpoints accept <code>limit</code> (default 50, 1–100) and <code>offset</code> (default 0, maximum 10,000).</p>
        <GuideTable columns={["Method", "Path", "Scope", "Result"]} rows={[
          ["GET", "/trips", "trips:read", "List trips organized by or shared with the account."],
          ["POST", "/trips", "trips:write", "Create a trip in planning status."],
          ["GET", "/trips/{trip_id}", "trips:read", "Read an accessible trip."],
          ["GET", "/trips/{trip_id}/budget", "budget:read", "Budget and recorded expense totals, grouped by currency."],
          ["POST", "/trips/{trip_id}/plan", "plans:generate", "Generate and save an unpublished itinerary version."],
          ["GET", "/orders", "orders:read", "List the account's booking request records."],
          ["POST", "/orders", "orders:write", "Record a booking request; replay may return 200."],
          ["GET", "/orders/{order_id}", "orders:read", "Read one owned booking request."],
        ]} />
        <CodeBlock label="List trips or booking requests" code={listCalls} />
        <p className="text-xs leading-5 text-muted-foreground">List responses have <code>data</code> and <code>pagination</code> fields, including <code>limit</code>, <code>offset</code>, and <code>has_more</code>. Trip access requires organizer ownership or trip membership; orders are account-owned.</p>
        <h4 className="text-sm font-semibold">Create a trip</h4>
        <CodeBlock label="POST /trips" code={createTrip} />
        <p className="text-xs leading-5 text-muted-foreground">Required: name, destination and valid YYYY-MM-DD start/end dates. Name and destination max 120 chars; country max 100; currency is a three-letter code; amount is 0–1,000,000,000; image URL must use HTTPS.</p>
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-2"><h4 className="text-sm font-semibold">Read a budget</h4><CodeBlock label="GET /trips/{trip_id}/budget" code={budgetCall} /></div>
          <div className="space-y-2"><h4 className="text-sm font-semibold">Generate an itinerary</h4><CodeBlock label="POST /trips/{trip_id}/plan" code={planCall} /></div>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">Plan generation requires an India trip, INR currency, positive budget, and 1–14 inclusive days. Travelers must be 1–50; up to 12 interests of 40 chars each. The function validates up to 80 activities, at most 6/day, no overlaps, durations up to 14 hours, and cost at most 102% of budget. Generated plans are unpublished and should be reviewed.</p>
        <h4 className="text-sm font-semibold">Create a booking request</h4>
        <CodeBlock label="POST /orders with idempotency" code={orderCall} />
        <p className="text-xs leading-5 text-muted-foreground">Allowed order types: flight, hotel, activity, transport, package, other. Use a unique Idempotency-Key (max 128 chars; letters, numbers, dot, underscore, colon, hyphen) for retries. It is unique per account. Reusing it returns the first request even if a later payload differs, so reuse only for the same operation. Details must be a JSON object up to 20,000 characters and cannot include payment, bank, password, token, secret, or authorization fields.</p>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm leading-6 text-amber-900"><strong>Booking boundary:</strong> order calls create a <code>requested</code> record only. They do not contact providers, confirm availability, reserve travel, or charge payments. Budget summaries include recorded expenses, not pending booking requests; currency totals are not converted.</div>
        <p className="text-xs leading-5 text-muted-foreground">REST uses HTTPS, JSON, GET and POST; preflight OPTIONS is supported. POST bodies declaring more than 1 MB are rejected. Successful responses are JSON; errors are non-2xx with an <code>error.code</code> and <code>request_id</code>.</p>
      </GuideSection>

      <GuideSection id="guide-mcp" title="Connect an MCP client" description="Remote stateless Streamable HTTP endpoint for compatible AI clients.">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl bg-secondary/60 p-4"><span className="text-[10px] uppercase tracking-wide text-muted-foreground">Endpoint</span><code className="mt-1 block break-all text-xs">{urls?.mcp ?? `${functionUrl}/mcp`}</code></div>
          <div className="rounded-xl bg-secondary/60 p-4"><span className="text-[10px] uppercase tracking-wide text-muted-foreground">Transport</span><p className="mt-1 text-sm font-semibold">Streamable HTTP over HTTPS</p></div>
          <div className="rounded-xl bg-secondary/60 p-4"><span className="text-[10px] uppercase tracking-wide text-muted-foreground">Headers</span><p className="mt-1 text-xs"><code>apikey</code> + <code>x-api-key</code></p></div>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">In the client's remote MCP server settings, enter the endpoint and both headers. Use a key scoped for that AI client. Some clients only support local stdio servers and need a compatible HTTP-to-stdio bridge.</p>
        <CodeBlock label="Generic remote MCP client configuration" code={mcpConfig} />
        <p className="text-xs leading-5 text-muted-foreground">This function supports the stateless 2026-07-28 discovery flow and legacy initialize versions 2025-11-25, 2025-06-18, 2025-03-26, and 2024-11-05. For 2026-07-28, request metadata and headers must match: MCP-Protocol-Version must be the same in both places, Mcp-Method must match JSON-RPC method, and tools/call also requires Mcp-Name matching the tool.</p>
        <div className="grid gap-4 xl:grid-cols-2"><CodeBlock label="MCP discovery request" code={mcpDiscover} /><CodeBlock label="Call get_trip" code={mcpToolCall} /></div>
        <GuideTable columns={["Tool", "Scope", "Purpose"]} rows={[
          ["list_trips", "trips:read", "List accessible trips; default page only."],
          ["get_trip", "trips:read", "Read a trip by UUID."],
          ["create_trip", "trips:write", "Create a planning trip."],
          ["get_trip_budget", "budget:read", "Summarize recorded spending by currency."],
          ["generate_trip_plan", "plans:generate", "Generate and save a plan."],
          ["create_booking_request", "orders:write", "Record a request only."],
          ["list_booking_requests", "orders:read", "List booking request records; default page only."],
        ]} />
        <p className="text-xs leading-5 text-muted-foreground">Tool discovery filters by scopes, and the server checks authorization again on each call. MCP tools currently use default pagination; choose REST when a specific limit or offset is needed. Successful results include text content and structuredContent. Tool failures may return HTTP 200 with result.isError=true, so inspect that flag.</p>
      </GuideSection>

      <GuideSection id="guide-limits" title="Limits, response headers, and errors" description="Application-level ceilings and how clients should react to failures.">
        <GuideTable columns={["Limit", "Value"]} rows={[
          ["Active keys", "10 per account; expiry 1–365 days or never."],
          ["Rate", "60 authenticated requests per fixed minute per key."],
          ["List paging", "Default 50, max 100; offset up to 10,000."],
          ["Request body", "POST body over 1 MB is rejected when declared Content-Length exceeds the cap."],
          ["Trip fields", "Name/destination 120 chars; country 100; amount 0–1,000,000,000."],
          ["Booking details", "20,000 serialized characters; object only; sensitive field names rejected recursively."],
          ["Plan inputs", "India + INR, 1–14 days, 1–50 travelers, max 12 interests."],
          ["Plan output", "1–80 activities, max 6/day, 14 hours/activity, total <=102% budget."],
          ["Planner timeout", "50 seconds in platform-api; model provider quota/latency is separate."],
        ]} />
        <p className="text-sm leading-6 text-muted-foreground">Authenticated success and rate-limit responses include <code>X-RateLimit-Limit</code>, <code>X-RateLimit-Remaining</code>, and <code>X-RateLimit-Reset</code> (Unix seconds). On 429, wait until reset and retry with exponential backoff and jitter. Supabase Edge Function runtime and concurrency limits depend on the project plan.</p>
        <GuideTable columns={["HTTP", "Code / meaning"]} rows={[
          ["400", "invalid_request or sensitive_data_rejected — correct the body or field."],
          ["401", "unauthorized — check gateway apikey, Atlas key, expiry, or revocation."],
          ["403", "insufficient_scope — issue a key with the required scope."],
          ["404", "not_found — route/resource absent or not visible to that owner."],
          ["409", "key_limit_reached — revoke an unused key."],
          ["413", "payload_too_large — reduce payload size."],
          ["422", "Plan input/output not supported; check destination, dates, currency, pace, and budget."],
          ["429", "rate_limit_exceeded — wait for X-RateLimit-Reset."],
          ["502 / 503", "Planner/provider or database/configuration issue; inspect function status and logs."],
          ["500", "internal_error — retain request_id, endpoint, timestamp, and status for investigation."],
        ]} />
        <CodeBlock label="REST error response" code={`{\n  "error": {\n    "code": "insufficient_scope",\n    "message": "This key needs the 'trips:read' scope.",\n    "request_id": "<request-uuid>"\n  }\n}`} />
      </GuideSection>

      <GuideSection id="guide-testing" title="Smoke checks and troubleshooting" description="Verify the service in development or staging with disposable accounts and trips.">
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
          <li>Check health returns 200 and OpenAPI returns 200 with <code>openapi: 3.1.0</code>.</li>
          <li>Call a data route without an Atlas key: expect 401. Call with a valid key lacking trips:read: expect 403. With the scope: expect GET /trips to return 200.</li>
          <li>Use two test accounts. Account B should receive 404 when reading A's private trip, and B's order list should not include A's records.</li>
          <li>Create a disposable trip, read its budget, and (if configured) generate a plan. It should be unpublished and contain activities.</li>
          <li>POST one order twice using the same Idempotency-Key: first response 201, replay 200, same order ID.</li>
          <li>In staging, exceed 60 requests with one key in a minute and confirm 429 and reset headers. Do not run this against a shared production key.</li>
        </ol>
        <CodeBlock label="Inspect Edge Function logs" code={`supabase functions logs platform-api --project-ref dfvyuqxyjlkoovxmtikq\nsupabase functions logs ai-planner --project-ref dfvyuqxyjlkoovxmtikq`} />
        <GuideTable columns={["Symptom", "Check"]} rows={[
          ["Failed to send a request to the Edge Function", "Network/CORS/gateway failure: inspect browser Network and console, URL, project apikey, and deployment."],
          ["Edge Function returned a non-2xx status code", "Inspect JSON response for error.code/request_id; likely 401, 403, 429, or 503. The generic client text is not the underlying API error."],
          ["Health 404", "Check /functions/v1/platform-api/health and redeploy current platform-api routing code."],
          ["Health 503 not_ready", "Apply/verify platform API migration against the same Supabase project."],
          ["401 or 403", "Check both apikey and rr_live key; then confirm expiry/revocation and key scopes."],
          ["Plan 502/503", "Check ai-planner deploy, HF_API_KEY, model provider quota/latency, and function logs."],
          ["profiles already exists during db push", "Remote schema/history mismatch. Compare migration list and live schema; do not drop data or blindly repair migration history."],
          ["MCP header mismatch", "Align the 2026-07-28 protocol version metadata and headers; method and tool name must match the body."],
        ]} />
        <p className="text-xs leading-5 text-muted-foreground">Supabase's functions.invoke() surfaces a generic non-2xx message; inspect its response context/body in the browser Network panel to see the API error code. The function normalizes both the public /functions/v1/platform-api path and the Edge Runtime /platform-api path; redeploy if the hosted function is older.</p>
      </GuideSection>

      <GuideSection id="guide-security" title="Security and reference links" description="Production practices, product boundaries, and protocol/platform references.">
        <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
          <li>Use one key per connected integration, grant only necessary scopes, set an expiry, and keep the key in a server-side secret store.</li>
          <li>Never put rr_live keys in browser bundles, URLs, screenshots, analytics, or public repositories. Never expose SUPABASE_SERVICE_ROLE_KEY.</li>
          <li>Rotate by creating a replacement, updating and verifying the integration, then revoking the old key.</li>
          <li>Trip access is checked against organizer/membership ownership; booking requests are account-owned.</li>
          <li>AI output is model-generated. Review an itinerary before publishing or acting on it.</li>
          <li>CORS currently allows cross-origin requests; CORS is not authorization. Data routes still need valid project and Atlas credentials.</li>
          <li>Provider search, availability, booking confirmation/cancellation, payment, and refunds are outside the current order-request API.</li>
        </ul>
        <div className="grid gap-3 md:grid-cols-2">
          {[
            ["Supabase Edge Functions", "https://supabase.com/docs/guides/functions"],
            ["Edge Function limits", "https://supabase.com/docs/guides/functions/limits"],
            ["Function secrets", "https://supabase.com/docs/guides/functions/secrets"],
            ["Database migrations", "https://supabase.com/docs/guides/deployment/database-migrations"],
            ["Supabase API keys", "https://supabase.com/docs/guides/api/api-keys"],
            ["OpenAPI 3.1 specification", "https://spec.openapis.org/oas/v3.1.2.html"],
            ["MCP 2026-07-28 release notes", "https://blog.modelcontextprotocol.io/posts/2026-07-28/"],
            ["MCP SDK protocol versions", "https://ts.sdk.modelcontextprotocol.io/v2/protocol-versions"],
            ["Hugging Face Inference Providers", "https://huggingface.co/docs/inference-providers/index"],
          ].map(([label, href]) => <a key={href} href={href} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm font-medium text-card-foreground hover:border-primary/40 hover:text-primary"><span>{label}</span><ExternalLink className="h-4 w-4 shrink-0" /></a>)}
        </div>
      </GuideSection>
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
    { id: "guide", label: "Full API guide", icon: BookOpen },
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

          <section className="flex flex-col gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 font-semibold text-card-foreground"><BookOpen className="h-4 w-4 text-primary" /> Full API integration guide</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">Setup, diagrams, REST and MCP calls, limits, testing, errors, and troubleshooting.</p>
            </div>
            <button type="button" onClick={() => setTab("guide")} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">Open guide <ArrowRight className="h-4 w-4" /></button>
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

      {tab === "guide" && <PlatformApiGuide urls={urls} />}

      {!urls && <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-900">Set <code>VITE_SUPABASE_URL</code> to show integration endpoints.</p>}
    </div>
  );
}
