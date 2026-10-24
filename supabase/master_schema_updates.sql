-- Atlas AI additive schema updates
--
-- Apply this file to an existing Supabase project whose base schema is already
-- installed. It contains the database additions reflected in master_schema.sql:
-- friends, direct messages, shared expenses, external platform APIs, and
-- profile details/avatar storage.
-- The statements are safe to re-run. This file can be run from the Supabase SQL
-- Editor; CLI users can apply the corresponding files in supabase/migrations.

BEGIN;

-- ---------------------------------------------------------------------------
-- Friends, direct messages, and shared expenses
-- ---------------------------------------------------------------------------

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

CREATE TABLE IF NOT EXISTS public.direct_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  read        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

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

-- Enforce amount and currency validation on pre-existing tables too. NOT VALID
-- avoids blocking the update on historical rows while enforcing new writes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.group_expenses'::regclass
      AND conname = 'group_expenses_amount_nonnegative'
  ) THEN
    ALTER TABLE public.group_expenses
      ADD CONSTRAINT group_expenses_amount_nonnegative CHECK (amount >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.group_expenses'::regclass
      AND conname = 'group_expenses_currency_format'
  ) THEN
    ALTER TABLE public.group_expenses
      ADD CONSTRAINT group_expenses_currency_format CHECK (currency ~ '^[A-Z]{3}$') NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.expense_splits'::regclass
      AND conname = 'expense_splits_amount_nonnegative'
  ) THEN
    ALTER TABLE public.expense_splits
      ADD CONSTRAINT expense_splits_amount_nonnegative CHECK (amount >= 0) NOT VALID;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_friend_requests_sender
  ON public.friend_requests(sender_id, status);
CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver
  ON public.friend_requests(receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation
  ON public.direct_messages (
    LEAST(sender_id, receiver_id),
    GREATEST(sender_id, receiver_id),
    created_at DESC
  );
CREATE INDEX IF NOT EXISTS idx_direct_messages_receiver
  ON public.direct_messages(receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_group_expenses_trip_created
  ON public.group_expenses(trip_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expense_splits_expense
  ON public.expense_splits(expense_id);
CREATE INDEX IF NOT EXISTS idx_expense_splits_user_settled
  ON public.expense_splits(user_id, settled);

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

DROP TRIGGER IF EXISTS trg_group_expenses_updated_at ON public.group_expenses;
CREATE TRIGGER trg_group_expenses_updated_at
  BEFORE UPDATE ON public.group_expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "friend_requests_select" ON public.friend_requests;
CREATE POLICY "friend_requests_select" ON public.friend_requests
  FOR SELECT USING (sender_id = auth.uid() OR receiver_id = auth.uid());
DROP POLICY IF EXISTS "friend_requests_insert" ON public.friend_requests;
CREATE POLICY "friend_requests_insert" ON public.friend_requests
  FOR INSERT WITH CHECK (sender_id = auth.uid());
DROP POLICY IF EXISTS "friend_requests_update" ON public.friend_requests;
CREATE POLICY "friend_requests_update" ON public.friend_requests
  FOR UPDATE USING (receiver_id = auth.uid());
DROP POLICY IF EXISTS "friend_requests_delete" ON public.friend_requests;
CREATE POLICY "friend_requests_delete" ON public.friend_requests
  FOR DELETE USING (sender_id = auth.uid() OR receiver_id = auth.uid());

DROP POLICY IF EXISTS "direct_messages_select" ON public.direct_messages;
CREATE POLICY "direct_messages_select" ON public.direct_messages
  FOR SELECT USING (sender_id = auth.uid() OR receiver_id = auth.uid());
DROP POLICY IF EXISTS "direct_messages_insert" ON public.direct_messages;
CREATE POLICY "direct_messages_insert" ON public.direct_messages
  FOR INSERT WITH CHECK (sender_id = auth.uid());
DROP POLICY IF EXISTS "direct_messages_update" ON public.direct_messages;
CREATE POLICY "direct_messages_update" ON public.direct_messages
  FOR UPDATE USING (receiver_id = auth.uid());
DROP POLICY IF EXISTS "direct_messages_delete" ON public.direct_messages;
CREATE POLICY "direct_messages_delete" ON public.direct_messages
  FOR DELETE USING (sender_id = auth.uid() OR receiver_id = auth.uid());

DROP POLICY IF EXISTS "group_expenses_select" ON public.group_expenses;
CREATE POLICY "group_expenses_select" ON public.group_expenses
  FOR SELECT USING (public.is_trip_member(trip_id));
DROP POLICY IF EXISTS "group_expenses_insert" ON public.group_expenses;
CREATE POLICY "group_expenses_insert" ON public.group_expenses
  FOR INSERT WITH CHECK (public.is_trip_member(trip_id) AND paid_by = auth.uid());
DROP POLICY IF EXISTS "group_expenses_update" ON public.group_expenses;
CREATE POLICY "group_expenses_update" ON public.group_expenses
  FOR UPDATE USING (paid_by = auth.uid());
DROP POLICY IF EXISTS "group_expenses_delete" ON public.group_expenses;
CREATE POLICY "group_expenses_delete" ON public.group_expenses
  FOR DELETE USING (paid_by = auth.uid());

DROP POLICY IF EXISTS "expense_splits_select" ON public.expense_splits;
CREATE POLICY "expense_splits_select" ON public.expense_splits
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.group_expenses ge
      WHERE ge.id = expense_id AND public.is_trip_member(ge.trip_id)
    )
  );
DROP POLICY IF EXISTS "expense_splits_insert" ON public.expense_splits;
CREATE POLICY "expense_splits_insert" ON public.expense_splits
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.group_expenses ge
      WHERE ge.id = expense_id AND public.is_trip_member(ge.trip_id)
    )
  );
DROP POLICY IF EXISTS "expense_splits_update" ON public.expense_splits;
CREATE POLICY "expense_splits_update" ON public.expense_splits
  FOR UPDATE USING (user_id = auth.uid());
DROP POLICY IF EXISTS "expense_splits_delete" ON public.expense_splits;
CREATE POLICY "expense_splits_delete" ON public.expense_splits
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.group_expenses ge
      WHERE ge.id = expense_id AND ge.paid_by = auth.uid()
    )
  );

-- Enable live updates when the standard Supabase Realtime publication exists.
DO $$
DECLARE
  v_table TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH v_table IN ARRAY ARRAY[
      'direct_messages', 'friend_requests', 'group_expenses', 'expense_splits'
    ] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = v_table
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
      END IF;
    END LOOP;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- External API keys, rate limits, and booking request records
-- ---------------------------------------------------------------------------

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
  ON public.integration_api_keys(user_id, created_at DESC);
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
  api_key_id      UUID NOT NULL REFERENCES public.integration_api_keys(id) ON DELETE CASCADE,
  window_start    TIMESTAMPTZ NOT NULL,
  request_count   INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
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

  INSERT INTO public.integration_api_rate_limits(api_key_id, window_start, request_count)
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

  RETURN QUERY
    SELECT TRUE,
           greatest(0, p_limit - v_count),
           v_window + interval '1 minute';
END;
$$;
REVOKE ALL ON FUNCTION public.consume_integration_api_rate_limit(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_integration_api_rate_limit(UUID, INTEGER)
  TO service_role;

CREATE TABLE IF NOT EXISTS public.travel_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_id           UUID REFERENCES public.trips(id) ON DELETE SET NULL,
  order_type        TEXT NOT NULL CHECK (order_type IN ('flight', 'hotel', 'activity', 'transport', 'package', 'other')),
  item_name         TEXT NOT NULL CHECK (length(item_name) BETWEEN 1 AND 160),
  provider          TEXT CHECK (provider IS NULL OR length(provider) <= 100),
  status            TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'confirmed', 'cancelled', 'failed')),
  currency          TEXT NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  quoted_amount     NUMERIC(12,2) CHECK (quoted_amount IS NULL OR quoted_amount >= 0),
  details           JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  idempotency_key   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT travel_orders_user_idempotency_unique UNIQUE (user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_travel_orders_user_created
  ON public.travel_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_travel_orders_trip_created
  ON public.travel_orders(trip_id, created_at DESC);
ALTER TABLE public.travel_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.travel_orders FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.travel_orders TO service_role;

DROP TRIGGER IF EXISTS update_travel_orders_updated_at ON public.travel_orders;
CREATE TRIGGER update_travel_orders_updated_at
  BEFORE UPDATE ON public.travel_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Profile details and profile photo storage
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS home_city TEXT,
  ADD COLUMN IF NOT EXISTS home_country TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('profile-avatars', 'profile-avatars', true, 5242880, ARRAY['image/webp', 'image/png']::text[])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Users can upload own profile avatars" ON storage.objects;
CREATE POLICY "Users can upload own profile avatars"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can update own profile avatars" ON storage.objects;
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

DROP POLICY IF EXISTS "Users can delete own profile avatars" ON storage.objects;
CREATE POLICY "Users can delete own profile avatars"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'profile-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- RLS hardening: private trip invites, communities, and event RSVPs
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Anyone can read invite by code" ON public.trip_invites;
DROP POLICY IF EXISTS "Members can view trip invites" ON public.trip_invites;
CREATE POLICY "Members can view trip invites"
  ON public.trip_invites FOR SELECT
  USING (public.is_trip_member(trip_id));

CREATE OR REPLACE FUNCTION public.lookup_trip_invite(p_invite_code TEXT)
RETURNS TABLE (
  id UUID, trip_id UUID, invite_code TEXT, status TEXT, max_uses INTEGER,
  uses INTEGER, expires_at TIMESTAMPTZ, trip_name TEXT, destination TEXT,
  start_date DATE, end_date DATE
)
LANGUAGE sql STABLE SECURITY DEFINER
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
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trip_invites i
    WHERE i.id = p_invite_id AND i.trip_id = p_trip_id
      AND i.status IN ('active', 'pending')
      AND (i.expires_at IS NULL OR i.expires_at > now())
      AND (i.max_uses IS NULL OR i.uses < i.max_uses)
  );
$$;
REVOKE ALL ON FUNCTION public.is_valid_trip_invite(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_valid_trip_invite(UUID, UUID) TO authenticated;

DROP POLICY IF EXISTS "Users can create join requests" ON public.trip_join_requests;
CREATE POLICY "Users can create join requests"
  ON public.trip_join_requests FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND status = 'pending' AND invite_id IS NOT NULL
    AND public.is_valid_trip_invite(invite_id, trip_id)
  );
DROP POLICY IF EXISTS "Users can add own membership" ON public.trip_memberships;

CREATE OR REPLACE FUNCTION public.is_community_public(p_community_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.communities c WHERE c.id = p_community_id AND c.is_public);
$$;

CREATE OR REPLACE FUNCTION public.can_view_community_event(p_event_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_events e
    JOIN public.communities c ON c.id = e.community_id
    WHERE e.id = p_event_id AND (c.is_public OR public.is_community_member(c.id))
  );
$$;

DROP POLICY IF EXISTS "Anyone can view public communities" ON public.communities;
CREATE POLICY "Anyone can view public communities"
  ON public.communities FOR SELECT
  USING (is_public OR created_by = auth.uid() OR public.is_community_member(id));

DROP POLICY IF EXISTS "Anyone can view community members" ON public.community_memberships;
DROP POLICY IF EXISTS "Visible community members" ON public.community_memberships;
CREATE POLICY "Visible community members"
  ON public.community_memberships FOR SELECT
  USING (
    user_id = auth.uid() OR public.is_community_member(community_id)
    OR public.is_community_public(community_id)
  );

DROP POLICY IF EXISTS "Users can join communities" ON public.community_memberships;
CREATE POLICY "Users can join communities"
  ON public.community_memberships FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND role = 'member'
    AND public.is_community_public(community_id)
  );

DROP POLICY IF EXISTS "Members can view events" ON public.community_events;
CREATE POLICY "Members can view events"
  ON public.community_events FOR SELECT
  USING (public.is_community_public(community_id) OR public.is_community_member(community_id));

DROP POLICY IF EXISTS "Members can view RSVPs" ON public.event_rsvps;
CREATE POLICY "Members can view RSVPs"
  ON public.event_rsvps FOR SELECT
  USING (public.can_view_community_event(event_id));

DROP POLICY IF EXISTS "Users can RSVP" ON public.event_rsvps;
CREATE POLICY "Users can RSVP"
  ON public.event_rsvps FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.can_view_community_event(event_id));

DROP POLICY IF EXISTS "Users can update own RSVP" ON public.event_rsvps;
CREATE POLICY "Users can update own RSVP"
  ON public.event_rsvps FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND public.can_view_community_event(event_id));

-- ---------------------------------------------------------------------------
-- Per-user and project-wide daily/minute quotas for provider proxy functions
-- ---------------------------------------------------------------------------

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

COMMIT;
