# Atlas AI Platform API

Atlas AI exposes the trip planner through a scoped REST API and a remote MCP
server. Both interfaces use the same API keys and authorization checks.

## Deploy

For a new project, run `supabase/master_schema.sql`. For an existing project,
apply `supabase/migrations/20261024000001_platform_api.sql` (or run
`supabase db push`). Then deploy the `platform-api` and `ai-planner` Edge
Functions. The planner requires the existing `HF_API_KEY` Edge Function secret;
Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` to Edge Functions automatically.

The `platform-api` function has JWT verification disabled at the Supabase
gateway so non-Supabase clients can reach it. The function validates every
request itself: dashboard key-management actions require a valid Supabase user
session, and external data requests require a live `rr_live_…` key. Never put a
service-role key in a browser or third-party client.

## Create a key

Open **API & Integrations** in the signed-in app. Give each connected system its
own key, select only the scopes it needs, and set an expiry. The full credential
is returned once. The database stores only its SHA-256 hash; use the panel to
revoke a key immediately if it is exposed. An account can have up to 10 active
keys. Each key is limited to 60 requests per minute.

| Scope | Permission |
|---|---|
| `trips:read` | List trips and read a trip |
| `trips:write` | Create trips |
| `budget:read` | Read expense totals and budgets |
| `plans:generate` | Generate and save an AI itinerary |
| `orders:read` | Read booking request records |
| `orders:write` | Record booking request records |

## REST API

Base URL: `https://<project>.supabase.co/functions/v1/platform-api/v1`

The OpenAPI 3.1 document is available at `/openapi.json`. Authenticate with
`x-api-key: rr_live_…` or `Authorization: Bearer rr_live_…`, and include the
Supabase publishable key in the `apikey` header for the Supabase gateway.

| Method | Path | Scope | Result |
|---|---|---|---|
| `GET` | `/trips` | `trips:read` | Paginated trips accessible to the key owner |
| `POST` | `/trips` | `trips:write` | Creates a trip owned by the key owner |
| `GET` | `/trips/{trip_id}` | `trips:read` | Reads a trip the owner belongs to |
| `GET` | `/trips/{trip_id}/budget` | `budget:read` | Sums expenses by currency and category |
| `POST` | `/trips/{trip_id}/plan` | `plans:generate` | Generates and saves a new itinerary version |
| `GET` | `/orders` | `orders:read` | Lists the owner's booking requests |
| `POST` | `/orders` | `orders:write` | Records a booking request |
| `GET` | `/orders/{order_id}` | `orders:read` | Reads one of the owner's booking requests |

Example:

```sh
curl "https://<project>.supabase.co/functions/v1/platform-api/v1/trips" \
  -H "x-api-key: $ATLAS_API_KEY" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY"
```

Trip and order list endpoints accept `limit` (1–100) and `offset`. Errors use
`{ "error": { "code", "message", "request_id" } }`. Responses include
`X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers.

## MCP server

Remote endpoint:

```text
https://<project>.supabase.co/functions/v1/platform-api/mcp
```

The endpoint speaks Streamable HTTP, supports MCP `2026-07-28` discovery and
the `2025-11-25` initialize handshake for older clients. Configure the client
with the URL and headers `x-api-key: rr_live_…` and `apikey:
<SUPABASE_PUBLISHABLE_KEY>`. MCP clients that support only local stdio servers
need an HTTP-to-stdio bridge supplied by that client or its MCP tooling.

Tools advertised by a key, filtered by scopes:

| MCP tool | Scope | Effect |
|---|---|---|
| `list_trips` | `trips:read` | Lists trips |
| `get_trip` | `trips:read` | Reads one trip |
| `create_trip` | `trips:write` | Creates a trip |
| `get_trip_budget` | `budget:read` | Summarizes budgets and expenses |
| `generate_trip_plan` | `plans:generate` | Generates and saves an itinerary |
| `create_booking_request` | `orders:write` | Records a booking request |
| `list_booking_requests` | `orders:read` | Lists booking requests |

Tool scopes are checked again when called; hiding a tool in discovery is not the
authorization boundary.

## Booking request boundary

`POST /orders` and `create_booking_request` create an internal record with status
`requested`. They do **not** contact an airline, hotel, activity provider, place
an order, confirm availability, or charge a payment method. A future provider
adapter can fulfill these records and update their status. Use the
`Idempotency-Key` header to safely retry REST order writes. Payment credentials,
passwords, tokens, and authorization fields are rejected from `details`.

## Important operating notes

- Trip ids are checked against the key owner's membership before reading or
  changing trip data; order records are visible only to their creator.
- AI generation currently supports India trips using INR budgets and IST dates,
  up to 14 days. It saves a new unpublished itinerary version. Review the
  generated activities before sharing or booking.
- Keep one key per integration, use the smallest scope set, and store it in the
  integration's secret manager. Rotate by creating a replacement key and
  revoking the old one.
- The project's older API credentials were exposed in Git history according to
  `AUDIT.md`; rotate those provider credentials in their dashboards before a
  production launch. This platform API uses a separate hashed-key store.
