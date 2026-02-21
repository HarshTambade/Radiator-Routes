# Radiator Routes — Supabase Setup Instructions
# Complete Step-by-Step Guide for supabase.com

> **Project ID:** `dfvyuqxyjlkoovxmtikq`
> **Project URL:** `https://dfvyuqxyjlkoovxmtikq.supabase.co`
> **Single SQL file to run:** `supabase/master_schema.sql`

---

## Overview

This guide walks you through setting up the entire Radiator Routes backend on
[supabase.com](https://supabase.com) — no CLI required for the core setup.
Every step is done through the Supabase web dashboard unless explicitly noted.

---

## STEP 1 — Create / Open Your Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and sign in.
2. From your dashboard click **"New project"** (or open the existing project
   `dfvyuqxyjlkoovxmtikq` if it already exists).
3. Fill in:
   - **Project name:** `radiator-routes`
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
| Tables | 15 | profiles, trips, trip_memberships, itineraries, activities, activity_votes, messages, disruption_events, trip_invites, trip_join_requests, communities, community_memberships, community_messages, community_events, event_rsvps |
| Helper functions | 5 | is_trip_member, is_trip_organizer, get_trip_id_from_activity, get_trip_id_from_vote, is_community_member |
| Trigger functions | 4 | handle_new_user, auto_add_organizer_membership, update_community_member_count, auto_add_community_creator |
| Triggers | 8 | on_auth_user_created, update_profiles_updated_at, update_trips_updated_at, trg_auto_add_organizer, update_itineraries_updated_at, update_communities_updated_at, trg_update_community_member_count, trg_auto_add_community_creator |
| RLS policies | 38 | Full row-level security on all 15 tables |
| Indexes | 24 | Performance indexes on all high-traffic columns |
| Realtime tables | 4 | messages, activity_votes, community_messages, trip_join_requests |

> ✅ The script is **idempotent** — safe to run multiple times. It drops and
> recreates all policies and triggers on every run, so the database always ends
> up in a consistent state.

### Verify the schema ran correctly

After running, open a **new query** in the SQL Editor and run each block below
to confirm everything was created:

```sql
-- Should return 15 rows
SELECT tablename
FROM   pg_tables
WHERE  schemaname = 'public'
ORDER  BY tablename;
```

```sql
-- Should return 9 functions (5 helpers + 4 trigger functions)
SELECT routine_name
FROM   information_schema.routines
WHERE  routine_schema = 'public'
ORDER  BY routine_name;
```

```sql
-- Should return 8 triggers
SELECT tgname AS trigger_name, c.relname AS table_name
FROM   pg_trigger t
JOIN   pg_class  c ON t.tgrelid = c.oid
WHERE  c.relnamespace = 'public'::regnamespace
AND    NOT tgisinternal
ORDER  BY c.relname, t.tgname;
```

```sql
-- Should return 38 policies
SELECT tablename, policyname
FROM   pg_policies
WHERE  schemaname = 'public'
ORDER  BY tablename, policyname;
```

```sql
-- Should return 4 realtime tables
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
| `HF_API_KEY` | `hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` | [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) |
| `AMADEUS_API_KEY` | `<your_amadeus_api_key>` | [developers.amadeus.com](https://developers.amadeus.com) → My Apps |
| `AMADEUS_API_SECRET` | `<your_amadeus_api_secret>` | Same Amadeus app page |
| `OPENTRIPMAP_API_KEY` | `<your_opentripmap_api_key>` | [opentripmap.io/product](https://opentripmap.io/product) |
| `TRAFFIC_API_KEY` | `<your_tomtom_api_key>` | [developer.tomtom.com](https://developer.tomtom.com) |
| `ORS_API_KEY` | *(your key)* | [openrouteservice.org/dev/#/signup](https://openrouteservice.org/dev/#/signup) — free tier gives 2 000 req/day |

> ⚠️ **Never commit secrets to Git.** These are set only in the Supabase dashboard.

> ℹ️ The following secrets are **automatically provided** by Supabase — do NOT
> set them manually:
> - `SUPABASE_URL`
> - `SUPABASE_ANON_KEY`
> - `SUPABASE_SERVICE_ROLE_KEY`

---

## STEP 5 — Deploy Edge Functions

You need the **Supabase CLI** for this step.

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

### Deploy all functions at once

From the project root folder run:

```bash
supabase functions deploy
```

This deploys all 9 edge functions in the `supabase/functions/` directory.

### Or deploy them one by one

```bash
supabase functions deploy ai-chat
supabase functions deploy ai-planner
supabase functions deploy dynamic-replan
supabase functions deploy travel-memory
supabase functions deploy amadeus
supabase functions deploy nominatim
supabase functions deploy opentripmap
supabase functions deploy tomtom
supabase functions deploy openroute
```

### Verify deployment

In the Supabase dashboard go to **Edge Functions** (left sidebar).
You should see all 9 functions listed with a green status dot.

### Edge Functions Reference

| Function | Purpose |
|---|---|
| `ai-chat` | Streaming AI assistant "Jinny" via HuggingFace (SSE), with user personalization |
| `ai-planner` | Itinerary generation, regret-counterfactual planning, intent extraction |
| `dynamic-replan` | Real-time disruption detection and automatic itinerary replanning |
| `travel-memory` | Learns from trip history to personalise future AI suggestions |
| `amadeus` | Flights, hotels, city search, POIs, activities, safety ratings |
| `nominatim` | OpenStreetMap geocoding (forward & reverse) — no API key needed |
| `opentripmap` | Points of interest around a location |
| `tomtom` | Traffic flow, incidents, place search |
| `openroute` | Full routing: directions, isochrones, matrix, geocoding |

---

## STEP 6 — Verify Realtime Is Enabled

1. In the left sidebar go to **Database → Replication**.
2. You will see a section called **"supabase_realtime"**.
3. Confirm the following tables have the toggle **ON** (green):
   - `public.messages`
   - `public.activity_votes`
   - `public.community_messages`
   - `public.trip_join_requests`

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
- [ ] "Hey Jinny" AI chat responds (requires `HF_API_KEY` secret to be set)
- [ ] Map loads with Mappls tiles
- [ ] Invite link flow: generate a link, open in incognito, request to join, approve as organizer

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
| `trip_invites` | Anyone authenticated | Organizer only | — | Organizer only |
| `trip_join_requests` | Own request + trip members | Self only | Organizer only | — |
| `communities` | Public communities | Authenticated (own created_by) | Creator only | Creator only |
| `community_memberships` | Anyone | Self only | — | Self only |
| `community_messages` | Community members | Community members (own sender_id) | — | — |
| `community_events` | Community members | Community members (own created_by) | Creator only | Creator only |
| `event_rsvps` | Anyone | Self only | Self only | Self only |

---

## API Keys & Services Reference

| Service | Key / Token | Used In | Notes |
|---|---|---|---|
| HuggingFace | `hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` | ai-chat, ai-planner, dynamic-replan, travel-memory | Free tier has rate limits — upgrade for production |
| Amadeus | Key: `<your_amadeus_api_key>` | amadeus function | Uses **test** environment by default |
| Amadeus | Secret: `<your_amadeus_api_secret>` | amadeus function | Switch base URL for production |
| OpenTripMap | `<your_opentripmap_api_key>` | opentripmap function | |
| TomTom | `<your_tomtom_api_key>` | tomtom function | |
| OpenRouteService | *(register for free)* | openroute + tomtom | 2 000 req/day free |
| Mappls (frontend) | `<your_mappls_frontend_key>` | MapplsMap component | In frontend `.env` |
| Mappls (backend) | `<your_mappls_backend_key>` | server-side map ops | |
| Nominatim | No key required | nominatim function | OpenStreetMap public API |
| Web Speech API | No key required | Voice / "Hey Jinny" | Chrome/Edge natively supported |

---

## AI Model Details

All AI edge functions use **HuggingFace Inference API**.

| Setting | Value |
|---|---|
| Endpoint | `https://router.huggingface.co/v1/chat/completions` |
| Model | `mistralai/Mistral-7B-Instruct-v0.3` |
| Auth | Bearer token from `HF_API_KEY` secret |
| Streaming | Enabled for `ai-chat` (Server-Sent Events) |
| JSON output | Enforced via system prompt in ai-planner, dynamic-replan, travel-memory |

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
The `"Users can add own membership"` policy (AS PERMISSIVE) must exist. Check:
```sql
SELECT policyname FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'trip_memberships';
```
If missing, re-run `master_schema.sql`.

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

### Amadeus returns no flight/hotel results
The edge function uses the **Amadeus test environment** (`test.api.amadeus.com`).
Test data has limited routes. For real data switch the base URL in
`supabase/functions/amadeus/index.ts` to `api.amadeus.com` and use production
Amadeus credentials.

### Map not rendering
Verify the Mappls API key is set correctly in the `.env` file as
`VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY` and that the domain is whitelisted in
your Mappls developer account.

---

## Production Deployment Checklist

When you are ready to go live, complete every item below:

### Supabase Dashboard
- [ ] Run `supabase/master_schema.sql` on the production project
- [ ] Set all 6 secrets: `HF_API_KEY`, `AMADEUS_API_KEY`, `AMADEUS_API_SECRET`, `OPENTRIPMAP_API_KEY`, `TRAFFIC_API_KEY`, `ORS_API_KEY`
- [ ] Deploy all 9 edge functions (`supabase functions deploy`)
- [ ] **Authentication → Providers → Email** — enable "Confirm email"
- [ ] **Authentication → URL Configuration** — set Site URL to your production domain
- [ ] **Authentication → URL Configuration** — add your production domain to Redirect URLs
- [ ] **Database → Replication** — verify all 4 realtime tables are in the publication

### Frontend / Hosting (Vercel / Netlify / etc.)
- [ ] Set `VITE_SUPABASE_URL` environment variable to the production project URL
- [ ] Set `VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY` to the production anon key
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

# Deploy all edge functions
supabase functions deploy

# Deploy a single function
supabase functions deploy ai-chat

# View live logs for a function
supabase functions logs ai-chat --tail

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

*Last updated: Radiator Routes v2.0*