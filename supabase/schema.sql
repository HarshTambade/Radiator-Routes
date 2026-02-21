-- ============================================================
-- Radiator Routes — COMPLETE DATABASE SCHEMA
-- Single idempotent script: safe to run on a fresh Supabase
-- project or re-run on an existing one.
-- ============================================================
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================


-- ===========================================================
-- SECTION 1 — SHARED UTILITY FUNCTIONS
-- ===========================================================

-- updated_at auto-stamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- ===========================================================
-- SECTION 2 — PROFILES
-- ===========================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id               UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL DEFAULT '',
  phone_number     TEXT,
  avatar_url       TEXT,
  travel_personality JSONB     DEFAULT '{}',
  travel_history   JSONB       DEFAULT '[]',
  preferences      JSONB       DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policies (drop first so re-runs are safe)
DROP POLICY IF EXISTS "Users can view own profile"               ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile"             ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile"             ON public.profiles;
DROP POLICY IF EXISTS "Trip members can view co-member profiles" ON public.profiles;
DROP POLICY IF EXISTS "Organizers can view requester profiles"   ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Allow members of the same trip to see each other's profiles
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

-- Allow organizers to view profiles of people who have requested to join their trip
CREATE POLICY "Organizers can view requester profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM   public.trip_join_requests tjr
      JOIN   public.trips t ON tjr.trip_id = t.id
      WHERE  tjr.user_id = profiles.id
      AND    t.organizer_id = auth.uid()
    )
  );

-- Trigger: auto-stamp updated_at
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: auto-create profile row when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ===========================================================
-- SECTION 3 — TRIPS
-- ===========================================================

CREATE TABLE IF NOT EXISTS public.trips (
  id           UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT           NOT NULL,
  destination  TEXT           NOT NULL,
  country      TEXT,
  start_date   DATE           NOT NULL,
  end_date     DATE           NOT NULL,
  organizer_id UUID           NOT NULL REFERENCES auth.users(id),
  budget_total DECIMAL(12, 2) DEFAULT 0,
  currency     TEXT           DEFAULT 'INR',
  status       TEXT           NOT NULL DEFAULT 'planning'
                              CHECK (status IN ('planning', 'booked', 'ongoing', 'completed')),
  image_url    TEXT,
  created_at   TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ    NOT NULL DEFAULT now()
);

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_trips_updated_at ON public.trips;
CREATE TRIGGER update_trips_updated_at
  BEFORE UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_trips_organizer ON public.trips(organizer_id);


-- ===========================================================
-- SECTION 4 — TRIP MEMBERSHIPS
-- ===========================================================

CREATE TABLE IF NOT EXISTS public.trip_memberships (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id    UUID        NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'member'
                         CHECK (role IN ('organizer', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trip_id, user_id)
);

ALTER TABLE public.trip_memberships ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_trip_memberships_user ON public.trip_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_trip_memberships_trip ON public.trip_memberships(trip_id);

-- Helper: is the calling user a member of this trip?
CREATE OR REPLACE FUNCTION public.is_trip_member(p_trip_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER STABLE
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.trip_memberships
    WHERE trip_id = p_trip_id AND user_id = auth.uid()
  );
END;
$$;

-- Helper: is the calling user the organizer of this trip?
CREATE OR REPLACE FUNCTION public.is_trip_organizer(p_trip_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER STABLE
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.trips
    WHERE id = p_trip_id AND organizer_id = auth.uid()
  );
END;
$$;

-- Trip RLS policies
DROP POLICY IF EXISTS "Members can view trips"       ON public.trips;
DROP POLICY IF EXISTS "Auth users can create trips"  ON public.trips;
DROP POLICY IF EXISTS "Organizer can update trips"   ON public.trips;
DROP POLICY IF EXISTS "Organizer can delete trips"   ON public.trips;

CREATE POLICY "Members can view trips"
  ON public.trips FOR SELECT
  USING (public.is_trip_member(id));

CREATE POLICY "Auth users can create trips"
  ON public.trips FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = organizer_id);

CREATE POLICY "Organizer can update trips"
  ON public.trips FOR UPDATE
  USING (public.is_trip_organizer(id));

CREATE POLICY "Organizer can delete trips"
  ON public.trips FOR DELETE
  USING (public.is_trip_organizer(id));

-- Trip membership RLS policies
DROP POLICY IF EXISTS "Members can view memberships"  ON public.trip_memberships;
DROP POLICY IF EXISTS "Organizer can add members"     ON public.trip_memberships;
DROP POLICY IF EXISTS "Organizer can remove members"  ON public.trip_memberships;
DROP POLICY IF EXISTS "Users can add own membership"  ON public.trip_memberships;

CREATE POLICY "Members can view memberships"
  ON public.trip_memberships FOR SELECT
  USING (public.is_trip_member(trip_id));

CREATE POLICY "Organizer can add members"
  ON public.trip_memberships FOR INSERT
  WITH CHECK (public.is_trip_organizer(trip_id));

CREATE POLICY "Organizer can remove members"
  ON public.trip_memberships FOR DELETE
  USING (public.is_trip_organizer(trip_id));

-- Allow the auto-add trigger (SECURITY DEFINER) and self-join flows to insert
CREATE POLICY "Users can add own membership"
  ON public.trip_memberships
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Trigger: auto-add organizer as 'organizer' member when a trip is created
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

DROP TRIGGER IF EXISTS trg_auto_add_organizer    ON public.trips;
DROP TRIGGER IF EXISTS on_trip_created           ON public.trips;
CREATE TRIGGER trg_auto_add_organizer
  AFTER INSERT ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.auto_add_organizer_membership();


-- ===========================================================
-- SECTION 5 — ITINERARIES
-- ===========================================================

CREATE TABLE IF NOT EXISTS public.itineraries (
  id           UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      UUID           NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  version      INT            DEFAULT 1,
  variant_id   TEXT,
  regret_score DECIMAL(5, 3),
  cost_breakdown JSONB        DEFAULT '{}',
  is_published BOOLEAN        DEFAULT FALSE,
  created_by   UUID           REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ    NOT NULL DEFAULT now()
);

ALTER TABLE public.itineraries ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_itineraries_updated_at ON public.itineraries;
CREATE TRIGGER update_itineraries_updated_at
  BEFORE UPDATE ON public.itineraries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_itineraries_trip ON public.itineraries(trip_id);

DROP POLICY IF EXISTS "Members can view itineraries"   ON public.itineraries;
DROP POLICY IF EXISTS "Members can create itineraries" ON public.itineraries;
DROP POLICY IF EXISTS "Members can update itineraries" ON public.itineraries;
DROP POLICY IF EXISTS "Members can delete itineraries" ON public.itineraries;

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


-- ===========================================================
-- SECTION 6 — ACTIVITIES
-- ===========================================================

CREATE TABLE IF NOT EXISTS public.activities (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id     UUID           NOT NULL REFERENCES public.itineraries(id) ON DELETE CASCADE,
  name             TEXT           NOT NULL,
  description      TEXT,
  location_lat     DOUBLE PRECISION,
  location_lng     DOUBLE PRECISION,
  location_name    TEXT,
  start_time       TIMESTAMPTZ    NOT NULL,
  end_time         TIMESTAMPTZ    NOT NULL,
  category         TEXT           CHECK (category IN ('food','attraction','transport','shopping','accommodation','other')),
  cost             DECIMAL(10, 2) DEFAULT 0,
  estimated_steps  INT,
  review_score     DECIMAL(2, 1),
  priority         FLOAT          DEFAULT 0.5,
  notes            TEXT,
  status           TEXT           NOT NULL DEFAULT 'pending',
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT now()
);

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_activities_itinerary  ON public.activities(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_activities_start_time ON public.activities(start_time);

-- Helper: resolve itinerary → trip
CREATE OR REPLACE FUNCTION public.get_trip_id_from_activity(p_itinerary_id UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT trip_id FROM public.itineraries WHERE id = p_itinerary_id;
$$;

DROP POLICY IF EXISTS "Members can view activities"   ON public.activities;
DROP POLICY IF EXISTS "Members can create activities" ON public.activities;
DROP POLICY IF EXISTS "Members can update activities" ON public.activities;
DROP POLICY IF EXISTS "Members can delete activities" ON public.activities;

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


-- ===========================================================
-- SECTION 7 — ACTIVITY VOTES
-- ===========================================================

CREATE TABLE IF NOT EXISTS public.activity_votes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID        NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL,
  vote        TEXT        NOT NULL CHECK (vote IN ('up', 'down')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (activity_id, user_id)
);

ALTER TABLE public.activity_votes ENABLE ROW LEVEL SECURITY;

-- Helper: resolve activity → trip
CREATE OR REPLACE FUNCTION public.get_trip_id_from_vote(p_activity_id UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT i.trip_id
  FROM   public.activities a
  JOIN   public.itineraries i ON a.itinerary_id = i.id
  WHERE  a.id = p_activity_id;
$$;

DROP POLICY IF EXISTS "Members can view votes"        ON public.activity_votes;
DROP POLICY IF EXISTS "Members can insert votes"      ON public.activity_votes;
DROP POLICY IF EXISTS "Members can update own votes"  ON public.activity_votes;
DROP POLICY IF EXISTS "Members can delete own votes"  ON public.activity_votes;

CREATE POLICY "Members can view votes"
  ON public.activity_votes FOR SELECT
  USING (public.is_trip_member(public.get_trip_id_from_vote(activity_id)));

CREATE POLICY "Members can insert votes"
  ON public.activity_votes FOR INSERT
  WITH CHECK (
    public.is_trip_member(public.get_trip_id_from_vote(activity_id))
    AND auth.uid() = user_id
  );

CREATE POLICY "Members can update own votes"
  ON public.activity_votes FOR UPDATE
  USING (
    auth.uid() = user_id
    AND public.is_trip_member(public.get_trip_id_from_vote(activity_id))
  );

CREATE POLICY "Members can delete own votes"
  ON public.activity_votes FOR DELETE
  USING (
    auth.uid() = user_id
    AND public.is_trip_member(public.get_trip_id_from_vote(activity_id))
  );

-- Enable realtime for collaborative vote updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_votes;


-- ===========================================================
-- SECTION 8 — MESSAGES (group trip chat)
-- ===========================================================

CREATE TABLE IF NOT EXISTS public.messages (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id      UUID        NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  sender_id    UUID        NOT NULL REFERENCES auth.users(id),
  content      TEXT        NOT NULL,
  message_type TEXT        DEFAULT 'text'
                           CHECK (message_type IN ('text','suggestion','edit_request','system')),
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_messages_trip_created ON public.messages(trip_id, created_at DESC);

DROP POLICY IF EXISTS "Members can view messages" ON public.messages;
DROP POLICY IF EXISTS "Members can send messages" ON public.messages;

CREATE POLICY "Members can view messages"
  ON public.messages FOR SELECT
  USING (public.is_trip_member(trip_id));

CREATE POLICY "Members can send messages"
  ON public.messages FOR INSERT
  WITH CHECK (public.is_trip_member(trip_id) AND auth.uid() = sender_id);

-- Enable realtime for live group chat
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;


-- ===========================================================
-- SECTION 9 — DISRUPTION EVENTS
-- ===========================================================

CREATE TABLE IF NOT EXISTS public.disruption_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id         UUID        NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  event_type      TEXT        NOT NULL,
  severity        TEXT        DEFAULT 'medium'
                              CHECK (severity IN ('low','medium','high','critical')),
  description     TEXT,
  detected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved        BOOLEAN     DEFAULT FALSE,
  replan_applied  BOOLEAN     DEFAULT FALSE,
  old_itinerary   JSONB,
  new_itinerary   JSONB
);

ALTER TABLE public.disruption_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_disruption_events_trip ON public.disruption_events(trip_id);

DROP POLICY IF EXISTS "Members can view disruption events"   ON public.disruption_events;
DROP POLICY IF EXISTS "Members can insert disruption events" ON public.disruption_events;

CREATE POLICY "Members can view disruption events"
  ON public.disruption_events FOR SELECT
  USING (public.is_trip_member(trip_id));

CREATE POLICY "Members can insert disruption events"
  ON public.disruption_events FOR INSERT
  WITH CHECK (public.is_trip_member(trip_id));


-- ===========================================================
-- SECTION 10 — TRIP INVITES
-- ===========================================================

CREATE TABLE IF NOT EXISTS public.trip_invites (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     UUID        NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  invite_code TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_by  UUID        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'pending',
  max_uses    INT,
  uses        INT         NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.trip_invites ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can look up an invite by code (needed for the join flow)
DROP POLICY IF EXISTS "Anyone can read invite by code"  ON public.trip_invites;
DROP POLICY IF EXISTS "Members can view trip invites"   ON public.trip_invites;
DROP POLICY IF EXISTS "Organizer can create invites"    ON public.trip_invites;
DROP POLICY IF EXISTS "Organizer can delete invites"    ON public.trip_invites;

CREATE POLICY "Anyone can read invite by code"
  ON public.trip_invites FOR SELECT
  USING (true);

CREATE POLICY "Organizer can create invites"
  ON public.trip_invites FOR INSERT
  WITH CHECK (public.is_trip_organizer(trip_id));

CREATE POLICY "Organizer can delete invites"
  ON public.trip_invites FOR DELETE
  USING (public.is_trip_organizer(trip_id));


-- ===========================================================
-- SECTION 11 — TRIP JOIN REQUESTS
-- ===========================================================

CREATE TABLE IF NOT EXISTS public.trip_join_requests (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     UUID        NOT NULL REFERENCES public.trips(id)        ON DELETE CASCADE,
  user_id     UUID        NOT NULL,
  invite_id   UUID        REFERENCES public.trip_invites(id)          ON DELETE SET NULL,
  status      TEXT        NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  UNIQUE (trip_id, user_id)
);

ALTER TABLE public.trip_join_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own requests"    ON public.trip_join_requests;
DROP POLICY IF EXISTS "Users can create join requests" ON public.trip_join_requests;
DROP POLICY IF EXISTS "Organizer can update requests"  ON public.trip_join_requests;

CREATE POLICY "Users can view own requests"
  ON public.trip_join_requests FOR SELECT
  USING (auth.uid() = user_id OR public.is_trip_member(trip_id));

CREATE POLICY "Users can create join requests"
  ON public.trip_join_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Organizer can update requests"
  ON public.trip_join_requests FOR UPDATE
  USING (public.is_trip_organizer(trip_id));

-- Enable realtime so organizer sees new join requests live
ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_join_requests;


-- ===========================================================
-- SECTION 12 — COMMUNITIES
-- ===========================================================

CREATE TABLE IF NOT EXISTS public.communities (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  description  TEXT,
  cover_image  TEXT,
  category     TEXT        NOT NULL DEFAULT 'general',
  created_by   UUID        NOT NULL,
  member_count INT         NOT NULL DEFAULT 0,
  is_public    BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_communities_updated_at ON public.communities;
CREATE TRIGGER update_communities_updated_at
  BEFORE UPDATE ON public.communities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Anyone can view public communities" ON public.communities;
DROP POLICY IF EXISTS "Auth users can create communities"  ON public.communities;
DROP POLICY IF EXISTS "Creator can update community"       ON public.communities;
DROP POLICY IF EXISTS "Creator can delete community"       ON public.communities;

CREATE POLICY "Anyone can view public communities"
  ON public.communities FOR SELECT
  USING (is_public = true);

CREATE POLICY "Auth users can create communities"
  ON public.communities FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creator can update community"
  ON public.communities FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Creator can delete community"
  ON public.communities FOR DELETE
  USING (auth.uid() = created_by);


-- ===========================================================
-- SECTION 13 — COMMUNITY MEMBERSHIPS
-- ===========================================================

CREATE TABLE IF NOT EXISTS public.community_memberships (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID        NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL,
  role         TEXT        NOT NULL DEFAULT 'member',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (community_id, user_id)
);

ALTER TABLE public.community_memberships ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_community_member(p_community_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER STABLE
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.community_memberships
    WHERE community_id = p_community_id AND user_id = auth.uid()
  );
END;
$$;

DROP POLICY IF EXISTS "Anyone can view community members" ON public.community_memberships;
DROP POLICY IF EXISTS "Users can join communities"        ON public.community_memberships;
DROP POLICY IF EXISTS "Users can leave communities"       ON public.community_memberships;

CREATE POLICY "Anyone can view community members"
  ON public.community_memberships FOR SELECT
  USING (true);

CREATE POLICY "Users can join communities"
  ON public.community_memberships FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave communities"
  ON public.community_memberships FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger: keep member_count accurate
CREATE OR REPLACE FUNCTION public.update_community_member_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.communities SET member_count = member_count + 1 WHERE id = NEW.community_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.communities SET member_count = GREATEST(0, member_count - 1) WHERE id = OLD.community_id;
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_community_member_count ON public.community_memberships;
CREATE TRIGGER trg_update_community_member_count
  AFTER INSERT OR DELETE ON public.community_memberships
  FOR EACH ROW EXECUTE FUNCTION public.update_community_member_count();

-- Trigger: auto-add creator as admin member
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

DROP TRIGGER IF EXISTS trg_auto_add_community_creator ON public.communities;
CREATE TRIGGER trg_auto_add_community_creator
  AFTER INSERT ON public.communities
  FOR EACH ROW EXECUTE FUNCTION public.auto_add_community_creator();


-- ===========================================================
-- SECTION 14 — COMMUNITY MESSAGES
-- ===========================================================

CREATE TABLE IF NOT EXISTS public.community_messages (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID        NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  sender_id    UUID        NOT NULL,
  content      TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view community messages" ON public.community_messages;
DROP POLICY IF EXISTS "Members can send community messages" ON public.community_messages;

CREATE POLICY "Members can view community messages"
  ON public.community_messages FOR SELECT
  USING (public.is_community_member(community_id));

CREATE POLICY "Members can send community messages"
  ON public.community_messages FOR INSERT
  WITH CHECK (public.is_community_member(community_id) AND auth.uid() = sender_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.community_messages;


-- ===========================================================
-- SECTION 15 — COMMUNITY EVENTS
-- ===========================================================

CREATE TABLE IF NOT EXISTS public.community_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id  UUID        NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  title         TEXT        NOT NULL,
  description   TEXT,
  destination   TEXT,
  event_date    TIMESTAMPTZ NOT NULL,
  created_by    UUID        NOT NULL,
  max_attendees INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.community_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view events"    ON public.community_events;
DROP POLICY IF EXISTS "Members can create events"  ON public.community_events;
DROP POLICY IF EXISTS "Creator can update events"  ON public.community_events;
DROP POLICY IF EXISTS "Creator can delete events"  ON public.community_events;

CREATE POLICY "Members can view events"
  ON public.community_events FOR SELECT
  USING (public.is_community_member(community_id));

CREATE POLICY "Members can create events"
  ON public.community_events FOR INSERT
  WITH CHECK (public.is_community_member(community_id) AND auth.uid() = created_by);

CREATE POLICY "Creator can update events"
  ON public.community_events FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "Creator can delete events"
  ON public.community_events FOR DELETE
  USING (auth.uid() = created_by);


-- ===========================================================
-- SECTION 16 — EVENT RSVPs
-- ===========================================================

CREATE TABLE IF NOT EXISTS public.event_rsvps (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID        NOT NULL REFERENCES public.community_events(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL,
  status     TEXT        NOT NULL DEFAULT 'going',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view RSVPs"    ON public.event_rsvps;
DROP POLICY IF EXISTS "Users can RSVP"            ON public.event_rsvps;
DROP POLICY IF EXISTS "Users can update own RSVP" ON public.event_rsvps;
DROP POLICY IF EXISTS "Users can delete own RSVP" ON public.event_rsvps;

CREATE POLICY "Members can view RSVPs"
  ON public.event_rsvps FOR SELECT
  USING (true);

CREATE POLICY "Users can RSVP"
  ON public.event_rsvps FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own RSVP"
  ON public.event_rsvps FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own RSVP"
  ON public.event_rsvps FOR DELETE
  USING (auth.uid() = user_id);


-- ===========================================================
-- SECTION 17 — EDGE FUNCTION SECRETS
-- ===========================================================
-- These secrets must be set in:
--   Supabase Dashboard → Settings → Edge Functions → Secrets
--   OR via the Supabase CLI:  supabase secrets set KEY=value
--
-- Required secrets:
--   HF_API_KEY             — HuggingFace API token (https://huggingface.co/settings/tokens)
--   AMADEUS_API_KEY        — Amadeus travel API key
--   AMADEUS_API_SECRET     — Amadeus travel API secret
--   OPENTRIPMAP_API_KEY    — OpenTripMap API key
--   TRAFFIC_API_KEY        — TomTom traffic/search API key
--   ORS_API_KEY            — OpenRouteService API key (https://openrouteservice.org)
--
-- The following are automatically provided by Supabase and do NOT
-- need to be set manually:
--   SUPABASE_URL
--   SUPABASE_ANON_KEY
--   SUPABASE_SERVICE_ROLE_KEY
-- ===========================================================


-- ===========================================================
-- SECTION 18 — REALTIME SUMMARY
-- ===========================================================
-- Tables enabled for Supabase Realtime (already added above):
--   public.messages             (trip group chat)
--   public.activity_votes       (collaborative voting)
--   public.community_messages   (community chat)
--   public.trip_join_requests   (live join-request notifications)
--
-- To verify in the dashboard:
--   Database → Replication → supabase_realtime publication
-- ===========================================================


-- ===========================================================
-- END OF SCHEMA
-- ===========================================================
-- After running this script:
-- 1. Deploy edge functions (see SETUP_INSTRUCTIONS.md)
-- 2. Set all required secrets listed in Section 17
-- 3. Configure Auth providers in Authentication → Providers
-- 4. Set the Site URL in Authentication → URL Configuration
-- ===========================================================
