# Atlas AI — Supabase Setup Instructions
# Complete Step-by-Step Guide for supabase.com

> **Project ID:** `dfvyuqxyjlkoovxmtikq`
> **Project URL:** `https://dfvyuqxyjlkoovxmtikq.supabase.co`
> **New project:** run `supabase/master_schema.sql`. **Existing project:** apply the latest migrations.

---

## Overview

This guide walks you through setting up the entire Atlas AI backend on
[supabase.com](https://supabase.com) — no CLI required for the core setup.
Every step is done through the Supabase web dashboard unless explicitly noted.

---

## STEP 1 — Create / Open Your Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and sign in.
2. From your dashboard click **"New project"** (or open the existing project
   `dfvyuqxyjlkoovxmtikq` if it already exists).
3. Fill in:
   - **Project name:** `Atlas AI`
   - **Database password:** choose a strong password and save it somewhere safe
   - **Region:** pick the closest to your users (e.g. `ap-south-1` for India)
4. Click **"Create new project"** and wait ~2 minutes for provisioning.

---

## STEP 2 — Run the Master Database Schema

> This is the **most important step**. One SQL file creates everything.

1. In the left sidebar click **"SQL Editor"**.
2. Click **"New query"** (top-right of the editor panel).
3. Open the file `supabase/master_schema.sql` from this project on your computer.
4. Select **all** the content (Ctrl+A / Cmd+A) and **copy** it.
5. Paste it into the Supabase SQL Editor.
6. Click the green **"Run"** button (or press Ctrl+Enter / Cmd+Enter).
7. Wait for the success message at the bottom: `Success. No rows returned`.

### What this script creates

| Category | Count | Items |
|---|---|---|
| Tables | 23 | Trips, itineraries, social/community, friends, expenses, API keys/orders, and provider quota counters |
| Database functions | 18 | Authorization helpers, triggers, invite lookup, API-key creation, trip listing, and rate limits |
| Trigger functions | 4 | handle_new_user, auto_add_organizer_membership, update_community_member_count, auto_add_community_creator |
| Triggers | 11 | Profile/trip/community/expense/order timestamp and membership triggers |
| RLS policies | 70 | User-facing tables use RLS; API credential/order tables are service-role-only with RLS enabled |
| Indexes | 36 | Performance indexes on high-traffic columns and integration lookups |
| Realtime tables | 8 | Messages, votes, join requests, friends and shared expenses |

> ✅ The script is **idempotent** — safe to run multiple times. It drops and
> recreates policies and triggers where needed. Integration credentials and
> order records have no browser-facing RLS policy: they are accessed only by the
> Edge Function service role after its own user and scope checks.

### Verify the schema ran correctly

After running, open a **new query** in the SQL Editor and run each block below
to confirm everything was created:

```sql
-- Should return 23 rows
SELECT tablename
FROM   pg_tables
WHERE  schemaname = 'public'
ORDER  BY tablename;
```

```sql
-- Should return 18 functions
SELECT routine_name
FROM   information_schema.routines
WHERE  routine_schema = 'public'
ORDER  BY routine_name;
```

```sql
-- Should return 11 triggers
SELECT tgname AS trigger_name, c.relname AS table_name
FROM   pg_trigger t
JOIN   pg_class  c ON t.tgrelid = c.oid
WHERE  c.relnamespace = 'public'::regnamespace
AND    NOT tgisinternal
ORDER  BY c.relname, t.tgname;
```

```sql
-- Should return 70 policies
SELECT tablename, policyname
FROM   pg_policies
WHERE  schemaname = 'public'
ORDER  BY tablename, policyname;
```

```sql
-- Should return 8 realtime tables
SELECT tablename
FROM   pg_publication_tables
WHERE  pubname    = 'supabase_realtime'
AND    schemaname = 'public';
```

---

## STEP 3 — Configure Authentication

### 3a. Enable Email Auth

1. In the left sidebar go to **Authentication → Providers**.
2. Find **Email** — it should already be enabled (toggle is blue).
3. Settings to confirm:
   - **Enable Email provider:** ON
   - **Confirm email:** OFF for development, ON for production
   - **Secure email change:** ON (recommended)
   - **Secure password change:** ON (recommended)

### 3b. Set Site URL and Redirect URLs

1. Go to **Authentication → URL Configuration**.
2. Set **Site URL:**
   - Development: `http://localhost:5173`
   - Production: `https://your-production-domain.com`
3. Under **Redirect URLs**, click **"Add URL"** and add:
   - `http://localhost:5173/**`
   - `http://localhost:5173`
   - *(Add your production URL too when ready)*
4. Click **"Save"**.

### 3c. (Optional) Enable Google OAuth

1. Go to **Authentication → Providers → Google**.
2. Toggle it **ON**.
3. You need a Google OAuth Client ID and Secret from
   [Google Cloud Console](https://console.cloud.google.com/):
   - Create a project → APIs & Services → Credentials → Create OAuth 2.0 Client
   - Authorised redirect URI: `https://dfvyuqxyjlkoovxmtikq.supabase.co/auth/v1/callback`
4. Paste the **Client ID** and **Client Secret** into Supabase.
5. Click **"Save"**.

---

## STEP 4 — Set Edge Function Secrets

1. In the left sidebar go to **Settings → Edge Functions**.
2. Click on the **"Secrets"** tab (or look for "Edge Function Secrets").
3. Add each secret below by clicking **"Add new secret"**:

| Secret Name | Value | Where to get it |
|---|---|---|
| `GROQ_API_KEY` | `<your_groq_api_key>` | [console.groq.com](https://console.groq.com) — hosted AI proxy |
| `ORS_API_KEY` | `<your_openrouteservice_key>` | [openrouteservice.org](https://openrouteservice.org) — authenticated routing proxy |
| `OPENTRIPMAP_API_KEY` | `<your_opentripmap_api_key>` | [opentripmap.io/product](https://opentripmap.io/product) — authenticated place-search proxy |
| `HF_API_KEY` | `<your_huggingface_token>` | [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) — optional `ai-planner` endpoint |

Optional server-side model overrides are `GROQ_MODEL` and `GROQ_VISION_MODEL`.
Never add provider credentials to a `VITE_*` variable; those values are public
in the built browser bundle. Previously exposed provider keys should be rotated.
For browser-based external REST/MCP clients, set `PLATFORM_API_ALLOWED_ORIGINS`
to a comma-separated list of exact production origins (for example,
`https://app.example.com`). Requests from server-side clients without an
`Origin` header remain supported.

> ⚠️ **Never commit secrets to Git.** These are set only in the Supabase dashboard.

> ℹ️ The following secrets are **automatically provided** by Supabase — do NOT
> set them manually:
> - `SUPABASE_URL`
> - `SUPABASE_ANON_KEY`
> - `SUPABASE_SERVICE_ROLE_KEY`

---

## STEP 5 — Deploy Edge Functions

For an existing project, apply all pending migrations before deploying the
functions. This includes the platform API, RLS/provider quota hardening,
atomic API-key creation, and bounded rate-limit counter migrations. CLI-managed
projects can run `supabase db push --linked` after linking.

### Install the CLI (if not already installed)

```bash
npm install -g supabase
```

### Login and link the project

```bash
supabase login
supabase link --project-ref dfvyuqxyjlkoovxmtikq
```

When prompted for the database password enter the one you set in Step 1.

```bash
supabase db push
```

### Deploy the active production functions

Deploy the functions used by the current app. Do not use bare `supabase functions deploy` here: the repository contains retired handlers that return HTTP 410 so an accidental all-functions deploy cannot restore old provider proxies.

```bash
supabase functions deploy groq-proxy
supabase functions deploy openroute
supabase functions deploy opentripmap
supabase functions deploy platform-api

# Needed only when the Platform API itinerary scope is enabled
supabase functions deploy ai-planner
```

### Verify deployment

In the Supabase dashboard go to **Edge Functions** (left sidebar). You should see `groq-proxy`, `openroute`, `opentripmap`, and `platform-api`; add `ai-planner` only if itinerary generation is enabled. Remove or redeploy any old remote `ai-chat`, `dynamic-replan`, `travel-memory`, `amadeus`, `nominatim`, or `tomtom` functions so the previous provider-backed handlers are no longer available.

### Edge Functions Reference

| Function | Purpose |
|---|---|
| `groq-proxy` | Authenticated chat, vision, and transcription; provider credential stays server-side |
| `openroute` | Authenticated directions, isochrones, matrix, geocoding, and elevation via HeiGIT |
| `opentripmap` | Authenticated place search with bounded requests |
| `platform-api` | Scoped REST/OpenAPI and remote MCP API for trips, budgets, planning, and booking request records |
| `ai-planner` | Optional internal itinerary-generation endpoint; accepts service-role calls only |
| Retired handlers | `ai-chat`, `dynamic-replan`, `travel-memory`, `amadeus`, `nominatim`, and `tomtom` return HTTP 410 |

---

## STEP 6 — Verify Realtime Is Enabled

1. In the left sidebar go to **Database → Replication**.
2. You will see a section called **"supabase_realtime"**.
3. Confirm the following tables have the toggle **ON** (green):
   - `public.messages`
   - `public.activity_votes`
   - `public.community_messages`
   - `public.trip_join_requests`
   - `public.direct_messages`
   - `public.friend_requests`
   - `public.group_expenses`
   - `public.expense_splits`

If any table is missing or toggled off, run this in the SQL Editor:

```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='activity_votes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_votes;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='community_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.community_messages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='trip_join_requests') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_join_requests;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='direct_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='friend_requests') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='group_expenses') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.group_expenses;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='expense_splits') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.expense_splits;
  END IF;
END;
$$;
```

---

## STEP 7 — Configure the Frontend Environment

Create a `.env` file in the **root of the project** (next to `package.json`):

```env
VITE_SUPABASE_URL=https://dfvyuqxyjlkoovxmtikq.supabase.co
VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=sb_publishable_Y3N5QRELKbHRYqWNZbx3EA_MVvHDzwF
```

> ✅ The `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY` is the **anon/public key** —
> it is safe to expose in the browser. All data access is protected by Row Level
> Security on the database side.

> ⛔ Never put `service_role` key in the frontend `.env` file.

You can find both values in **Settings → API** in the Supabase dashboard:
- **Project URL** → `VITE_SUPABASE_URL`
- **anon public** key → `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY`

---

## STEP 8 — Start the Frontend

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

Sign up with a new email account. A profile row will be automatically created
in `public.profiles` by the `on_auth_user_created` trigger.

---

## STEP 9 — Smoke Test Checklist

After completing all steps above, verify the following in the browser:

- [ ] Sign up creates a user and a profile row appears in **Database → profiles**
- [ ] Creating a trip auto-adds the creator as an `organizer` in **trip_memberships**
- [ ] Trip group chat messages appear in **Database → messages** in real time
- [ ] Community creation adds the creator as `admin` in **community_memberships**
- [ ] Hosted AI responds through `groq-proxy` when `GROQ_API_KEY` is configured; WebLLM works after downloading a local model
- [ ] Map loads with the configured MapLibre/OpenStreetMap tiles
- [ ] Invite link flow: the recipient resolves one invite through `lookup_trip_invite`, requests to join, and the organizer approves

---

## Database Schema Diagram

```
auth.users  (Supabase-managed)
    │
    ├── profiles                (1:1 — travel preferences, personality, history)
    │
    ├── trips                   (organizer_id → auth.users)
    │    ├── trip_memberships        (many users ↔ many trips, roles: organizer | member)
    │    ├── itineraries             (versioned plans, regret-scoring variants)
    │    │    └── activities             (time-blocked activities with cost & location)
    │    │         └── activity_votes    (up/down voting per user per activity)
    │    ├── messages                (real-time group trip chat)
    │    ├── disruption_events       (detected disruptions + replanning history)
    │    ├── trip_invites            (shareable invite codes with expiry & use cap)
    │    └── trip_join_requests      (pending/approved/rejected join requests)
    │
    └── communities             (travel interest groups)
         ├── community_memberships   (many users ↔ many communities, roles: admin | member)
         ├── community_messages      (real-time community chat)
         ├── community_events        (meetups and group trips)
         └── event_rsvps             (going | maybe | not_going)
```

---

## Row Level Security Summary

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | Own row + co-trip members + organizer for join requests | Own row only | Own row only | — |
| `trips` | Trip members | Authenticated (own organizer_id) | Organizer only | Organizer only |
| `trip_memberships` | Trip members | Organizer OR self (join flow) | — | Organizer OR self |
| `itineraries` | Trip members | Trip members | Trip members | Trip members |
| `activities` | Trip members | Trip members | Trip members | Trip members |
| `activity_votes` | Trip members | Trip members (own user_id) | Own votes only | Own votes only |
| `messages` | Trip members | Trip members (own sender_id) | — | — |
| `disruption_events` | Trip members | Trip members | — | — |
| `trip_invites` | Trip members; invite recipient by exact code via RPC | Organizer only | — | Organizer only |
| `trip_join_requests` | Own request + trip members | Self only | Organizer only | — |
| `communities` | Public communities, own private communities, or member communities | Authenticated (own created_by) | Creator only | Creator only |
| `community_memberships` | Own row, same community, or public community | Self only on public communities | — | Self only |
| `community_messages` | Community members | Community members (own sender_id) | — | — |
| `community_events` | Public communities or community members | Community members (own created_by) | Creator only | Creator only |
| `event_rsvps` | Public events or community members | Self on a visible event | Self on a visible event | Self |

---

## API Keys & Services Reference

| Service | Credential location | Used by | Protection |
|---|---|---|---|
| Groq | `GROQ_API_KEY` Edge Function secret | `groq-proxy` for chat, vision, and transcription | Supabase user JWT plus per-user and project quotas |
| OpenRouteService | `ORS_API_KEY` Edge Function secret | `openroute` | Supabase user JWT, bounded inputs, per-user and project quotas |
| OpenTripMap | `OPENTRIPMAP_API_KEY` Edge Function secret | `opentripmap` | Supabase user JWT, bounded inputs, per-user and project quotas |
| Hugging Face | `HF_API_KEY` Edge Function secret | Optional `ai-planner` platform itinerary generation | Service-side only; do not add to frontend builds |
| Open-Meteo | No provider key | Weather forecasts | Public service usage policies apply |
| Web Speech / WebLLM | No provider key | Browser voice and opt-in local inference | Browser/device capability dependent |

---

## AI Model Details

The browser uses an authenticated `groq-proxy` for hosted chat/vision/audio or
WebLLM for local inference. The proxy defaults to `openai/gpt-oss-120b` and
`qwen/qwen3.8-27b`; deployments may override them with server-only
`GROQ_MODEL` and `GROQ_VISION_MODEL` secrets. The separate `ai-planner`
function used by the Platform API requires `HF_API_KEY`.

---

## Troubleshooting

### "row violates row-level security policy" on trip INSERT
The `trg_auto_add_organizer` trigger runs as `SECURITY DEFINER` and inserts
into `trip_memberships`. Verify it exists:
```sql
SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.trips'::regclass;
```
You should see `trg_auto_add_organizer`. If missing, re-run `master_schema.sql`.

### "row violates row-level security policy" on trip_memberships INSERT
Only a trip organizer can insert another trip member. The old self-insert policy
allowed users to join a trip by supplying its UUID and must not exist. Check:
```sql
SELECT policyname FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'trip_memberships';
```
If `Users can add own membership` is listed, apply migration
`20261024000003_platform_hardening.sql`. Organizer approval and trip creation
use the organizer policy and security-definer trigger.

### Profile not created after sign up
The `on_auth_user_created` trigger on `auth.users` creates the profile row.
Check the trigger exists:
```sql
SELECT tgname FROM pg_trigger
WHERE tgrelid = 'auth.users'::regclass;
```
If missing, re-run `master_schema.sql`.

### AI functions return 401 / 403
- Confirm `HF_API_KEY` is set in **Settings → Edge Functions → Secrets**.
- Confirm the user is signed in before calling the function (JWT token required).

### AI functions return 429 (rate limited)
HuggingFace free tier has rate limits. Wait a few seconds and retry, or upgrade
to a HuggingFace Pro plan for production.

### Realtime not working (messages not appearing live)
1. Check **Database → Replication** — the table must be in the `supabase_realtime` publication.
2. Check that RLS allows the user to SELECT from that table.
3. Check your browser console for WebSocket errors.

### Edge function cold-start delay (1–2 seconds on first call)
This is normal for Supabase Edge Functions after a period of inactivity.
Subsequent calls within the warm window are fast.

### Voice / "Hey Jinny" not working
- Requires **Chrome or Edge** (uses `webkitSpeechRecognition`)
- Site must be served over **HTTPS** in production (mic access requires a secure context)
- Firefox: enable `media.webspeech.recognition.enable` in `about:config`
- Safari: requires iOS 14.5+ or macOS 12+

### Old Edge Function returns HTTP 410
The `ai-chat`, `dynamic-replan`, `travel-memory`, `amadeus`, `nominatim`, and
`tomtom` Edge Functions are retired. Deploy the current `groq-proxy`, `openroute`,
and `opentripmap` functions and update any external client still calling the old
names.

### Map not rendering
The current map view uses MapLibre with the configured public basemap. Check the
browser console and network panel for tile or style request failures; no Mappls
API key is configured by this project.

---

## Production Deployment Checklist

When you are ready to go live, complete every item below:

### Supabase Dashboard
- [ ] For a new empty project only, apply `supabase/master_schema.sql`; for an existing project, apply pending migrations and verify the remote schema first
- [ ] Apply all pending migrations, including `20261024000001_platform_api.sql`, `20261024000003_platform_hardening.sql`, `20261024000004_api_key_creation_hardening.sql`, and `20261024000005_api_rate_limit_overflow_guard.sql`
- [ ] Set only the provider secrets used by this deployment: `GROQ_API_KEY`, `ORS_API_KEY`, `OPENTRIPMAP_API_KEY`, and optional `HF_API_KEY`
- [ ] If browser clients call REST/MCP, set `PLATFORM_API_ALLOWED_ORIGINS` to their exact origins
- [ ] Confirm the planner daily limit (10 generations per account, 100 per project) matches the deployment budget
- [ ] Deploy `groq-proxy`, `openroute`, `opentripmap`, and `platform-api`; deploy `ai-planner` only if itinerary generation uses it
- [ ] **Authentication → Providers → Email** — enable "Confirm email"
- [ ] **Authentication → URL Configuration** — set Site URL to your production domain
- [ ] **Authentication → URL Configuration** — add your production domain to Redirect URLs
- [ ] **Database → Replication** — verify all 8 realtime tables are in the publication

### Frontend / Hosting (Vercel / Netlify / etc.)
- [ ] Set `VITE_SUPABASE_URL` environment variable to the production project URL
- [ ] Set `VITE_SUPABASE_PUBLISHABLE_KEY` to the production publishable key (the legacy `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY` alias is still accepted)
- [ ] Ensure the site is served over **HTTPS** (required for mic / voice features)
- [ ] Update Mappls developer account to whitelist your production domain

### Testing
- [ ] Sign up flow creates a profile row automatically
- [ ] Create a trip — organizer appears in trip_memberships
- [ ] Send a trip chat message — appears in real time in another browser tab
- [ ] Generate an AI itinerary — Jinny responds with a structured plan
- [ ] Generate a trip invite link — another user can request to join
- [ ] Organizer can approve the join request
- [ ] Community creation, join, and chat all work
- [ ] Voice wake word "Hey Jinny" works on Chrome over HTTPS

---

## CLI Quick Reference

```bash
# Login to Supabase CLI
supabase login

# Link to the project
supabase link --project-ref dfvyuqxyjlkoovxmtikq

# View live logs for a function
supabase functions logs platform-api --tail

# Set a secret via CLI
supabase secrets set HF_API_KEY=your_key_here

# List all secrets (names only, not values)
supabase secrets list

# List deployed functions
supabase functions list

# Run the database locally (Docker required)
supabase start

# Push local migrations to remote
supabase db push

# Pull remote schema to local
supabase db pull
```

---

*Last updated: Atlas AI v2.0*
