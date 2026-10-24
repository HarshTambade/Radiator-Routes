-- ============================================================
-- Atlas AI — MASTER DATABASE SCHEMA
-- Version : 2.0
-- Project : dfvyuqxyjlkoovxmtikq (Supabase)
-- ============================================================
-- HOW TO RUN
--   Supabase Dashboard → SQL Editor → New query → Paste → Run
-- ============================================================
-- This script is 100 % IDEMPOTENT.
-- Safe to run on a brand-new project OR re-run on an existing one.
-- It drops and recreates every policy, trigger, and function so
-- the final state is always consistent.
-- ============================================================


-- ============================================================
-- PART 0  —  PRE-FLIGHT: DROP ALL TRIGGERS & POLICIES
--
--  Every block is wrapped in a DO $$ ... $$ that checks whether
--  the table actually exists before issuing any DROP statement.
--  This makes the script safe on a completely empty (fresh)
--  Supabase project as well as on an existing one.
-- ============================================================

-- auth.users always exists in Supabase — safe to drop directly
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- profile avatar storage
DROP POLICY IF EXISTS "Users can upload own profile avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own profile avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own profile avatars" ON storage.objects;

-- profiles
DO $$ BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS update_profiles_updated_at       ON public.profiles;
    DROP POLICY  IF EXISTS "Users can view own profile"               ON public.profiles;
    DROP POLICY  IF EXISTS "Users can insert own profile"             ON public.profiles;
    DROP POLICY  IF EXISTS "Users can update own profile"             ON public.profiles;
    DROP POLICY  IF EXISTS "Trip members can view co-member profiles" ON public.profiles;
    DROP POLICY  IF EXISTS "Organizers can view requester profiles"   ON public.profiles;
  END IF;
END $$;

-- trips
DO $$ BEGIN
  IF to_regclass('public.trips') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS update_trips_updated_at  ON public.trips;
    DROP TRIGGER IF EXISTS trg_auto_add_organizer   ON public.trips;
    DROP TRIGGER IF EXISTS on_trip_created          ON public.trips;  -- legacy name
    DROP POLICY  IF EXISTS "Members can view trips"      ON public.trips;
    DROP POLICY  IF EXISTS "Auth users can create trips" ON public.trips;
    DROP POLICY  IF EXISTS "Organizer can update trips"  ON public.trips;
    DROP POLICY  IF EXISTS "Organizer can delete trips"  ON public.trips;
  END IF;
END $$;

-- trip_memberships
DO $$ BEGIN
  IF to_regclass('public.trip_memberships') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Members can view memberships" ON public.trip_memberships;
    DROP POLICY IF EXISTS "Organizer can add members"    ON public.trip_memberships;
    DROP POLICY IF EXISTS "Users can add own membership" ON public.trip_memberships;
    DROP POLICY IF EXISTS "Organizer can remove members" ON public.trip_memberships;
  END IF;
END $$;

-- itineraries
DO $$ BEGIN
  IF to_regclass('public.itineraries') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS update_itineraries_updated_at     ON public.itineraries;
    DROP POLICY  IF EXISTS "Members can view itineraries"    ON public.itineraries;
    DROP POLICY  IF EXISTS "Members can create itineraries"  ON public.itineraries;
    DROP POLICY  IF EXISTS "Members can update itineraries"  ON public.itineraries;
    DROP POLICY  IF EXISTS "Members can delete itineraries"  ON public.itineraries;
  END IF;
END $$;

-- activities
DO $$ BEGIN
  IF to_regclass('public.activities') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Members can view activities"   ON public.activities;
    DROP POLICY IF EXISTS "Members can create activities" ON public.activities;
    DROP POLICY IF EXISTS "Members can update activities" ON public.activities;
    DROP POLICY IF EXISTS "Members can delete activities" ON public.activities;
  END IF;
END $$;

-- activity_votes
DO $$ BEGIN
  IF to_regclass('public.activity_votes') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Members can view votes"       ON public.activity_votes;
    DROP POLICY IF EXISTS "Members can insert votes"     ON public.activity_votes;
    DROP POLICY IF EXISTS "Members can update own votes" ON public.activity_votes;
    DROP POLICY IF EXISTS "Members can delete own votes" ON public.activity_votes;
  END IF;
END $$;

-- messages
DO $$ BEGIN
  IF to_regclass('public.messages') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Members can view messages" ON public.messages;
    DROP POLICY IF EXISTS "Members can send messages" ON public.messages;
  END IF;
END $$;

-- disruption_events
DO $$ BEGIN
  IF to_regclass('public.disruption_events') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Members can view disruption events"   ON public.disruption_events;
    DROP POLICY IF EXISTS "Members can insert disruption events" ON public.disruption_events;
  END IF;
END $$;

-- trip_invites
DO $$ BEGIN
  IF to_regclass('public.trip_invites') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Anyone can read invite by code" ON public.trip_invites;
    DROP POLICY IF EXISTS "Members can view trip invites"  ON public.trip_invites;
    DROP POLICY IF EXISTS "Organizer can create invites"   ON public.trip_invites;
    DROP POLICY IF EXISTS "Organizer can delete invites"   ON public.trip_invites;
  END IF;
END $$;

-- trip_join_requests
DO $$ BEGIN
  IF to_regclass('public.trip_join_requests') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Users can view own requests"    ON public.trip_join_requests;
    DROP POLICY IF EXISTS "Users can create join requests" ON public.trip_join_requests;
    DROP POLICY IF EXISTS "Organizer can update requests"  ON public.trip_join_requests;
  END IF;
END $$;

-- communities
DO $$ BEGIN
  IF to_regclass('public.communities') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS update_communities_updated_at      ON public.communities;
    DROP TRIGGER IF EXISTS trg_auto_add_community_creator     ON public.communities;
    DROP POLICY  IF EXISTS "Anyone can view public communities" ON public.communities;
    DROP POLICY  IF EXISTS "Auth users can create communities"  ON public.communities;
    DROP POLICY  IF EXISTS "Creator can update community"       ON public.communities;
    DROP POLICY  IF EXISTS "Creator can delete community"       ON public.communities;
  END IF;
END $$;

-- community_memberships
DO $$ BEGIN
  IF to_regclass('public.community_memberships') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_update_community_member_count  ON public.community_memberships;
    DROP POLICY  IF EXISTS "Anyone can view community members" ON public.community_memberships;
    DROP POLICY  IF EXISTS "Visible community members"          ON public.community_memberships;
    DROP POLICY  IF EXISTS "Users can join communities"        ON public.community_memberships;
    DROP POLICY  IF EXISTS "Users can leave communities"       ON public.community_memberships;
  END IF;
END $$;

-- community_messages
DO $$ BEGIN
  IF to_regclass('public.community_messages') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Members can view community messages" ON public.community_messages;
    DROP POLICY IF EXISTS "Members can send community messages" ON public.community_messages;
  END IF;
END $$;

-- community_events
DO $$ BEGIN
  IF to_regclass('public.community_events') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Members can view events"   ON public.community_events;
    DROP POLICY IF EXISTS "Members can create events" ON public.community_events;
    DROP POLICY IF EXISTS "Creator can update events" ON public.community_events;
    DROP POLICY IF EXISTS "Creator can delete events" ON public.community_events;
  END IF;
END $$;

-- event_rsvps
DO $$ BEGIN
  IF to_regclass('public.event_rsvps') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Members can view RSVPs"    ON public.event_rsvps;
    DROP POLICY IF EXISTS "Users can RSVP"            ON public.event_rsvps;
    DROP POLICY IF EXISTS "Users can update own RSVP" ON public.event_rsvps;
    DROP POLICY IF EXISTS "Users can delete own RSVP" ON public.event_rsvps;
  END IF;
END $$;

-- friend_requests
DO $$ BEGIN
  IF to_regclass('public.friend_requests') IS NOT NULL THEN
    DROP POLICY IF EXISTS "friend_requests_select" ON public.friend_requests;
    DROP POLICY IF EXISTS "friend_requests_insert" ON public.friend_requests;
    DROP POLICY IF EXISTS "friend_requests_update" ON public.friend_requests;
    DROP POLICY IF EXISTS "friend_requests_delete" ON public.friend_requests;
  END IF;
END $$;

-- direct_messages
DO $$ BEGIN
  IF to_regclass('public.direct_messages') IS NOT NULL THEN
    DROP POLICY IF EXISTS "direct_messages_select" ON public.direct_messages;
    DROP POLICY IF EXISTS "direct_messages_insert" ON public.direct_messages;
    DROP POLICY IF EXISTS "direct_messages_update" ON public.direct_messages;
    DROP POLICY IF EXISTS "direct_messages_delete" ON public.direct_messages;
  END IF;
END $$;

-- group_expenses
DO $$ BEGIN
  IF to_regclass('public.group_expenses') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_group_expenses_updated_at ON public.group_expenses;
    DROP POLICY IF EXISTS "group_expenses_select" ON public.group_expenses;
    DROP POLICY IF EXISTS "group_expenses_insert" ON public.group_expenses;
    DROP POLICY IF EXISTS "group_expenses_update" ON public.group_expenses;
    DROP POLICY IF EXISTS "group_expenses_delete" ON public.group_expenses;
  END IF;
END $$;

-- expense_splits
DO $$ BEGIN
  IF to_regclass('public.expense_splits') IS NOT NULL THEN
    DROP POLICY IF EXISTS "expense_splits_select" ON public.expense_splits;
    DROP POLICY IF EXISTS "expense_splits_insert" ON public.expense_splits;
    DROP POLICY IF EXISTS "expense_splits_update" ON public.expense_splits;
    DROP POLICY IF EXISTS "expense_splits_delete" ON public.expense_splits;
  END IF;
END $$;


-- ============================================================
-- PART 1  —  SHARED UTILITY FUNCTION
-- ============================================================

-- Automatically stamps updated_at on every UPDATE
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- ============================================================
-- PART 2  —  TABLES
--            Creation order respects foreign-key dependencies.
--            Every table uses CREATE TABLE IF NOT EXISTS so
--            existing data is never lost on a re-run.
-- ============================================================

-- ----------------------------------------------------------
-- 2.1  PROFILES
--      One row per auth.users entry. Auto-created on signup.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id                 UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name               TEXT        NOT NULL DEFAULT '',
  phone_number       TEXT,
  avatar_url         TEXT,
  bio                TEXT        NOT NULL DEFAULT '',
  home_city          TEXT,
  home_country       TEXT,
  travel_personality JSONB       NOT NULL DEFAULT '{}',
  travel_history     JSONB       NOT NULL DEFAULT '[]',
  preferences        JSONB       NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Additive upgrades for profiles created by earlier schema versions.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS home_city TEXT,
  ADD COLUMN IF NOT EXISTS home_country TEXT;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Public reads let trip members see avatars; writes are restricted to the
-- authenticated user's own folder. Uploaded images are normalized to WebP.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('profile-avatars', 'profile-avatars', true, 5242880, ARRAY['image/webp', 'image/png']::text[])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Users can upload own profile avatars"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update own profile avatars"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own profile avatars"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ----------------------------------------------------------
-- 2.2  TRIPS
--      Core trip record. Organizer is always a member too
--      (enforced by trigger in Part 6).
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trips (
  id           UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT           NOT NULL,
  destination  TEXT           NOT NULL,
  country      TEXT,
  start_date   DATE           NOT NULL,
  end_date     DATE           NOT NULL,
  organizer_id UUID           NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  budget_total DECIMAL(12, 2) NOT NULL DEFAULT 0,
  currency     TEXT           NOT NULL DEFAULT 'INR',
  status       TEXT           NOT NULL DEFAULT 'planning'
                              CHECK (status IN ('planning', 'booked', 'ongoing', 'completed')),
  image_url    TEXT,
  created_at   TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ    NOT NULL DEFAULT now()
);

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------
-- 2.3  TRIP MEMBERSHIPS
--      Maps users to trips with a role.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trip_memberships (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id    UUID        NOT NULL REFERENCES public.trips(id)  ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'member'
                         CHECK (role IN ('organizer', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trip_id, user_id)
);

ALTER TABLE public.trip_memberships ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------
-- 2.4  ITINERARIES
--      Versioned plans attached to a trip. Multiple variants
--      may exist (regret-counterfactual planning).
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.itineraries (
  id             UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id        UUID           NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  version        INT            NOT NULL DEFAULT 1,
  variant_id     TEXT,
  regret_score   DECIMAL(5, 3),
  cost_breakdown JSONB          NOT NULL DEFAULT '{}',
  is_published   BOOLEAN        NOT NULL DEFAULT FALSE,
  created_by     UUID           REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ    NOT NULL DEFAULT now()
);

ALTER TABLE public.itineraries ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------
-- 2.5  ACTIVITIES
--      Individual activities within an itinerary day.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activities (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id    UUID            NOT NULL REFERENCES public.itineraries(id) ON DELETE CASCADE,
  name            TEXT            NOT NULL,
  description     TEXT,
  location_lat    DOUBLE PRECISION,
  location_lng    DOUBLE PRECISION,
  location_name   TEXT,
  start_time      TIMESTAMPTZ     NOT NULL,
  end_time        TIMESTAMPTZ     NOT NULL,
  category        TEXT            CHECK (category IN (
                                    'food', 'attraction', 'transport',
                                    'shopping', 'accommodation', 'other'
                                  )),
  cost            DECIMAL(10, 2)  NOT NULL DEFAULT 0,
  estimated_steps INT,
  review_score    DECIMAL(2, 1),
  priority        FLOAT           NOT NULL DEFAULT 0.5,
  notes           TEXT,
  status          TEXT            NOT NULL DEFAULT 'pending',
  -- Consumed by lib/itineraryVerifier.ts. NULL means unknown, which the
  -- verifier treats as unverifiable rather than as closed.
  opening_hours   JSONB,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
  -- Concurrency stamp. The offline mutation queue matches on this when
  -- replaying a queued edit, so a row someone else changed in the meantime
  -- rejects the stale write instead of silently overwriting it.
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------
-- 2.6  ACTIVITY VOTES
--      Collaborative up/down voting for trip activities.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_votes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID        NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id)        ON DELETE CASCADE,
  vote        TEXT        NOT NULL CHECK (vote IN ('up', 'down')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (activity_id, user_id)
);

ALTER TABLE public.activity_votes ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------
-- 2.7  MESSAGES  (trip group chat — realtime)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.messages (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      UUID        NOT NULL REFERENCES public.trips(id)  ON DELETE CASCADE,
  sender_id    UUID        NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  content      TEXT        NOT NULL,
  message_type TEXT        NOT NULL DEFAULT 'text'
                           CHECK (message_type IN ('text', 'suggestion', 'edit_request', 'system')),
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------
-- 2.8  DISRUPTION EVENTS
--      Detected travel disruptions and replanning history.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.disruption_events (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id        UUID        NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  event_type     TEXT        NOT NULL,
  severity       TEXT        NOT NULL DEFAULT 'medium'
                             CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  description    TEXT,
  detected_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved       BOOLEAN     NOT NULL DEFAULT FALSE,
  replan_applied BOOLEAN     NOT NULL DEFAULT FALSE,
  old_itinerary  JSONB,
  new_itinerary  JSONB
);

ALTER TABLE public.disruption_events ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------
-- 2.9  TRIP INVITES
--      Shareable invite links with optional expiry / use cap.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trip_invites (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     UUID        NOT NULL REFERENCES public.trips(id)   ON DELETE CASCADE,
  invite_code TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_by  UUID        NOT NULL REFERENCES auth.users(id)     ON DELETE CASCADE,
  status      TEXT        NOT NULL DEFAULT 'active',
  max_uses    INT,                                  -- NULL = unlimited
  uses        INT         NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ,                          -- NULL = never expires
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.trip_invites ENABLE ROW LEVEL SECURITY;

-- Resolve a single invite by its high-entropy bearer code without exposing
-- every invite row through broad table SELECT access.
CREATE OR REPLACE FUNCTION public.lookup_trip_invite(p_invite_code TEXT)
RETURNS TABLE (
  id UUID,
  trip_id UUID,
  invite_code TEXT,
  status TEXT,
  max_uses INTEGER,
  uses INTEGER,
  expires_at TIMESTAMPTZ,
  trip_name TEXT,
  destination TEXT,
  start_date DATE,
  end_date DATE
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT i.id, i.trip_id, i.invite_code, i.status, i.max_uses, i.uses,
         i.expires_at, t.name, t.destination, t.start_date, t.end_date
  FROM public.trip_invites i
  JOIN public.trips t ON t.id = i.trip_id
  WHERE i.invite_code = p_invite_code
    AND i.status IN ('active', 'pending')
    AND (i.expires_at IS NULL OR i.expires_at > now())
    AND (i.max_uses IS NULL OR i.uses < i.max_uses)
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.lookup_trip_invite(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_trip_invite(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_valid_trip_invite(p_invite_id UUID, p_trip_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trip_invites i
    WHERE i.id = p_invite_id
      AND i.trip_id = p_trip_id
      AND i.status IN ('active', 'pending')
      AND (i.expires_at IS NULL OR i.expires_at > now())
      AND (i.max_uses IS NULL OR i.uses < i.max_uses)
  );
$$;
REVOKE ALL ON FUNCTION public.is_valid_trip_invite(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_valid_trip_invite(UUID, UUID) TO authenticated;

-- ----------------------------------------------------------
-- 2.10 TRIP JOIN REQUESTS
--      Created when someone clicks an invite link.
--      Organizer approves or rejects.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trip_join_requests (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     UUID        NOT NULL REFERENCES public.trips(id)       ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id)         ON DELETE CASCADE,
  invite_id   UUID        REFERENCES public.trip_invites(id)         ON DELETE SET NULL,
  status      TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  UNIQUE (trip_id, user_id)
);

ALTER TABLE public.trip_join_requests ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------
-- 2.11 COMMUNITIES
--      Travel interest groups / forums.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.communities (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  description  TEXT,
  cover_image  TEXT,
  category     TEXT        NOT NULL DEFAULT 'general',
  created_by   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_count INT         NOT NULL DEFAULT 0,
  is_public    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------
-- 2.12 COMMUNITY MEMBERSHIPS
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_memberships (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID        NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES auth.users(id)         ON DELETE CASCADE,
  role         TEXT        NOT NULL DEFAULT 'member'
                           CHECK (role IN ('admin', 'member')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (community_id, user_id)
);

ALTER TABLE public.community_memberships ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------
-- 2.13 COMMUNITY MESSAGES  (realtime community chat)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_messages (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID        NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  sender_id    UUID        NOT NULL REFERENCES auth.users(id)         ON DELETE CASCADE,
  content      TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------
-- 2.14 COMMUNITY EVENTS
--      Meetups and group trips organised inside a community.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id  UUID        NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  title         TEXT        NOT NULL,
  description   TEXT,
  destination   TEXT,
  event_date    TIMESTAMPTZ NOT NULL,
  created_by    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  max_attendees INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.community_events ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------
-- 2.15 EVENT RSVPs
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_rsvps (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID        NOT NULL REFERENCES public.community_events(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id)              ON DELETE CASCADE,
  status     TEXT        NOT NULL DEFAULT 'going'
                         CHECK (status IN ('going', 'maybe', 'not_going')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------
-- 2.16 FRIEND REQUESTS
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.friend_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sender_id, receiver_id)
);
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------
-- 2.17 DIRECT MESSAGES
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.direct_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  read        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------
-- 2.18 GROUP EXPENSES
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.group_expenses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  paid_by     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  amount      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  currency    TEXT NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  category    TEXT NOT NULL DEFAULT 'general'
              CHECK (category IN ('accommodation', 'food', 'transport', 'activity', 'shopping', 'general', 'other')),
  split_type  TEXT NOT NULL DEFAULT 'equal'
              CHECK (split_type IN ('equal', 'custom', 'percentage')),
  split_with  UUID[] NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.group_expenses ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------
-- 2.19 EXPENSE SPLITS
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expense_splits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id  UUID NOT NULL REFERENCES public.group_expenses(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount      NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  percentage  NUMERIC(5,2),
  settled     BOOLEAN NOT NULL DEFAULT false,
  settled_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (expense_id, user_id)
);
ALTER TABLE public.expense_splits ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- PART 3  —  INDEXES  (performance)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_trips_organizer             ON public.trips(organizer_id);
CREATE INDEX IF NOT EXISTS idx_trips_status                ON public.trips(status);
CREATE INDEX IF NOT EXISTS idx_trip_memberships_user       ON public.trip_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_trip_memberships_trip       ON public.trip_memberships(trip_id);
CREATE INDEX IF NOT EXISTS idx_itineraries_trip            ON public.itineraries(trip_id);
CREATE INDEX IF NOT EXISTS idx_itineraries_published       ON public.itineraries(trip_id, is_published);
CREATE INDEX IF NOT EXISTS idx_activities_itinerary        ON public.activities(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_activities_start_time       ON public.activities(start_time);
CREATE INDEX IF NOT EXISTS idx_activities_category         ON public.activities(category);
CREATE INDEX IF NOT EXISTS idx_activity_votes_activity     ON public.activity_votes(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_votes_user         ON public.activity_votes(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_trip_created       ON public.messages(trip_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_disruption_events_trip      ON public.disruption_events(trip_id);
CREATE INDEX IF NOT EXISTS idx_disruption_events_resolved  ON public.disruption_events(trip_id, resolved);
CREATE INDEX IF NOT EXISTS idx_trip_invites_code           ON public.trip_invites(invite_code);
CREATE INDEX IF NOT EXISTS idx_trip_invites_trip           ON public.trip_invites(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_join_requests_trip     ON public.trip_join_requests(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_join_requests_user     ON public.trip_join_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_communities_category        ON public.communities(category);
CREATE INDEX IF NOT EXISTS idx_communities_public          ON public.communities(is_public);
CREATE INDEX IF NOT EXISTS idx_community_memberships_user  ON public.community_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_community_memberships_comm  ON public.community_memberships(community_id);
CREATE INDEX IF NOT EXISTS idx_community_messages_comm     ON public.community_messages(community_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_events_comm       ON public.community_events(community_id, event_date);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_event           ON public.event_rsvps(event_id);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_user            ON public.event_rsvps(user_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_sender       ON public.friend_requests(sender_id, status);
CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver     ON public.friend_requests(receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation ON public.direct_messages (LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id), created_at DESC);
CREATE INDEX IF NOT EXISTS idx_direct_messages_receiver     ON public.direct_messages(receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_group_expenses_trip_created  ON public.group_expenses(trip_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expense_splits_expense       ON public.expense_splits(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_splits_user_settled  ON public.expense_splits(user_id, settled);


-- ============================================================
-- PART 4  —  HELPER FUNCTIONS  (called by RLS policies)
-- ============================================================

-- 4a. Is the calling user a member of this trip?
CREATE OR REPLACE FUNCTION public.is_trip_member(p_trip_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER STABLE
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM   public.trip_memberships
    WHERE  trip_id = p_trip_id
    AND    user_id = auth.uid()
  );
END;
$$;

-- 4b. Is the calling user the organizer of this trip?
CREATE OR REPLACE FUNCTION public.is_trip_organizer(p_trip_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER STABLE
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM   public.trips
    WHERE  id            = p_trip_id
    AND    organizer_id  = auth.uid()
  );
END;
$$;

-- 4c. Resolve itinerary_id → trip_id  (used by activity policies)
CREATE OR REPLACE FUNCTION public.get_trip_id_from_activity(p_itinerary_id UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT trip_id
  FROM   public.itineraries
  WHERE  id = p_itinerary_id;
$$;

-- 4d. Resolve activity_id → trip_id  (used by vote policies)
CREATE OR REPLACE FUNCTION public.get_trip_id_from_vote(p_activity_id UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT i.trip_id
  FROM   public.activities  a
  JOIN   public.itineraries i ON a.itinerary_id = i.id
  WHERE  a.id = p_activity_id;
$$;

-- 4e. Is the calling user a member of this community?
CREATE OR REPLACE FUNCTION public.is_community_member(p_community_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM   public.community_memberships
    WHERE  community_id = p_community_id
    AND    user_id      = auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_community_public(p_community_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.communities c
    WHERE c.id = p_community_id AND c.is_public
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_community_event(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_events e
    JOIN public.communities c ON c.id = e.community_id
    WHERE e.id = p_event_id
      AND (c.is_public OR public.is_community_member(c.id))
  );
$$;


-- ============================================================
-- PART 5  —  TRIGGER FUNCTIONS
-- ============================================================

-- 5a. Auto-create a profile row immediately after a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 5b. Auto-add the organizer as an 'organizer' member when a trip is created
CREATE OR REPLACE FUNCTION public.auto_add_organizer_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.trip_memberships (trip_id, user_id, role)
  VALUES (NEW.id, NEW.organizer_id, 'organizer')
  ON CONFLICT (trip_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 5c. Keep communities.member_count accurate on join / leave
CREATE OR REPLACE FUNCTION public.update_community_member_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.communities
    SET    member_count = member_count + 1
    WHERE  id = NEW.community_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.communities
    SET    member_count = GREATEST(0, member_count - 1)
    WHERE  id = OLD.community_id;
    RETURN OLD;
  END IF;
END;
$$;

-- 5d. Auto-add the community creator as an 'admin' member
CREATE OR REPLACE FUNCTION public.auto_add_community_creator()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.community_memberships (community_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'admin')
  ON CONFLICT (community_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;


-- ============================================================
-- PART 6  —  TRIGGERS  (attach functions to tables)
-- ============================================================

-- auth.users  →  auto-create profile on new signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- profiles  →  stamp updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- trips  →  stamp updated_at
CREATE TRIGGER update_trips_updated_at
  BEFORE UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- trips  →  auto-add organizer as a member
CREATE TRIGGER trg_auto_add_organizer
  AFTER INSERT ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.auto_add_organizer_membership();

-- activities  →  stamp updated_at (drives offline-replay conflict detection)
DROP TRIGGER IF EXISTS update_activities_updated_at ON public.activities;
CREATE TRIGGER update_activities_updated_at
  BEFORE UPDATE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- itineraries  →  stamp updated_at
CREATE TRIGGER update_itineraries_updated_at
  BEFORE UPDATE ON public.itineraries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- communities  →  stamp updated_at
CREATE TRIGGER update_communities_updated_at
  BEFORE UPDATE ON public.communities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- group_expenses  →  stamp updated_at
DROP TRIGGER IF EXISTS trg_group_expenses_updated_at ON public.group_expenses;
CREATE TRIGGER trg_group_expenses_updated_at
  BEFORE UPDATE ON public.group_expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- community_memberships  →  keep member_count in sync
CREATE TRIGGER trg_update_community_member_count
  AFTER INSERT OR DELETE ON public.community_memberships
  FOR EACH ROW EXECUTE FUNCTION public.update_community_member_count();

-- communities  →  auto-add creator as admin member
CREATE TRIGGER trg_auto_add_community_creator
  AFTER INSERT ON public.communities
  FOR EACH ROW EXECUTE FUNCTION public.auto_add_community_creator();


-- ============================================================
-- PART 7  —  ROW LEVEL SECURITY POLICIES
-- ============================================================

-- ----------------------------------------------------------
-- 7.1  profiles
-- ----------------------------------------------------------

-- Users can always read and write their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Members of the same trip can view each other's profiles
CREATE POLICY "Trip members can view co-member profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM   public.trip_memberships tm1
      JOIN   public.trip_memberships tm2 ON tm1.trip_id = tm2.trip_id
      WHERE  tm1.user_id = auth.uid()
      AND    tm2.user_id = profiles.id
    )
  );

-- Organizers can read profiles of users who have requested to join their trip
CREATE POLICY "Organizers can view requester profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM   public.trip_join_requests tjr
      JOIN   public.trips t ON tjr.trip_id = t.id
      WHERE  tjr.user_id   = profiles.id
      AND    t.organizer_id = auth.uid()
    )
  );

-- ----------------------------------------------------------
-- 7.2  trips
-- ----------------------------------------------------------

-- Only trip members can see the trip
CREATE POLICY "Members can view trips"
  ON public.trips FOR SELECT
  USING (public.is_trip_member(id));

-- Any authenticated user can create a trip (they become the organizer)
CREATE POLICY "Auth users can create trips"
  ON public.trips FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = organizer_id);

-- Only the organizer can modify the trip
CREATE POLICY "Organizer can update trips"
  ON public.trips FOR UPDATE
  USING (public.is_trip_organizer(id));

-- Only the organizer can delete the trip
CREATE POLICY "Organizer can delete trips"
  ON public.trips FOR DELETE
  USING (public.is_trip_organizer(id));

-- ----------------------------------------------------------
-- 7.3  trip_memberships
-- ----------------------------------------------------------

-- Trip members can see who else is in the trip
CREATE POLICY "Members can view memberships"
  ON public.trip_memberships FOR SELECT
  USING (public.is_trip_member(trip_id));

-- Organizer can add any user to the trip
CREATE POLICY "Organizer can add members"
  ON public.trip_memberships FOR INSERT
  WITH CHECK (public.is_trip_organizer(trip_id));

-- Membership is organizer-managed. Invitees submit a join request; only an
-- organizer may add them after approval. The organizer trigger runs as the
-- function owner and does not need a self-insert policy.

-- Organizer can remove members; members can remove themselves
CREATE POLICY "Organizer can remove members"
  ON public.trip_memberships FOR DELETE
  USING (
    public.is_trip_organizer(trip_id)
    OR auth.uid() = user_id
  );

-- ----------------------------------------------------------
-- 7.4  itineraries
-- ----------------------------------------------------------

-- Trip members can fully manage itineraries
CREATE POLICY "Members can view itineraries"
  ON public.itineraries FOR SELECT
  USING (public.is_trip_member(trip_id));

CREATE POLICY "Members can create itineraries"
  ON public.itineraries FOR INSERT
  WITH CHECK (public.is_trip_member(trip_id));

CREATE POLICY "Members can update itineraries"
  ON public.itineraries FOR UPDATE
  USING (public.is_trip_member(trip_id));

CREATE POLICY "Members can delete itineraries"
  ON public.itineraries FOR DELETE
  USING (public.is_trip_member(trip_id));

-- ----------------------------------------------------------
-- 7.5  activities
-- ----------------------------------------------------------

CREATE POLICY "Members can view activities"
  ON public.activities FOR SELECT
  USING (public.is_trip_member(public.get_trip_id_from_activity(itinerary_id)));

CREATE POLICY "Members can create activities"
  ON public.activities FOR INSERT
  WITH CHECK (public.is_trip_member(public.get_trip_id_from_activity(itinerary_id)));

CREATE POLICY "Members can update activities"
  ON public.activities FOR UPDATE
  USING (public.is_trip_member(public.get_trip_id_from_activity(itinerary_id)));

CREATE POLICY "Members can delete activities"
  ON public.activities FOR DELETE
  USING (public.is_trip_member(public.get_trip_id_from_activity(itinerary_id)));

-- ----------------------------------------------------------
-- 7.6  activity_votes
-- ----------------------------------------------------------

-- Trip members can see all votes on activities in their trip
CREATE POLICY "Members can view votes"
  ON public.activity_votes FOR SELECT
  USING (public.is_trip_member(public.get_trip_id_from_vote(activity_id)));

-- Members can only cast votes under their own user_id
CREATE POLICY "Members can insert votes"
  ON public.activity_votes FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_trip_member(public.get_trip_id_from_vote(activity_id))
  );

-- Members can change their own vote
CREATE POLICY "Members can update own votes"
  ON public.activity_votes FOR UPDATE
  USING (
    auth.uid() = user_id
    AND public.is_trip_member(public.get_trip_id_from_vote(activity_id))
  );

-- Members can retract their own vote
CREATE POLICY "Members can delete own votes"
  ON public.activity_votes FOR DELETE
  USING (
    auth.uid() = user_id
    AND public.is_trip_member(public.get_trip_id_from_vote(activity_id))
  );

-- ----------------------------------------------------------
-- 7.7  messages  (trip group chat)
-- ----------------------------------------------------------

-- Only trip members can read the chat
CREATE POLICY "Members can view messages"
  ON public.messages FOR SELECT
  USING (public.is_trip_member(trip_id));

-- Members can only post as themselves
CREATE POLICY "Members can send messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND public.is_trip_member(trip_id)
  );

-- ----------------------------------------------------------
-- 7.8  disruption_events
-- ----------------------------------------------------------

CREATE POLICY "Members can view disruption events"
  ON public.disruption_events FOR SELECT
  USING (public.is_trip_member(trip_id));

CREATE POLICY "Members can insert disruption events"
  ON public.disruption_events FOR INSERT
  WITH CHECK (public.is_trip_member(trip_id));

-- ----------------------------------------------------------
-- 7.9  trip_invites
-- ----------------------------------------------------------

-- Invitees resolve one high-entropy code through lookup_trip_invite(). Table
-- reads stay limited to members so callers cannot enumerate invite secrets.
DROP POLICY IF EXISTS "Anyone can read invite by code" ON public.trip_invites;
DROP POLICY IF EXISTS "Members can view trip invites" ON public.trip_invites;
CREATE POLICY "Members can view trip invites"
  ON public.trip_invites FOR SELECT
  USING (public.is_trip_member(trip_id));

-- Only the trip organizer can create invite links
CREATE POLICY "Organizer can create invites"
  ON public.trip_invites FOR INSERT
  WITH CHECK (public.is_trip_organizer(trip_id));

-- Only the trip organizer can revoke invite links
CREATE POLICY "Organizer can delete invites"
  ON public.trip_invites FOR DELETE
  USING (public.is_trip_organizer(trip_id));

-- ----------------------------------------------------------
-- 7.10 trip_join_requests
-- ----------------------------------------------------------

-- Users can see their own requests; trip members can see all requests for their trip
CREATE POLICY "Users can view own requests"
  ON public.trip_join_requests FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.is_trip_member(trip_id)
  );

-- Any authenticated user can submit a join request for themselves
CREATE POLICY "Users can create join requests"
  ON public.trip_join_requests FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
    AND invite_id IS NOT NULL
    AND public.is_valid_trip_invite(invite_id, trip_id)
  );

-- Only the organizer can approve or reject requests
CREATE POLICY "Organizer can update requests"
  ON public.trip_join_requests FOR UPDATE
  USING (public.is_trip_organizer(trip_id));

-- ----------------------------------------------------------
-- 7.11 communities
-- ----------------------------------------------------------

-- Any authenticated user can browse public communities
CREATE POLICY "Anyone can view public communities"
  ON public.communities FOR SELECT
  USING (is_public = TRUE OR created_by = auth.uid() OR public.is_community_member(id));

-- Any authenticated user can create a community
CREATE POLICY "Auth users can create communities"
  ON public.communities FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- Only the creator can edit the community details
CREATE POLICY "Creator can update community"
  ON public.communities FOR UPDATE
  USING (auth.uid() = created_by);

-- Only the creator can delete the community
CREATE POLICY "Creator can delete community"
  ON public.communities FOR DELETE
  USING (auth.uid() = created_by);

-- ----------------------------------------------------------
-- 7.12 community_memberships
-- ----------------------------------------------------------

-- Members can see their group; anyone can see memberships of public groups.
CREATE POLICY "Visible community members"
  ON public.community_memberships FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_community_member(community_id)
    OR public.is_community_public(community_id)
  );

-- Users can join a community themselves
CREATE POLICY "Users can join communities"
  ON public.community_memberships FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND role = 'member'
    AND public.is_community_public(community_id)
  );

-- Users can leave a community (delete their own row)
CREATE POLICY "Users can leave communities"
  ON public.community_memberships FOR DELETE
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------
-- 7.13 community_messages
-- ----------------------------------------------------------

-- Only community members can read or post messages
CREATE POLICY "Members can view community messages"
  ON public.community_messages FOR SELECT
  USING (public.is_community_member(community_id));

CREATE POLICY "Members can send community messages"
  ON public.community_messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND public.is_community_member(community_id)
  );

-- ----------------------------------------------------------
-- 7.14 community_events
-- ----------------------------------------------------------

-- Community members can view events in their community
CREATE POLICY "Members can view events"
  ON public.community_events FOR SELECT
  USING (public.is_community_public(community_id) OR public.is_community_member(community_id));

-- Community members can create events
CREATE POLICY "Members can create events"
  ON public.community_events FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND public.is_community_member(community_id)
  );

-- Only the event creator can edit it
CREATE POLICY "Creator can update events"
  ON public.community_events FOR UPDATE
  USING (auth.uid() = created_by);

-- Only the event creator can delete it
CREATE POLICY "Creator can delete events"
  ON public.community_events FOR DELETE
  USING (auth.uid() = created_by);

-- ----------------------------------------------------------
-- 7.15 event_rsvps
-- ----------------------------------------------------------

-- Anyone can view RSVPs (helps show attendee counts publicly)
CREATE POLICY "Members can view RSVPs"
  ON public.event_rsvps FOR SELECT
  USING (public.can_view_community_event(event_id));

-- Users can RSVP to any event as themselves
CREATE POLICY "Users can RSVP"
  ON public.event_rsvps FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.can_view_community_event(event_id));

-- Users can update their own RSVP status
CREATE POLICY "Users can update own RSVP"
  ON public.event_rsvps FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND public.can_view_community_event(event_id));

-- Users can withdraw their own RSVP
CREATE POLICY "Users can delete own RSVP"
  ON public.event_rsvps FOR DELETE
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------
-- 7.16 friend_requests
-- ----------------------------------------------------------
CREATE POLICY "friend_requests_select" ON public.friend_requests
  FOR SELECT USING (sender_id = auth.uid() OR receiver_id = auth.uid());
CREATE POLICY "friend_requests_insert" ON public.friend_requests
  FOR INSERT WITH CHECK (sender_id = auth.uid());
CREATE POLICY "friend_requests_update" ON public.friend_requests
  FOR UPDATE USING (receiver_id = auth.uid());
CREATE POLICY "friend_requests_delete" ON public.friend_requests
  FOR DELETE USING (sender_id = auth.uid() OR receiver_id = auth.uid());

-- ----------------------------------------------------------
-- 7.17 direct_messages
-- ----------------------------------------------------------
CREATE POLICY "direct_messages_select" ON public.direct_messages
  FOR SELECT USING (sender_id = auth.uid() OR receiver_id = auth.uid());
CREATE POLICY "direct_messages_insert" ON public.direct_messages
  FOR INSERT WITH CHECK (sender_id = auth.uid());
CREATE POLICY "direct_messages_update" ON public.direct_messages
  FOR UPDATE USING (receiver_id = auth.uid());
CREATE POLICY "direct_messages_delete" ON public.direct_messages
  FOR DELETE USING (sender_id = auth.uid() OR receiver_id = auth.uid());

-- ----------------------------------------------------------
-- 7.18 group_expenses
-- ----------------------------------------------------------
CREATE POLICY "group_expenses_select" ON public.group_expenses
  FOR SELECT USING (public.is_trip_member(trip_id));
CREATE POLICY "group_expenses_insert" ON public.group_expenses
  FOR INSERT WITH CHECK (public.is_trip_member(trip_id) AND paid_by = auth.uid());
CREATE POLICY "group_expenses_update" ON public.group_expenses
  FOR UPDATE USING (paid_by = auth.uid());
CREATE POLICY "group_expenses_delete" ON public.group_expenses
  FOR DELETE USING (paid_by = auth.uid());

-- ----------------------------------------------------------
-- 7.19 expense_splits
-- ----------------------------------------------------------
CREATE POLICY "expense_splits_select" ON public.expense_splits
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.group_expenses ge
      WHERE ge.id = expense_id AND public.is_trip_member(ge.trip_id)
    )
  );
CREATE POLICY "expense_splits_insert" ON public.expense_splits
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.group_expenses ge
      WHERE ge.id = expense_id AND public.is_trip_member(ge.trip_id)
    )
  );
CREATE POLICY "expense_splits_update" ON public.expense_splits
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "expense_splits_delete" ON public.expense_splits
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.group_expenses ge
      WHERE ge.id = expense_id AND ge.paid_by = auth.uid()
    )
  );


-- ============================================================
-- PART 8  —  REALTIME PUBLICATIONS
--            Adds tables to the supabase_realtime publication
--            idempotently using DO blocks (adding a table that
--            is already in the publication would error otherwise).
-- ============================================================

DO $$
BEGIN
  -- messages: live trip group chat
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND   schemaname = 'public'
    AND   tablename  = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;

  -- activity_votes: live collaborative voting
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND   schemaname = 'public'
    AND   tablename  = 'activity_votes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_votes;
  END IF;

  -- community_messages: live community chat
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND   schemaname = 'public'
    AND   tablename  = 'community_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.community_messages;
  END IF;

  -- trip_join_requests: live join-request notifications for organizers
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND   schemaname = 'public'
    AND   tablename  = 'trip_join_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_join_requests;
  END IF;

  -- friends and shared-expense updates
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'direct_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'friend_requests') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'group_expenses') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.group_expenses;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'expense_splits') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.expense_splits;
  END IF;
END;
$$;


-- ============================================================
-- PART 9  —  VERIFICATION QUERIES
--            Uncomment and run these individually after the
--            main script to confirm everything was created.
-- ============================================================

-- Check all tables exist:
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- Check all functions exist:
-- SELECT routine_name FROM information_schema.routines
-- WHERE routine_schema = 'public' ORDER BY routine_name;

-- Check all triggers exist:
-- SELECT tgname, relname FROM pg_trigger t
-- JOIN pg_class c ON t.tgrelid = c.oid
-- WHERE c.relnamespace = 'public'::regnamespace ORDER BY relname, tgname;

-- Check all RLS policies exist:
-- SELECT tablename, policyname FROM pg_policies
-- WHERE schemaname = 'public' ORDER BY tablename, policyname;

-- Check realtime publication tables:
-- SELECT tablename FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime' AND schemaname = 'public';

-- Check all indexes exist:
-- SELECT indexname, tablename FROM pg_indexes
-- WHERE schemaname = 'public' ORDER BY tablename, indexname;


-- ============================================================
-- PART 10 — EXTERNAL API & BOOKING REQUESTS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.integration_api_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  key_prefix      TEXT NOT NULL,
  key_hash        TEXT NOT NULL UNIQUE,
  scopes          TEXT[] NOT NULL DEFAULT '{}',
  last_used_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_integration_api_keys_user_created
  ON public.integration_api_keys (user_id, created_at DESC);
ALTER TABLE public.integration_api_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integration_api_keys FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.integration_api_keys TO service_role;

CREATE OR REPLACE FUNCTION public.create_integration_api_key(
  p_user_id UUID, p_name TEXT, p_key_prefix TEXT, p_key_hash TEXT,
  p_scopes TEXT[], p_expires_at TIMESTAMPTZ
)
RETURNS TABLE (
  id UUID, name TEXT, key_prefix TEXT, scopes TEXT[], last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ, created_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_active_count INTEGER;
  v_key_id UUID;
BEGIN
  IF p_user_id IS NULL OR p_provider IS NULL OR p_bucket IS NULL
     OR p_user_limit IS NULL OR p_project_limit IS NULL
     OR p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 80
     OR p_key_prefix IS NULL OR p_key_prefix !~ '^rr_live_[A-Za-z0-9_-]{8,32}$'
     OR p_key_hash IS NULL OR p_key_hash !~ '^[a-f0-9]{64}$'
     OR p_scopes IS NULL OR cardinality(p_scopes) NOT BETWEEN 1 AND 6
     OR EXISTS (
       SELECT 1 FROM unnest(p_scopes) AS requested(scope)
       WHERE requested.scope <> ALL (ARRAY[
         'trips:read', 'trips:write', 'budget:read',
         'plans:generate', 'orders:read', 'orders:write'
       ]::TEXT[])
     )
     OR (p_expires_at IS NOT NULL AND (p_expires_at <= now() OR p_expires_at > now() + interval '365 days')) THEN
    RAISE EXCEPTION 'invalid API key arguments' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 918273));
  SELECT count(*)::INTEGER INTO v_active_count
  FROM public.integration_api_keys k
  WHERE k.user_id = p_user_id AND k.revoked_at IS NULL
    AND (k.expires_at IS NULL OR k.expires_at > now());
  IF v_active_count >= 10 THEN
    RAISE EXCEPTION 'active_api_key_limit_reached' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.integration_api_keys (user_id, name, key_prefix, key_hash, scopes, expires_at)
  VALUES (p_user_id, btrim(p_name), p_key_prefix, p_key_hash, ARRAY(SELECT DISTINCT unnest(p_scopes)), p_expires_at)
  RETURNING integration_api_keys.id INTO v_key_id;
  RETURN QUERY SELECT k.id, k.name, k.key_prefix, k.scopes, k.last_used_at, k.expires_at, k.revoked_at, k.created_at
    FROM public.integration_api_keys k WHERE k.id = v_key_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_integration_api_key(UUID, TEXT, TEXT, TEXT, TEXT[], TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_integration_api_key(UUID, TEXT, TEXT, TEXT, TEXT[], TIMESTAMPTZ) TO service_role;

CREATE TABLE IF NOT EXISTS public.integration_api_rate_limits (
  api_key_id UUID NOT NULL REFERENCES public.integration_api_keys(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  PRIMARY KEY (api_key_id, window_start)
);
ALTER TABLE public.integration_api_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integration_api_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.integration_api_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_integration_api_rate_limit(
  p_api_key_id UUID,
  p_limit INTEGER DEFAULT 60
)
RETURNS TABLE (allowed BOOLEAN, remaining INTEGER, resets_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_window TIMESTAMPTZ := date_trunc('minute', now());
  v_count INTEGER;
BEGIN
  IF p_api_key_id IS NULL OR p_limit IS NULL OR p_limit < 1 OR p_limit > 10000 THEN
    RAISE EXCEPTION 'invalid API rate limit arguments' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.integration_api_rate_limits (api_key_id, window_start, request_count)
  VALUES (p_api_key_id, v_window, 1)
  ON CONFLICT (api_key_id, window_start)
  DO UPDATE SET request_count = public.integration_api_rate_limits.request_count + 1
  WHERE public.integration_api_rate_limits.request_count < p_limit
  RETURNING request_count INTO v_count;
  IF NOT FOUND THEN
    SELECT request_count INTO v_count FROM public.integration_api_rate_limits
    WHERE api_key_id = p_api_key_id AND window_start = v_window;
    RETURN QUERY SELECT FALSE, 0, v_window + interval '1 minute';
    RETURN;
  END IF;

  IF random() < 0.01 THEN
    DELETE FROM public.integration_api_rate_limits
    WHERE window_start < now() - interval '2 days';
  END IF;

  RETURN QUERY SELECT TRUE, greatest(0, p_limit - v_count), v_window + interval '1 minute';
END;
$$;
REVOKE ALL ON FUNCTION public.consume_integration_api_rate_limit(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_integration_api_rate_limit(UUID, INTEGER) TO service_role;

CREATE TABLE IF NOT EXISTS public.travel_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_id UUID REFERENCES public.trips(id) ON DELETE SET NULL,
  order_type TEXT NOT NULL CHECK (order_type IN ('flight', 'hotel', 'activity', 'transport', 'package', 'other')),
  item_name TEXT NOT NULL CHECK (length(item_name) BETWEEN 1 AND 160),
  provider TEXT CHECK (provider IS NULL OR length(provider) <= 100),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'confirmed', 'cancelled', 'failed')),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  quoted_amount NUMERIC(12,2) CHECK (quoted_amount IS NULL OR quoted_amount >= 0),
  details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT travel_orders_user_idempotency_unique UNIQUE (user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_travel_orders_user_created
  ON public.travel_orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_travel_orders_trip_created
  ON public.travel_orders (trip_id, created_at DESC);
ALTER TABLE public.travel_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.travel_orders FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.travel_orders TO service_role;
DROP TRIGGER IF EXISTS update_travel_orders_updated_at ON public.travel_orders;
CREATE TRIGGER update_travel_orders_updated_at
  BEFORE UPDATE ON public.travel_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.list_accessible_trips(
  p_user_id UUID, p_limit INTEGER, p_offset INTEGER
)
RETURNS SETOF public.trips
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT t.*
  FROM public.trips t
  WHERE t.organizer_id = p_user_id
     OR EXISTS (
       SELECT 1 FROM public.trip_memberships m
       WHERE m.trip_id = t.id AND m.user_id = p_user_id
     )
  ORDER BY t.start_date ASC, t.id ASC
  LIMIT p_limit OFFSET p_offset;
$$;
REVOKE ALL ON FUNCTION public.list_accessible_trips(UUID, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_accessible_trips(UUID, INTEGER, INTEGER) TO service_role;

CREATE TABLE IF NOT EXISTS public.provider_request_rate_limits (
  subject_key TEXT NOT NULL CHECK (length(subject_key) BETWEEN 1 AND 50),
  provider TEXT NOT NULL CHECK (provider IN ('groq', 'ors', 'opentripmap', 'planner')),
  bucket TEXT NOT NULL CHECK (bucket IN ('minute', 'day')),
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  PRIMARY KEY (subject_key, provider, bucket, window_start)
);
ALTER TABLE public.provider_request_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_request_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.provider_request_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_provider_request_rate_limit(
  p_user_id UUID, p_provider TEXT, p_bucket TEXT,
  p_user_limit INTEGER, p_project_limit INTEGER
)
RETURNS TABLE (allowed BOOLEAN, remaining INTEGER, resets_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_window TIMESTAMPTZ;
  v_user_count INTEGER;
  v_project_count INTEGER;
  v_reset TIMESTAMPTZ;
BEGIN
  IF p_user_id IS NULL
     OR p_provider NOT IN ('groq', 'ors', 'opentripmap', 'planner')
     OR p_bucket NOT IN ('minute', 'day')
     OR p_user_limit < 1 OR p_user_limit > 10000
     OR p_project_limit < 1 OR p_project_limit > 1000000 THEN
    RAISE EXCEPTION 'invalid rate limit arguments' USING ERRCODE = '22023';
  END IF;
  v_window := CASE p_bucket WHEN 'minute' THEN date_trunc('minute', now()) ELSE date_trunc('day', now()) END;
  v_reset := CASE p_bucket WHEN 'minute' THEN v_window + interval '1 minute' ELSE v_window + interval '1 day' END;

  INSERT INTO public.provider_request_rate_limits AS limits
    (subject_key, provider, bucket, window_start, request_count)
  VALUES ('user:' || p_user_id::TEXT, p_provider, p_bucket, v_window, 1)
  ON CONFLICT (subject_key, provider, bucket, window_start)
  DO UPDATE SET request_count = limits.request_count + 1
  WHERE limits.request_count < p_user_limit
  RETURNING request_count INTO v_user_count;
  IF NOT FOUND THEN
    SELECT request_count INTO v_user_count FROM public.provider_request_rate_limits
    WHERE subject_key = 'user:' || p_user_id::TEXT AND provider = p_provider
      AND bucket = p_bucket AND window_start = v_window;
    RETURN QUERY SELECT FALSE, 0, v_reset;
    RETURN;
  END IF;

  INSERT INTO public.provider_request_rate_limits AS limits
    (subject_key, provider, bucket, window_start, request_count)
  VALUES ('project', p_provider, p_bucket, v_window, 1)
  ON CONFLICT (subject_key, provider, bucket, window_start)
  DO UPDATE SET request_count = limits.request_count + 1
  WHERE limits.request_count < p_project_limit
  RETURNING request_count INTO v_project_count;
  IF NOT FOUND THEN
    SELECT request_count INTO v_project_count FROM public.provider_request_rate_limits
    WHERE subject_key = 'project' AND provider = p_provider
      AND bucket = p_bucket AND window_start = v_window;
    RETURN QUERY SELECT FALSE, 0, v_reset;
    RETURN;
  END IF;

  IF random() < 0.01 THEN
    DELETE FROM public.provider_request_rate_limits WHERE window_start < now() - interval '2 days';
  END IF;
  RETURN QUERY SELECT TRUE,
    greatest(0, least(p_user_limit - v_user_count, p_project_limit - v_project_count)),
    v_reset;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_provider_request_rate_limit(UUID, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_provider_request_rate_limit(UUID, TEXT, TEXT, INTEGER, INTEGER) TO service_role;

-- ============================================================
-- END OF MASTER SCHEMA
-- ============================================================
-- Tables created (22):
--   profiles, trips, trip_memberships, itineraries, activities,
--   activity_votes, messages, disruption_events, trip_invites,
--   trip_join_requests, communities, community_memberships,
--   community_messages, community_events, event_rsvps,
--   friend_requests, direct_messages, group_expenses, expense_splits,
--   integration_api_keys, integration_api_rate_limits, travel_orders
--
-- Helper functions (6):
--   is_trip_member, is_trip_organizer,
--   get_trip_id_from_activity, get_trip_id_from_vote,
--   is_community_member, consume_integration_api_rate_limit
--
-- Trigger functions (4):
--   handle_new_user, auto_add_organizer_membership,
--   update_community_member_count, auto_add_community_creator
--
-- Triggers (11):
--   on_auth_user_created, update_profiles_updated_at,
--   update_trips_updated_at, trg_auto_add_organizer,
--   update_itineraries_updated_at, update_communities_updated_at,
--   trg_group_expenses_updated_at, trg_update_community_member_count,
--   trg_auto_add_community_creator,
--   update_travel_orders_updated_at
--
-- RLS policies (68 total across user-facing tables; integration records are service-role-only)
--
-- Indexes (36 total)
--
-- Realtime tables (8):
--   messages, activity_votes, community_messages, trip_join_requests,
--   direct_messages, friend_requests, group_expenses, expense_splits
-- ============================================================
